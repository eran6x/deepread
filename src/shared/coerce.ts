const SPAN_CATEGORIES = new Set(["entity", "claim", "evidence", "number"])
const SECTION_RELEVANCES = new Set(["core", "supporting", "tangent", "boilerplate"])

/**
 * Filter and trim raw LLM output before Zod validation. Tolerates the most
 * common provider-side schema violations without rejecting the whole result.
 */
export function coerceAnalysis(raw: unknown): unknown {
  if (raw == null || typeof raw !== "object") return raw
  const r = { ...(raw as Record<string, unknown>) }

  if (Array.isArray(r.spans)) {
    r.spans = (r.spans as unknown[]).filter((s) => {
      if (s == null || typeof s !== "object") return false
      const cat = (s as Record<string, unknown>).category
      return typeof cat === "string" && SPAN_CATEGORIES.has(cat)
    })
  }

  if (Array.isArray(r.sections)) {
    r.sections = (r.sections as unknown[]).filter((s) => {
      if (s == null || typeof s !== "object") return false
      const rel = (s as Record<string, unknown>).relevance
      return typeof rel === "string" && SECTION_RELEVANCES.has(rel)
    })
  }

  if (Array.isArray(r.brief) && r.brief.length > 3) {
    r.brief = (r.brief as unknown[]).slice(0, 3)
  }

  if (Array.isArray(r.topics) && r.topics.length > 5) {
    r.topics = (r.topics as unknown[]).slice(0, 5)
  }

  return r
}
