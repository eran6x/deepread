# Deepread — developer install guide

How to set up Deepread on a fresh machine, build it, load it into Chrome, and verify it works end-to-end.

## Prerequisites

| Tool | Version | Why |
|---|---|---|
| **Node.js** | 22.x LTS (or 20.x LTS minimum) | Vite build, TypeScript, Vitest |
| **pnpm** | 9.15+ | Package manager (locked via `packageManager` in `package.json`) |
| **git** | any recent | Source control |
| **Chrome** or Chromium | 114+ (for `chrome.sidePanel`) | To run the extension |
| **An Anthropic API key** | — | Required to use the extension. Get one at <https://console.anthropic.com>. Optional if you only want to use Ollama or DeepSeek. |

### Installing Node.js

Pick **one** approach. Don't mix them — pick the one that matches how you usually manage runtimes.

**macOS — Homebrew (simplest)**
```sh
brew install node@22 pnpm
```

**macOS / Linux — fnm (per-project version pinning)**
```sh
curl -fsSL https://fnm.vercel.app/install | bash
fnm install 22
fnm use 22
corepack enable
corepack prepare pnpm@9.15.0 --activate
```

**macOS / Linux — nvm**
```sh
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
nvm install 22
nvm use 22
corepack enable
corepack prepare pnpm@9.15.0 --activate
```

**Windows**
- Install Node 22 LTS from <https://nodejs.org/>
- In PowerShell: `corepack enable; corepack prepare pnpm@9.15.0 --activate`

**Verify**
```sh
node --version    # v22.x or v20.x
pnpm --version    # 9.15.x
```

## Clone and install

```sh
git clone <repo-url> deepread
cd deepread
pnpm install
```

`pnpm install` reads `pnpm-lock.yaml` and produces an exactly-reproducible `node_modules/`. Should finish in under 30 seconds on a clean machine.

## Verify the toolchain

Run all four checks. Every one should pass before you touch code.

```sh
pnpm typecheck    # strict TS check, no emit
pnpm lint         # Biome — formatting + linting
pnpm test         # Vitest unit tests (50+)
pnpm build        # production bundle into dist/
```

If any fail on a clean clone, that's a bug — open an issue.

## Build and load into Chrome

### Production build (recommended for first-time setup)

```sh
pnpm build
```

Produces `dist/` containing the unpacked extension.

Then in Chrome:

1. Open `chrome://extensions`
2. Toggle **Developer mode** (top-right)
3. Click **Load unpacked**
4. Select the `dist/` directory
5. Pin the **Deepread** icon to the toolbar (puzzle-piece icon → pin)

### Development build with HMR

For active development:

```sh
pnpm dev
```

This starts the Vite dev server with hot-module reloading. Load `dist/` as unpacked the same way as above; CRXjs handles live updates for the side panel and content script when you save files. **The background service worker doesn't HMR** — for changes there, click the reload icon on the Deepread card in `chrome://extensions`.

If HMR breaks (rare, after large refactors), `pnpm build` and reload the extension card.

## First-run check

1. Click the Deepread toolbar icon — the side panel opens.
2. Switch to the **Settings** tab.
3. Pick a provider (default: **Anthropic**) and either:
   - Anthropic: paste your `sk-ant-...` key → click **Save & test**. The button runs a real test call and reports success or a reason code.
   - Ollama: install Ollama locally (<https://ollama.com>), `ollama pull llama3.1`, leave the endpoint as `http://localhost:11434`, model `llama3.1`, click **Save & test**. The model must support tool calling — Llama 3.1+, Qwen 2.5+, Mistral with tools.
   - DeepSeek: paste your DeepSeek API key, leave model as `deepseek-chat`, click **Save & test**.
4. Open a long-form article in the active tab (a Substack post, NYT article, Stratechery, arXiv, etc.).
5. Switch back to the **Brief** tab in the side panel.
6. Click **Analyze this page**. You should see verdict → brief → topics stream in within ~5–8 seconds.
7. Click **Open reader** (top-right action bar). The page is replaced by a clean reader-mode overlay with color-coded highlights, sticky section one-liners, and a focus band that brightens as you scroll.

## Project layout

```
deepread/
├── src/
│   ├── manifest.json              # MV3 manifest
│   ├── background/                # Service worker
│   │   ├── index.ts               # Message router + analysis pipeline
│   │   ├── llm/
│   │   │   ├── client.ts          # LLMClient interface + TEST_ARTICLE
│   │   │   ├── direct.ts          # DirectAnthropicClient (Anthropic SDK)
│   │   │   ├── openai-compat.ts   # OpenAICompatibleClient (Ollama, DeepSeek)
│   │   │   ├── factory.ts         # createLLMClient(provider, settings, secrets)
│   │   │   └── prompts.ts         # System prompts + tool schemas
│   │   ├── cache/
│   │   │   └── analysis.ts        # Dexie tables (analyses, definitions, feedback)
│   │   └── settings.ts            # chrome.storage.local wrappers
│   ├── content/                   # Content script (per-tab)
│   │   ├── index.ts               # Extract + reader-mode dispatcher
│   │   └── reader/
│   │       ├── index.ts           # Top-level reader controller
│   │       ├── mount.ts           # Shadow DOM frame
│   │       ├── styles.ts          # Scoped CSS (string)
│   │       ├── text-index.ts      # Char-range → DOM Range mapping
│   │       ├── highlights.ts      # Highlight overlay layer
│   │       └── paragraphs.ts      # Active-paragraph band + section pins
│   ├── sidepanel/                 # React app for the side panel
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   ├── messaging.ts
│   │   ├── format.ts              # Markdown formatter for Copy/Save
│   │   └── views/
│   │       ├── Brief.tsx          # Verdict + brief + actions + feedback
│   │       └── Settings.tsx       # Multi-provider config
│   ├── popup/                     # Minimal popup placeholder
│   ├── shared/                    # Imported by all surfaces
│   │   ├── types.ts               # Message types, AppSettings
│   │   ├── schema.ts              # Zod schemas (AnalysisResult, etc.)
│   │   ├── coerce.ts              # Defensive LLM-output coercion
│   │   ├── feedback.ts            # FeedbackEntry + buildMetrics
│   │   └── constants.ts           # Models, defaults, providers
│   └── styles/                    # Tailwind v4 entry point
├── tests/unit/                    # Vitest tests
├── docs/                          # Design documents
├── package.json
├── tsconfig.json
├── vite.config.ts
├── biome.json
├── vitest.config.ts
└── dist/                          # Build output (git-ignored)
```

## Common issues and fixes

### `pnpm install` fails with `ERR_INVALID_THIS` or similar

You're on Node < 18. Upgrade to Node 20+ or 22+.

### `pnpm: command not found` after installing Node

Run `corepack enable` to make pnpm available, then `corepack prepare pnpm@9.15.0 --activate`.

### TypeScript errors immediately on a clean clone

Most likely the lockfile is out of sync with your platform's binary deps (Vite/Tailwind have native bindings). Try:

```sh
rm -rf node_modules
pnpm install --frozen-lockfile=false
```

If that works, commit the updated `pnpm-lock.yaml`.

### "Side panel" doesn't appear when clicking the icon

Your Chrome is older than 114. `chrome.sidePanel` was added in Chrome 114. Update Chrome.

### Content script not injecting on Twitter / Reddit / Gmail / etc.

Expected. Deepread refuses to extract on non-article pages (`isProbablyReaderable` returns false), and a sensitive-domain block-list is planned for M3. Open a long-form article instead.

### Ollama "Cannot reach endpoint"

- Confirm Ollama is running: `curl http://localhost:11434/api/tags` should return JSON.
- If using a non-default port, update the **Endpoint** field in Settings to match.
- If running Ollama on a different machine, set `OLLAMA_HOST=0.0.0.0` on that machine and use its LAN IP in the Endpoint field — and grant the host permission when prompted.

### Ollama model returns text instead of tool call

The model doesn't support function calling. Try `llama3.1`, `qwen2.5`, or `mistral-nemo` — these support tools natively. Avoid `llama2`, `gemma:7b`, and other older models.

### "schema validation failed" after analysis

The model produced JSON that doesn't match the analysis schema. The coercion step filters most violations, but some models still fail completely. Try a different model, or open the DevTools console for the side panel (`chrome://extensions` → **service worker**) to see the raw error.

### Highlights look misaligned

Open the **service worker** DevTools console (from `chrome://extensions`) and look for `[Deepread] reader mounted: X/Y spans mapped (Z%)`. If Z% is below 90, the article has unusual structure and the substring fallback isn't catching all spans. Open an issue with the article URL so we can improve the diff aligner.

## Scripts reference

| Command | What it does |
|---|---|
| `pnpm dev` | Vite dev server with HMR; outputs to `dist/` |
| `pnpm build` | Production bundle to `dist/` (typecheck + Vite build) |
| `pnpm preview` | Serve the production bundle locally |
| `pnpm typecheck` | TypeScript strict check, no emit |
| `pnpm lint` | Biome lint + format check |
| `pnpm format` | Biome format-write |
| `pnpm test` | Vitest, single run |
| `pnpm test:watch` | Vitest in watch mode |

## Updating dependencies

```sh
pnpm update --latest          # interactive review
pnpm install                  # reinstall + relock
pnpm typecheck && pnpm test   # confirm nothing broke
```

If updating Vite, CRXjs, or Tailwind, expect breakage and read their migration notes first.

## Where to look when something breaks

| Symptom | Where to look first |
|---|---|
| Side panel doesn't load | `chrome://extensions` → Deepread card → **service worker** link → console for errors |
| Analysis silently fails | Same service-worker console; look for `[Deepread]` logs and Anthropic SDK errors |
| Reader-mode rendering issue | DevTools on the host page → inspect `<deepread-reader>` element → look in its shadow DOM |
| Highlights misaligned | Service worker console for the `spans mapped (X%)` line |
| Settings not persisting | `chrome://extensions` → **storage** inspector — check `chrome.storage.local` keys |

## Architecture overview (quick map for new contributors)

```
[User clicks "Analyze this page"]
        │
        ▼
[Side panel: React] ──────────────────────────┐
        │ chrome.runtime.connect (port)        │
        ▼                                      │ chrome.runtime.sendMessage
[Background service worker]                    │
   1. asks content script to extract           │
   2. hashes text, checks IndexedDB cache      │
   3. routes to provider (Anthropic / Ollama / │
      DeepSeek) via factory                    │
   4. streams partial AnalysisResult back ─────┘
        │
        ▼
[Side panel renders verdict → brief → topics]

[User clicks "Open reader"]
        │
        ▼
[Side panel sends reader.open to content script]
[Content script] mounts Shadow DOM overlay,
  resolves spans → DOM Ranges, paints
  highlight overlay, attaches focus band
```

For deeper reading, see [docs/02-architecture.md](docs/02-architecture.md), [docs/04-llm.md](docs/04-llm.md), and [docs/05-reader-mode.md](docs/05-reader-mode.md).

## Releasing

Not yet relevant — alpha distribution is unlisted Web Store or direct CRX install. When we get to public Beta:

1. Bump version in `src/manifest.json` and `package.json`
2. `pnpm build`
3. Zip the `dist/` directory: `cd dist && zip -r ../deepread-vX.Y.Z.zip . && cd ..`
4. Upload to Chrome Web Store dashboard
