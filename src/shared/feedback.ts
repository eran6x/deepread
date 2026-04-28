import type { AnalysisResult, Difficulty, VerdictDecision } from "./schema"

export interface FeedbackMetrics {
  verdict: VerdictDecision
  difficulty: Difficulty
  estReadTimeMin: number
  reasonLength: number
  briefBulletLengths: number[]
  topicCount: number
  sectionCount: number
  sectionRelevance: {
    core: number
    supporting: number
    tangent: number
    boilerplate: number
  }
  spanCount: number
  spanCategories: {
    entity: number
    claim: number
    evidence: number
    number: number
  }
}

export interface FeedbackEntry {
  /** SHA-256 of the article text — also the cache key for the analysis. */
  contentHash: string
  /** When the user submitted the rating (epoch ms). */
  ts: number
  /** 1 (worst) to 10 (best). */
  rating: number
  /** Article title at time of analysis (truncated to 140 chars). */
  title: string
  /** Article URL at time of analysis. */
  url: string
  /** Approximate word count of the extracted article. */
  wordCount: number
  /** Provider used to produce this analysis. */
  provider: "anthropic" | "ollama" | "deepseek"
  /** Model name actually used. */
  model: string
  /** Time from analysis-start to analysis-complete. Null if served from cache. */
  latencyMs: number | null
  /** Structural metrics derived from the AnalysisResult. */
  metrics: FeedbackMetrics
}

export const FEEDBACK_MAX_ENTRIES = 100

export function buildMetrics(result: AnalysisResult): FeedbackMetrics {
  const sectionRelevance = { core: 0, supporting: 0, tangent: 0, boilerplate: 0 }
  for (const s of result.sections) sectionRelevance[s.relevance]++

  const spanCategories = { entity: 0, claim: 0, evidence: 0, number: 0 }
  for (const sp of result.spans) spanCategories[sp.category]++

  return {
    verdict: result.verdict.decision,
    difficulty: result.difficulty,
    estReadTimeMin: result.est_read_time_min,
    reasonLength: result.verdict.reason.length,
    briefBulletLengths: result.brief.map((b) => b.length),
    topicCount: result.topics.length,
    sectionCount: result.sections.length,
    sectionRelevance,
    spanCount: result.spans.length,
    spanCategories,
  }
}

export function approxWordCount(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/).length
}
