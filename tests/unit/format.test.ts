import type { AnalysisResult } from "@/shared/schema"
import { formatAsMarkdown, slug } from "@/sidepanel/format"
import { describe, expect, it } from "vitest"

const result: AnalysisResult = {
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
  spans: [],
}

const article = {
  title: "Rate-Limit Algorithms at 100k RPS",
  url: "https://example.com/rate-limit",
}

describe("formatAsMarkdown", () => {
  it("renders title and URL at the top", () => {
    const md = formatAsMarkdown(result, article)
    expect(md).toContain(`# ${article.title}`)
    expect(md).toContain(article.url)
  })

  it("renders the verdict line with decision uppercased", () => {
    const md = formatAsMarkdown(result, article)
    expect(md).toContain("**Verdict: READ**")
    expect(md).toContain("8 min")
    expect(md).toContain("medium")
  })

  it("renders the reason as a blockquote", () => {
    const md = formatAsMarkdown(result, article)
    expect(md).toContain(`> ${result.verdict.reason}`)
  })

  it("renders all brief bullets", () => {
    const md = formatAsMarkdown(result, article)
    for (const bullet of result.brief) {
      expect(md).toContain(`- ${bullet}`)
    }
  })

  it("joins topics with middle dots", () => {
    const md = formatAsMarkdown(result, article)
    expect(md).toContain("rate limiting · benchmarks · distributed systems")
  })

  it("renders sections with relevance suffix", () => {
    const md = formatAsMarkdown(result, article)
    expect(md).toContain("**Setup** — Defines the benchmark harness. *(supporting)*")
  })

  it("omits topics section when empty", () => {
    const md = formatAsMarkdown({ ...result, topics: [] }, article)
    expect(md).not.toContain("## Topics")
  })

  it("omits sections section when empty", () => {
    const md = formatAsMarkdown({ ...result, sections: [] }, article)
    expect(md).not.toContain("## Sections")
  })
})

describe("slug", () => {
  it("lowercases and hyphenates", () => {
    expect(slug("Rate-Limit Algorithms at 100k RPS")).toBe("rate-limit-algorithms-at-100k-rps")
  })

  it("strips leading and trailing separators", () => {
    expect(slug("  --hello world!--  ")).toBe("hello-world")
  })

  it("falls back to 'article' for empty input", () => {
    expect(slug("")).toBe("article")
    expect(slug("!@#$%")).toBe("article")
  })

  it("caps at 60 chars", () => {
    const long = "a".repeat(200)
    expect(slug(long).length).toBeLessThanOrEqual(60)
  })
})
