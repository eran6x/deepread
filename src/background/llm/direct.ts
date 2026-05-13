import { coerceAnalysis } from "@/shared/coerce"
import { ANTHROPIC_MODELS } from "@/shared/constants"
import { AnalysisResult, DefinitionResult, PartialAnalysisResult } from "@/shared/schema"
import type { ProviderTestResult } from "@/shared/types"
import Anthropic from "@anthropic-ai/sdk"
import {
  type AnalyzeInput,
  type AskInput,
  type DefineInput,
  type LLMClient,
  LLMError,
  type PartialHandler,
  TEST_ARTICLE,
  type UsageHandler,
} from "./client"
import {
  ANALYSIS_SYSTEM_PROMPT,
  ANALYSIS_TOOL,
  DEFINE_SYSTEM_PROMPT,
  DEFINE_TOOL,
  buildAnalysisUserMessage,
  buildAskSystemPrompt,
  buildDefineUserMessage,
} from "./prompts"

export class DirectAnthropicClient implements LLMClient {
  private client: Anthropic

  constructor(apiKey: string) {
    if (!apiKey) throw new LLMError("Missing API key", undefined, "auth")
    this.client = new Anthropic({
      apiKey,
      dangerouslyAllowBrowser: true,
    })
  }

  async analyze(
    input: AnalyzeInput,
    onPartial: PartialHandler,
    onUsage?: UsageHandler,
  ): Promise<AnalysisResult> {
    let stream: ReturnType<Anthropic["messages"]["stream"]>
    try {
      stream = this.client.messages.stream({
        model: ANTHROPIC_MODELS.analysis,
        max_tokens: 4096,
        system: ANALYSIS_SYSTEM_PROMPT,
        tools: [ANALYSIS_TOOL],
        tool_choice: { type: "tool", name: ANALYSIS_TOOL.name },
        messages: [
          {
            role: "user",
            content: buildAnalysisUserMessage(input),
          },
        ],
      })
    } catch (err) {
      throw classifyError(err)
    }

    stream.on("inputJson", (_partialJson, snapshot) => {
      if (snapshot == null || typeof snapshot !== "object") return
      const validated = PartialAnalysisResult.safeParse(coerceAnalysis(snapshot))
      if (validated.success) onPartial(validated.data)
    })

    let finalMessage: Awaited<ReturnType<typeof stream.finalMessage>>
    try {
      finalMessage = await stream.finalMessage()
    } catch (err) {
      throw classifyError(err)
    }

    const toolUse = finalMessage.content.find((b) => b.type === "tool_use")
    if (!toolUse || toolUse.type !== "tool_use") {
      throw new LLMError("Model did not return a tool call", undefined, "schema")
    }

    if (onUsage && finalMessage.usage) {
      onUsage({
        inputTokens: finalMessage.usage.input_tokens ?? 0,
        outputTokens: finalMessage.usage.output_tokens ?? 0,
      })
    }

    const validated = AnalysisResult.safeParse(coerceAnalysis(toolUse.input))
    if (!validated.success) {
      throw new LLMError(
        `Schema validation failed: ${validated.error.message}`,
        validated.error,
        "schema",
      )
    }
    return validated.data
  }

  async define(input: DefineInput): Promise<DefinitionResult> {
    let response: Anthropic.Message
    try {
      response = await this.client.messages.create({
        model: ANTHROPIC_MODELS.define,
        max_tokens: 256,
        system: DEFINE_SYSTEM_PROMPT,
        tools: [DEFINE_TOOL],
        tool_choice: { type: "tool", name: DEFINE_TOOL.name },
        messages: [
          {
            role: "user",
            content: buildDefineUserMessage(input.word, input.sentence),
          },
        ],
      })
    } catch (err) {
      throw classifyError(err)
    }

    const toolUse = response.content.find((b) => b.type === "tool_use")
    if (!toolUse || toolUse.type !== "tool_use") {
      throw new LLMError("Model did not return a tool call", undefined, "schema")
    }

    const validated = DefinitionResult.safeParse(toolUse.input)
    if (!validated.success) {
      throw new LLMError(
        `Schema validation failed: ${validated.error.message}`,
        validated.error,
        "schema",
      )
    }
    return validated.data
  }

  async ask(input: AskInput, onPartial: (text: string) => void): Promise<string> {
    let stream: ReturnType<Anthropic["messages"]["stream"]>
    try {
      stream = this.client.messages.stream({
        model: ANTHROPIC_MODELS.analysis,
        max_tokens: 1024,
        system: buildAskSystemPrompt(input.article),
        messages: [...input.history, { role: "user", content: input.question }],
      })
    } catch (err) {
      throw classifyError(err)
    }

    let accumulated = ""
    stream.on("text", (delta: string) => {
      accumulated += delta
      onPartial(accumulated)
    })

    try {
      await stream.finalMessage()
    } catch (err) {
      throw classifyError(err)
    }
    return accumulated
  }

  async test(): Promise<ProviderTestResult> {
    try {
      await this.analyze(TEST_ARTICLE, () => {})
      return { ok: true }
    } catch (err) {
      return mapErrorToTestResult(err)
    }
  }
}

function mapErrorToTestResult(err: unknown): ProviderTestResult {
  if (err instanceof LLMError) {
    return { ok: false, reason: err.kind, detail: err.message }
  }
  return { ok: false, reason: "unknown", detail: err instanceof Error ? err.message : String(err) }
}

function classifyError(err: unknown): LLMError {
  if (err instanceof Anthropic.AuthenticationError) {
    return new LLMError("Invalid API key", err, "auth")
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new LLMError("Rate limit exceeded", err, "rate_limit")
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new LLMError("Network error", err, "network")
  }
  if (err instanceof Error) return new LLMError(err.message, err)
  return new LLMError("Unknown error", err)
}
