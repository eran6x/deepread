import type { DefinitionResult } from "@/shared/schema"
import type { RuntimeMessage } from "@/shared/types"

const WORD_CHAR = /[\p{L}\p{N}_'’-]/u

/**
 * Click-to-define handler. On a single-click in the article body, finds the
 * word at the cursor, renders a popover with a definition and synonyms.
 * Definitions are cached locally by (word, lang) so repeated lookups are
 * instant and free.
 */
export class ClickToDefine {
  private readonly articleRoot: HTMLElement
  private readonly shadowRoot: ShadowRoot
  private readonly lang: string
  private popover: HTMLElement | null = null
  private currentToken = 0

  constructor(shadowRoot: ShadowRoot, articleRoot: HTMLElement, lang: string | null) {
    this.shadowRoot = shadowRoot
    this.articleRoot = articleRoot
    this.lang = lang ?? "en"
    this.articleRoot.addEventListener("click", this.onClick)
    this.articleRoot.addEventListener("mousedown", this.onMouseDown)
  }

  destroy(): void {
    this.articleRoot.removeEventListener("click", this.onClick)
    this.articleRoot.removeEventListener("mousedown", this.onMouseDown)
    this.dismiss()
  }

  private onMouseDown = () => {
    // Always dismiss on any mousedown — including inside the popover. This
    // makes the bubble feel disposable: tap once anywhere to make it go away.
    this.dismiss()
  }

  private onClick = (e: MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    if (e.target instanceof HTMLAnchorElement) return
    // Skip if user is mid-selection (drag-select)
    const sel = (
      this.shadowRoot as ShadowRoot & { getSelection?: () => Selection | null }
    ).getSelection?.()
    if (sel && !sel.isCollapsed && sel.toString().trim().length > 0) return

    const target = e.target instanceof Element ? e.target : null
    const word = wordAtPoint(e.clientX, e.clientY, target, this.articleRoot)
    if (!word) return
    e.preventDefault()
    this.lookup(word)
  }

  private async lookup(found: WordHit) {
    const token = ++this.currentToken
    this.showLoading(found)

    // Show a clear error if the call hangs (e.g. service worker stalled).
    const timeoutId = window.setTimeout(() => {
      if (token !== this.currentToken) return
      this.showError(
        found,
        "Lookup timed out. Check the side panel for errors and confirm your provider is reachable.",
      )
    }, 15_000)

    try {
      const result = await chrome.runtime.sendMessage<RuntimeMessage, DefinitionResult | null>({
        kind: "define.request",
        word: found.word,
        sentence: found.sentence,
        lang: this.lang,
      })
      window.clearTimeout(timeoutId)
      if (token !== this.currentToken) return
      if (!result) {
        this.showError(
          found,
          "Couldn't fetch a definition. Check your provider in Settings (API key valid? endpoint reachable? model supports tool calling?).",
        )
        return
      }
      this.showDefinition(found, result)
    } catch (err) {
      window.clearTimeout(timeoutId)
      if (token !== this.currentToken) return
      this.showError(found, err instanceof Error ? err.message : "Lookup failed.")
    }
  }

  private showLoading(found: WordHit) {
    this.renderPopover(
      found,
      `<div class="define-loading">Looking up "${escapeHtml(found.word)}"…</div>`,
    )
  }

  private showError(found: WordHit, message: string) {
    this.renderPopover(
      found,
      `<div class="define-word">${escapeHtml(found.word)}</div>
       <div class="define-error">${escapeHtml(message)}</div>`,
    )
  }

  private showDefinition(found: WordHit, result: DefinitionResult) {
    const synonyms = result.synonyms.length
      ? `<div class="define-synonyms">${result.synonyms.map((s) => `<span class="define-syn">${escapeHtml(s)}</span>`).join("")}</div>`
      : ""
    this.renderPopover(
      found,
      `<div class="define-word">${escapeHtml(found.word)}</div>
       <div class="define-meaning">${escapeHtml(result.definition)}</div>
       ${synonyms}`,
    )
  }

  private renderPopover(found: WordHit, contentHtml: string) {
    // Internal replacement: just swap the DOM element. Do NOT touch the
    // token — doing so would invalidate the in-flight lookup that called
    // showLoading() → renderPopover().
    this.removePopover()
    const pop = this.shadowRoot.ownerDocument.createElement("div")
    pop.className = "define-popover"
    pop.innerHTML = contentHtml
    this.shadowRoot.querySelector(".root")?.appendChild(pop)
    this.popover = pop
    this.position(pop, found)
  }

  private removePopover() {
    this.popover?.remove()
    this.popover = null
  }

  private position(pop: HTMLElement, found: WordHit) {
    const root = this.shadowRoot.querySelector(".root") as HTMLElement
    const rect = found.rect
    const rootRect = root.getBoundingClientRect()
    pop.style.position = "absolute"
    pop.style.zIndex = "20"
    // Place above the word; flip below if no room
    const popHeight = pop.offsetHeight || 80
    const popWidth = pop.offsetWidth || 280
    let top = rect.top - rootRect.top + root.scrollTop - popHeight - 8
    if (top < root.scrollTop + 8) top = rect.bottom - rootRect.top + root.scrollTop + 8
    let left = rect.left - rootRect.left + root.scrollLeft + rect.width / 2 - popWidth / 2
    if (left < 8) left = 8
    if (left + popWidth > rootRect.width - 8) left = rootRect.width - popWidth - 8
    pop.style.top = `${top}px`
    pop.style.left = `${left}px`
  }

  private dismiss() {
    // User-initiated dismissal: invalidate any in-flight lookup AND remove
    // the popover. Internal popover replacements use removePopover() instead.
    this.currentToken++
    this.removePopover()
  }
}

interface WordHit {
  word: string
  sentence: string
  rect: DOMRect
}

function wordAtPoint(
  x: number,
  y: number,
  target: Element | null,
  fallbackRoot: HTMLElement,
): WordHit | null {
  // Try the click target first — its descendant text nodes are the most likely
  // hits and walking is cheaper. Fall back to the whole article if no hit.
  if (target) {
    const hit = searchTextNodes(target, fallbackRoot, x, y)
    if (hit) return hit
  }
  return searchTextNodes(fallbackRoot, fallbackRoot, x, y)
}

function searchTextNodes(root: Node, scopeRoot: Node, x: number, y: number): WordHit | null {
  const doc = (root as Element).ownerDocument
  if (!doc) return null
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) =>
      n.nodeValue && n.nodeValue.trim().length > 0
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT,
  })

  let node: Node | null
  // biome-ignore lint/suspicious/noAssignInExpressions: TreeWalker pattern
  while ((node = walker.nextNode())) {
    const textNode = node as Text
    if (!scopeRoot.contains(textNode)) continue
    const range = doc.createRange()
    range.selectNodeContents(textNode)
    const rects = range.getClientRects()
    for (const rect of rects) {
      if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) continue
      const offset = binarySearchOffset(textNode, x, y, doc)
      if (offset == null) continue
      const hit = buildHit(textNode, offset, doc)
      if (hit) return hit
    }
  }
  return null
}

function binarySearchOffset(textNode: Text, x: number, y: number, doc: Document): number | null {
  const len = textNode.data.length
  if (len === 0) return null

  let lo = 0
  let hi = len - 1
  let safety = 64
  while (lo <= hi && safety-- > 0) {
    const mid = (lo + hi) >> 1
    const range = doc.createRange()
    range.setStart(textNode, mid)
    range.setEnd(textNode, mid + 1)
    const rect = range.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) {
      lo = mid + 1
      continue
    }
    if (rect.bottom < y) {
      lo = mid + 1
    } else if (rect.top > y) {
      hi = mid - 1
    } else if (rect.right < x) {
      lo = mid + 1
    } else if (rect.left > x) {
      hi = mid - 1
    } else {
      return mid
    }
  }
  // Best effort: clamp to the discovered range
  return Math.max(0, Math.min(lo, len - 1))
}

function buildHit(textNode: Text, offset: number, doc: Document): WordHit | null {
  const text = textNode.data
  let start = offset
  let end = offset
  while (start > 0 && WORD_CHAR.test(text[start - 1] ?? "")) start--
  while (end < text.length && WORD_CHAR.test(text[end] ?? "")) end++
  if (end <= start) return null
  const word = text.slice(start, end).trim()
  if (!word || /^[\d\W]+$/.test(word)) return null

  const range = doc.createRange()
  range.setStart(textNode, start)
  range.setEnd(textNode, end)
  const rect = range.getBoundingClientRect()

  const ctxLo = Math.max(0, start - 120)
  const ctxHi = Math.min(text.length, end + 120)
  let sentence = text.slice(ctxLo, ctxHi).trim()
  if (sentence.length > 240) sentence = `${sentence.slice(0, 237)}...`

  return { word, sentence, rect }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}
