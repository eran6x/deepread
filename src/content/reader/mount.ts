import type { AppSettings, ExtractedArticle } from "@/shared/types"
import { buildReaderCSS } from "./styles"

export interface MountedReader {
  shadowHost: HTMLElement
  shadowRoot: ShadowRoot
  scrollHost: HTMLElement
  articleRoot: HTMLElement
  toolbar: HTMLElement
  pacerToggleBtn: HTMLButtonElement
  tangentsToggleBtn: HTMLButtonElement
  closeBtn: HTMLButtonElement
  destroy: () => void
}

const HOST_TAG = "deepread-reader"

export function mountReader(
  article: ExtractedArticle,
  settings: AppSettings,
  onClose: () => void,
): MountedReader {
  const existing = document.querySelector(HOST_TAG)
  if (existing) existing.remove()

  const host = document.createElement(HOST_TAG)
  document.documentElement.appendChild(host)
  const shadow = host.attachShadow({ mode: "open" })

  const style = document.createElement("style")
  style.textContent = buildReaderCSS(settings.reader)
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
      <span class="legend-item"><span class="legend-swatch swatch-entity"></span>entity</span>
      <span class="legend-item"><span class="legend-swatch swatch-claim"></span>claim</span>
      <span class="legend-item"><span class="legend-swatch swatch-evidence"></span>evidence</span>
      <span class="legend-item"><span class="legend-swatch swatch-number"></span>number</span>
    </div>
    <div class="toolbar-buttons">
      <span class="pacer-status"></span>
      <button class="tool-btn pacer-toggle" type="button" title="Toggle pacer (space)">Pacer</button>
      <button class="tool-btn tangents-toggle" type="button" title="Show tangents and boilerplate">Hide tangents</button>
      <button class="tool-btn close-btn" type="button" title="Close (Esc)">Close</button>
    </div>
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

  for (const a of Array.from(articleRoot.querySelectorAll("a"))) {
    a.setAttribute("target", "_blank")
    a.setAttribute("rel", "noopener noreferrer")
  }

  if (!document.body.dataset.deepreadOverflow) {
    document.body.dataset.deepreadOverflow = document.body.style.overflow || ""
    document.body.style.overflow = "hidden"
  }

  const closeBtn = toolbar.querySelector("button.close-btn") as HTMLButtonElement
  const pacerToggleBtn = toolbar.querySelector("button.pacer-toggle") as HTMLButtonElement
  const tangentsToggleBtn = toolbar.querySelector("button.tangents-toggle") as HTMLButtonElement

  const onClickClose = () => onClose()
  closeBtn.addEventListener("click", onClickClose)

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") onClose()
  }
  document.addEventListener("keydown", onKey, { capture: true })

  function destroy() {
    closeBtn.removeEventListener("click", onClickClose)
    document.removeEventListener("keydown", onKey, { capture: true })
    host.remove()
    if (document.body.dataset.deepreadOverflow !== undefined) {
      const prior = document.body.dataset.deepreadOverflow
      document.body.style.overflow = prior
      delete document.body.dataset.deepreadOverflow
    }
  }

  return {
    shadowHost: host,
    shadowRoot: shadow,
    scrollHost: root,
    articleRoot,
    toolbar,
    pacerToggleBtn,
    tangentsToggleBtn,
    closeBtn,
    destroy,
  }
}
