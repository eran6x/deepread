import type { Section } from "@/shared/schema"
import { findNearestOccurrence } from "./text-index"

/**
 * Drives active-paragraph dimming. The paragraph whose center is closest to
 * the scroll-container's viewport center is marked `is-active`; the article
 * root has `data-focus="on"` so the CSS dims the rest.
 */
/**
 * Vertical inset (in % of scroll-host height) that defines the focus band.
 * 25% top + 25% bottom = the middle 50% of the viewport is the active zone.
 * Any paragraph whose rect overlaps this band is marked `is-active`. Fast
 * readers see a generous active zone; CSS does asymmetric fade timing so
 * activation feels snappy and deactivation has a soft trail.
 */
const BAND_INSET_PERCENT = 25

export class ActiveParagraph {
  private readonly articleRoot: HTMLElement
  private readonly observer: IntersectionObserver
  private readonly active = new Set<Element>()

  constructor(scrollHost: HTMLElement, articleRoot: HTMLElement) {
    this.articleRoot = articleRoot
    this.observer = new IntersectionObserver(
      (entries) => this.onChange(entries),
      {
        root: scrollHost,
        rootMargin: `-${BAND_INSET_PERCENT}% 0px -${BAND_INSET_PERCENT}% 0px`,
        threshold: 0,
      },
    )
    this.attach()
  }

  enable() {
    this.articleRoot.setAttribute("data-focus", "on")
  }

  destroy() {
    this.observer.disconnect()
    for (const el of this.active) el.classList.remove("is-active")
    this.active.clear()
    this.articleRoot.removeAttribute("data-focus")
  }

  private attach() {
    const candidates = this.articleRoot.querySelectorAll("p, li, blockquote, h1, h2, h3, h4")
    for (const el of Array.from(candidates)) this.observer.observe(el)
  }

  private onChange(entries: IntersectionObserverEntry[]) {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        if (!this.active.has(entry.target)) {
          entry.target.classList.add("is-active")
          this.active.add(entry.target)
        }
      } else if (this.active.has(entry.target)) {
        entry.target.classList.remove("is-active")
        this.active.delete(entry.target)
      }
    }
  }
}

/**
 * Insert pinned one-liner subtitles after each section heading, matched by
 * the LLM's section.heading text. Falls back to char-range proximity when
 * heading text alone is ambiguous.
 */
export function pinSectionOneLiners(
  articleRoot: HTMLElement,
  fullText: string,
  sections: Section[],
): number {
  let inserted = 0
  const headingEls = Array.from(articleRoot.querySelectorAll("h1, h2, h3, h4")) as HTMLElement[]

  for (const section of sections) {
    if (!section.one_liner.trim()) continue
    const target = findHeadingForSection(headingEls, fullText, section)
    if (!target) continue
    if (target.dataset.deepreadOneliner === "1") continue
    const sub = articleRoot.ownerDocument.createElement("div")
    sub.className = "section-oneliner"
    sub.textContent = section.one_liner
    target.insertAdjacentElement("afterend", sub)
    target.dataset.deepreadOneliner = "1"
    inserted++
  }
  return inserted
}

function findHeadingForSection(
  headings: HTMLElement[],
  fullText: string,
  section: Section,
): HTMLElement | null {
  const wanted = section.heading.trim()
  if (!wanted) return null
  // Exact textContent match
  for (const h of headings) {
    if (h.textContent?.trim() === wanted && !h.dataset.deepreadOneliner) return h
  }
  // Case-insensitive fallback
  const lower = wanted.toLowerCase()
  for (const h of headings) {
    if (h.textContent?.trim().toLowerCase() === lower && !h.dataset.deepreadOneliner) return h
  }
  // Char-range proximity fallback: find the heading whose textContent appears
  // closest to section.char_range[0] in fullText.
  const [sectionStart] = section.char_range
  let best: HTMLElement | null = null
  let bestDistance = Number.POSITIVE_INFINITY
  for (const h of headings) {
    if (h.dataset.deepreadOneliner) continue
    const text = h.textContent?.trim()
    if (!text) continue
    const offset = findNearestOccurrence(fullText, text, sectionStart, 5000)
    if (offset === -1) continue
    const distance = Math.abs(offset - sectionStart)
    if (distance < bestDistance) {
      bestDistance = distance
      best = h
    }
  }
  return best
}
