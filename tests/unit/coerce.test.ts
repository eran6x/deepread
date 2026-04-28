import { coerceAnalysis } from "@/shared/coerce"
import { describe, expect, it } from "vitest"

describe("coerceAnalysis", () => {
  it("filters spans with invalid categories", () => {
    const input = {
      spans: [
        { char_range: [0, 5], category: "entity" },
        { char_range: [6, 12], category: "supporting" },
        { char_range: [13, 20], category: "claim" },
        { char_range: [21, 30], category: "core" },
      ],
    }
    const out = coerceAnalysis(input) as { spans: Array<{ category: string }> }
    expect(out.spans.map((s) => s.category)).toEqual(["entity", "claim"])
  })

  it("filters sections with invalid relevance values", () => {
    const input = {
      sections: [
        { heading: "A", char_range: [0, 100], one_liner: "x", relevance: "core" },
        { heading: "B", char_range: [100, 200], one_liner: "y", relevance: "entity" },
        { heading: "C", char_range: [200, 300], one_liner: "z", relevance: "tangent" },
      ],
    }
    const out = coerceAnalysis(input) as { sections: Array<{ heading: string }> }
    expect(out.sections.map((s) => s.heading)).toEqual(["A", "C"])
  })

  it("trims brief to 3 bullets", () => {
    const out = coerceAnalysis({ brief: ["a", "b", "c", "d", "e"] }) as { brief: string[] }
    expect(out.brief).toEqual(["a", "b", "c"])
  })

  it("trims topics to 5", () => {
    const out = coerceAnalysis({ topics: ["a", "b", "c", "d", "e", "f", "g"] }) as {
      topics: string[]
    }
    expect(out.topics).toEqual(["a", "b", "c", "d", "e"])
  })

  it("returns non-objects unchanged", () => {
    expect(coerceAnalysis(null)).toBe(null)
    expect(coerceAnalysis("hello")).toBe("hello")
    expect(coerceAnalysis(undefined)).toBe(undefined)
  })

  it("does not mutate the input object", () => {
    const input = {
      spans: [
        { char_range: [0, 5], category: "entity" },
        { char_range: [6, 12], category: "supporting" },
      ],
    }
    coerceAnalysis(input)
    expect(input.spans).toHaveLength(2)
  })
})
