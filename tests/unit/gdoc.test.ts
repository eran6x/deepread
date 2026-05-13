import { GoogleDocError, extractGoogleDoc } from "@/background/sources/gdoc"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

describe("extractGoogleDoc", () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    globalThis.fetch = vi.fn() as unknown as typeof fetch
  })
  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it("rejects invalid URLs", async () => {
    await expect(extractGoogleDoc("https://example.com/nope")).rejects.toMatchObject({
      reason: "invalid_url",
    })
  })

  it("maps 403 to gdoc_not_authorized", async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response("", { status: 403 }),
    )
    await expect(
      extractGoogleDoc("https://docs.google.com/document/d/abc/edit"),
    ).rejects.toMatchObject({ reason: "gdoc_not_authorized" })
  })

  it("maps 404 to gdoc_not_found", async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response("", { status: 404 }),
    )
    await expect(
      extractGoogleDoc("https://docs.google.com/document/d/abc/edit"),
    ).rejects.toMatchObject({ reason: "gdoc_not_found" })
  })

  it("returns an ExtractedArticle for a successful export", async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response("My Title\n\nFirst paragraph of the doc.\n\nSecond paragraph."),
    )
    const out = await extractGoogleDoc("https://docs.google.com/document/d/abc/edit")
    expect(out.title).toBe("My Title")
    expect(out.text).toContain("First paragraph")
    expect(out.siteName).toBe("Google Docs")
    expect(out.paywallSuspected).toBe(false)
    expect(out.url).toBe("https://docs.google.com/document/d/abc/edit")
  })

  it("throws empty when the export is blank", async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(new Response("\n\n   \n"))
    await expect(
      extractGoogleDoc("https://docs.google.com/document/d/abc/edit"),
    ).rejects.toMatchObject({ reason: "empty" })
  })

  it("uses GoogleDocError class for errors", async () => {
    await expect(extractGoogleDoc("https://example.com")).rejects.toBeInstanceOf(GoogleDocError)
  })
})
