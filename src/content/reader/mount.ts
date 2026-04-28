import type { ExtractedArticle } from "@/shared/types"
import { READER_CSS } from "./styles"

export interface MountedReader {
  shadowHost: HTMLElement
  shadowRoot: ShadowRoot
  scrollHost: HTMLElement
  articleRoot: HTMLElement
  destroy: () => void
}

const HOST_TAG = "deepread-reader"
const PRIOR_BODY_OVERFLOW_KEY = "data-deepread-prior-overflow"

export function mountReader(article: ExtractedArticle, onClose: () => void): MountedReader {
  const existing = document.querySelector(HOST_TAG)
  if (existing) existing.remove()

  const host = document.createElement(HOST_TAG)
  document.documentElement.appendChild(host)
  const shadow = host.attachShadow({ mode: "open" })

  const style = document.createElement("style")
  style.textContent = READER_CSS
  shadow.appendChild(style)

  const root = document.createElement("div")
  root.className = "root"
  shadow.appendChild(root)

  const toolbar = document.createElement("div")
  toolbar.className = "toolbar"
  toolbar.innerHTML = `
    <div>
      <span class="brand">Deepread</span>
      <span class="brand-tag">Reader</span>
    </div>
    <div class="legend">
      <span class="legend-item"><span class="legend-swatch hl hl--entity"></span>entity</span>
      <span class="legend-item"><span class="legend-swatch hl hl--claim"></span>claim</span>
      <span class="legend-item"><span class="legend-swatch hl hl--evidence"></span>evidence</span>
      <span class="legend-item"><span class="legend-swatch hl hl--number"></span>number</span>
    </div>
    <button class="close-btn" type="button">Close</button>
  `
  root.appendChild(toolbar)

  const wrap = document.createElement("div")
  wrap.className = "article-wrap"
  root.appendChild(wrap)

  const title = document.createElement("h1")
  title.className = "article-title"
  title.textContent = article.title
  wrap.appendChild(title)

  if (article.byline || article.siteName) {
    const meta = document.createElement("div")
    meta.className = "article-meta"
    meta.textContent = [article.byline, article.siteName].filter(Boolean).join(" · ")
    wrap.appendChild(meta)
  }

  const articleRoot = document.createElement("div")
  articleRoot.className = "article-content"
  articleRoot.innerHTML = article.html
  wrap.appendChild(articleRoot)

  // Disable links inside the reader to avoid accidental navigation.
  for (const a of Array.from(articleRoot.querySelectorAll("a"))) {
    a.setAttribute("target", "_blank")
    a.setAttribute("rel", "noopener noreferrer")
  }

  // Prevent host page from scrolling underneath.
  if (!document.body.dataset.deepreadOverflow) {
    document.body.dataset.deepreadOverflow = document.body.style.overflow || ""
    document.body.style.overflow = "hidden"
  }

  const closeBtn = toolbar.querySelector("button.close-btn") as HTMLButtonElement
  const onClick = () => onClose()
  closeBtn.addEventListener("click", onClick)

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") onClose()
  }
  document.addEventListener("keydown", onKey, { capture: true })

  function destroy() {
    closeBtn.removeEventListener("click", onClick)
    document.removeEventListener("keydown", onKey, { capture: true })
    host.remove()
    if (document.body.dataset.deepreadOverflow !== undefined) {
      const prior = document.body.dataset.deepreadOverflow
      document.body.style.overflow = prior
      delete document.body.dataset.deepreadOverflow
    }
  }

  // Expose this for cleanup if anything weird happens
  document.body.setAttribute(PRIOR_BODY_OVERFLOW_KEY, "set")

  return {
    shadowHost: host,
    shadowRoot: shadow,
    scrollHost: root,
    articleRoot,
    destroy,
  }
}
