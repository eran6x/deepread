import { TELEMETRY_LOG_PREFIX } from "@/shared/constants"

/**
 * A word-level pacer: highlights the currently-paced word and advances at
 * the user's WPM. Keyboard controls:
 *   space        — play/pause
 *   ArrowLeft    — step back one word
 *   ArrowRight   — step forward one word
 *   ArrowUp      — increase WPM by 25
 *   ArrowDown    — decrease WPM by 25
 *
 * The pacer scrolls the active word into view and emits a callback when
 * speed changes so the UI / settings can reflect the new value.
 */

export interface PacerOptions {
  initialWpm: number
  onWpmChange?: (wpm: number) => void
}

interface Word {
  range: Range
  /** Length in words (always 1 — kept for forward compat with chunk mode). */
  weight: number
}

export class Pacer {
  private readonly shadowRoot: ShadowRoot
  private readonly articleRoot: HTMLElement
  private readonly scrollHost: HTMLElement
  private readonly indicator: HTMLElement
  private words: Word[] = []
  private idx = 0
  private playing = false
  private wpm: number
  private timer: number | null = null
  private readonly onWpmChange: ((wpm: number) => void) | undefined
  private statusEl: HTMLElement | null = null

  constructor(
    shadowRoot: ShadowRoot,
    scrollHost: HTMLElement,
    articleRoot: HTMLElement,
    opts: PacerOptions,
  ) {
    this.shadowRoot = shadowRoot
    this.scrollHost = scrollHost
    this.articleRoot = articleRoot
    this.wpm = opts.initialWpm
    this.onWpmChange = opts.onWpmChange
    this.indicator = this.createIndicator()
    this.statusEl = shadowRoot.querySelector(".pacer-status")
    this.tokenize()
    document.addEventListener("keydown", this.onKey, { capture: true })
  }

  destroy(): void {
    document.removeEventListener("keydown", this.onKey, { capture: true })
    this.pause()
    this.indicator.remove()
  }

  toggle(): void {
    if (this.playing) this.pause()
    else this.play()
  }

  play(): void {
    if (this.words.length === 0) return
    this.playing = true
    this.tick()
    this.updateStatus()
  }

  pause(): void {
    this.playing = false
    if (this.timer != null) {
      clearTimeout(this.timer)
      this.timer = null
    }
    this.updateStatus()
  }

  setWpm(wpm: number): void {
    this.wpm = clamp(wpm, 80, 1200)
    this.onWpmChange?.(this.wpm)
    this.updateStatus()
  }

  step(delta: number): void {
    this.idx = clamp(this.idx + delta, 0, Math.max(0, this.words.length - 1))
    this.paintCurrent()
  }

  private onKey = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
    if (e.metaKey || e.ctrlKey || e.altKey) return

    if (e.code === "Space") {
      e.preventDefault()
      this.toggle()
    } else if (e.key === "ArrowLeft") {
      e.preventDefault()
      this.step(-1)
    } else if (e.key === "ArrowRight") {
      e.preventDefault()
      this.step(1)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      this.setWpm(this.wpm + 25)
    } else if (e.key === "ArrowDown") {
      e.preventDefault()
      this.setWpm(this.wpm - 25)
    }
  }

  private tick(): void {
    if (!this.playing) return
    const intervalMs = (60_000 / this.wpm) * (this.words[this.idx]?.weight ?? 1)
    this.paintCurrent()
    this.timer = window.setTimeout(() => {
      if (!this.playing) return
      if (this.idx >= this.words.length - 1) {
        this.pause()
        return
      }
      this.idx++
      this.tick()
    }, intervalMs)
  }

  private paintCurrent(): void {
    const word = this.words[this.idx]
    if (!word) return
    const rect = word.range.getBoundingClientRect()
    if (rect.width < 0.5 || rect.height < 0.5) return

    const articleRect = this.articleRoot.getBoundingClientRect()
    this.indicator.style.left = `${rect.left - articleRect.left}px`
    this.indicator.style.top = `${rect.top - articleRect.top}px`
    this.indicator.style.width = `${rect.width}px`
    this.indicator.style.height = `${rect.height}px`
    this.indicator.style.display = "block"

    this.scrollIntoBand(rect)
  }

  private scrollIntoBand(rect: DOMRect): void {
    const hostRect = this.scrollHost.getBoundingClientRect()
    const top = hostRect.top + hostRect.height * 0.4
    const bottom = hostRect.top + hostRect.height * 0.6
    if (rect.top < top) {
      this.scrollHost.scrollBy({ top: rect.top - top, behavior: "auto" })
    } else if (rect.bottom > bottom) {
      this.scrollHost.scrollBy({ top: rect.bottom - bottom, behavior: "auto" })
    }
  }

  private updateStatus(): void {
    if (!this.statusEl) return
    this.statusEl.textContent = this.playing
      ? `${this.wpm} WPM · playing`
      : `${this.wpm} WPM · paused (space to play)`
  }

  private createIndicator(): HTMLElement {
    const el = this.shadowRoot.ownerDocument.createElement("div")
    el.className = "pacer-cursor"
    el.style.display = "none"
    this.articleRoot.appendChild(el)
    return el
  }

  /**
   * Tokenize all word-like substrings inside the article into Range objects.
   * One Range per word; chunked modes can group these later.
   */
  private tokenize(): void {
    const segmenter = new Intl.Segmenter("en", { granularity: "word" })
    const walker = document.createTreeWalker(this.articleRoot, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        if (!node.nodeValue?.trim()) return NodeFilter.FILTER_REJECT
        // Skip text inside the highlight layer / pacer cursor / popover etc.
        let parent: Node | null = node.parentNode
        while (parent && parent !== this.articleRoot) {
          if (
            parent instanceof HTMLElement &&
            (parent.classList.contains("highlight-layer") ||
              parent.classList.contains("pacer-cursor") ||
              parent.classList.contains("define-popover"))
          ) {
            return NodeFilter.FILTER_REJECT
          }
          parent = parent.parentNode
        }
        return NodeFilter.FILTER_ACCEPT
      },
    })

    const words: Word[] = []
    let textNode: Node | null
    // biome-ignore lint/suspicious/noAssignInExpressions: TreeWalker pattern
    while ((textNode = walker.nextNode())) {
      const data = (textNode as Text).data
      for (const seg of segmenter.segment(data)) {
        if (!seg.isWordLike) continue
        const range = document.createRange()
        try {
          range.setStart(textNode, seg.index)
          range.setEnd(textNode, seg.index + seg.segment.length)
          words.push({ range, weight: 1 })
        } catch {
          /* skip invalid range */
        }
      }
    }
    this.words = words
    console.info(`${TELEMETRY_LOG_PREFIX} pacer.tokenized`, { wordCount: words.length })
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}
