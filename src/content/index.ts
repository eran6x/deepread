import type { ExtractedArticle, RuntimeMessage } from "@/shared/types"
import { Readability, isProbablyReaderable } from "@mozilla/readability"
import { closeReader, openReader } from "./reader"

let cachedArticle: ExtractedArticle | null = null
let cachedFromUrl: string | null = null
let cachedContentHash: string | null = null

chrome.runtime.onMessage.addListener((msg: RuntimeMessage, _sender, sendResponse) => {
  if (msg.kind === "extract.request") {
    handleExtract(sendResponse)
    return false
  }

  if (msg.kind === "reader.open") {
    handleReaderOpen(msg.result, msg.settings, sendResponse)
    return false
  }

  if (msg.kind === "reader.close") {
    closeReader()
    sendResponse({ kind: "reader.ack", ok: true } satisfies RuntimeMessage)
    return false
  }

  return false
})

function handleExtract(sendResponse: (m: RuntimeMessage) => void) {
  try {
    const article = extractArticle()
    if (!article) {
      sendResponse({ kind: "extract.error", reason: "not_readerable" })
      return
    }
    cachedArticle = article
    cachedFromUrl = location.href
    cachedContentHash = null // populated when we receive analysis.complete
    sendResponse({ kind: "extract.response", article })
  } catch (err) {
    sendResponse({
      kind: "extract.error",
      reason: err instanceof Error ? err.message : String(err),
    })
  }
}

function handleReaderOpen(
  result: Parameters<typeof openReader>[0]["result"],
  settings: Parameters<typeof openReader>[0]["settings"],
  sendResponse: (m: RuntimeMessage) => void,
) {
  if (!cachedArticle || cachedFromUrl !== location.href) {
    sendResponse({
      kind: "reader.error",
      reason: "Article not extracted for this page. Re-run analysis.",
    })
    return
  }
  try {
    const contentHash = cachedContentHash ?? ""
    openReader({ article: cachedArticle, result, settings, contentHash })
    sendResponse({ kind: "reader.ack", ok: true })
  } catch (err) {
    sendResponse({
      kind: "reader.error",
      reason: err instanceof Error ? err.message : String(err),
    })
  }
}

function extractArticle(): ExtractedArticle | null {
  if (!isProbablyReaderable(document, { minContentLength: 500 })) return null

  const clone = document.cloneNode(true) as Document
  const parsed = new Readability(clone, {
    keepClasses: false,
    charThreshold: 500,
  }).parse()
  if (!parsed) return null

  const text = (parsed.textContent ?? "").trim()
  if (text.length < 500) return null

  return {
    title: parsed.title ?? document.title,
    byline: parsed.byline ?? null,
    text,
    html: parsed.content ?? "",
    lang: parsed.lang ?? document.documentElement.lang ?? null,
    excerpt: parsed.excerpt ?? null,
    siteName: parsed.siteName ?? null,
    url: location.href,
  }
}
