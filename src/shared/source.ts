export type Source =
  | { kind: "html"; tabId: number }
  | { kind: "pdf"; url: string; tabId: number }
  | { kind: "gdoc"; documentId: string; url: string; tabId: number }

const GDOC_RE = /^https?:\/\/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/i

export function isPdfUrl(url: string): boolean {
  try {
    const u = new URL(url)
    if (u.protocol !== "http:" && u.protocol !== "https:") return false
    return /\.pdf(?:$|[?#])/i.test(u.pathname + u.search)
  } catch {
    return false
  }
}

export function extractGoogleDocId(url: string): string | null {
  const m = GDOC_RE.exec(url)
  return m?.[1] ?? null
}

export function isGoogleDocUrl(url: string): boolean {
  return extractGoogleDocId(url) != null
}

export function detectSource(url: string, tabId: number): Source {
  const docId = extractGoogleDocId(url)
  if (docId) return { kind: "gdoc", documentId: docId, url, tabId }
  if (isPdfUrl(url)) return { kind: "pdf", url, tabId }
  return { kind: "html", tabId }
}

export function originPatternFor(source: Source): string | null {
  if (source.kind === "html") return null
  try {
    const u = new URL(source.url)
    return `${u.protocol}//${u.hostname}/*`
  } catch {
    return null
  }
}
