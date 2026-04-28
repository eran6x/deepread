import type { ExtractedArticle, RuntimeMessage } from "@/shared/types"
import { Readability, isProbablyReaderable } from "@mozilla/readability"

chrome.runtime.onMessage.addListener((msg: RuntimeMessage, _sender, sendResponse) => {
  if (msg.kind !== "extract.request") return false

  try {
    const article = extractArticle()
    if (!article) {
      sendResponse({
        kind: "extract.error",
        reason: "not_readerable",
      } satisfies RuntimeMessage)
      return false
    }
    sendResponse({ kind: "extract.response", article } satisfies RuntimeMessage)
  } catch (err) {
    sendResponse({
      kind: "extract.error",
      reason: err instanceof Error ? err.message : String(err),
    } satisfies RuntimeMessage)
  }
  return false
})

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
