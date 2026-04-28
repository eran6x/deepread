# Features

Each feature has: behavior, surface(s), inputs, success criteria, and known edge cases. Features marked **v1** ship in the first release; **v2/v3** are scaffolded but not built.

---

## F1 — Page activation **[v1]**

**Behavior**: User triggers Deepread on the current tab; reader-mode rendering begins; Tier 1 analysis streams into the side panel within 5 seconds.

**Surfaces**:
- Toolbar icon click
- Keyboard shortcut (default `Cmd/Ctrl+Shift+V`, configurable)
- Right-click "Read with Deepread" menu item

**Inputs**: current tab URL + DOM.

**Behavior detail**:
1. Content script runs Readability on the live document.
2. If extraction fails (e.g. on application views like Gmail), show a side panel error with a "send page text manually" fallback.
3. If extraction succeeds, content hash is computed; if cached, reuse the analysis. Otherwise call the LLM.
4. Reader mode mounts in a full-page Shadow DOM overlay so the underlying page is preserved (and restorable on deactivate).

**Success criteria**:
- Verdict bullet rendered in side panel within 5s p50 / 10s p95 on a 2000-word article (network permitting).
- Reader-mode rendering visually clean on top 50 publishers (NYT, Atlantic, Substack, Medium, Stripe Press, Reuters, etc.) — tracked as a Playwright E2E sweep.

**Edge cases**:
- Paywalled content: extract what's visible, mark as paywalled in the UI, do not retry.
- SPAs (Twitter, Reddit infinite scroll): refuse extraction, show "this page isn't an article" hint.
- Pages already in reader-like UI (Notion, Obsidian Publish): still works, but offer "use original" opt-out.

---

## F2 — Tier 1: Brief **[v1]**

**Behavior**: 5-second triage answer in the side panel.

**Surface**: side panel, top section.

**Inputs**: `AnalysisResult.verdict`, `.brief`, `.topics`, `.est_read_time_min`, `.difficulty`.

**UI**:
```
┌──────────────────────────────────────┐
│ ⚡ Verdict: READ  · 8 min · medium    │
│ "Original analysis on rate-limit     │
│  algorithms with novel benchmarks."  │
├──────────────────────────────────────┤
│ TL;DR                                │
│  • Token-bucket vs sliding-window... │
│  • Author tested at 100k RPS and...  │
│  • Recommendation: hybrid approach…  │
├──────────────────────────────────────┤
│ Topics: rate limiting · benchmarks · │
│         distributed systems · …      │
└──────────────────────────────────────┘
```

**Success criteria**:
- Verdict streams in under 2s p50.
- Brief bullets ≤20 words each (enforced in prompt).
- User reports verdict-accurate ("would I actually have read this?") on ≥80% of articles in alpha dogfooding.

---

## F3 — Tier 2: Scan view **[v1]**

**Behavior**: Reader-mode page with section one-liners pinned, color-coded highlights active, tangents dimmed.

**Surface**: in-page reader-mode rendering.

**UI elements**:
- **Section one-liners**: italic subtitle under each `<h2>` / `<h3>` rendered from `AnalysisResult.sections[].one_liner`.
- **Highlights**: span backgrounds in 4 colors (entity / claim / evidence / number). Colors configurable; default scheme designed for color-blind accessibility (use Wong palette: blue, orange, green, vermillion).
- **Tangent dimming**: sections marked `tangent` or `boilerplate` rendered at `opacity: 0.35`. Banner at top of section: "🌫️ Marked as tangential — click to expand."
- **"Jump to core" button** in side panel: scrolls through `core` sections only, skipping `supporting` and below.

**Edge cases**:
- LLM mis-classifies section as boilerplate. Mitigation: dim never hide; persistent toggle to "show all"; learn-from-undo signal stored locally for future tuning (out of v1).
- Highlights span across DOM elements after rendering. Mitigation: see `05-reader-mode.md` for the span-mapping algorithm.

---

## F4 — Tier 3: Read mode **[v1]**

**Behavior**: Active-paragraph focus + optional pacer + click-to-define + live stats.

### F4a — Active-paragraph focus

- Current paragraph (determined by viewport center) at full opacity.
- Other paragraphs at `opacity: 0.4`.
- Smooth transitions (200ms ease-out).
- Configurable: opacity floor, smoothing window, off.

### F4b — Pacer mode (toggle, off by default)

- Animated highlight band advances at the user's WPM.
- Style options: full-line band, word-by-word underline, chunk highlight (3-word window).
- User can pause (space), step back (left arrow), step forward (right arrow), adjust speed (up/down).
- Default WPM seeded from user's tracked average; first-time user starts at 250 WPM.

### F4c — Click-to-define

- Single-click on a word → popover with definition + 3 synonyms.
- Backed by Haiku call with sentence context for disambiguation.
- Aggressive local cache; never re-query for a word in same language.
- Popover dismisses on click-outside or Escape.

**Success criteria**:
- Definition popover appears within 800ms p50 (cached < 50ms).
- Pacer doesn't desync from user scroll position.
- User-reported regression rate decreases week-over-week in alpha (we track it).

---

## F5 — Stats tracking **[v1]**

**Behavior**: Local recording of reading metrics; surfaced in side panel and a dedicated stats view.

**Tracked signals**:
- **WPM**: words in active-paragraph viewport ÷ time before scrolling past
- **Regression**: scroll-up event followed by re-reading the same paragraph (debounced)
- **Articles completed / partially read** (≥80% scroll = completed)
- **Time-on-page** vs `est_read_time_min`
- **Definitions requested per article** (proxies for difficulty match)

**Storage**: IndexedDB rolling daily aggregates; raw events kept for 7 days then aggregated.

**Display**: side panel "Stats" tab with last-7-day chart, current article live readout, all-time WPM trend.

**Privacy**: stats are local-only at v1. Cloud sync is Phase 3 and explicitly opt-in.

---

## F6 — Settings **[v1]**

**Surface**: side panel "Settings" tab + dedicated options page for power users.

**Settings**:
- **API key** (BYO mode): paste field, stored in `chrome.storage.local`, never logged
- **Auth mode** (Beta+): BYO or Hosted toggle
- **Default WPM**: integer input
- **Active-paragraph dim opacity**: slider 0.2–1.0
- **Pacer style**: band / underline / chunk
- **Highlight palette**: default / high-contrast / mono
- **Highlight categories enabled**: 4 toggles
- **Domain allow-list**: text area, one domain per line, with sensitive-domain warnings
- **Sensitive domain block-list**: read-only display of defaults; user can override per-domain
- **Telemetry**: error reports only (opt-in, off by default at v1)

---

## F7 — Domain allow-list & sensitive-domain blocking **[v1]**

**Behavior**:
- By default, Deepread is **off** on every page; the user must activate explicitly per page.
- An "always on for this domain" toggle in the popup adds it to the allow-list.
- A built-in block-list (banking, health portals, Gmail, calendar, Slack, Notion private workspaces, common SSO providers) refuses activation with a clear message: *"Deepread doesn't run on this site by default to protect your data."*
- Block-list is overridable per-user, but the override prompt requires explicit confirmation and warns about data egress.

**Why**: this is the largest single trust risk for the product. See `06-auth-billing-privacy.md`.

---

## F8 — Click-to-define popover **[v1]**

Already covered in F4c. Listed separately because it's the only feature that issues an LLM call *during* reading rather than at activation. Cost and latency are tightly bounded by aggressive caching.

---

## F9 — RSVP / chunked mode **[v2]**

Single-word and 2–4 word chunked display, controlled by spacebar. Not in v1 because it's divisive and the comprehension hit is real. Architecture supports it: the same `AnalysisResult` provides word boundaries; pacer module abstracts presentation mode.

---

## F10 — Retention layer **[v2]**

- End-of-article recall prompts ("name three claims, one piece of evidence")
- LLM evaluation of user answer (generous scoring)
- Anki export (`.apkg`) of cards generated from claims/evidence
- Native flashcard review with spaced repetition

The v1 LLM schema already includes `spans.category: "claim" | "evidence" | "definition"` — this powers retention without re-analysis.

---

## F11 — PDF support **[v2]**

Chrome's PDF viewer is hard to extend. Plan: render PDFs in our own viewer using `pdf.js`, treat them as a separate render path that produces the same `AnalysisResult` shape.

---

## F12 — Eye tracking **[v3, experimental opt-in]**

WebGazer.js or MediaPipe FaceMesh. Consumer webcam accuracy is ±100px under good conditions, worse with glasses or poor lighting. Use **only** as supplementary stats input (not for UI behavior). Mouse hover + scroll velocity remain the primary signals.

Strict gating: requires camera permission, dedicated calibration flow, on-device only (no video frames leave the machine), prominent "recording" indicator.

---

## F13 — Cloud-synced stats **[v3]**

After hosted billing exists, opt-in cloud sync of stats for cross-device continuity and aggregate cohort dashboards (anonymous benchmarks: "you read 1.4x faster than median professional"). Requires careful data model — only aggregates leave the device, never article URLs or content.
