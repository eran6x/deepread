import type { ResolvedRange } from "./text-index"

/**
 * Paints a layer of absolute-positioned overlay divs behind the article
 * text, one per client rect of each resolved range. Position is computed
 * relative to the layer itself, so the math is invariant under scroll: the
 * layer scrolls with the content (it's a child of articleRoot), and span
 * rects move by the same amount, leaving their relative offsets unchanged.
 */
export class HighlightLayer {
  private readonly host: HTMLElement
  private readonly layer: HTMLElement
  private readonly ranges: ResolvedRange[] = []
  private rafScheduled = false
  private resizeObserver: ResizeObserver | null = null

  constructor(host: HTMLElement, articleRoot: HTMLElement) {
    this.host = host
    this.layer = host.ownerDocument.createElement("div")
    this.layer.className = "highlight-layer"
    // Insert as the first child so highlights paint behind the text content
    // (later siblings render on top in normal flow).
    articleRoot.insertBefore(this.layer, articleRoot.firstChild)

    this.resizeObserver = new ResizeObserver(() => this.scheduleRepaint())
    this.resizeObserver.observe(articleRoot)
    host.addEventListener("scroll", this.onScroll, { passive: true })
  }

  setRanges(ranges: ResolvedRange[]): void {
    this.ranges.length = 0
    this.ranges.push(...ranges)
    this.repaint()
  }

  destroy(): void {
    this.host.removeEventListener("scroll", this.onScroll)
    this.resizeObserver?.disconnect()
    this.resizeObserver = null
    this.layer.remove()
  }

  private onScroll = () => this.scheduleRepaint()

  private scheduleRepaint() {
    if (this.rafScheduled) return
    this.rafScheduled = true
    requestAnimationFrame(() => {
      this.rafScheduled = false
      this.repaint()
    })
  }

  private repaint() {
    const fragment = this.host.ownerDocument.createDocumentFragment()
    const layerRect = this.layer.getBoundingClientRect()

    for (const { range, category } of this.ranges) {
      const rects = range.getClientRects()
      for (const rect of rects) {
        if (rect.width < 0.5 || rect.height < 0.5) continue
        const div = this.host.ownerDocument.createElement("div")
        div.className = `hl hl--${category}`
        div.style.left = `${rect.left - layerRect.left}px`
        div.style.top = `${rect.top - layerRect.top}px`
        div.style.width = `${rect.width}px`
        div.style.height = `${rect.height}px`
        fragment.appendChild(div)
      }
    }
    this.layer.replaceChildren(fragment)
  }
}
