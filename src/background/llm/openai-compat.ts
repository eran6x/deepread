import { coerceAnalysis } from "@/shared/coerce"
import { AnalysisResult, DefinitionResult, PartialAnalysisResult } from "@/shared/schema"
import type { ProviderTestResult } from "@/shared/types"
import { Allow, parse as parsePartialJson } from "partial-json"
import {
  type AnalyzeInput,
  type DefineInput,
  type LLMClient,
  LLMError,
  type PartialHandler,
  TEST_ARTICLE,
} from "./client"
import {
  ANALYSIS_SYSTEM_PROMPT,
  ANALYSIS_TOOL,
  ANALYSIS_TOOL_OPENAI,
  DEFINE_SYSTEM_PROMPT,
  DEFINE_TOOL,
  DEFINE_TOOL_OPENAI,
  buildAnalysisUserMessage,
  buildDefineUserMessage,
} from "./prompts"

interface OpenAITool {
  type: "function"
  function: {
    name: string
    description: string
    parameters: unknown
  }
}

export interface OpenAICompatConfig {
  /** Full base URL up to and including `/v1` (no trailing slash). */
  baseURL: string
  /** API key sent as `Authorization: Bearer ...`. Empty/undefined for Ollama. */
  apiKey?: string
  /** Model name to send. */
  model: string
  /** Human-readable label for error messages. */
  label: string
}

/**
 * OpenAI-compatible chat-completions client. Used for Ollama (local) and
 * DeepSeek. Supports streaming tool calls and validates the response against
 * the same schema as the Anthropic client.
 */
export class OpenAICompatibleClient implements LLMClient {
  constructor(private readonly config: OpenAICompatConfig) {
    if (!config.baseURL) {
      throw new LLMError(`${config.label}: missing baseURL`, undefined, "missing_config")
    }
    if (!config.model) {
      throw new LLMError(`${config.label}: missing model`, undefined, "missing_config")
    }
  }

  async analyze(input: AnalyzeInput, onPartial: PartialHandler): Promise<AnalysisResult> {
    const argsAccum = await this.streamToolCallArgs({
      systemPrompt: ANALYSIS_SYSTEM_PROMPT,
      userContent: buildAnalysisUserMessage(input),
      tool: ANALYSIS_TOOL_OPENAI,
      toolName: ANALYSIS_TOOL.name,
      maxTokens: 4096,
      onPartialArgs: (partialArgs) => {
        const partial = tryPartialParse(partialArgs)
        if (partial == null || typeof partial !== "object") return
        const validated = PartialAnalysisResult.safeParse(coerceAnalysis(partial))
        if (validated.success) onPartial(validated.data)
      },
    })

    const final = parseFinalJson(argsAccum, this.config.label)
    const validated = AnalysisResult.safeParse(coerceAnalysis(final))
    if (!validated.success) {
      throw new LLMError(
        `${this.config.label}: schema validation failed: ${validated.error.message}`,
        validated.error,
        "schema",
      )
    }
    return validated.data
  }

  async define(input: DefineInput): Promise<DefinitionResult> {
    const argsAccum = await this.streamToolCallArgs({
      systemPrompt: DEFINE_SYSTEM_PROMPT,
      userContent: buildDefineUserMessage(input.word, input.sentence),
      tool: DEFINE_TOOL_OPENAI,
      toolName: DEFINE_TOOL.name,
      maxTokens: 256,
      onPartialArgs: () => {},
    })

    const parsed = parseFinalJson(argsAccum, this.config.label)
    const validated = DefinitionResult.safeParse(parsed)
    if (!validated.success) {
      throw new LLMError(
        `${this.config.label}: schema validation failed: ${validated.error.message}`,
        validated.error,
        "schema",
      )
    }
    return validated.data
  }

  async test(): Promise<ProviderTestResult> {
    try {
      await this.analyze(TEST_ARTICLE, () => {})
      return { ok: true }
    } catch (err) {
      if (err instanceof LLMError) {
        return { ok: false, reason: err.kind, detail: err.message }
      }
      return {
        ok: false,
        reason: "unknown",
        detail: err instanceof Error ? err.message : String(err),
      }
    }
  }

  private async streamToolCallArgs(args: {
    systemPrompt: string
    userContent: string
    tool: OpenAITool
    toolName: string
    maxTokens: number
    onPartialArgs: (accumulated: string) => void
  }): Promise<string> {
    const body = {
      model: this.config.model,
      messages: [
        { role: "system", content: args.systemPrompt },
        { role: "user", content: args.userContent },
      ],
      tools: [args.tool],
      tool_choice: { type: "function", function: { name: args.toolName } },
      stream: true,
      max_tokens: args.maxTokens,
    }

    let response: Response
    try {
      response = await fetch(`${this.config.baseURL}/chat/completions`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(body),
      })
    } catch (err) {
      throw classifyFetchError(err, this.config.label)
    }

    if (!response.ok) {
      throw classifyHttpError(response.status, await safeReadText(response), this.config.label)
    }
    if (!response.body) {
      throw new LLMError(`${this.config.label}: empty response body`, undefined, "network")
    }

    let argsAccum = ""
    let toolCallSeen = false
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""

    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      while (true) {
        const sep = buffer.indexOf("\n\n")
        if (sep === -1) break
        const event = buffer.slice(0, sep)
        buffer = buffer.slice(sep + 2)
        const dataLine = event.split("\n").find((l) => l.startsWith("data:"))
        if (!dataLine) continue
        const data = dataLine.slice(5).trim()
        if (!data || data === "[DONE]") continue

        let parsed: unknown
        try {
          parsed = JSON.parse(data)
        } catch {
          continue
        }
        const choices = (parsed as { choices?: Array<{ delta?: unknown }> }).choices
        const delta = choices?.[0]?.delta as
          | { tool_calls?: Array<{ function?: { arguments?: string } }> }
          | undefined
        const toolCall = delta?.tool_calls?.[0]
        const argsDelta = toolCall?.function?.arguments
        if (typeof argsDelta === "string" && argsDelta.length > 0) {
          toolCallSeen = true
          argsAccum += argsDelta
          args.onPartialArgs(argsAccum)
        }
      }
    }

    if (!toolCallSeen) {
      throw new LLMError(
        `${this.config.label}: model did not return a tool call (does this model support function calling?)`,
        undefined,
        "no_tool_use",
      )
    }
    return argsAccum
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json" }
    if (this.config.apiKey) h.Authorization = `Bearer ${this.config.apiKey}`
    return h
  }
}

function tryPartialParse(json: string): unknown {
  try {
    return parsePartialJson(json, Allow.ALL)
  } catch {
    return null
  }
}

function parseFinalJson(text: string, label: string): unknown {
  try {
    return JSON.parse(text)
  } catch (err) {
    throw new LLMError(`${label}: failed to parse final tool arguments as JSON`, err, "schema")
  }
}

async function safeReadText(response: Response): Promise<string> {
  try {
    return await response.text()
  } catch {
    return ""
  }
}

function classifyHttpError(status: number, body: string, label: string): LLMError {
  if (status === 401 || status === 403) {
    return new LLMError(`${label}: authentication failed (HTTP ${status})`, body, "auth")
  }
  if (status === 404) {
    return new LLMError(
      `${label}: endpoint or model not found (HTTP 404). Check the URL and model name.`,
      body,
      "model_missing",
    )
  }
  if (status === 429) {
    return new LLMError(`${label}: rate limited (HTTP 429)`, body, "rate_limit")
  }
  return new LLMError(`${label}: HTTP ${status}: ${truncate(body, 200)}`, body, "network")
}

function classifyFetchError(err: unknown, label: string): LLMError {
  const msg = err instanceof Error ? err.message : String(err)
  if (/Failed to fetch|NetworkError|ECONNREFUSED|ENOTFOUND/i.test(msg)) {
    return new LLMError(
      `${label}: cannot reach endpoint. Check the URL and that the service is running.`,
      err,
      "endpoint_unreachable",
    )
  }
  return new LLMError(`${label}: ${msg}`, err, "network")
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s
}
