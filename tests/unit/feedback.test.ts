import { approxWordCount, buildMetrics } from "@/shared/feedback"
import type { AnalysisResult } from "@/shared/schema"
import { describe, expect, it } from "vitest"

const result: AnalysisResult = {
  verdict: { decision: "read", reason: "Original benchmarks on rate-limit algorithms." },
  brief: ["First bullet.", "Second bullet, slightly longer.", "Third bullet."],
  topics: ["rate limiting", "benchmarks"],
  est_read_time_min: 8,
  difficulty: "medium",
  sections: [
    { heading: "A", char_range: [0, 100], one_liner: "x", relevance: "core" },
    { heading: "B", char_range: [100, 200], one_liner: "y", relevance: "core" },
    { heading: "C", char_range: [200, 300], one_liner: "z", relevance: "supporting" },
    { heading: "D", char_range: [300, 400], one_liner: "w", relevance: "tangent" },
  ],
  spans: [
    { char_range: [0, 5], category: "entity" },
    { char_range: [6, 12], category: "entity" },
    { char_range: [13, 20], category: "claim" },
    { char_range: [21, 30], category: "number" },
  ],
}

describe("buildMetrics", () => {
  it("captures verdict and difficulty", () => {
    const m = buildMetrics(result)
    expect(m.verdict).toBe("read")
    expect(m.difficulty).toBe("medium")
    expect(m.estReadTimeMin).toBe(8)
  })

  it("computes brief bullet lengths", () => {
    const m = buildMetrics(result)
    expect(m.briefBulletLengths).toEqual([13, 31, 13])
  })

  it("counts section relevance distribution", () => {
    const m = buildMetrics(result)
    expect(m.sectionRelevance).toEqual({ core: 2, supporting: 1, tangent: 1, boilerplate: 0 })
    expect(m.sectionCount).toBe(4)
  })

  it("counts span category distribution", () => {
    const m = buildMetrics(result)
    expect(m.spanCategories).toEqual({ entity: 2, claim: 1, evidence: 0, number: 1 })
    expect(m.spanCount).toBe(4)
  })

  it("captures reason length and topic count", () => {
    const m = buildMetrics(result)
    expect(m.reasonLength).toBe(result.verdict.reason.length)
    expect(m.topicCount).toBe(2)
  })
})

describe("approxWordCount", () => {
  it("counts words separated by whitespace", () => {
    expect(approxWordCount("hello world foo bar")).toBe(4)
  })

  it("handles multiple whitespace", () => {
    expect(approxWordCount("hello   world\n\nfoo\tbar")).toBe(4)
  })

  it("returns 0 for empty or whitespace-only input", () => {
    expect(approxWordCount("")).toBe(0)
    expect(approxWordCount("   ")).toBe(0)
    expect(approxWordCount("\n\t  ")).toBe(0)
  })
})
