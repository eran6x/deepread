// @vitest-environment jsdom
import { detectPaywall } from "@/content/paywall"
import { describe, expect, it } from "vitest"

function setupDoc(html: string): Document {
  document.body.innerHTML = html
  return document
}

const COMPLETE_TEXT = `${"This is a complete sentence about the topic. ".repeat(20)}It ends properly.`

const TRUNCATED_TEXT = `${"The article begins with claims and evidence and continues at length ".repeat(
  10,
)}but then the body cuts off mid-sentence without any terminal punctuation here at all`

describe("detectPaywall", () => {
  it("does not flag a clean article on a normal host", () => {
    setupDoc(`<article><p>${"Lorem ipsum. ".repeat(60)}</p></article>`)
    const out = detectPaywall(document, COMPLETE_TEXT, "example.com")
    expect(out.suspected).toBe(false)
  })

  it("flags when overlay element + truncation both present", () => {
    setupDoc(`
      <article><p>${"Lorem ipsum. ".repeat(60)}</p></article>
      <div class="paywall">Subscribe to continue reading</div>
    `)
    const out = detectPaywall(document, TRUNCATED_TEXT, "example.com")
    expect(out.suspected).toBe(true)
    expect(out.reason).toBeTruthy()
  })

  it("does not flag truncation alone on an unknown host", () => {
    setupDoc(`<article><p>${"x ".repeat(500)}</p></article>`)
    const out = detectPaywall(document, TRUNCATED_TEXT, "example.com")
    expect(out.suspected).toBe(false)
  })

  it("flags truncation + known paywalled host", () => {
    setupDoc(`<article><p>${"x ".repeat(500)}</p></article>`)
    const out = detectPaywall(document, TRUNCATED_TEXT, "www.nytimes.com")
    expect(out.suspected).toBe(true)
  })

  it("does not flag known host alone with a complete article", () => {
    setupDoc(`<article><p>${"Lorem ipsum. ".repeat(60)}</p></article>`)
    const out = detectPaywall(document, COMPLETE_TEXT, "wsj.com")
    expect(out.suspected).toBe(false)
  })

  it("flags subscriber-gate copy + truncation", () => {
    setupDoc(`
      <article>
        <p>${"Lorem ipsum dolor sit amet. ".repeat(40)}</p>
        <p>Already a subscriber? Sign in to keep reading.</p>
      </article>
    `)
    const out = detectPaywall(document, TRUNCATED_TEXT, "example.com")
    expect(out.suspected).toBe(true)
  })

  it("matches subdomain of a known paywalled host", () => {
    setupDoc(`<article><p>${"x ".repeat(500)}</p></article>`)
    const out = detectPaywall(document, TRUNCATED_TEXT, "edition.economist.com")
    expect(out.suspected).toBe(true)
  })
})
