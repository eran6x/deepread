# Product

## Personas

### P1 — Professional triager (primary, v1)

A consultant, analyst, PM, researcher, or engineer who opens 5–20 tabs of long-form content per day (news, reports, research, blog posts, internal docs) and has to decide quickly which deserve real attention.

**Pain points**
- Pre-reading triage is manual and slow; titles + first paragraphs are unreliable signals
- Long articles have variable signal density — finding the "core 30%" is friction
- Subvocalization-paced reading wastes time on content they could skim
- Important entities, numbers, and claims are buried in prose

**Success looks like**
- Verdict on "skip / skim / read" within 5 seconds of activation
- 1.5–2x effective reading speed on kept articles, with comparable comprehension
- Ability to jump straight to the substantive sections

### P2 — Student / lifelong learner (secondary, v2)

A graduate student, self-directed learner, or knowledge worker reading to *retain*, not just consume. Same surface, different defaults: slower pacer, richer summaries, end-of-article recall prompts, spaced repetition export.

This persona is **out of scope for v1** but the architecture must not block it. Specifically: the LLM analysis schema should already include enough structure (claims, evidence, definitions) to generate retention prompts later without re-analyzing the page.

## The three-tier reading flow

Single activation, three progressive depths. The user can stop at any tier or push deeper.

### Tier 1 — Brief (target: <5s to first useful output)

Shown immediately in the side panel when the user activates the extension on a page.

- **Verdict**: `skip / skim / read` with one-sentence rationale
- **TL;DR**: 3 bullets, ≤20 words each
- **Topics**: up to 5 chips
- **Estimated read time** at the user's tracked WPM
- **Difficulty**: easy / medium / hard

The verdict streams first. The user can close the panel and move on within 2–3 seconds.

### Tier 2 — Scan (target: 30–90s for a 2000-word article)

The page is replaced by a clean reader-mode rendering with:

- **Section headers** with one-line summaries pinned at each section break
- **Color-coded highlights** for entities, claims, evidence, numbers
- **Dimmed sections** marked as `tangent` or `boilerplate` (dim, never hide; one-click "show all")
- A persistent **"jump to core sections"** affordance

User can scroll naturally; the highlights and one-liners give them the argument shape without reading every word.

### Tier 3 — Read (full read, paced)

For articles the user wants to fully consume.

- **Active-paragraph focus**: current paragraph at full opacity; others at 0.4
- **Pacer mode** (optional toggle): a moving highlight band advances at the configured WPM
- **Click-to-define**: any word → definition + synonyms in a popover
- **Live stats**: WPM, regression rate, time-on-section

Stats are recorded locally and surfaced in the side panel.

## Methodology grounding

Three reading goals; different evidence-backed techniques. Deepread optimizes primarily for **speed** at v1; the architecture supports **comprehension** as a side effect of pre-reading priming, and reserves retention work for v2.

### Speed (WPM)

- **Pacer / guided reading** — a moving highlight forces forward motion and reduces *regressions*, which is the largest speed killer for typical readers. **Strongest evidence-backed lever; this is v1's headline mechanic for Tier 3.**
- **Active-paragraph focus** — reduces peripheral distraction, keeps eyes anchored. Cheap to implement, well-tolerated by users.
- **Chunking** (2–4 word units) — better than single-word RSVP for comprehension. **Phase 2 toggle.**
- **RSVP** (single-word fixation, Spritz-style) — works but comprehension drops above ~500 WPM and retention is weak. **Phase 2 toggle, not default.**
- **Bionic-style fixation bolding** — popular but evidence is weak/mixed. **Cosmetic option, not headline.**

### Comprehension

- **Pre-reading priming** (summary + keyword preview *before* reading) — measurably improves comprehension via schema activation. **This is what Tier 1 (Brief) does, and it's the LLM's biggest contribution.**
- **Structure mapping** (claim → evidence → conclusion) — surfacing the argument skeleton helps more than highlighting alone. **Tier 2 section one-liners deliver this.**
- **SQ3R** (Survey → Question → Read → Recite → Review) — canonical framework. Deepread's three tiers map loosely to Survey → Read; Recite/Review belong to v2.

### Retention (v2)

- **Active recall** beats re-reading by a wide margin (Karpicke & Roediger, 2008). End-of-article recall prompts.
- **Spaced repetition** for anything worth keeping. Anki export at minimum; native flashcards as a fast follow.
- **Generation effect** — making the user produce a summary in their own words beats showing them one.

## Scope

### In for v1

- Reader-mode extraction via Mozilla Readability
- Single streaming LLM analysis call per page (verdict, brief, topics, sections, spans)
- Side panel UI with the three-tier flow
- Color-coded highlighting (4 categories: entity, claim, evidence, number)
- Active-paragraph focus / dimming
- Pacer mode with configurable WPM
- Click-to-define (Haiku call, locally cached)
- Local WPM and regression stats
- BYO Anthropic API key
- Per-domain allow-list with sensitive-domain default block-list
- Settings UI for WPM, color scheme, dim opacity, pacer style

### Out of v1, scaffolded for later

- **Phase 1.5**: hosted subscription mode (auth, Stripe, proxy backend)
- **Phase 2**: chunked / RSVP modes, retention layer (recall prompts + Anki export), PDF support
- **Phase 3**: cloud-synced stats, eye-tracking experimental opt-in, cross-article topic graph

### Explicitly not building

- Audio / TTS reading (different product)
- Translation (different product)
- Annotation / highlight-saving as a knowledge base (different product, lots of competitors)
- In-place overlay on live (non-reader-mode) DOM as default. May ship as an advanced toggle later, but it's not the primary surface.
