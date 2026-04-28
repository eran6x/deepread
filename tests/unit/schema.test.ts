import { AnalysisResult, PartialAnalysisResult } from "@/shared/schema"
import { describe, expect, it } from "vitest"

const validResult = {
  verdict: { decision: "read", reason: "Original benchmarks on rate-limit algorithms." },
  brief: [
    "Token-bucket vs sliding-window compared at scale.",
    "Author tested both at 100k requests per second.",
    "Recommendation: hybrid approach with explicit fallback.",
  ],
  topics: ["rate limiting", "benchmarks", "distributed systems"],
  est_read_time_min: 8,
  difficulty: "medium",
  sections: [
    {
      heading: "Setup",
      char_range: [0, 500],
      one_liner: "Defines the benchmark harness.",
      relevance: "supporting",
    },
  ],
  spans: [
    { char_range: [12, 24], category: "claim" },
    { char_range: [50, 56], category: "number" },
  ],
}

describe("AnalysisResult schema", () => {
  it("accepts a valid result", () => {
    const parsed = AnalysisResult.safeParse(validResult)
    expect(parsed.success).toBe(true)
  })

  it("accepts a brief with 1-3 bullets", () => {
    const one = { ...validResult, brief: ["only one"] }
    expect(AnalysisResult.safeParse(one).success).toBe(true)
  })

  it("rejects a brief with 0 bullets or more than 3", () => {
    expect(AnalysisResult.safeParse({ ...validResult, brief: [] }).success).toBe(false)
    expect(AnalysisResult.safeParse({ ...validResult, brief: ["a", "b", "c", "d"] }).success).toBe(
      false,
    )
  })

  it("rejects an unknown verdict decision", () => {
    const bad = { ...validResult, verdict: { decision: "maybe", reason: "x" } }
    expect(AnalysisResult.safeParse(bad).success).toBe(false)
  })

  it("rejects too many topics", () => {
    const bad = { ...validResult, topics: ["a", "b", "c", "d", "e", "f"] }
    expect(AnalysisResult.safeParse(bad).success).toBe(false)
  })
})

describe("PartialAnalysisResult schema", () => {
  it("accepts an empty object", () => {
    expect(PartialAnalysisResult.safeParse({}).success).toBe(true)
  })

  it("accepts a partial with only verdict.decision", () => {
    const partial = { verdict: { decision: "skim", reason: "Some useful content but uneven." } }
    expect(PartialAnalysisResult.safeParse(partial).success).toBe(true)
  })

  it("still rejects a non-enum decision in a partial", () => {
    const bad = { verdict: { decision: "yolo", reason: "x" } }
    expect(PartialAnalysisResult.safeParse(bad).success).toBe(false)
  })
})
