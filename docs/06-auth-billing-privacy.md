# Auth, Billing & Privacy

Three concerns that share infrastructure and affect each other. Treated together.

## Phasing

| Phase | Auth | Billing | Backend |
|---|---|---|---|
| **Alpha** | **BYO Anthropic API key only** | **None** | None — extension calls Anthropic directly |
| **Beta** | BYO **+** hosted (magic-link sign-in) | Stripe subscription, **flat $15–20/mo** | Cloudflare Workers proxy + D1 + R2 |
| **v2+** | Same as Beta | Same as Beta | + retention features running through same proxy |

The architectural abstraction (`LLMClient` interface, see below) lets us add the hosted client in Beta without touching the content script or side panel.

## Two auth modes

### BYO API key (Alpha + Beta)

User pastes their Anthropic API key into Settings. Stored in `chrome.storage.local`. The background worker calls Anthropic directly using `@anthropic-ai/sdk`.

**Pros**: ships fast, no backend needed, target alpha persona has keys, lowest privacy footprint (no data passes through us), zero ops cost.

**Cons**: friction for non-technical users, key management is user's problem, no quota enforcement (user pays Anthropic directly).

**Alpha distribution**: BYO is the *only* mode. Alpha users are professionals with Anthropic keys (or willing to make one in 5 minutes). This is intentional — it filters for the audience whose feedback we want, and removes billing as a confounding variable while we validate the technology.

### Hosted, flat-monthly subscription (Beta)

User signs in via magic link, pays Stripe, receives a session token. Background worker calls our proxy backend; proxy calls Anthropic with our key.

**Pros**: zero-friction onboarding, predictable monthly cost for the user, lets us cache analyses across users (huge cost lever).

**Cons**: requires backend, auth, billing, abuse handling; users' page text passes through our infrastructure.

**Why deferred to Beta**: building the hosted stack (auth, billing, proxy, abuse handling) is ~3–4 weeks of work that doesn't move the *reading product* forward. We defer until alpha confirms the technology actually works and users actually want to keep using it. If alpha fails, we save the entire beta backend investment.

### Architecture: same interface, two implementations

```ts
// shared/types.ts
export interface LLMClient {
  analyze(input: AnalyzeInput, onPartial: PartialHandler): Promise<AnalysisResult>
  define(input: DefineInput): Promise<DefineResult>
}

// background/llm/direct.ts  (Alpha + Beta)
export class DirectAnthropicClient implements LLMClient { /* uses Anthropic SDK directly */ }

// background/llm/hosted.ts  (Beta)
export class HostedProxyClient implements LLMClient { /* fetches from our /v1/analyze etc. */ }
```

The content script and side panel never know which client is in use. A single `getLLMClient()` factory reads `settings.authMode` and returns the right one. In Alpha, the factory only returns `DirectAnthropicClient`.

## API key storage (BYO)

The API key is sensitive: anyone with it can run up the user's Anthropic bill. Defense-in-depth:

1. **Storage**: `chrome.storage.local` — stays on the device, doesn't sync via Google.
2. **Never log it.** Searchable banned-substring check in dev builds.
3. **Never round-trip through the side panel** after initial entry. Settings UI writes once, reads via masked display ("sk-ant-•••••XYZ"). The actual key only travels: settings panel → background worker (one-time write) → Anthropic API (per call).
4. **No content script ever has it.** Content scripts request analysis via message; the background worker holds the key.
5. **At-rest encryption** (consideration, not Alpha): we could derive a key from a user passphrase and encrypt the stored API key. Adds friction. Defer until a user actually asks for it.
6. **Detection of paste**: when user pastes a key, validate format (`sk-ant-...`) and optionally do a 1-token test call to confirm validity before saving.

## Hosted backend (Beta)

### Stack

- **Runtime**: Hono on Cloudflare Workers (single binary, low cold-start, edge-deployed)
- **Database**: Cloudflare D1 (SQLite-on-edge) for users, subscriptions, quota counters
- **KV**: Cloudflare KV for session tokens and rate-limit counters
- **Cache**: Cloudflare R2 (or Workers KV with TTL) for cross-user analysis cache, keyed by content hash
- **Auth**: Magic-link via [Stytch](https://stytch.com) (managed) — final call between Stytch and roll-our-own deferred to start of M5
- **Billing**: Stripe Checkout for sign-up, Stripe Customer Portal for management

### Endpoints

```
POST /auth/magic-link      → email a sign-in link
GET  /auth/callback        → exchange link token for session
POST /auth/refresh         → refresh session token
POST /v1/analyze           → streamed AnalysisResult (proxies to Anthropic)
POST /v1/define            → definition lookup
GET  /v1/quota             → remaining requests this period
POST /webhooks/stripe      → subscription state changes
```

### Cross-user analysis cache

The biggest cost lever for hosted mode. If User A and User B both analyze the same NYT article, we should pay for one Sonnet call, not two.

- Cache key = SHA-256 of the **extracted text** (not URL — same article via different URLs share content)
- Cache TTL: 7 days (articles can update; news outlets edit silently)
- Stored in R2; payload is the JSON `AnalysisResult`
- Hit rate target: 30–50% for trending content, lower for long-tail. Even 25% hit rate roughly halves the per-active-user cost.

### Rate limits & abuse

- Per-user: configurable quota (default: 200 analyses/day → covers heavy professional use). Soft cap with grace; hard cap at 2× soft.
- Per-IP: 60 req/min unauthenticated, 600 req/min authenticated.
- Anomaly detection: a user issuing 1000+ analyses in an hour is flagged for review.
- No free tier at Beta launch (BYO is the free option). Optional: 5-analyses-free trial without credit card to demo the UX.

### Pricing

**$15–20/month flat**, locked in at signup. Final number chosen at Beta launch from alpha cost telemetry. Lower bound is ~$12/mo of pure Anthropic cost for a heavy user before any cache savings.

Billing model: Stripe subscription, monthly. No annual prepay at Beta launch — adds support complexity.

## Privacy

The biggest single trust risk in this product. A user activating Deepread on a logged-in or sensitive page sends that page's text to Anthropic (BYO mode) or to us-then-Anthropic (hosted mode). We need to make this unmistakable, controllable, and conservatively-defaulted.

### Default behavior

- **Off everywhere by default.** User explicitly activates per page.
- **Sensitive-domain block-list** ships in the extension (read-only base list, user-extensible). Activation is refused on these domains with a clear message and a "I understand the risk, enable anyway" override.

Initial block-list:
- Banking: chase.com, bofa.com, wellsfargo.com, etc. (curated list of top 50 retail banks worldwide)
- Health: mychart.com, generic patterns like `*.epic.com`, `*.cerner.com`
- Email: gmail.com, mail.google.com, outlook.live.com, mail.yahoo.com, fastmail.com, etc.
- Calendar: calendar.google.com, outlook.office.com
- Workspace tools: slack.com, notion.so (workspace URLs), figma.com (file URLs), atlassian.net (jira/confluence)
- SSO providers: okta.com, auth0.com, login.microsoftonline.com
- Anything matching `*.internal.*` heuristics (corporate intranets)

This list is in `shared/domains.ts` and shippable as data, not code, so it can be updated.

### "Always on for this domain" allow-list

Power-user feature. Adds a domain to a per-device allow-list; activation is automatic on those domains. Prominent indicator in the popup: domain name, count of analyses today, "remove from allow-list" button.

### In-page indicator

Whenever Deepread is active on a page, a small fixed-position badge in the corner of the reader-mode overlay says **"Deepread active · sending text to Anthropic"** (or **"…to Deepread servers"** in hosted mode). Cannot be hidden in alpha or beta. Click for details + deactivate.

### Data retention

**BYO mode (Alpha + Beta)**: we retain nothing. All caching is local to the user's device.

**Hosted mode (Beta)**:
- Analysis results in cross-user cache: 7 days, keyed by content hash (no user attribution)
- Per-user quota counters: rolling 30 days
- Auth sessions: 30 days inactive then expired
- Stripe billing data: per Stripe's retention
- **Page text is never persisted server-side** beyond the in-flight request and the analysis cache (which holds the *result* only, not the source text)
- No analytics on what content users analyze. No URLs logged.

### Privacy policy promises (Beta — required for Web Store)

Drafted in plain language, prominently linked from the popup and Web Store listing. Key promises:

1. We don't read your API key. It's stored on your device only. (BYO mode)
2. We don't store the text of pages you analyze beyond the in-flight request. (Hosted mode)
3. We don't track which pages you analyze.
4. We don't sell, share, or use your data for anything other than running this product.
5. You can delete your account and all associated data with one click. (Hosted mode)

These need legal review before public Beta launch. **Alpha is invite-only and unlisted, so a lighter privacy disclaimer is sufficient** — but write the real policy during alpha so it's ready for the Beta submission.

### Telemetry

**Alpha**: opt-in **and on by default for invited users**, with an explicit consent during onboarding. Alpha's purpose is technology validation — telemetry *is* the product at this stage. Includes:
- Time-to-verdict, time-to-first-highlight (perf)
- Span-mapping success/failure rate per page
- Schema validation failures (model name, error class, page-text length bucket — *no* URL, *no* content)
- LLM analysis cost (input/output tokens — used to model Beta unit economics)
- User actions: "show all" toggles on tangents, pacer enabled/disabled, definition requests count
- Reading speed (WPM) before and during pacer use
- Crash and error events

Sent to a self-hosted PostHog or similar instance. URLs and page content are **never** sent. See `08-alpha-validation.md` for the full schema and how this drives the alpha → beta gate.

**Beta**: opt-in, **off by default**. Same schema as Alpha minus the explicit consent flow (since users are now self-onboarding from the Web Store). Default-off means we lose visibility on most users, which is the right tradeoff once tech is validated.

## Web Store / Edge Add-ons review

Deepread falls into the higher-scrutiny "modifies page content" category. Plan for review:

- **Permissions**: minimal. `activeTab` + `storage` + `sidePanel` + `scripting`. No `<all_urls>` host permission at alpha or beta; require user activation per page or per allow-listed domain.
- **Privacy disclosure**: complete and accurate from day one. Reviewers check this. Even alpha (unlisted) needs a basic disclosure for the install consent screen.
- **Demo video**: short screencast for the Beta listing showing legitimate use.
- **Support email**: working from day one; first review failures often come down to "can we contact a human?"

Budget: 1–2 review cycles for first Beta submission. Subsequent updates are usually fast.

**Alpha doesn't go through Chrome Web Store review** — it ships as a direct CRX install or unlisted Web Store entry, which has lighter review. This is one of the reasons the alpha phase is fast: no Web Store gating.
