# LLM Integration

The single most important technical artifact in this product. Quality of the analysis call determines whether users trust the verdict, whether highlights feel right, and whether tangent-dimming earns confidence rather than losing it.

## Models

| Use case | Model | Why |
|---|---|---|
| Page analysis (one call per page) | **Claude Sonnet 4.6** | Best quality/cost balance; structured output reliable; fast enough to stream a verdict in <2s |
| Click-to-define | **Claude Haiku 4.5** | Cheap, fast, definitions don't need Sonnet |
| Pre-summarization for long pages (>15k tokens) | **Claude Haiku 4.5** | Compress to <8k tokens before passing to Sonnet for the real analysis |
| v2 retention prompt evaluation | Sonnet 4.6 | Generous-but-fair grading needs reasoning |

Model IDs are resolved at runtime from a `models.ts` constants file so we can swap as new versions ship.

## The analysis call

### Output schema (Zod, source of truth)

```ts
import { z } from "zod"

export const AnalysisResult = z.object({
  verdict: z.object({
    decision: z.enum(["skip", "skim", "read"]),
    reason: z.string().max(160),
  }),
  brief: z.array(z.string().max(120)).length(3),
  topics: z.array(z.string()).max(5),
  est_read_time_min: z.number().int().positive(),
  difficulty: z.enum(["easy", "medium", "hard"]),
  sections: z.array(z.object({
    heading: z.string(),
    char_range: z.tuple([z.number().int(), z.number().int()]),
    one_liner: z.string().max(140),
    relevance: z.enum(["core", "supporting", "tangent", "boilerplate"]),
  })),
  spans: z.array(z.object({
    char_range: z.tuple([z.number().int(), z.number().int()]),
    category: z.enum(["entity", "claim", "evidence", "number"]),
  })),
})

export type AnalysisResult = z.infer<typeof AnalysisResult>
```

**Why character ranges, not CSS selectors**: Readability hands us clean text; we map ranges back to DOM nodes inside our reader-mode rendering (which we control). Selectors would fight site re-renders. See `05-reader-mode.md` for the mapping algorithm.

### System prompt (v1 draft)

```
You are Deepread, an analysis engine for a reading-aid Chrome extension whose users
are professionals triaging long-form content. Your job is to produce a single
structured analysis of an article that helps the user decide whether to read it
and, if so, lets them read it faster without losing comprehension.

You will receive the article's title, URL, and extracted main text.

Produce a JSON object exactly matching the provided schema. Do not include any
fields outside the schema. Do not write commentary outside JSON.

Guidelines:

VERDICT
- "skip": low signal, redundant with common knowledge, mostly opinion without
  evidence, or off-topic for the apparent intent of the title.
- "skim": some useful information but heavy boilerplate or low signal density.
- "read": dense in claims, evidence, or novel perspective worth full attention.
- The reason must be a single sentence specific to THIS article. Never generic.

BRIEF
- Exactly 3 bullets, each ≤20 words.
- Cover the article's actual claims, not its topic. "The author argues X" not
  "this is about X".
- Lead with the most consequential claim.

SECTIONS
- One entry per logical section, not per HTML heading. Group short adjacent
  sections that share a thesis.
- char_range refers to offsets in the extracted text we sent you (0-indexed,
  end-exclusive).
- relevance:
  - "core": load-bearing for the main argument
  - "supporting": context, examples, caveats
  - "tangent": author digression, unrelated anecdote
  - "boilerplate": author bio, "subscribe to my newsletter", related-articles
    list, navigation, ads, cookie disclosures
- Be conservative on "tangent" and "boilerplate" — when in doubt, mark
  "supporting". A false boilerplate hurts the user more than a false core.

SPANS
- Highlight 4 categories of substantive content. Total spans should not exceed
  ~80 per 1000 words; aim for signal, not coverage.
  - "entity": named people, organizations, products, places that matter to the
    argument (skip ones mentioned only in passing)
  - "claim": author assertions, especially load-bearing ones
  - "evidence": numbers, citations, study names, concrete examples supporting
    a claim
  - "number": standalone notable figures (years, percentages, magnitudes)
- char_range must be valid (start < end, within text length, no overlap within
  the same category).

DIFFICULTY
- "easy": general-audience prose, ≤8th grade reading level
- "medium": some jargon or technical concepts, advanced reader
- "hard": dense technical, academic, or specialist content requiring background

EST_READ_TIME_MIN
- Compute from word count assuming 250 WPM (the median professional reader's
  natural pace, before any speed-aid). Round up. Minimum 1.
```

### Streaming order

Use Anthropic's tool use with a single `submit_analysis` tool whose input matches `AnalysisResult`. Streaming partial JSON yields fields in declaration order, so we structure the schema so that the most user-facing fields stream first:

1. `verdict` — user gets answer in <2s
2. `brief` — user gets the gist
3. `topics` — chips render
4. `est_read_time_min`, `difficulty` — header completes
5. `sections` — Tier 2 view becomes interactive
6. `spans` — highlights paint in

The side panel reads partial events from a `chrome.runtime.connect` port and updates progressively.

### Prompt caching

System prompt is identical across every page. Use Anthropic's prompt caching with a 5-minute TTL on the system block. Hit rate should be >95% for active users.

Article text goes in a non-cached user turn (different per page).

### Long-page handling

If extracted text exceeds **15,000 tokens** (~12k words):

1. Split into roughly equal chunks at section boundaries.
2. Run each chunk through Haiku with a "summarize preserving claims, evidence, entities, numbers, and section structure" prompt.
3. Concatenate Haiku outputs.
4. Pass the compressed version to Sonnet for the real `AnalysisResult` call.

This keeps Sonnet input under cap, predictably cheap, and recovers most of the signal. Char ranges in the result will reference the compressed text — the content script keeps both the original and the compressed text available and falls back gracefully when a span doesn't map to the original (just hides the highlight; never errors).

### Cost model

Rough numbers for sanity-checking pricing.

Per-page analysis at v1 (Sonnet 4.6, cached system, 4k input tokens, ~1.2k output tokens):
- Input cached: very cheap (10x discount)
- Input uncached: ~$0.003
- Output: ~$0.018
- **Per-analysis cost: ~$0.02**

Click-to-define (Haiku 4.5, ~500 input / 100 output, cached):
- ~$0.0003 per call
- Heavy local cache means most reads issue 0–3 calls
- **Per-active-reading-session: ~$0.001**

A heavy professional user analyzing 20 pages/day: **~$0.40/day**, **~$12/mo**. This is the lower bound for hosted-tier pricing.

A reasonable hosted flat-monthly tier of **$15–20/mo** has gross margin once you discount cache hits across users (covered in `06-auth-billing-privacy.md`).

### Error handling

| Failure | Behavior |
|---|---|
| API key invalid | Side panel shows clear error with link to settings |
| Network timeout (>30s) | Cancel, retry once, then show "couldn't analyze" with a "send page text manually" fallback |
| Schema validation fails on LLM output | Log the violation, retry once with stricter system prompt addendum, then degrade to "best effort" — show whatever fields validated |
| Rate limit (429) | Exponential backoff up to 30s, surface "rate limited" if user-visible |
| Quota exceeded (hosted mode) | Side panel shows upgrade CTA |

### Telemetry

**At v1**: nothing. No analytics. No error reporting.

**At v1.0 launch (Web Store)**: opt-in error reporting only. Schema validation failures are the highest-value signal — they tell us where the prompt needs work. Errors include: error class, model, page-text length bucket. Never include: URL, page text, user identity.

## Click-to-define call

Tiny prompt, tight schema:

```
System: You are a dictionary lookup. Given a word and the sentence it appears in,
return its definition in that context plus up to 3 synonyms. Definition ≤25
words. Plain prose, no quotation marks around the word.

User: word: "ratiocinate"
sentence: "Holmes would ratiocinate his way through the smallest details."
```

Output schema:
```ts
{ definition: string, synonyms: string[] }
```

Cached locally by `(word, language)` indefinitely. Vocabulary is finite; cache hit rate climbs steeply.

## Open questions for the LLM layer

1. **Streaming structured output reliability**: Anthropic's tool-use streaming is solid but partial JSON parsing is fiddly. May want a tiny streaming JSON parser (e.g. `partial-json`) instead of waiting for whole-object validation per field.
2. **Schema migration**: when we add v2 retention fields (e.g. `definitions[]`, `questions[]`), older cached analyses won't have them. Need a `schema_version` field and graceful re-analysis on miss.
3. **Multilingual**: v1 is English-only. Non-English pages should be detected pre-call (via `navigator.language` heuristic + first-200-char language detection) and either refused or processed with a translated system prompt. Decision deferred to v2.
