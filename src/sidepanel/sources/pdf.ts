import type { ExtractedArticle } from "@/shared/types"

export class PdfExtractError extends Error {
  constructor(
    message: string,
    readonly reason: "fetch" | "parse" | "empty",
  ) {
    super(message)
    this.name = "PdfExtractError"
  }
}

interface PdfJsModule {
  GlobalWorkerOptions: { workerSrc: string }
  getDocument: (params: { data: ArrayBuffer }) => { promise: Promise<PdfDocument> }
}

interface PdfDocument {
  numPages: number
  getMetadata: () => Promise<{ info?: { Title?: string } }>
  getPage: (n: number) => Promise<PdfPage>
}

interface PdfPage {
  getTextContent: () => Promise<{ items: Array<{ str: string; hasEOL?: boolean }> }>
}

let cached: PdfJsModule | null = null

async function loadPdfJs(): Promise<PdfJsModule> {
  if (cached) return cached
  const mod = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as PdfJsModule
  const workerUrl = (
    (await import("pdfjs-dist/legacy/build/pdf.worker.mjs?url")) as { default: string }
  ).default
  mod.GlobalWorkerOptions.workerSrc = workerUrl
  cached = mod
  return mod
}

export async function extractPdf(url: string): Promise<ExtractedArticle> {
  let response: Response
  try {
    response = await fetch(url, { credentials: "include" })
  } catch (err) {
    throw new PdfExtractError(
      `Failed to fetch PDF: ${err instanceof Error ? err.message : String(err)}`,
      "fetch",
    )
  }
  if (!response.ok) {
    throw new PdfExtractError(`Failed to fetch PDF (HTTP ${response.status})`, "fetch")
  }
  const buf = await response.arrayBuffer()

  let doc: PdfDocument
  try {
    const pdfjs = await loadPdfJs()
    doc = await pdfjs.getDocument({ data: buf }).promise
  } catch (err) {
    throw new PdfExtractError(
      `Failed to parse PDF: ${err instanceof Error ? err.message : String(err)}`,
      "parse",
    )
  }

  const pages: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    const pageText = content.items
      .map((it) => it.str + (it.hasEOL ? "\n" : ""))
      .join("")
      .replace(/[ \t]+\n/g, "\n")
      .trim()
    if (pageText.length > 0) pages.push(pageText)
  }

  const text = pages.join("\n\n").trim()
  if (text.length === 0) {
    throw new PdfExtractError("PDF contained no extractable text.", "empty")
  }

  const meta = await doc
    .getMetadata()
    .catch(() => ({ info: undefined }) as { info?: { Title?: string } })
  const metaTitle = meta?.info?.Title?.trim() ?? ""
  const title = metaTitle || filenameFromUrl(url) || "PDF Document"

  return {
    title,
    byline: null,
    text,
    html: "",
    lang: null,
    excerpt: null,
    siteName: hostnameOf(url),
    url,
    paywallSuspected: false,
    paywallReason: null,
  }
}

function filenameFromUrl(url: string): string | null {
  try {
    const path = new URL(url).pathname
    const base = path.slice(path.lastIndexOf("/") + 1)
    return decodeURIComponent(base).replace(/\.pdf$/i, "") || null
  } catch {
    return null
  }
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname
  } catch {
    return null
  }
}
