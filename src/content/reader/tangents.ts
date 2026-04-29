import type { Section } from "@/shared/schema"
import { findNearestOccurrence } from "./text-index"

/**
 * Walk paragraphs/lis and mark those that fall inside tangent or boilerplate
 * sections with `data-tangent="true"` (or "boilerplate"). CSS dims them when
 * the article root has `data-tangents="hide"`.
 *
 * Matching uses the section's char_range to find approximate paragraph
 * locations within the rendered fullText (built from the same TreeWalker).
 */
export function markTangentParagraphs(
  articleRoot: HTMLElement,
  fullText: string,
  sections: Section[],
): { marked: number } {
  const targets = sections.filter((s) => s.relevance === "tangent" || s.relevance === "boilerplate")
  if (targets.length === 0) return { marked: 0 }

  const paragraphs = Array.from(articleRoot.querySelectorAll("p, li, blockquote")) as HTMLElement[]

  // Build paragraph offsets in fullText. We do this by best-effort substring
  // search of each paragraph's textContent. Cheap and good enough.
  const paragraphRanges = paragraphs.map((p) => {
    const text = (p.textContent ?? "").trim()
    if (text.length < 8) return { el: p, start: -1, end: -1 }
    const start = findNearestOccurrence(
      fullText,
      text.slice(0, Math.min(60, text.length)),
      0,
      fullText.length,
    )
    if (start === -1) return { el: p, start: -1, end: -1 }
    return { el: p, start, end: start + text.length }
  })

  let marked = 0
  for (const section of targets) {
    const [secStart, secEnd] = section.char_range
    for (const p of paragraphRanges) {
      if (p.start < 0) continue
      // Overlap test
      if (p.end < secStart || p.start > secEnd) continue
      const tag = section.relevance === "boilerplate" ? "boilerplate" : "true"
      // boilerplate wins over tangent
      if (p.el.dataset.tangent === "boilerplate") continue
      p.el.dataset.tangent = tag
      marked++
    }
  }

  return { marked }
}
