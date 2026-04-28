import type { Provider } from "./constants"
import type { AnalysisResult, DefinitionResult, PartialAnalysisResult } from "./schema"

export interface OllamaConfig {
  endpoint: string
  model: string
}

export interface DeepSeekConfig {
  model: string
}

export interface AppSettings {
  wpm: number
  dimOpacity: number
  pacerStyle: "band" | "underline" | "chunk"
  provider: Provider
  ollama: OllamaConfig
  deepseek: DeepSeekConfig
}

export interface ExtractedArticle {
  title: string
  byline: string | null
  text: string
  html: string
  lang: string | null
  excerpt: string | null
  siteName: string | null
  url: string
}

export type RuntimeMessage =
  | { kind: "extract.request" }
  | { kind: "extract.response"; article: ExtractedArticle }
  | { kind: "extract.error"; reason: string }
  | { kind: "analyze.start"; tabId: number }
  | { kind: "analyze.cancel" }
  | { kind: "settings.get" }
  | { kind: "settings.update"; patch: Partial<AppSettings> }
  | { kind: "secrets.set"; provider: "anthropic" | "deepseek"; key: string }
  | { kind: "secrets.status"; provider: "anthropic" | "deepseek" }
  | { kind: "provider.test"; provider: Provider }

export type PortMessage =
  | { kind: "analysis.partial"; result: PartialAnalysisResult }
  | { kind: "analysis.complete"; result: AnalysisResult }
  | { kind: "analysis.error"; reason: string }
  | { kind: "analysis.status"; phase: AnalysisPhase }

export type AnalysisPhase =
  | "idle"
  | "extracting"
  | "cache-hit"
  | "calling-llm"
  | "streaming"
  | "done"
  | "error"

export interface ApiKeyStatus {
  present: boolean
  masked: string | null
  validated: boolean
}

export type ProviderTestResult =
  | { ok: true }
  | {
      ok: false
      reason:
        | "missing_credentials"
        | "missing_config"
        | "auth"
        | "network"
        | "endpoint_unreachable"
        | "model_missing"
        | "no_tool_use"
        | "rate_limit"
        | "schema"
        | "permission_denied"
        | "unknown"
      detail?: string
    }

export type { AnalysisResult, DefinitionResult, PartialAnalysisResult }
