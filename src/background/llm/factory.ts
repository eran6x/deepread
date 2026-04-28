import { DEEPSEEK_DEFAULTS, type Provider } from "@/shared/constants"
import type { AppSettings } from "@/shared/types"
import { type LLMClient, LLMError } from "./client"
import { DirectAnthropicClient } from "./direct"
import { OpenAICompatibleClient } from "./openai-compat"

export interface ProviderSecrets {
  anthropicKey: string | null
  deepseekKey: string | null
}

export function createLLMClient(
  provider: Provider,
  settings: AppSettings,
  secrets: ProviderSecrets,
): LLMClient {
  switch (provider) {
    case "anthropic": {
      if (!secrets.anthropicKey) {
        throw new LLMError("No Anthropic API key set", undefined, "missing_credentials")
      }
      return new DirectAnthropicClient(secrets.anthropicKey)
    }
    case "ollama": {
      const { endpoint, model } = settings.ollama
      if (!endpoint || !model) {
        throw new LLMError("Ollama endpoint or model not set", undefined, "missing_config")
      }
      return new OpenAICompatibleClient({
        baseURL: normalizeOllamaBaseURL(endpoint),
        model,
        label: "Ollama",
      })
    }
    case "deepseek": {
      if (!secrets.deepseekKey) {
        throw new LLMError("No DeepSeek API key set", undefined, "missing_credentials")
      }
      return new OpenAICompatibleClient({
        baseURL: DEEPSEEK_DEFAULTS.baseURL,
        apiKey: secrets.deepseekKey,
        model: settings.deepseek.model || "deepseek-chat",
        label: "DeepSeek",
      })
    }
  }
}

/**
 * Ollama exposes its OpenAI-compatible endpoint at `/v1`. Accept both
 * `http://host:port` and `http://host:port/v1` from the user.
 */
export function normalizeOllamaBaseURL(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "")
  if (trimmed.endsWith("/v1")) return trimmed
  return `${trimmed}/v1`
}
