import { TELEMETRY_LOG_PREFIX } from "@/shared/constants"
import type { RuntimeMessage } from "@/shared/types"

/**
 * Tracks reading speed by timing how long each paragraph spends in the focus
 * band. Approximates word count from text length / 5. Sends samples to the
 * background for aggregation.
 */
export class WpmTracker {
  private readonly contentHash: string
  private readonly observer: IntersectionObserver
  /** When did each currently-active paragraph become active. */
  private readonly enterTs = new Map<Element, number>()
  /** Set of elements we've already sampled, to avoid double-counting on re-enter. */
  private readonly sampled = new WeakSet<Element>()
  private regressions = 0
  private articlesCompletedAtScroll = 0
  private destroyed = false

  constructor(scrollHost: HTMLElement, articleRoot: HTMLElement, contentHash: string) {
    this.contentHash = contentHash
    this.observer = new IntersectionObserver((entries) => this.onChange(entries), {
      root: scrollHost,
      rootMargin: "-25% 0px -25% 0px",
      threshold: 0,
    })
    const candidates = articleRoot.querySelectorAll("p, li, blockquote")
    for (const el of Array.from(candidates)) this.observer.observe(el)

    scrollHost.addEventListener("scroll", this.onScroll, { passive: true })
    this.lastScrollY = scrollHost.scrollTop
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.observer.disconnect()
    // Flush any open timings as best-effort
    const now = performance.now()
    for (const [el, enteredAt] of this.enterTs) this.flush(el, enteredAt, now)
    this.enterTs.clear()
  }

  private lastScrollY = 0
  private onScroll = (e: Event) => {
    const target = e.currentTarget as HTMLElement
    const dy = target.scrollTop - this.lastScrollY
    this.lastScrollY = target.scrollTop
    if (dy < -40) this.regressions++
    if (target.scrollTop / Math.max(1, target.scrollHeight - target.clientHeight) > 0.9) {
      this.articlesCompletedAtScroll = 1
    }
  }

  private onChange(entries: IntersectionObserverEntry[]) {
    const now = performance.now()
    for (const entry of entries) {
      if (entry.isIntersecting) {
        if (!this.enterTs.has(entry.target)) this.enterTs.set(entry.target, now)
      } else {
        const enteredAt = this.enterTs.get(entry.target)
        if (enteredAt != null) {
          this.flush(entry.target, enteredAt, now)
          this.enterTs.delete(entry.target)
        }
      }
    }
  }

  private flush(el: Element, enteredAt: number, now: number) {
    if (this.sampled.has(el)) return
    const durationMs = now - enteredAt
    if (durationMs < 200 || durationMs > 120_000) return // ignore flicker / idle
    const text = el.textContent ?? ""
    const wordCount = approxWordCount(text)
    if (wordCount < 5) return
    const wpm = Math.round((wordCount / durationMs) * 60_000)
    if (wpm < 40 || wpm > 1500) return // sanity guard
    this.sampled.add(el)

    const payload = {
      kind: "stats.wpmSample" as const,
      contentHash: this.contentHash,
      wpm,
      wordCount,
      durationMs: Math.round(durationMs),
      ts: Date.now(),
    }
    void chrome.runtime.sendMessage<RuntimeMessage, void>(payload).catch(() => {})
    console.debug(`${TELEMETRY_LOG_PREFIX} wpm.sample`, payload)
  }

  flushFinal(): void {
    void chrome.runtime
      .sendMessage<RuntimeMessage, void>({
        kind: "stats.session",
        contentHash: this.contentHash,
        regressions: this.regressions,
        completed: this.articlesCompletedAtScroll === 1,
        ts: Date.now(),
      })
      .catch(() => {})
  }
}

export function approxWordCount(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/).length
}
