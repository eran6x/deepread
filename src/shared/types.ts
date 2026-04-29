import type { Provider } from "./constants"
import type { FeedbackEntry } from "./feedback"
import type { AnalysisResult, DefinitionResult, PartialAnalysisResult } from "./schema"

export interface OllamaConfig {
  endpoint: string
  model: string
}

export interface DeepSeekConfig {
  model: string
}

export type HighlightPalette = "default" | "high-contrast" | "mono"
export type HighlightStyle = "underline" | "fill"

export interface ReaderUISettings {
  /** Opacity for paragraphs outside the focus band (0.2 - 1). */
  dimOpacity: number
  /** Color palette name for highlight overlays. */
  palette: HighlightPalette
  /**
   * How highlights are rendered. "underline" puts a colored bar under the
   * text (always readable, default). "fill" tints the text background — works
   * in light mode but can clash with text in dark mode.
   */
  highlightStyle: HighlightStyle
  /** Per-category enable flags. All on by default. */
  categories: {
    entity: boolean
    claim: boolean
    evidence: boolean
    number: boolean
  }
  /** Whether to dim sections marked tangent/boilerplate. */
  hideTangents: boolean
}

export interface PrivacySettings {
  /** Domains the user has explicitly allowed (overrides sensitive-list). */
  allowedDomains: string[]
  /** Domains the user has explicitly added to their personal block-list. */
  blockedDomains: string[]
  /** Whether the first-run onboarding has been completed. */
  onboardingComplete: boolean
  /** Local telemetry events: structured-log only at v1 (no backend). */
  telemetryConsent: boolean
}

export interface AppSettings {
  wpm: number
  pacerStyle: "band" | "underline" | "chunk"
  provider: Provider
  ollama: OllamaConfig
  deepseek: DeepSeekConfig
  reader: ReaderUISettings
  privacy: PrivacySettings
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
  | { kind: "feedback.append"; entry: FeedbackEntry }
  | { kind: "feedback.list" }
  | { kind: "feedback.get"; contentHash: string }
  | { kind: "reader.open"; result: AnalysisResult; settings: AppSettings }
  | { kind: "reader.close" }
  | { kind: "reader.ack"; ok: true }
  | { kind: "reader.error"; reason: string }
  | { kind: "define.request"; word: string; sentence: string; lang: string }
  | {
      kind: "stats.wpmSample"
      contentHash: string
      wpm: number
      wordCount: number
      durationMs: number
      ts: number
    }
  | {
      kind: "stats.session"
      contentHash: string
      regressions: number
      completed: boolean
      ts: number
    }
  | { kind: "stats.summary" }
  | { kind: "telemetry.log"; event: string; payload: Record<string, unknown> }

export type PortMessage =
  | { kind: "analysis.partial"; result: PartialAnalysisResult }
  | {
      kind: "analysis.complete"
      result: AnalysisResult
      contentHash: string
      wordCount: number
      provider: Provider
      model: string
      latencyMs: number | null
    }
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
