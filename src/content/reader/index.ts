import type { AnalysisResult } from "@/shared/schema"
import type { ExtractedArticle } from "@/shared/types"
import { HighlightLayer } from "./highlights"
import { type MountedReader, mountReader } from "./mount"
import { ActiveParagraph, pinSectionOneLiners } from "./paragraphs"
import { buildTextIndex, resolveSpans } from "./text-index"

let active: {
  mount: MountedReader
  highlights: HighlightLayer
  focus: ActiveParagraph
} | null = null

export interface OpenReaderArgs {
  article: ExtractedArticle
  result: AnalysisResult
}

export function openReader({ article, result }: OpenReaderArgs): void {
  closeReader()

  const mount = mountReader(article, closeReader)
  const index = buildTextIndex(mount.articleRoot)

  pinSectionOneLiners(mount.articleRoot, index.fullText, result.sections)

  // Sections were inserted as siblings inside articleRoot, which extends
  // the text index. Rebuild after pinning so highlight positions stay correct.
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

  active = { mount, highlights, focus }
}

export function closeReader(): void {
  if (!active) return
  try {
    active.focus.destroy()
    active.highlights.destroy()
    active.mount.destroy()
  } finally {
    active = null
  }
}
