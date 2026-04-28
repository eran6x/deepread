import type { AnalysisResult, DefinitionResult, PartialAnalysisResult } from "@/shared/schema"
import type { ProviderTestResult } from "@/shared/types"

export interface AnalyzeInput {
  title: string
  url: string
  text: string
}

export interface DefineInput {
  word: string
  sentence: string
}

export type PartialHandler = (partial: PartialAnalysisResult) => void

export interface LLMClient {
  analyze(input: AnalyzeInput, onPartial: PartialHandler): Promise<AnalysisResult>
  define(input: DefineInput): Promise<DefinitionResult>
  test(): Promise<ProviderTestResult>
}

export type LLMErrorKind =
  | "auth"
  | "network"
  | "rate_limit"
  | "schema"
  | "endpoint_unreachable"
  | "model_missing"
  | "no_tool_use"
  | "permission_denied"
  | "missing_credentials"
  | "missing_config"
  | "unknown"

export class LLMError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
    readonly kind: LLMErrorKind = "unknown",
  ) {
    super(message)
    this.name = "LLMError"
  }
}

/**
 * Tiny realistic article used for the provider-test compatibility check.
 * Should produce a valid AnalysisResult on any reasonably capable model.
 */
export const TEST_ARTICLE = {
  title: "A short note on rate limiting",
  url: "https://example.com/test",
  text: "Rate limiting is the practice of capping the number of requests a service accepts in a given window. The two most common algorithms are the token bucket, which lets short bursts through, and the sliding window, which enforces a stricter average. In a 2023 internal benchmark at scale, the token bucket handled bursts up to 3x the average load with under 10ms added latency, while the sliding window held the average exactly but rejected 8% of legitimate burst traffic. The takeaway: pick token bucket for user-facing APIs and sliding window for cost control.",
} as const
