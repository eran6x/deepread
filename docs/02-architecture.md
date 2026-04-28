# Architecture

## Tech stack

Locked. All choices below are final.

| Layer | Choice | Why |
|---|---|---|
| Language | **TypeScript** (strict mode) | Type safety across content/background/panel boundaries; non-negotiable for an extension of this complexity |
| Build tool | **Vite + @crxjs/vite-plugin** | Best MV3 dev experience; HMR for content scripts; clean separation of entry points |
| Side panel UI | **React 18 + Tailwind** | Familiar, ecosystem, fast for forms/lists |
| Content script UI | **Vanilla TS + lit-html** for overlays | Avoid shipping React into every page; performance and bundle size matter here |
| LLM SDK | **`@anthropic-ai/sdk`** (web fetch transport) | Official, supports streaming and tool use |
| Schema validation | **Zod** | Validate LLM JSON outputs at the boundary |
| DOM extraction | **`@mozilla/readability`** | Battle-tested article extraction |
| Caching | **IndexedDB via Dexie** | Page-analysis cache, definition cache, stats history |
| Tests | **Vitest** (unit), **Playwright** (E2E with extension loaded) | Standard combo for MV3 |
| Package manager | **pnpm** | Fast, strict, monorepo-ready if hosted backend lives in same repo |
| Linter / formatter | **Biome** | Single binary, fast, replaces ESLint + Prettier |

### Hosted backend (Beta — covered in `06-auth-billing-privacy.md`)

| Layer | Choice |
|---|---|
| Runtime | Hono on Cloudflare Workers |
| DB | Cloudflare D1 (SQLite) for users/quotas; KV for session tokens |
| Billing | Stripe (subscriptions, customer portal) |
| Auth | Magic-link via Stytch (or roll-our-own with Resend) |

## MV3 module layout

```
deepread/                          # repo root (working dir is currently `vision/`)
├── manifest.json                  # MV3 manifest
├── src/
│   ├── background/                # Service worker
│   │   ├── index.ts               # Worker entry + message router
│   │   ├── llm/
│   │   │   ├── client.ts          # LLMClient interface
│   │   │   ├── direct.ts          # DirectAnthropicClient (BYO)
│   │   │   ├── hosted.ts          # HostedProxyClient (Beta)
│   │   │   └── prompts.ts         # System prompts + schema
│   │   ├── cache/                 # Dexie wrappers for page-analysis + definitions
│   │   ├── stats/                 # WPM rollups, regression aggregation
│   │   └── settings.ts            # chrome.storage abstraction
│   │
│   ├── content/                   # Content script (per-tab)
│   │   ├── index.ts               # Entry: detects activation, orchestrates
│   │   ├── extract.ts             # Readability invocation + cleanup
│   │   ├── render/
│   │   │   ├── reader.ts          # Reader-mode shadow DOM render
│   │   │   ├── highlights.ts      # Span-to-DOM mapping + highlight layer
│   │   │   ├── focus.ts           # Active-paragraph dimming controller
│   │   │   └── pacer.ts           # Pacer animation
│   │   ├── interact/
│   │   │   ├── click-define.ts    # Word-click → definition popover
│   │   │   ├── scroll-tracker.ts  # WPM + regression signals
│   │   │   └── keyboard.ts        # Keyboard shortcuts
│   │   └── messaging.ts           # Typed message bus to background
│   │
│   ├── sidepanel/                 # React app for the side panel
│   │   ├── App.tsx
│   │   ├── views/
│   │   │   ├── Brief.tsx          # Tier 1 output
│   │   │   ├── Scan.tsx           # Tier 2 controls
│   │   │   ├── Read.tsx           # Tier 3 controls + live stats
│   │   │   └── Settings.tsx
│   │   ├── stores/                # Zustand for panel state
│   │   └── messaging.ts
│   │
│   ├── popup/                     # Minimal: on/off toggle, current-domain status
│   │   └── Popup.tsx
│   │
│   ├── shared/                    # Imported by all surfaces
│   │   ├── types.ts               # AnalysisResult, AppSettings, messages
│   │   ├── schema.ts              # Zod schemas
│   │   ├── domains.ts             # Sensitive-domain block-list
│   │   └── constants.ts
│   │
│   └── styles/                    # Tailwind config + global styles
│
├── public/                        # Icons, static assets
├── tests/
│   ├── unit/
│   └── e2e/                       # Playwright with extension loaded
├── package.json
├── vite.config.ts
├── tsconfig.json
└── biome.json
```

## Data flow

### Page activation → Brief (Tier 1)

```
[Popup or shortcut: "Read this page"]
        │
        ▼
[Content script]
  1. Run Readability on document            ← all local
  2. Compute content hash (SHA-256)
  3. Send {url, hash, text, title} to background
        │
        ▼
[Background worker]
  4. Check IndexedDB cache for hash
     ├── HIT → stream cached AnalysisResult to side panel
     └── MISS → continue
  5. Resolve LLMClient (BYO or hosted)
  6. Stream tool-use call to Claude Sonnet 4.6
  7. As fields arrive, validate with Zod, push to side panel via runtime.connect port
  8. On completion, write AnalysisResult to cache (keyed by hash)
        │
        ▼
[Side panel] renders verdict → brief → topics progressively
```

**Tier 2 / Tier 3** reuse the same `AnalysisResult` already in the panel; no new LLM call.

### Click-to-define

```
[Content script: word click]
  → message {word, sentence_context} to background
  → background calls Claude Haiku (cheap, fast)
  → response cached locally by (word, language) — definitions are stable
  → popover renders in content script
```

## Message bus

Single typed router in `shared/types.ts`. Use `chrome.runtime.connect` (long-lived ports) for streamed analysis; use `chrome.runtime.sendMessage` (one-shot) for definitions, settings, stats.

```ts
// Sketch — see shared/types.ts in implementation
type Message =
  | { kind: "analyze.request"; url: string; hash: string; text: string; title: string }
  | { kind: "analyze.partial"; field: keyof AnalysisResult; value: unknown }
  | { kind: "analyze.complete"; result: AnalysisResult }
  | { kind: "analyze.error"; reason: string }
  | { kind: "define.request"; word: string; context: string }
  | { kind: "define.response"; definition: string; synonyms: string[] }
  | { kind: "settings.update"; patch: Partial<AppSettings> }
  | { kind: "stats.event"; type: "wpm.sample" | "regression" | "section.view"; payload: object }
```

## Storage

| Store | Backend | Purpose |
|---|---|---|
| `settings` | `chrome.storage.local` | User preferences: WPM, colors, allow-list, API key (encrypted-at-rest if we add it) |
| `cache.analysis` | IndexedDB (Dexie table) | `{contentHash → AnalysisResult, ttl}` |
| `cache.definitions` | IndexedDB | `{word|lang → {definition, synonyms, ts}}` |
| `stats` | IndexedDB | Rolling daily aggregates (WPM, articles, regressions) |

**No `chrome.storage.sync`** at v1. Reading stats and API keys should not propagate across devices via Google's sync.

## Permissions (manifest)

Aim for the minimum review-friendly set:

```json
{
  "manifest_version": 3,
  "permissions": ["activeTab", "storage", "sidePanel", "scripting"],
  "host_permissions": [],
  "optional_host_permissions": ["<all_urls>"]
}
```

Use `activeTab` as the default; request `<all_urls>` only if/when we add an "always on for these domains" feature. This makes Web Store review materially easier.

## Build & dev

- `pnpm dev` → Vite dev server with CRXjs; load `dist/` as unpacked extension; HMR for side panel and content script
- `pnpm build` → production bundle, source maps disabled, tree-shaken, ready to zip for Web Store
- `pnpm test` → Vitest
- `pnpm e2e` → Playwright with the built extension loaded

## Cross-browser

MV3 is supported across Chrome, Edge, Brave, Arc, Opera. No code changes expected; verify Edge Add-ons listing separately at v1.0 if we want that distribution channel. Firefox is **not** a v1 target — its MV3 implementation has known gaps around side panels.
