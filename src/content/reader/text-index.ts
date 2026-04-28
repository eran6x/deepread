/**
 * Text-indexing utilities for mapping LLM-returned character ranges (offsets
 * into the plain text we sent the model) back to DOM Range objects inside the
 * rendered reader-mode HTML.
 *
 * Strategy:
 * 1. Walk all text nodes in the rendered article and build a flat index of
 *    {node, length, globalOffset}.
 * 2. The original LLM input text and the rendered DOM textContent are usually
 *    very close (both come from the same Readability parse), but whitespace
 *    can collapse differently. So for each span we additionally use the
 *    expected substring as a verification key.
 * 3. If direct mapping produces the wrong substring at the target range, fall
 *    back to a substring search anchored near the expected offset. If still
 *    not found, drop the highlight silently.
 */

export interface TextIndexEntry {
  node: Text
  /** Cumulative offset across all text nodes in the rendered article. */
  globalOffset: number
  /** Length of this text node's data. */
  length: number
}

export interface TextIndex {
  entries: TextIndexEntry[]
  /** Concatenation of all text-node values, in document order. */
  fullText: string
}

export function buildTextIndex(root: Node): TextIndex {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const entries: TextIndexEntry[] = []
  const parts: string[] = []
  let global = 0
  let node: Node | null
  // biome-ignore lint/suspicious/noAssignInExpressions: standard TreeWalker iteration pattern
  while ((node = walker.nextNode())) {
    const text = (node as Text).data
    if (!text.length) continue
    entries.push({ node: node as Text, globalOffset: global, length: text.length })
    parts.push(text)
    global += text.length
  }
  return { entries, fullText: parts.join("") }
}

export function findEntry(entries: TextIndexEntry[], offset: number): TextIndexEntry | null {
  if (entries.length === 0) return null
  let lo = 0
  let hi = entries.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    const e = entries[mid]
    if (e !== undefined && e.globalOffset <= offset) {
      lo = mid
    } else {
      hi = mid - 1
    }
  }
  const last = entries[entries.length - 1]
  const candidate = entries[lo]
  if (!candidate) return null
  if (offset < candidate.globalOffset) return null
  if (last && offset > last.globalOffset + last.length) return null
  return candidate
}

export function rangeFromOffsets(index: TextIndex, start: number, end: number): Range | null {
  if (start < 0 || end <= start || end > index.fullText.length) return null
  const startEntry = findEntry(index.entries, start)
  const endEntry = findEntry(index.entries, end - 1)
  if (!startEntry || !endEntry) return null

  const startOffset = start - startEntry.globalOffset
  const endOffset = end - endEntry.globalOffset
  if (startOffset < 0 || startOffset > startEntry.length) return null
  if (endOffset < 0 || endOffset > endEntry.length) return null

  const range = document.createRange()
  try {
    range.setStart(startEntry.node, startOffset)
    range.setEnd(endEntry.node, endOffset)
  } catch {
    return null
  }
  return range
}

/**
 * Try to locate `phrase` in the rendered text near `nearOffset`. Used when
 * the direct char-range mapping disagrees with the source phrase.
 */
export function findNearestOccurrence(
  fullText: string,
  phrase: string,
  nearOffset: number,
  maxDistance = 2000,
): number {
  if (!phrase) return -1
  const lo = Math.max(0, nearOffset - maxDistance)
  const hi = Math.min(fullText.length, nearOffset + maxDistance + phrase.length)
  const window = fullText.slice(lo, hi)

  // Find all occurrences in the window, return the one closest to nearOffset.
  let best = -1
  let bestDistance = Number.POSITIVE_INFINITY
  let from = 0
  while (true) {
    const idx = window.indexOf(phrase, from)
    if (idx === -1) break
    const absolute = lo + idx
    const distance = Math.abs(absolute - nearOffset)
    if (distance < bestDistance) {
      bestDistance = distance
      best = absolute
    }
    from = idx + 1
  }
  if (best !== -1) return best

  // Fallback: search the full text once.
  const fullIdx = fullText.indexOf(phrase)
  return fullIdx
}

export interface ResolvedRange {
  range: Range
  category: string
}

export interface RangeResolutionInput {
  /** The original plain text we sent to the LLM. */
  originalText: string
  /** Char ranges + categories returned by the LLM. */
  spans: Array<{ char_range: [number, number]; category: string }>
}

const WORD_CHAR = /[\p{L}\p{N}_'’-]/u

/**
 * Expand a char range to whole-word boundaries. The LLM commonly returns
 * ranges that start or end mid-word; this snaps both ends to the surrounding
 * word so highlights always read as full tokens.
 */
export function snapToWordBoundaries(text: string, start: number, end: number): [number, number] {
  let s = start < 0 ? 0 : start
  let e = end > text.length ? text.length : end
  if (e <= s) return [s, e]

  while (s > 0) {
    const prev = text[s - 1]
    if (!prev || !WORD_CHAR.test(prev)) break
    s--
  }

  while (e < text.length) {
    const cur = text[e]
    if (!cur || !WORD_CHAR.test(cur)) break
    e++
  }

  return [s, e]
}

/**
 * Resolve LLM char ranges to DOM Ranges in the rendered article. Drops any
 * span that can't be mapped reliably. Returns counts for telemetry.
 */
export function resolveSpans(
  index: TextIndex,
  input: RangeResolutionInput,
): { resolved: ResolvedRange[]; total: number; mapped: number } {
  const out: ResolvedRange[] = []
  for (const span of input.spans) {
    const [rawStart, rawEnd] = span.char_range
    const [start, end] = snapToWordBoundaries(input.originalText, rawStart, rawEnd)
    const phrase = input.originalText.slice(start, end)
    if (!phrase || phrase.length > 1000) continue

    // Direct attempt
    const direct = rangeFromOffsets(index, start, end)
    if (direct && direct.toString() === phrase) {
      out.push({ range: direct, category: span.category })
      continue
    }

    // Substring fallback
    const offset = findNearestOccurrence(index.fullText, phrase, start)
    if (offset === -1) continue
    const fallback = rangeFromOffsets(index, offset, offset + phrase.length)
    if (fallback && fallback.toString() === phrase) {
      out.push({ range: fallback, category: span.category })
    }
  }
  return { resolved: out, total: input.spans.length, mapped: out.length }
}
