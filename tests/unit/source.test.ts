import {
  detectSource,
  extractGoogleDocId,
  isGoogleDocUrl,
  isPdfUrl,
  originPatternFor,
} from "@/shared/source"
import { describe, expect, it } from "vitest"

describe("isPdfUrl", () => {
  it.each([
    ["https://arxiv.org/pdf/2310.00001.pdf", true],
    ["https://arxiv.org/pdf/2310.00001.PDF", true],
    ["https://example.com/doc.pdf?download=1", true],
    ["https://example.com/doc.pdf#page=3", true],
    ["https://example.com/notpdf.html", false],
    ["https://example.com/path/file.pdf.txt", false],
    ["file:///Users/me/doc.pdf", false],
    ["", false],
  ])("%s -> %s", (url, expected) => {
    expect(isPdfUrl(url)).toBe(expected)
  })
})

describe("extractGoogleDocId", () => {
  it("matches /document/d/{id}/edit", () => {
    expect(extractGoogleDocId("https://docs.google.com/document/d/abc123_XYZ-9/edit")).toBe(
      "abc123_XYZ-9",
    )
  })
  it("matches /view, /preview, no trailing", () => {
    expect(extractGoogleDocId("https://docs.google.com/document/d/abc/view")).toBe("abc")
    expect(extractGoogleDocId("https://docs.google.com/document/d/abc/preview")).toBe("abc")
    expect(extractGoogleDocId("https://docs.google.com/document/d/abc")).toBe("abc")
  })
  it("matches with querystring", () => {
    expect(extractGoogleDocId("https://docs.google.com/document/d/abc/edit?tab=t.0")).toBe("abc")
  })
  it("rejects non-doc URLs", () => {
    expect(extractGoogleDocId("https://docs.google.com/spreadsheets/d/abc")).toBeNull()
    expect(extractGoogleDocId("https://example.com/document/d/abc")).toBeNull()
    expect(isGoogleDocUrl("https://example.com/article")).toBe(false)
  })
})

describe("detectSource", () => {
  it("returns gdoc for a Google Doc URL", () => {
    const s = detectSource("https://docs.google.com/document/d/abc/edit", 7)
    expect(s.kind).toBe("gdoc")
    if (s.kind === "gdoc") expect(s.documentId).toBe("abc")
  })

  it("returns pdf for a .pdf URL", () => {
    const s = detectSource("https://arxiv.org/pdf/2310.00001.pdf", 7)
    expect(s.kind).toBe("pdf")
  })

  it("returns html otherwise", () => {
    const s = detectSource("https://example.com/article", 7)
    expect(s.kind).toBe("html")
    if (s.kind === "html") expect(s.tabId).toBe(7)
  })
})

describe("originPatternFor", () => {
  it("returns null for html", () => {
    expect(originPatternFor({ kind: "html", tabId: 1 })).toBeNull()
  })
  it("returns origin pattern for pdf", () => {
    expect(originPatternFor({ kind: "pdf", url: "https://arxiv.org/x.pdf", tabId: 1 })).toBe(
      "https://arxiv.org/*",
    )
  })
  it("returns origin pattern for gdoc", () => {
    expect(
      originPatternFor({
        kind: "gdoc",
        documentId: "abc",
        url: "https://docs.google.com/document/d/abc/edit",
        tabId: 1,
      }),
    ).toBe("https://docs.google.com/*")
  })
})
