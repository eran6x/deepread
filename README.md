# Deepread

A Chrome extension that helps professionals read faster and understand more, then extends to retention support for students. Reader-mode-first; LLM-driven analysis (Anthropic Claude); BYO API key in alpha; hosted subscription added in beta.

Brand / domain: **deepread.xyz**

## Status

Planning. No code yet. This repository currently contains design documents only.

## Core thesis

> *"I have 12 tabs open, 3 are worth my time. Help me triage in 30 seconds and read the keepers in half the time."*

Three reading tiers per page: **Brief** (5s triage), **Scan** (60s overview with highlights), **Read** (full read with active-paragraph focus and optional pacer).

## Phasing

| Phase | What ships | Audience | Goal |
|---|---|---|---|
| **Alpha** | Reader-mode + LLM analysis + highlights + focus + pacer + click-to-define + local stats. **BYO API key only. No billing.** | Invite-only, unlisted Web Store install or direct CRX. ~30–80 users. | **Prove the technology works.** Validate the LLM analysis quality, span-mapping reliability, and measurable reading-speed improvement. |
| **Beta** | Adds hosted mode + magic-link auth + Stripe subscription + cross-user analysis cache. Public Chrome Web Store listing. | General professional audience. Paid (flat monthly). | Validate willingness to pay; lock in unit economics. |
| **v2** | Retention layer: recall prompts, Anki export, native flashcards. Student persona unlocked. | Both professional and student segments. | Expand to second persona without disrupting v1 surface. |
| **v3** | Cloud-synced stats; experimental eye tracking; PDF support; cross-article topic graph. | All users; opt-in. | Deepen engagement; not blocking. |

**Current focus**: Alpha. Billing is explicitly deferred to Beta — alpha is a tech-validation phase, not a revenue phase.

## Key decisions (all final)

| # | Decision | Choice |
|---|---|---|
| 1 | Brand / domain | **Deepread / deepread.xyz** |
| 2 | Primary goal | **Speed first**; retention scaffolded for v2 |
| 3 | Page handling | **Reader mode** default |
| 4 | Auth model | **BYO API key** in alpha; **hosted flat-monthly subscription** added in beta |
| 5 | Browsers | **Chrome only** at alpha; Chromium (Edge, Brave, Arc) by beta |
| 6 | Personas | **Professionals first**, students in v2 |
| 7 | Stats storage | **Local-only** at launch; cloud sync in v3 |
| 8 | PDF support | **v3** |
| 9 | Hosted pricing | **$15–20 flat monthly** (final number set at beta launch from alpha cost data) |
| 10 | Build tool | **Vite + @crxjs/vite-plugin** |
| 11 | UI framework | **React 18 + Tailwind** for side panel; vanilla TS + lit-html for content script |
| 12 | Hosted backend | **Cloudflare Workers + D1 + R2 + Stripe** (beta) |

## Document map

Read in order for the first pass:

1. **[Product](docs/01-product.md)** — personas, the three-tier reading flow, methodology grounding, scope
2. **[Architecture](docs/02-architecture.md)** — MV3 module layout, tech stack, data flow, build setup
3. **[Features](docs/03-features.md)** — F1–F13 detailed specs, in/out of alpha
4. **[LLM Integration](docs/04-llm.md)** — prompt design, output schema, caching, cost model
5. **[Reader Mode](docs/05-reader-mode.md)** — extraction, rendering, span-to-DOM mapping (the trickiest module)
6. **[Auth, Billing & Privacy](docs/06-auth-billing-privacy.md)** — BYO at alpha, hosted at beta, key storage, allow-lists
7. **[Roadmap](docs/07-roadmap.md)** — M1–M5 milestones, top risks, gating between alpha and beta
8. **[Alpha Validation](docs/08-alpha-validation.md)** — testable hypotheses, instrumentation, success criteria for the alpha → beta gate

## Naming

The product brand is **Deepread** (deepread.xyz). The current working directory is `vision/` for historical reasons — the eventual repo / package name is `deepread`.

## License

TBD.
