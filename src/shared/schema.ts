import { z } from "zod"

export const VerdictDecision = z.enum(["skip", "skim", "read"])
export type VerdictDecision = z.infer<typeof VerdictDecision>

export const Difficulty = z.enum(["easy", "medium", "hard"])
export type Difficulty = z.infer<typeof Difficulty>

export const Relevance = z.enum(["core", "supporting", "tangent", "boilerplate"])
export type Relevance = z.infer<typeof Relevance>

export const SpanCategory = z.enum(["entity", "claim", "evidence", "number"])
export type SpanCategory = z.infer<typeof SpanCategory>

const CharRange = z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()])

export const Section = z.object({
  heading: z.string(),
  char_range: CharRange,
  one_liner: z.string(),
  relevance: Relevance,
})
export type Section = z.infer<typeof Section>

export const Span = z.object({
  char_range: CharRange,
  category: SpanCategory,
})
export type Span = z.infer<typeof Span>

export const Verdict = z.object({
  decision: VerdictDecision,
  reason: z.string(),
})
export type Verdict = z.infer<typeof Verdict>

export const AnalysisResult = z.object({
  verdict: Verdict,
  brief: z.array(z.string()).min(1).max(3),
  topics: z.array(z.string()).max(5),
  est_read_time_min: z.number().int().positive(),
  difficulty: Difficulty,
  sections: z.array(Section),
  spans: z.array(Span),
})
export type AnalysisResult = z.infer<typeof AnalysisResult>

export const PartialAnalysisResult = AnalysisResult.partial()
export type PartialAnalysisResult = z.infer<typeof PartialAnalysisResult>

export const DefinitionResult = z.object({
  definition: z.string(),
  synonyms: z.array(z.string()).max(3),
})
export type DefinitionResult = z.infer<typeof DefinitionResult>
