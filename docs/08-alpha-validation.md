# Alpha Validation

The alpha is a tech-validation phase, not a revenue phase. This doc defines what "the technology works" means in measurable terms and sets the gate for proceeding to Beta.

## Hypotheses to test

Five hypotheses, each with measurable success criteria. All five must pass — collectively, they constitute the **alpha → beta gate**.

### H1 — The LLM analysis is accurate enough that users trust it.

If users distrust the verdict or the highlights, no UX layer can save the product.

**Measures**
- **Verdict agreement rate**: when an alpha user lands on an article, do they agree with the verdict? Measured via a 1-click thumbs-up/down on the verdict in the side panel.
  - **Target**: ≥80% thumbs-up across all rated verdicts in the validation period.
- **Tangent/boilerplate correction rate**: how often do users click "show all" on a dimmed section?
  - **Target**: ≤15% of dimmed sections get "show all" clicked. Higher rates indicate the LLM is over-aggressive on dimming.
- **Brief comprehension proxy**: do users continue from Brief into Scan/Read after seeing the brief? (i.e. does the brief give them confidence to proceed, or scare them off?)
  - **Target**: ≥60% of activations where verdict is "skim" or "read" proceed past the Brief view. <40% on "skip" verdicts (i.e. users actually skip when told to).

### H2 — The reader-mode rendering and span-mapping work reliably across the open web.

Highlights in wrong positions, broken layouts, or extraction failures destroy the experience.

**Measures**
- **Extraction success rate**: of all activations, on what percent does Readability successfully extract an article?
  - **Target**: ≥85% on activations the user *intended* to be on an article (excluding sites where Deepread shows "this isn't an article" — those are correct refusals, not failures).
- **Span-mapping success rate**: of all spans returned by the LLM, what fraction map cleanly to DOM ranges?
  - **Target**: ≥90% across the validation cohort. Per-page measurement; aggregate by article, not by span.
- **"Low-quality render" rate**: pages where >10% of spans fail to map and we degrade to no-highlights.
  - **Target**: ≤5% of analyzed pages.
- **Crash and error rate**: uncaught exceptions in content script, background, or side panel.
  - **Target**: <0.5% of sessions.

### H3 — The reading aid actually speeds up reading.

The product's promise is "read faster." If we can't measure a real speed lift, the value claim is hollow.

**Measures**
- **Within-user WPM lift**: compare each user's measured WPM during pacer-on reading vs. their baseline pacer-off WPM on similar-difficulty articles.
  - **Target**: median user shows ≥30% WPM lift with pacer enabled, no regression in self-reported comprehension (post-article 1-click "did you understand it?").
- **Active-paragraph focus adoption**: do users keep this feature enabled?
  - **Target**: ≥70% of users who try it keep it enabled (not disabled in settings) by week 2.
- **Pacer adoption**: of users who try the pacer, what fraction continue using it?
  - **Target**: ≥40% of triers are still using it weekly by week 4. (Pacers are divisive — this is a lower bar than focus.)

### H4 — Users come back. The product is sticky enough to be a habit.

A faster reader they use once a month isn't a product. We need to see retention.

**Measures**
- **D7 retention**: of alpha users who activate Deepread on day 0, what fraction activate again within 7 days?
  - **Target**: ≥50%.
- **D30 retention**: same, within 30 days.
  - **Target**: ≥35%.
- **Articles-per-active-day**: median articles analyzed per day among weekly-active users.
  - **Target**: ≥3.
- **Time-to-second-use**: median time between first and second activation.
  - **Target**: <48 hours for ≥60% of users.

### H5 — Users will pay for it.

The most important hypothesis, and the one we can only measure indirectly during alpha (since billing isn't shipped). We test it via stated intent and prior behavior.

**Measures**
- **Pay-intent survey** at week 4 of validation period:
  - "If Deepread cost $15/month for the hosted version (no API key needed), would you pay?"
  - "If $20/month?"
  - **Target**: ≥40% of weekly-active users say yes at $15/mo; ≥25% say yes at $20/mo.
- **API spend during alpha** (telemetry, with user consent): how much does each user actually spend on Anthropic API calls?
  - **Target**: median weekly-active user spends ≥$3/week — proves they're using it enough that the hosted price ($15–20/mo) is below their organic spend.
- **Referral rate**: do alpha users invite colleagues unprompted?
  - **Target**: ≥15% of alpha users refer at least one other alpha invitee. (Soft signal; positive but not a gate criterion.)

## The alpha → beta gate

Beta work begins only when:

| Criterion | Threshold |
|---|---|
| H1 — verdict agreement | ≥80% thumbs-up |
| H1 — tangent correction rate | ≤15% |
| H2 — extraction success | ≥85% |
| H2 — span-mapping success | ≥90% |
| H2 — crash rate | <0.5% |
| H3 — WPM lift with pacer | ≥30% median |
| H3 — focus retention | ≥70% keep it on |
| H4 — D7 retention | ≥50% |
| H4 — D30 retention | ≥35% |
| H5 — pay intent at $15/mo | ≥40% |
| Cost validation | $15–20/mo is gross-margin-positive at observed cost-per-user |

If any *single* criterion fails by a small margin (≤10% miss), the call is judgment-based: investigate root cause, decide whether to iterate in alpha or proceed to Beta with a fix planned. If multiple criteria miss, alpha continues until they pass — or the project is killed if they're structurally unreachable.

## Telemetry implementation

### Event schema

All events shaped as:

```ts
{
  event: string,             // dot-delimited, e.g. "analysis.completed"
  user_id: string,           // anonymous random UUID generated on first install, stored locally
  session_id: string,        // rotates daily
  ts: number,                // client epoch ms
  client_version: string,    // extension version
  payload: Record<string, unknown>,  // event-specific
}
```

### Event catalog (alpha)

| Event | When | Payload |
|---|---|---|
| `install` | First load | `{ source: "alpha-invite" \| "direct" }` |
| `consent.granted` | Onboarding | `{ telemetry: boolean }` |
| `activation.attempted` | User clicks icon | `{ domain_hash: string, in_blocklist: boolean }` |
| `activation.refused` | Block-list intercept | `{ reason: "blocklist" \| "not-readerable" }` |
| `extraction.completed` | Readability returns | `{ success: boolean, char_count?: number, lang?: string }` |
| `analysis.requested` | LLM call starts | `{ char_count: number, cache_hit: boolean }` |
| `analysis.completed` | LLM call ends | `{ duration_ms: number, input_tokens: number, output_tokens: number, schema_valid: boolean }` |
| `analysis.failed` | LLM call errors | `{ error_class: string, retry_count: number }` |
| `verdict.rated` | User thumbs-up/down | `{ rating: "up" \| "down", verdict: "skip" \| "skim" \| "read" }` |
| `render.completed` | Reader mode mounted | `{ duration_ms: number, span_count: number, spans_mapped: number }` |
| `render.degraded` | Low-quality render | `{ reason: string, span_failure_rate: number }` |
| `tangent.expanded` | User clicks "show all" | `{ section_index: number }` |
| `focus.toggled` | User toggles in settings | `{ enabled: boolean }` |
| `pacer.toggled` | User toggles | `{ enabled: boolean, wpm: number }` |
| `pacer.used` | Pacer ran ≥30s | `{ duration_s: number, wpm: number, regressions: number }` |
| `define.requested` | Word click | `{ cache_hit: boolean }` |
| `wpm.sample` | Per-paragraph reading sample | `{ wpm: number, pacer_active: boolean, difficulty: string }` |
| `comprehension.rated` | Post-article 1-click | `{ rating: "understood" \| "lost", est_difficulty: string }` |
| `error.uncaught` | JS error | `{ error_class: string, surface: "content" \| "background" \| "panel" }` |
| `survey.submitted` | Week 4 survey | `{ pay_intent_15: boolean, pay_intent_20: boolean, nps: number, free_text_consented: boolean }` |

### What we explicitly do NOT collect

- URLs (only domain hashes if needed; never the path or query string)
- Page text (ever, in any form, even hashed beyond the content-hash for cache lookups)
- User identity (email, name, anything PII)
- Anthropic API key (obvious, but worth restating)

### Storage

Self-hosted PostHog instance on Fly.io or similar. Not a vendor's shared cloud. Database backups encrypted at rest. Access restricted to the engineering team (i.e. you).

## Alpha cohort

### Recruiting

- Target size: **30–80 users**. Below 30, the metrics are too noisy. Above 80, manual feedback synthesis becomes a job.
- Profile: **working professionals who read 5+ long-form articles per week**. Bias toward tech, finance, consulting, journalism, research roles. Not students (they're a different persona for v2).
- Channels: personal network, LinkedIn, niche communities (Hacker News "Show HN" if scope permits, professional Slack groups). Application form on deepread.xyz.
- Manual approval. Ask three filter questions in the application:
  1. How many long-form articles do you read in a typical week?
  2. Do you have an Anthropic API key (or are you willing to make one)?
  3. What's the most painful thing about how you read online today?

### Onboarding

- One-screen install instructions
- Telemetry consent screen (clear, not buried)
- 60-second product video
- API key paste field with format validation + 1-token test call
- Pre-populated allow-list for the user's most-read sites (optional, manual)

### Cadence

- **Week 0**: alpha goes live; first 10–15 users invited
- **Weeks 1–2**: ramp to full cohort; daily metric review; rapid bug fix turnaround
- **Weeks 3–6**: validation period proper; weekly metric read-out; biweekly user calls (5–10 users on a 30-min call to talk through their experience)
- **Week 4**: pay-intent survey
- **Week 6**: gate-decision meeting

## Iterating during validation

Validation is not a one-shot test. The system prompt, UI, and pacer parameters all benefit from tuning during the validation period. Rules of the road:

- **Allowed during validation**: prompt iteration, copy changes, UI polish, bug fixes, parameter tuning (default WPM, dim opacity, etc.).
- **NOT allowed during validation without restarting**: changing the analysis schema, adding/removing tiers, adding new mechanics (e.g. retention prompts) that meaningfully change what users are evaluating.

If we make a "not allowed" change, reset the validation period clock. The whole point is to evaluate a stable artifact.

## What "alpha succeeded" looks like in narrative form

50 weekly-active alpha users, each analyzing a median of 4–5 articles per day, sustained over four weeks. They thumbs-up 85% of verdicts, expand only 8% of dimmed sections, and read 35% faster with the pacer on (without losing comprehension self-reports). 45% say they'd pay $15/mo. The team has 200+ open user-feedback comments and a clear list of the top 10 to fix in Beta.

## What "alpha failed" looks like — and what to do

If users don't come back (D7 < 30%), it's not the tech — it's the value proposition. Don't proceed to Beta. Reposition or kill.

If users come back but verdict-trust is low (<70%), the LLM analysis isn't pulling its weight. Try: stronger system prompt, model upgrade, different schema. Iterate in alpha.

If users love it but won't pay (≥50% engaged, <25% pay-intent), the price is wrong or the value is partial. Try: lower price test ($10), or identify the missing feature blocking pay-intent.

If span mapping fails systematically on key publisher sites, that's a tech problem with a clear path: more site overrides, better text-diff aligner, possibly a different rendering strategy. Iterate in alpha.

In all cases: **don't build the Beta backend until the gate passes**. The whole point of the alpha-vs-beta split is to avoid that wasted work.
