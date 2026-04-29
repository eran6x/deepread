import type { AnalysisResult } from "@/shared/schema"
import type { AppSettings, ExtractedArticle } from "@/shared/types"
import { ClickToDefine } from "./define"
import { HighlightLayer } from "./highlights"
import { type MountedReader, mountReader } from "./mount"
import { Pacer } from "./pacer"
import { ActiveParagraph, pinSectionOneLiners } from "./paragraphs"
import { markTangentParagraphs } from "./tangents"
import { buildTextIndex, resolveSpans } from "./text-index"
import { WpmTracker } from "./wpm-tracker"

let active: ReaderInstance | null = null

interface ReaderInstance {
  mount: MountedReader
  highlights: HighlightLayer
  focus: ActiveParagraph
  pacer: Pacer
  define: ClickToDefine
  wpm: WpmTracker
  hideTangents: boolean
}

export interface OpenReaderArgs {
  article: ExtractedArticle
  result: AnalysisResult
  settings: AppSettings
  contentHash: string
}

export function openReader({ article, result, settings, contentHash }: OpenReaderArgs): void {
  closeReader()

  const mount = mountReader(article, settings, closeReader)
  const initialIndex = buildTextIndex(mount.articleRoot)

  // Tangent / boilerplate dimming (data attributes only; CSS does the work)
  markTangentParagraphs(mount.articleRoot, initialIndex.fullText, result.sections)

  // Section one-liners (mutate DOM, then rebuild index)
  pinSectionOneLiners(mount.articleRoot, initialIndex.fullText, result.sections)
  const indexAfterSections = buildTextIndex(mount.articleRoot)

  const { resolved, total, mapped } = resolveSpans(indexAfterSections, {
    originalText: article.text,
    spans: result.spans,
  })

  console.info(
    `[Deepread] reader mounted: ${mapped}/${total} spans mapped (${
      total === 0 ? 0 : Math.round((mapped / total) * 100)
    }%)`,
  )

  const highlights = new HighlightLayer(mount.scrollHost, mount.articleRoot)
  highlights.setRanges(resolved)

  const focus = new ActiveParagraph(mount.scrollHost, mount.articleRoot)
  focus.enable()

  const pacer = new Pacer(mount.shadowRoot, mount.scrollHost, mount.articleRoot, {
    initialWpm: settings.wpm,
  })
  const define = new ClickToDefine(mount.shadowRoot, mount.articleRoot, article.lang)
  const wpm = new WpmTracker(mount.scrollHost, mount.articleRoot, contentHash)

  // Toolbar wiring
  mount.pacerToggleBtn.addEventListener("click", () => {
    pacer.toggle()
    mount.pacerToggleBtn.dataset.active = String(active?.pacer === pacer)
  })
  mount.tangentsToggleBtn.addEventListener("click", () => {
    if (!active) return
    active.hideTangents = !active.hideTangents
    mount.articleRoot.dataset.tangents = active.hideTangents ? "hide" : "show"
    mount.tangentsToggleBtn.textContent = active.hideTangents ? "Show tangents" : "Hide tangents"
    mount.tangentsToggleBtn.dataset.active = String(!active.hideTangents)
  })

  active = {
    mount,
    highlights,
    focus,
    pacer,
    define,
    wpm,
    hideTangents: settings.reader.hideTangents,
  }
  mount.articleRoot.dataset.tangents = active.hideTangents ? "hide" : "show"
  mount.tangentsToggleBtn.textContent = active.hideTangents ? "Show tangents" : "Hide tangents"
}

export function closeReader(): void {
  if (!active) return
  try {
    active.wpm.flushFinal()
    active.wpm.destroy()
    active.define.destroy()
    active.pacer.destroy()
    active.focus.destroy()
    active.highlights.destroy()
    active.mount.destroy()
  } finally {
    active = null
  }
}
