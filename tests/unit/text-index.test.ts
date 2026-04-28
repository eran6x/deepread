// @vitest-environment jsdom
import {
  buildTextIndex,
  findEntry,
  findNearestOccurrence,
  rangeFromOffsets,
  resolveSpans,
  snapToWordBoundaries,
} from "@/content/reader/text-index"
import { describe, expect, it } from "vitest"

function mountHTML(html: string): HTMLElement {
  const root = document.createElement("div")
  root.innerHTML = html
  document.body.appendChild(root)
  return root
}

describe("buildTextIndex", () => {
  it("indexes text nodes in document order", () => {
    const root = mountHTML("<p>Hello</p><p>World</p>")
    const index = buildTextIndex(root)
    expect(index.fullText).toBe("HelloWorld")
    expect(index.entries).toHaveLength(2)
    expect(index.entries[0]?.globalOffset).toBe(0)
    expect(index.entries[0]?.length).toBe(5)
    expect(index.entries[1]?.globalOffset).toBe(5)
    expect(index.entries[1]?.length).toBe(5)
  })

  it("skips empty text nodes", () => {
    const root = mountHTML("<p></p><p>Hi</p>")
    const index = buildTextIndex(root)
    expect(index.entries).toHaveLength(1)
    expect(index.fullText).toBe("Hi")
  })

  it("includes nested element text", () => {
    const root = mountHTML("<p>Hello <strong>brave</strong> world</p>")
    const index = buildTextIndex(root)
    expect(index.fullText).toBe("Hello brave world")
    expect(index.entries).toHaveLength(3)
  })
})

describe("findEntry", () => {
  it("returns the entry containing the offset", () => {
    const root = mountHTML("<p>abc</p><p>def</p><p>ghi</p>")
    const { entries } = buildTextIndex(root)
    expect(findEntry(entries, 0)?.globalOffset).toBe(0)
    expect(findEntry(entries, 4)?.globalOffset).toBe(3)
    expect(findEntry(entries, 8)?.globalOffset).toBe(6)
  })

  it("returns null for out-of-range offsets", () => {
    const root = mountHTML("<p>abc</p>")
    const { entries } = buildTextIndex(root)
    expect(findEntry(entries, -1)).toBeNull()
    expect(findEntry(entries, 100)).toBeNull()
  })
})

describe("rangeFromOffsets", () => {
  it("creates a range that yields the expected substring", () => {
    const root = mountHTML("<p>Hello world</p>")
    const index = buildTextIndex(root)
    const range = rangeFromOffsets(index, 6, 11)
    expect(range).not.toBeNull()
    expect(range?.toString()).toBe("world")
  })

  it("creates a range across multiple text nodes", () => {
    const root = mountHTML("<p>Hello </p><p>brave new world</p>")
    const index = buildTextIndex(root)
    expect(index.fullText).toBe("Hello brave new world")
    const range = rangeFromOffsets(index, 6, 11)
    expect(range?.toString()).toBe("brave")
  })
})

describe("findNearestOccurrence", () => {
  it("finds the nearest match to the anchor", () => {
    const text = "alpha beta gamma alpha delta alpha"
    expect(findNearestOccurrence(text, "alpha", 0)).toBe(0)
    expect(findNearestOccurrence(text, "alpha", 18)).toBe(17)
    expect(findNearestOccurrence(text, "alpha", 30)).toBe(29)
  })

  it("returns -1 if not found anywhere", () => {
    expect(findNearestOccurrence("abcdef", "xyz", 0)).toBe(-1)
  })
})

describe("snapToWordBoundaries", () => {
  it("expands a mid-word range to the surrounding word", () => {
    const text = "Hello world from a test"
    expect(snapToWordBoundaries(text, 2, 4)).toEqual([0, 5]) // "Hello"
  })

  it("expands an end that lands inside a word", () => {
    const text = "Hello world from a test"
    expect(snapToWordBoundaries(text, 0, 8)).toEqual([0, 11]) // "Hello world"
  })

  it("leaves a range that already aligns to word boundaries unchanged", () => {
    const text = "Hello world"
    expect(snapToWordBoundaries(text, 0, 5)).toEqual([0, 5])
    expect(snapToWordBoundaries(text, 6, 11)).toEqual([6, 11])
  })

  it("preserves apostrophes and hyphens as word characters", () => {
    const text = "It's a state-of-the-art test"
    expect(snapToWordBoundaries(text, 1, 3)).toEqual([0, 4]) // "It's"
    expect(snapToWordBoundaries(text, 7, 12)).toEqual([7, 23]) // "state-of-the-art"
  })

  it("handles boundaries at start and end of text", () => {
    const text = "alpha beta"
    expect(snapToWordBoundaries(text, 0, 3)).toEqual([0, 5])
    expect(snapToWordBoundaries(text, 7, 10)).toEqual([6, 10])
  })

  it("returns empty range when given empty range", () => {
    expect(snapToWordBoundaries("hello", 3, 3)).toEqual([3, 3])
  })
})

describe("resolveSpans", () => {
  it("resolves direct-mapping spans", () => {
    const root = mountHTML("<p>Hello world from a test</p>")
    const index = buildTextIndex(root)
    const { resolved, mapped, total } = resolveSpans(index, {
      originalText: "Hello world from a test",
      spans: [
        { char_range: [6, 11], category: "claim" },
        { char_range: [17, 23], category: "entity" },
      ],
    })
    expect(total).toBe(2)
    expect(mapped).toBe(2)
    expect(resolved[0]?.range.toString()).toBe("world")
    expect(resolved[1]?.range.toString()).toBe("a test")
  })

  it("drops spans that resolve to mismatched text and cannot be found nearby", () => {
    const root = mountHTML("<p>Hello world from a test</p>")
    const index = buildTextIndex(root)
    const { resolved, mapped } = resolveSpans(index, {
      originalText: "Hello world from a test",
      spans: [{ char_range: [0, 5], category: "claim" }],
    })
    // "Hello" exists, so this should still resolve
    expect(mapped).toBe(1)
    expect(resolved[0]?.range.toString()).toBe("Hello")
  })
})
