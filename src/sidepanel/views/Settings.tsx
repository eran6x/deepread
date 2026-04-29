import { OLLAMA_DEFAULTS, PROVIDERS, PROVIDER_LABELS, type Provider } from "@/shared/constants"
import type {
  ApiKeyStatus,
  AppSettings,
  HighlightPalette,
  HighlightStyle,
  ProviderTestResult,
} from "@/shared/types"
import { useEffect, useState } from "react"
import { send } from "../messaging"

export function Settings() {
  const [settings, setSettings] = useState<AppSettings | null>(null)

  useEffect(() => {
    void refresh()
  }, [])

  async function refresh() {
    const next = await send<AppSettings>({ kind: "settings.get" })
    setSettings(next)
  }

  async function setProvider(provider: Provider) {
    const next = await send<AppSettings>({ kind: "settings.update", patch: { provider } })
    setSettings(next)
  }

  if (!settings) return <div className="p-4 text-sm text-neutral-500">Loading…</div>

  return (
    <div className="space-y-6 p-4">
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          Provider
        </h2>
        <div className="flex gap-2">
          {PROVIDERS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setProvider(p)}
              className={
                settings.provider === p
                  ? "rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white dark:bg-white dark:text-neutral-900"
                  : "rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
              }
            >
              {PROVIDER_LABELS[p]}
            </button>
          ))}
        </div>
      </section>

      {settings.provider === "anthropic" && <AnthropicSection />}
      {settings.provider === "ollama" && (
        <OllamaSection settings={settings} onChange={setSettings} />
      )}
      {settings.provider === "deepseek" && (
        <DeepSeekSection settings={settings} onChange={setSettings} />
      )}

      <ReaderSection settings={settings} onChange={setSettings} />
      <ReadingSpeedSection settings={settings} onChange={setSettings} />

      <section className="text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
        <p>
          Deepread sends the extracted text of the page you analyze to the selected provider. It
          does not send anything else, and it does not run on a page until you click "Analyze this
          page".
        </p>
      </section>
    </div>
  )
}

function ReadingSpeedSection({
  settings,
  onChange,
}: {
  settings: AppSettings
  onChange: (s: AppSettings) => void
}) {
  const [wpm, setWpm] = useState(settings.wpm)

  async function commit() {
    if (wpm === settings.wpm) return
    const next = await send<AppSettings>({ kind: "settings.update", patch: { wpm } })
    onChange(next)
  }

  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        Reading speed
      </h2>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={120}
          max={800}
          step={10}
          value={wpm}
          onChange={(e) => setWpm(Number(e.target.value))}
          onMouseUp={commit}
          onTouchEnd={commit}
          onKeyUp={commit}
          className="flex-1"
        />
        <span className="w-20 text-right tabular-nums text-sm">{wpm} WPM</span>
      </div>
      <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
        Default WPM for the pacer. Adjustable live in the reader with arrow keys.
      </p>
    </section>
  )
}

function ReaderSection({
  settings,
  onChange,
}: {
  settings: AppSettings
  onChange: (s: AppSettings) => void
}) {
  const [dimOpacity, setDimOpacity] = useState(settings.reader.dimOpacity)

  async function patchReader(patch: Partial<AppSettings["reader"]>) {
    const next = await send<AppSettings>({
      kind: "settings.update",
      patch: { reader: { ...settings.reader, ...patch } },
    })
    onChange(next)
  }

  async function setPalette(palette: HighlightPalette) {
    await patchReader({ palette })
  }

  async function toggleCategory(key: keyof AppSettings["reader"]["categories"]) {
    await patchReader({
      categories: { ...settings.reader.categories, [key]: !settings.reader.categories[key] },
    })
  }

  async function commitOpacity() {
    if (dimOpacity === settings.reader.dimOpacity) return
    await patchReader({ dimOpacity })
  }

  const palettes: HighlightPalette[] = ["default", "high-contrast", "mono"]

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        Reader display
      </h2>

      <div className="space-y-4">
        <div>
          <span className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">
            Highlight style
          </span>
          <div className="flex gap-1.5">
            {(["underline", "fill"] as HighlightStyle[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => patchReader({ highlightStyle: s })}
                className={
                  settings.reader.highlightStyle === s
                    ? "rounded-md bg-neutral-900 px-2.5 py-1 text-xs font-medium text-white dark:bg-white dark:text-neutral-900"
                    : "rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
                }
              >
                {s}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
            Underline puts a colored bar under highlighted text (always readable). Fill tints the
            background — best in light mode.
          </p>
        </div>

        <div>
          <span className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">
            Highlight palette
          </span>
          <div className="flex gap-1.5">
            {palettes.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPalette(p)}
                className={
                  settings.reader.palette === p
                    ? "rounded-md bg-neutral-900 px-2.5 py-1 text-xs font-medium text-white dark:bg-white dark:text-neutral-900"
                    : "rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
                }
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">
            Highlight categories
          </span>
          <div className="flex flex-wrap gap-1.5">
            {(["entity", "claim", "evidence", "number"] as const).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => toggleCategory(cat)}
                className={
                  settings.reader.categories[cat]
                    ? "rounded-md bg-neutral-900 px-2.5 py-1 text-xs font-medium text-white dark:bg-white dark:text-neutral-900"
                    : "rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-neutral-400 line-through dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-500"
                }
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">
            Out-of-focus opacity ({dimOpacity.toFixed(2)})
          </span>
          <input
            type="range"
            min={0.2}
            max={1}
            step={0.05}
            value={dimOpacity}
            onChange={(e) => setDimOpacity(Number(e.target.value))}
            onMouseUp={commitOpacity}
            onTouchEnd={commitOpacity}
            onKeyUp={commitOpacity}
            className="w-full"
          />
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
            Hide tangent / boilerplate sections
          </span>
          <button
            type="button"
            onClick={() => patchReader({ hideTangents: !settings.reader.hideTangents })}
            className={
              settings.reader.hideTangents
                ? "rounded-md bg-neutral-900 px-2.5 py-1 text-xs font-medium text-white dark:bg-white dark:text-neutral-900"
                : "rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
            }
          >
            {settings.reader.hideTangents ? "Hidden" : "Shown"}
          </button>
        </div>
      </div>
    </section>
  )
}

function AnthropicSection() {
  const [status, setStatus] = useState<ApiKeyStatus | null>(null)
  const [draft, setDraft] = useState("")
  const [busy, setBusy] = useState(false)
  const [test, setTest] = useState<TestState>({ kind: "idle" })

  useEffect(() => {
    void refresh()
  }, [])

  async function refresh() {
    const next = await send<ApiKeyStatus>({ kind: "secrets.status", provider: "anthropic" })
    setStatus(next)
  }

  async function save() {
    if (!draft.startsWith("sk-ant-")) {
      setTest({ kind: "error", message: "Key should start with sk-ant-" })
      return
    }
    setBusy(true)
    setTest({ kind: "idle" })
    await send({ kind: "secrets.set", provider: "anthropic", key: draft })
    const result = await send<ProviderTestResult>({
      kind: "provider.test",
      provider: "anthropic",
    })
    setTest(toTestState(result))
    setBusy(false)
    setDraft("")
    await refresh()
  }

  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        Anthropic API key
      </h2>
      {status?.present ? (
        <p className="mb-3 text-sm">
          Stored:{" "}
          <code className="rounded bg-neutral-100 px-1 py-0.5 text-xs dark:bg-neutral-800">
            {status.masked}
          </code>
        </p>
      ) : (
        <p className="mb-3 text-sm text-neutral-600 dark:text-neutral-400">
          Paste your Anthropic API key. It is stored locally and never logged.
        </p>
      )}
      <div className="flex gap-2">
        <input
          type="password"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="sk-ant-..."
          autoComplete="off"
          spellCheck={false}
          className={inputClass}
        />
        <button
          type="button"
          onClick={save}
          disabled={busy || draft.length === 0}
          className={primaryButtonClass}
        >
          {busy ? "Testing…" : "Save & test"}
        </button>
      </div>
      <TestFeedback state={test} />
    </section>
  )
}

function OllamaSection(props: {
  settings: AppSettings
  onChange: (s: AppSettings) => void
}) {
  const [endpoint, setEndpoint] = useState(
    props.settings.ollama.endpoint || OLLAMA_DEFAULTS.endpoint,
  )
  const [model, setModel] = useState(props.settings.ollama.model || OLLAMA_DEFAULTS.model)
  const [busy, setBusy] = useState(false)
  const [test, setTest] = useState<TestState>({ kind: "idle" })

  async function saveAndTest() {
    setBusy(true)
    setTest({ kind: "idle" })
    const next = await send<AppSettings>({
      kind: "settings.update",
      patch: { ollama: { endpoint, model } },
    })
    props.onChange(next)
    const granted = await ensureHostPermission(endpoint)
    if (!granted) {
      setTest({
        kind: "error",
        message: "Permission denied. Deepread needs permission to reach the Ollama endpoint.",
      })
      setBusy(false)
      return
    }
    const result = await send<ProviderTestResult>({ kind: "provider.test", provider: "ollama" })
    setTest(toTestState(result))
    setBusy(false)
  }

  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        Ollama (local)
      </h2>
      <p className="mb-3 text-xs text-neutral-600 dark:text-neutral-400">
        Run a model locally with Ollama. The model must support tool calling (Llama 3.1+, Qwen 2.5+,
        Mistral with tools).
      </p>
      <div className="space-y-2">
        <Field label="Endpoint">
          <input
            type="text"
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
            placeholder="http://localhost:11434"
            spellCheck={false}
            className={inputClass}
          />
        </Field>
        <Field label="Model">
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="llama3.1"
            spellCheck={false}
            className={inputClass}
          />
        </Field>
      </div>
      <div className="mt-3">
        <button
          type="button"
          onClick={saveAndTest}
          disabled={busy || !endpoint || !model}
          className={primaryButtonClass}
        >
          {busy ? "Testing…" : "Save & test"}
        </button>
      </div>
      <TestFeedback state={test} />
    </section>
  )
}

function DeepSeekSection(props: {
  settings: AppSettings
  onChange: (s: AppSettings) => void
}) {
  const [status, setStatus] = useState<ApiKeyStatus | null>(null)
  const [draft, setDraft] = useState("")
  const [model, setModel] = useState(props.settings.deepseek.model || "deepseek-chat")
  const [busy, setBusy] = useState(false)
  const [test, setTest] = useState<TestState>({ kind: "idle" })

  useEffect(() => {
    void refresh()
  }, [])

  async function refresh() {
    const next = await send<ApiKeyStatus>({ kind: "secrets.status", provider: "deepseek" })
    setStatus(next)
  }

  async function save() {
    setBusy(true)
    setTest({ kind: "idle" })
    if (draft.length > 0) {
      await send({ kind: "secrets.set", provider: "deepseek", key: draft })
    }
    const next = await send<AppSettings>({
      kind: "settings.update",
      patch: { deepseek: { model } },
    })
    props.onChange(next)
    const granted = await ensureHostPermission("https://api.deepseek.com")
    if (!granted) {
      setTest({
        kind: "error",
        message: "Permission denied. Deepread needs permission to reach api.deepseek.com.",
      })
      setBusy(false)
      return
    }
    const result = await send<ProviderTestResult>({ kind: "provider.test", provider: "deepseek" })
    setTest(toTestState(result))
    setBusy(false)
    setDraft("")
    await refresh()
  }

  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        DeepSeek API key
      </h2>
      {status?.present ? (
        <p className="mb-3 text-sm">
          Stored:{" "}
          <code className="rounded bg-neutral-100 px-1 py-0.5 text-xs dark:bg-neutral-800">
            {status.masked}
          </code>
        </p>
      ) : (
        <p className="mb-3 text-sm text-neutral-600 dark:text-neutral-400">
          Paste your DeepSeek API key. It is stored locally.
        </p>
      )}
      <div className="space-y-2">
        <Field label="API key">
          <input
            type="password"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={status?.present ? "(leave empty to keep stored key)" : "sk-..."}
            autoComplete="off"
            spellCheck={false}
            className={inputClass}
          />
        </Field>
        <Field label="Model">
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="deepseek-chat"
            spellCheck={false}
            className={inputClass}
          />
        </Field>
      </div>
      <div className="mt-3">
        <button
          type="button"
          onClick={save}
          disabled={busy || (!draft && !status?.present)}
          className={primaryButtonClass}
        >
          {busy ? "Testing…" : "Save & test"}
        </button>
      </div>
      <TestFeedback state={test} />
    </section>
  )
}

type TestState = { kind: "idle" } | { kind: "ok" } | { kind: "error"; message: string }

function TestFeedback({ state }: { state: TestState }) {
  if (state.kind === "idle") return null
  if (state.kind === "ok") {
    return <p className="mt-2 text-xs text-green-700 dark:text-green-400">Connected. Schema OK.</p>
  }
  return <p className="mt-2 text-xs text-red-700 dark:text-red-400">{state.message}</p>
}

function toTestState(result: ProviderTestResult): TestState {
  if (result.ok) return { kind: "ok" }
  return { kind: "error", message: humanizeTestFailure(result.reason, result.detail) }
}

function humanizeTestFailure(
  reason: Exclude<ProviderTestResult, { ok: true }>["reason"],
  detail: string | undefined,
): string {
  switch (reason) {
    case "missing_credentials":
      return "Missing API key."
    case "missing_config":
      return detail ?? "Missing configuration."
    case "auth":
      return "Authentication failed. Check your API key."
    case "endpoint_unreachable":
      return "Cannot reach endpoint. Is the service running and reachable from your browser?"
    case "model_missing":
      return "Model not found. Check the model name."
    case "no_tool_use":
      return "This model returned text instead of a tool call. Pick a model that supports function/tool calling."
    case "rate_limit":
      return "Rate limited. Try again in a moment."
    case "network":
      return detail ?? "Network error."
    case "schema":
      return "Response did not match the expected analysis shape. The model may not be capable enough."
    case "permission_denied":
      return "Browser permission denied for this endpoint."
    default:
      return detail ?? "Test failed."
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: input is passed as children; label wraps it
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">
        {label}
      </span>
      {children}
    </label>
  )
}

async function ensureHostPermission(endpoint: string): Promise<boolean> {
  try {
    const url = new URL(endpoint)
    const origin = `${url.protocol}//${url.host}/*`
    const already = await chrome.permissions.contains({ origins: [origin] })
    if (already) return true
    return await chrome.permissions.request({ origins: [origin] })
  } catch (err) {
    console.error("[Deepread] permission request failed", err)
    return false
  }
}

const inputClass =
  "w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900"

const primaryButtonClass =
  "rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
