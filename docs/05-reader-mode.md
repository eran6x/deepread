# Reader Mode

The trickiest module. Three jobs:

1. **Extract** the article from a real-world page reliably.
2. **Render** it cleanly without fighting the host site's CSS or JS.
3. **Map** LLM-returned character ranges back to DOM ranges so highlights, dimming, and the pacer all work.

## Extraction

Use **`@mozilla/readability`** as the primary extractor. It's the same library Firefox Reader View uses; it's been hardened against thousands of real-world pages.

```ts
import { Readability, isProbablyReaderable } from "@mozilla/readability"

function extract(doc: Document): Extracted | null {
  if (!isProbablyReaderable(doc, { minContentLength: 500 })) return null
  const clone = doc.cloneNode(true) as Document  // Readability mutates
  const article = new Readability(clone, {
    keepClasses: false,
    charThreshold: 500,
  }).parse()
  if (!article) return null
  return {
    title: article.title,
    byline: article.byline,
    text: article.textContent,        // plain text — what we send to LLM
    html: article.content,             // sanitized HTML — what we render
    lang: article.lang,
    excerpt: article.excerpt,
    siteName: article.siteName,
  }
}
```

**Sanitization**: Readability's output HTML is *mostly* safe but we run it through DOMPurify before mounting. Allowlist tags: `p, h1-h6, ul, ol, li, blockquote, pre, code, a, em, strong, img, figure, figcaption, table, thead, tbody, tr, th, td, hr, br`.

**Failure modes & fallbacks**:
- `isProbablyReaderable === false` → side panel shows "this page doesn't look like an article". Offer manual override (user can force extraction).
- Parse returns null → same path.
- Article text < 500 chars → treat as not-an-article.
- Specific site overrides: a small JSON file (`shared/site-overrides.json`) lets us hardcode CSS selectors for known-bad sites (e.g. some publishers wrap content in shadow DOM that Readability can't see). Keep this list small; it's a maintenance debt.

## Rendering

### Why a Shadow DOM overlay

We mount reader mode as a **full-viewport overlay inside a closed Shadow DOM**. The original page DOM stays intact underneath, so deactivating Deepread is instant and complete.

```ts
const host = document.createElement("deepread-reader")
host.style.cssText = "position:fixed;inset:0;z-index:2147483647;"
document.documentElement.appendChild(host)
const shadow = host.attachShadow({ mode: "closed" })
// inject our scoped stylesheet + rendered content into `shadow`
```

Benefits:
- Site CSS doesn't leak in (Shadow DOM scoping)
- Our CSS doesn't leak out
- Site JS continues running but can't reach into our DOM
- One-line teardown: `host.remove()`

Z-index of `2147483647` (max signed 32-bit int) is paranoid but reliable.

### Layout

Single column, max-width ~720px (research-supported optimal line length is ~50–75 chars), generous line-height (`1.6`), system font stack with a serif option in settings. Top bar with title, byline, est. read time, and a tier indicator (Brief/Scan/Read). Bottom of viewport: keyboard-shortcut hint strip.

### Sticky section one-liners (Tier 2)

For each entry in `AnalysisResult.sections`, render the heading followed by a thin italic subtitle line containing `one_liner`. CSS `position: sticky; top: 0;` on the heading group means the user always sees the section's gist while scrolling within it.

## Span-to-DOM mapping (the real work)

The LLM returns character ranges into the **plain text** we sent it. Our reader mode renders **HTML**. We need to map a `[start, end]` text range to one or more DOM Range objects so we can paint highlights, observe the active paragraph, and animate the pacer.

### Algorithm

After rendering the sanitized HTML, walk the DOM and build a flat index:

```ts
type TextIndexEntry = {
  node: Text
  textOffset: number      // offset within the node
  globalOffset: number    // running offset across all text nodes
  length: number
}

function buildTextIndex(root: Node): { index: TextIndexEntry[]; fullText: string } {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const index: TextIndexEntry[] = []
  let global = 0
  let full = ""
  let node: Node | null
  while ((node = walker.nextNode())) {
    const text = node.nodeValue ?? ""
    if (!text.length) continue
    index.push({ node: node as Text, textOffset: 0, globalOffset: global, length: text.length })
    full += text
    global += text.length
  }
  return { index, fullText: full }
}
```

To find the DOM Range for a `[start, end]` char range:

```ts
function rangeFromCharOffsets(
  index: TextIndexEntry[],
  start: number,
  end: number,
): Range {
  const startEntry = findEntry(index, start)
  const endEntry = findEntry(index, end)
  const range = document.createRange()
  range.setStart(startEntry.node, start - startEntry.globalOffset)
  range.setEnd(endEntry.node, end - endEntry.globalOffset)
  return range
}

function findEntry(index: TextIndexEntry[], offset: number): TextIndexEntry {
  // binary search on globalOffset
}
```

### The text-mismatch problem

Readability's `textContent` and the textContent of the rendered sanitized HTML are *almost* identical, but not always:

- Whitespace normalization differs (multiple spaces collapsed differently)
- Soft hyphens, zero-width chars
- DOMPurify may strip elements Readability kept
- Elements that produce visible text but no textContent (rare; CSS `::before`)

**Mitigation strategy**:

1. After rendering, compute the rendered text and **diff it against** the text we sent to the LLM.
2. If they're identical (the common case), use offsets directly.
3. If they differ, build an offset-translation table using a fast diff (e.g. `fast-diff` or a dedicated whitespace-tolerant aligner).
4. Translate every LLM-returned `char_range` through the table before mapping to DOM.
5. If a range can't be translated (genuine mismatch), **silently drop the highlight** for that span. Never error to the user.

Acceptance threshold: if more than 10% of spans fail to map, we log a "low-quality render" event and skip span rendering entirely for the page (the user still gets verdict + brief + section one-liners — degrading gracefully).

### Highlighting layer

Highlights paint as overlay elements, **not** as `<mark>` wrappers in-DOM. Wrapping breaks the offset index and fights with adjacent ranges. Instead:

- Compute client rects for each Range (`range.getClientRects()`).
- Render absolutely-positioned `<div class="deepread-highlight deepread-highlight--entity">` overlays inside a sibling layer.
- On scroll/resize, observe and reposition. A `ResizeObserver` on the article + scroll listener throttled to `requestAnimationFrame` is sufficient.

This pattern is borrowed from PDF.js and Hypothesis. It's robust to text-resize, dark mode, and zoom.

## Active-paragraph detection

Use `IntersectionObserver` on every `<p>` (and `<li>`) at multiple thresholds. The "active" paragraph is the one whose intersection ratio is highest **and** whose top is closest to the viewport center.

```ts
const observer = new IntersectionObserver((entries) => {
  // pick highest-ratio entry; tie-break by distance to viewport center
}, { threshold: [0, 0.25, 0.5, 0.75, 1] })
```

CSS does the dimming via a class toggle; transitions are pure CSS for free smoothness.

## Pacer animation

The pacer is a sliding rectangular highlight overlay (the same overlay layer used for span highlights). It advances in WPM time:

- Words per second = `wpm / 60`
- Each word's bounding rect is precomputed at render time (split each text node by word, get rects, store)
- On each `requestAnimationFrame`, pick the word whose `cumulativeStartTime` is closest to elapsed time
- Smoothly interpolate position between words

Pause/resume = freeze elapsed time. Step back = subtract one word's duration. Speed change = recompute cumulative times from current position.

## Word-tokenization

Used by both pacer and click-to-define. Use `Intl.Segmenter` with `granularity: "word"` for proper Unicode word boundaries — much better than regex for non-English (and we want non-English ready for v2).

```ts
const segmenter = new Intl.Segmenter("en", { granularity: "word" })
for (const seg of segmenter.segment(text)) {
  if (seg.isWordLike) words.push({ text: seg.segment, start: seg.index })
}
```

## Tear-down

Activation/deactivation must be instant and lossless:

- Mount: append shadow host, freeze body scroll (`document.body.style.overflow = "hidden"`)
- Unmount: remove shadow host, restore body scroll
- All event listeners and observers attached to the shadow root are GC'd with it

No global side effects on the host page beyond body overflow and our own shadow root.

## Performance budget

For a 5000-word article on a 2019 MacBook Pro:

| Step | Budget |
|---|---|
| Readability extraction | <200ms |
| Hash compute (SHA-256 of text) | <30ms |
| Text-index build after render | <50ms |
| Span Range computation (50 spans) | <30ms |
| First highlight paint after analysis | <100ms after spans arrive |
| Pacer frame cost | <2ms / frame |

Profile with the Chrome DevTools Performance tab during alpha. Anything over 16ms blocks scrolling.

## Open questions

1. **Adjacent / overlapping spans** of different categories: should "claim" containing a "number" render as nested highlights, both colors visible, or does the inner suppress the outer? Current preference: render both with subtle layering (the inner highlight has a slightly different opacity), but worth testing with users.
2. **Code blocks and pre-formatted text**: skip span detection inside `<pre>` and `<code>` to avoid noise. The LLM should be told the same in the prompt.
3. **Images and figures**: do we surface figure captions in the brief? Out of v1.
