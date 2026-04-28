# Roadmap

Two-phase delivery: **Alpha** (validate the technology) and **Beta** (commercialize). Alpha must pass a tech-validation gate before Beta work begins. See `08-alpha-validation.md` for the gate criteria.

```
┌─ ALPHA ──────────────────────────────────────────┐  ┌─ BETA ──────────────┐
│ M1   M2   M3   M4 (alpha release + validation)   │→ │ M5 (hosted+billing) │
│ ~8–10 weeks                                      │  │ ~3–4 weeks           │
│ BYO key only · invite-only · tech validation     │  │ Public + paid        │
└──────────────────────────────────────────────────┘  └──────────────────────┘
```

Effort estimates assume **one engineer full-time**. Add 30% padding for the long tail of weird sites. Two engineers in parallel collapses M1–M3 by roughly a third (front/back split: content + reader mode vs. background + LLM + side panel).

Adjust gates based on dogfood feedback rather than chasing dates.

---

## Phase A — Alpha (M1–M4)

Goal: prove the technology works and is worth charging for. BYO API key only. No billing. Invite-only distribution.

### M1 — Foundations + Tier 1 Brief (2 weeks)

Goal: paste a key, click the icon on an article, see a verdict + brief in the side panel.

**Deliverables**
- Repo scaffold (Vite + CRXjs + TS + React + Tailwind + Biome + Vitest)
- MV3 manifest with minimal permissions
- Background worker skeleton with typed message router
- `LLMClient` interface + `DirectAnthropicClient` implementation
- Settings UI (just the API key field)
- Side panel shell + Brief view with streaming partial rendering
- Readability extraction in content script
- Content-hash + IndexedDB cache for analyses
- Zod-validated `AnalysisResult` schema
- Initial system prompt for analysis
- Working end-to-end on 5 hand-picked test articles

**Exit criteria**
- I can paste my own API key, hit Deepread on an NYT or Atlantic article, and see a streamed verdict + brief in <8 seconds, twice in a row (second one served from cache).

---

### M2 — Highlights + active-paragraph focus (Tier 2 + part of Tier 3) (2 weeks)

Goal: Reader mode renders, highlights paint, active paragraph focuses.

**Deliverables**
- Reader-mode Shadow DOM rendering pipeline
- DOMPurify sanitization
- Text-index + char-range → DOM Range mapping
- Highlight overlay layer (4 categories, configurable palette)
- Section one-liners (sticky)
- Tangent / boilerplate dimming with "show all" toggle
- Active-paragraph IntersectionObserver + dimming
- Settings: dim opacity, color palette, highlight categories on/off
- Internal dogfood with 3–5 trusted users

**Exit criteria**
- Span-mapping success rate ≥90% across a fixed corpus of 30 articles (NYT, Atlantic, Substack, Stripe Press, Stratechery, arXiv, GitHub blog, Medium).
- Active paragraph stays correctly identified through normal scrolling on those articles.
- Internal dogfood users report the Scan view "feels right" on majority of pages.

---

### M3 — Pacer + click-to-define + stats + alpha telemetry (2.5 weeks)

Goal: full reading flow with measurable stats, plus the telemetry pipeline that drives the alpha-validation gate.

**Deliverables**
- Pacer module (band, underline, chunk styles)
- Keyboard controls (play/pause/step/speed)
- Click-to-define popover with Haiku call
- Local definition cache
- Scroll/regression/WPM signal collection
- Stats view in side panel (today, last 7 days, all-time WPM)
- Sensitive-domain block-list with override prompt
- "Always on for this domain" allow-list
- Popup with on/off + current-domain status
- **Alpha telemetry pipeline**: self-hosted PostHog (or similar), event schema, opt-in onboarding consent
- **In-product feedback widget**: thumbs-up/down on verdict; "this section shouldn't be tangent" 1-click correction; free-text bug report

**Exit criteria**
- Pacer runs at user's chosen WPM without desyncing for ≥10 minutes of continuous reading.
- Stats accurately reflect manually-timed reading sessions (within 10%).
- Block-list correctly intercepts Gmail, online banking, and Notion private workspaces in testing.
- Telemetry events are flowing to PostHog and validate-able against expected schema.

---

### M4 — Alpha release + validation period (2 weeks build + 4–6 weeks validation)

Goal: ship to invited alpha cohort and run the validation period that determines whether Beta is worth building.

**Build deliverables (2 weeks)**
- Edge-case sweep on top 100 publishers (automated Playwright suite)
- Clear error states for: invalid API key, network failure, extraction failure, paywall, schema validation failure
- Onboarding flow with telemetry consent
- Lightweight privacy disclaimer for alpha
- Distribution mechanism: unlisted Chrome Web Store entry **or** direct CRX install with auto-update manifest
- Recruiting page (lightweight): one-pager at deepread.xyz with a sign-up form
- Alpha invite system (manual approval, ~30–80 testers)
- Dashboards in PostHog for the alpha-validation metrics

**Validation period (4–6 weeks of users actively using the product)**
- See `08-alpha-validation.md` for the full criteria.
- Weekly read-out of validation metrics + qualitative feedback synthesis.
- Iterate on prompt + UX during the validation period; do not let validation become a one-shot test.

**Exit criteria** (the **alpha → beta gate**)
- All gate criteria in `08-alpha-validation.md` met or exceeded.
- Qualitative: ≥40% of weekly-active alpha users say they would pay $15–20/mo for the hosted version (post-validation survey).
- Cost telemetry confirms the $15–20/mo Beta price is gross-margin-positive.
- No fundamental tech blockers (e.g. span mapping cannot be made reliable enough; LLM verdicts are too unreliable for users to trust).

If the gate fails: iterate in alpha until it passes, or kill the project. Don't proceed to Beta.

---

## Phase B — Beta (M5)

Only starts if the alpha → beta gate passes.

### M5 — Hosted mode + billing + public launch (3–4 weeks)

Goal: zero-friction onboarding for non-technical users; subscription revenue live; public Web Store release.

**Deliverables**
- Cloudflare Workers backend (Hono)
- D1 schema: users, subscriptions, quota_periods
- Magic-link auth (Stytch or roll-our-own — final decision at start of M5)
- Stripe Checkout + Customer Portal integration
- Webhook handler for subscription lifecycle
- `HostedProxyClient` implementation
- Cross-user analysis cache (R2)
- Per-user rate limiting
- Sign-in flow in side panel
- Auth-mode switcher in settings
- Privacy policy (legal review)
- Web Store listing assets: screenshots, demo video (60s), copy
- Public Chrome Web Store release as v1.0
- Migration path for alpha users (keep BYO mode; offer hosted as upgrade)

**Exit criteria**
- Real customers can sign up, pay, and start using hosted mode end-to-end without engineer intervention.
- Cross-user cache hit rate ≥25% across active users on shared content.
- Unit economics positive at the chosen price point (verified against M5 first-month cohort).
- Web Store approval received.

---

## Total schedule

| Phase | Calendar time | Engineering effort |
|---|---|---|
| **Alpha build (M1–M4 build)** | ~8.5 weeks | 8.5 weeks (one eng) |
| **Alpha validation period** | ~4–6 weeks | Mostly observation + iteration; ~30% engineering |
| **Beta (M5)** | ~3–4 weeks (only if gate passes) | 3–4 weeks |
| **Total to public Beta launch** | **~15–18 weeks** | **~12–14 eng-weeks** |

Each milestone ends with a demoable artifact. M1 itself produces a working extension you can use; everything from M2 on is iterative improvement of an already-working tool.

---

## Top risks

Ranked by potential impact × likelihood.

### R1 — Span-to-DOM mapping fails on real-world sites (HIGH × MEDIUM)

The text-mismatch problem (`05-reader-mode.md`) is well-understood, but real-world sites will surface edge cases we haven't seen. Worst case: highlights paint in wrong positions, breaking trust.

**Mitigation**: silent-fail policy (drop unmappable highlights, never render wrong); 30-article fixed corpus in CI; alpha telemetry tracks span-mapping success rate per page; "low-quality render" detection that downgrades to no-highlights mode.

**Tracked in alpha as a gate criterion.**

### R2 — LLM mis-classifies content the user cared about (HIGH × MEDIUM)

User loses trust if "tangent" hides something relevant. Recovery from broken trust is expensive.

**Mitigation**: dim never hide; persistent "show all" toggle; conservative prompt ("when in doubt, mark supporting"); local feedback signal (user clicking "show all" on a tangent is logged for prompt iteration). Alpha telemetry tracks correction rate.

### R3 — Alpha shows the tech works but no one wants to pay (HIGH × MEDIUM)

The whole point of deferring billing to Beta is to avoid building the billing stack until we know users will pay. But the inverse risk is: alpha validation passes the *technical* tests but the post-validation pay-intent survey shows weak willingness. Then we either kill the project or iterate on positioning.

**Mitigation**: include pay-intent in the alpha validation gate (not just tech metrics); recruit alpha users who match the paying-customer profile (working professionals, not students or hobbyists); price-test variants in the pay-intent question.

### R4 — Cost of hosted tier exceeds revenue (MEDIUM × LOW–MEDIUM)

A heavy user analyzing 50+ pages/day at $20/mo is unprofitable on Anthropic costs alone, before infrastructure.

**Mitigation**: alpha telemetry directly measures cost-per-active-user from real usage patterns. Beta price is set after seeing this data. Cross-user cache (target ≥25% hit rate); per-user soft cap (200/day default); pricing locked-in at signup so we can adjust new-user price without churn.

### R5 — Web Store rejection or slow review (MEDIUM × MEDIUM)

"Modifies page content" extensions get scrutiny. A rejection at M5 delays public Beta by weeks.

**Mitigation**: minimal permissions; complete privacy disclosure; demo video; conservative listing copy; alpha validation already proved the product works, so we have screenshots and metrics to back the listing. Fall-back distribution via direct CRX install if needed.

### R6 — Privacy perception kills adoption (MEDIUM × LOW)

Tech-savvy users see "sends page text to an AI" and bounce.

**Mitigation**: BYO-first positioning ("your key, your control"); prominent in-page activity indicator; sensitive-domain block-list in default config; clear privacy policy; never set `<all_urls>` host permission. Alpha measures bounce vs. activate rates.

### R7 — Extraction fails on sites users care about (MEDIUM × MEDIUM)

Readability is good but not perfect. Some publishers (especially academic, paywalled) wrap content in ways it can't see.

**Mitigation**: site-overrides JSON for known-bad sites; "manual extraction" fallback (user pastes text); track extraction failure rate as a key alpha telemetry metric and gate criterion.

### R8 — Pacer makes reading worse for some users (LOW × HIGH)

Pacers help on average but actively hurt some readers, especially those with ADHD or unusual reading styles.

**Mitigation**: opt-in by default; broad style controls; clear "off" mode; alpha measures whether users keep using the pacer or disable it.

---

## What "done" looks like for Beta launch (v1.0)

A professional can:

1. Install Deepread from the Chrome Web Store (free).
2. Either paste an Anthropic key in 30 seconds, **or** sign in with email and pay $X/mo.
3. Click Deepread on any article on the open web.
4. Get a 5-second triage verdict.
5. If they keep reading, scan the article 1.5–2× faster than baseline with active-paragraph focus and an optional pacer.
6. See their reading speed trend over time.
7. Trust that Deepread is not running on their banking, email, or workspace tools without explicit permission.

When that whole loop works smoothly for the alpha cohort *and* the first 50 paying Beta customers, v1.0 is done. Then we start on retention (v2) for the student persona.
