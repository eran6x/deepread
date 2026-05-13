import { PROVIDER_LABELS } from "@/shared/constants"
import { type FeedbackEntry, buildMetrics } from "@/shared/feedback"
import type { AnalysisResult } from "@/shared/schema"
import { type Source, detectSource, originPatternFor } from "@/shared/source"
import type { AnalysisPhase, AppSettings, PartialAnalysisResult } from "@/shared/types"
import { useEffect, useMemo, useRef, useState } from "react"
import { type ArticleMeta, downloadMarkdown, formatAsMarkdown, slug } from "../format"
import { getActiveTab, openAnalysisPort, send } from "../messaging"
import {
  type AnalysisMeta,
  NO_PAYWALL,
  NO_TRUNCATION,
  type PaywallNotice,
  type TruncationNotice,
  useSidepanelStore,
} from "../store"
import { AskSection } from "./AskSection"

export function Brief() {
  const state = useSidepanelStore((s) => s.state)
  const setState = useSidepanelStore((s) => s.setState)
  const resetIfRunning = useSidepanelStore((s) => s.resetIfRunning)
  const clear = useSidepanelStore((s) => s.clear)
  const portRef = useRef<ReturnType<typeof openAnalysisPort> | null>(null)

  useEffect(() => {
    return () => {
      portRef.current?.close()
      resetIfRunning()
    }
  }, [resetIfRunning])

  useEffect(() => {
    const listener = (
      msg: { kind?: string; url?: string },
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response: unknown) => void,
    ) => {
      if (msg?.kind !== "extract.pdf.request" || typeof msg.url !== "string") return false
      void (async () => {
        try {
          const { extractPdf } = await import("../sources/pdf")
          const article = await extractPdf(msg.url as string)
          sendResponse({ ok: true, article })
        } catch (err) {
          sendResponse({ ok: false, reason: err instanceof Error ? err.message : String(err) })
        }
      })()
      return true
    }
    chrome.runtime.onMessage.addListener(listener)
    return () => chrome.runtime.onMessage.removeListener(listener)
  }, [])

  async function startAnalysis() {
    const tab = await getActiveTab()
    if (!tab?.id || !tab.url) {
      setState({ kind: "error", reason: "No active tab" })
      return
    }
    const source = detectSource(tab.url, tab.id)

    if (source.kind !== "html") {
      const pattern = originPatternFor(source)
      if (pattern) {
        let granted = false
        try {
          granted = await chrome.permissions.request({ origins: [pattern] })
        } catch (err) {
          setState({
            kind: "error",
            reason: `permission_denied: ${err instanceof Error ? err.message : String(err)}`,
          })
          return
        }
        if (!granted) {
          setState({ kind: "error", reason: "permission_denied" })
          return
        }
      }
    }

    const article: ArticleMeta = {
      title: tab.title ?? "Untitled",
      url: tab.url,
    }

    setState({
      kind: "running",
      phase: "extracting",
      partial: {},
      article,
      source,
      paywall: NO_PAYWALL,
      truncation: NO_TRUNCATION,
    })

    const port = openAnalysisPort((msg) => {
      if (msg.kind === "analysis.status") {
        setState((prev) => (prev.kind === "running" ? { ...prev, phase: msg.phase } : prev))
      } else if (msg.kind === "analysis.partial") {
        setState((prev) => (prev.kind === "running" ? { ...prev, partial: msg.result } : prev))
      } else if (msg.kind === "analysis.paywall") {
        setState((prev) =>
          prev.kind === "running"
            ? {
                ...prev,
                paywall: { suspected: msg.suspected, reason: msg.reason, dismissed: false },
              }
            : prev,
        )
      } else if (msg.kind === "analysis.truncated") {
        setState((prev) =>
          prev.kind === "running"
            ? {
                ...prev,
                truncation: {
                  truncated: true,
                  originalLength: msg.originalLength,
                  truncatedLength: msg.truncatedLength,
                  dismissed: false,
                },
              }
            : prev,
        )
      } else if (msg.kind === "analysis.complete") {
        const meta: AnalysisMeta = {
          contentHash: msg.contentHash,
          wordCount: msg.wordCount,
          provider: msg.provider,
          model: msg.model,
          latencyMs: msg.latencyMs,
          inputTokens: msg.inputTokens,
          outputTokens: msg.outputTokens,
          tabId: tab.id ?? -1,
        }
        setState((prev) =>
          prev.kind === "running"
            ? {
                kind: "done",
                result: msg.result,
                article: prev.article,
                meta,
                source: prev.source,
                paywall: prev.paywall,
                truncation: prev.truncation,
              }
            : {
                kind: "done",
                result: msg.result,
                article,
                meta,
                source,
                paywall: NO_PAYWALL,
                truncation: NO_TRUNCATION,
              },
        )
      } else if (msg.kind === "analysis.error") {
        setState({ kind: "error", reason: msg.reason })
      }
    })
    portRef.current = port
    port.start(source)
  }

  if (state.kind === "idle") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Open an article and click below to get a 5-second triage verdict.
        </p>
        <button
          type="button"
          onClick={startAnalysis}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          Analyze this page
        </button>
      </div>
    )
  }

  if (state.kind === "error") {
    return (
      <div className="p-4">
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-900 dark:bg-red-950 dark:text-red-200">
          {humanizeError(state.reason)}
        </p>
        <button
          type="button"
          onClick={() => setState({ kind: "idle" })}
          className="mt-3 text-sm text-neutral-600 underline hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200"
        >
          Try again
        </button>
      </div>
    )
  }

  const partial = state.kind === "running" ? state.partial : state.result
  const phase = state.kind === "running" ? state.phase : "done"

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <PhaseLine phase={phase} />
        {state.kind === "done" ? (
          <ActionBar
            result={state.result}
            article={state.article}
            meta={state.meta}
            source={state.source}
            onClear={clear}
          />
        ) : null}
      </div>
      {state.kind === "done" ? <MetaLine meta={state.meta} /> : null}
      {(state.kind === "running" || state.kind === "done") &&
      state.paywall.suspected &&
      !state.paywall.dismissed ? (
        <PaywallBanner
          paywall={state.paywall}
          onDismiss={() =>
            setState((prev) =>
              prev.kind === "running" || prev.kind === "done"
                ? { ...prev, paywall: { ...prev.paywall, dismissed: true } }
                : prev,
            )
          }
        />
      ) : null}
      {(state.kind === "running" || state.kind === "done") &&
      state.truncation.truncated &&
      !state.truncation.dismissed ? (
        <TruncationBanner
          truncation={state.truncation}
          onDismiss={() =>
            setState((prev) =>
              prev.kind === "running" || prev.kind === "done"
                ? { ...prev, truncation: { ...prev.truncation, dismissed: true } }
                : prev,
            )
          }
        />
      ) : null}
      <VerdictCard partial={partial} />
      <BriefCard partial={partial} />
      <TopicsRow partial={partial} />
      {state.kind === "done" ? (
        <>
          <FeedbackBar result={state.result} article={state.article} meta={state.meta} />
          <AskSection
            key={state.meta.contentHash}
            article={state.article}
            meta={state.meta}
            suggestions={suggestionsFromResult(state.result)}
          />
        </>
      ) : null}
    </div>
  )
}

function MetaLine({ meta }: { meta: AnalysisMeta }) {
  const parts: string[] = [PROVIDER_LABELS[meta.provider], meta.model]
  if (meta.inputTokens != null && meta.outputTokens != null) {
    parts.push(`${formatTokens(meta.inputTokens)}↑ ${formatTokens(meta.outputTokens)}↓`)
  } else if (meta.latencyMs == null) {
    parts.push("cached")
  }
  if (meta.latencyMs != null) parts.push(`${(meta.latencyMs / 1000).toFixed(1)}s`)
  return (
    <p className="text-[11px] text-neutral-500 dark:text-neutral-400" title="Analysis metadata">
      {parts.join(" · ")}
    </p>
  )
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function TruncationBanner({
  truncation,
  onDismiss,
}: {
  truncation: TruncationNotice
  onDismiss: () => void
}) {
  const pct = Math.round((truncation.truncatedLength / truncation.originalLength) * 100)
  return (
    <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
      <div className="flex-1">
        <p className="font-medium">Document truncated</p>
        <p className="mt-0.5 text-xs">
          Analyzed first {pct}% of the document ({formatChars(truncation.truncatedLength)} of{" "}
          {formatChars(truncation.originalLength)} chars). Analysis may miss content past the cap.
        </p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss truncation warning"
        className="-m-1 rounded p-1 text-amber-700 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900"
      >
        ×
      </button>
    </div>
  )
}

function formatChars(n: number): string {
  if (n >= 1000) return `${Math.round(n / 1000)}k`
  return String(n)
}

function PaywallBanner({
  paywall,
  onDismiss,
}: {
  paywall: PaywallNotice
  onDismiss: () => void
}) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
      <div className="flex-1">
        <p className="font-medium">Article may be paywalled</p>
        <p className="mt-0.5 text-xs">
          {paywall.reason ? `Detected: ${paywall.reason}.` : "We couldn't extract the full text."}{" "}
          Analysis is still running, but it may be incomplete.
        </p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss paywall warning"
        className="-m-1 rounded p-1 text-amber-700 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900"
      >
        ×
      </button>
    </div>
  )
}

function suggestionsFromResult(result: AnalysisResult): string[] {
  const topic = result.topics[0]
  return [
    "What is the main argument of this article?",
    topic
      ? `What evidence supports the claim about ${topic}?`
      : "What evidence does the author provide?",
    "What does the author conclude?",
  ]
}

function ActionBar({
  result,
  article,
  meta,
  source,
  onClear,
}: {
  result: AnalysisResult
  article: ArticleMeta
  meta: AnalysisMeta
  source: Source
  onClear: () => void
}) {
  const [copied, setCopied] = useState(false)
  const [readerErr, setReaderErr] = useState<string | null>(null)
  const markdown = useMemo(() => formatAsMarkdown(result, article), [result, article])

  async function copy() {
    try {
      await navigator.clipboard.writeText(markdown)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch (err) {
      console.error("[Deepread] clipboard write failed", err)
    }
  }

  function save() {
    const filename = `deepread-${slug(article.title)}.md`
    downloadMarkdown(markdown, filename)
  }

  async function openInReader() {
    setReaderErr(null)
    try {
      const settings = await send<AppSettings>({ kind: "settings.get" })
      const response = await chrome.tabs.sendMessage(meta.tabId, {
        kind: "reader.open",
        result,
        settings,
      } as const)
      if (response?.kind === "reader.error") setReaderErr(response.reason)
    } catch (err) {
      setReaderErr(
        err instanceof Error
          ? `${err.message}. Try reloading the page and re-analyzing.`
          : String(err),
      )
    }
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <div className="flex gap-1.5">
        {source.kind === "html" ? (
          <ActionButton onClick={openInReader}>Open reader</ActionButton>
        ) : null}
        <ActionButton onClick={copy}>{copied ? "Copied" : "Copy"}</ActionButton>
        <ActionButton onClick={save}>Save .md</ActionButton>
        <ActionButton onClick={onClear}>New</ActionButton>
      </div>
      {readerErr ? (
        <p className="max-w-xs text-right text-[11px] text-red-700 dark:text-red-400">
          {readerErr}
        </p>
      ) : null}
    </div>
  )
}

function ActionButton(props: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
    >
      {props.children}
    </button>
  )
}

function FeedbackBar({
  result,
  article,
  meta,
}: {
  result: AnalysisResult
  article: ArticleMeta
  meta: AnalysisMeta
}) {
  const [rating, setRating] = useState<number | null>(null)
  const [savedRating, setSavedRating] = useState<number | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Pre-fill from previously saved feedback for this article
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const existing = await send<FeedbackEntry | null>({
        kind: "feedback.get",
        contentHash: meta.contentHash,
      })
      if (!cancelled && existing) {
        setRating(existing.rating)
        setSavedRating(existing.rating)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [meta.contentHash])

  function onChange(value: number) {
    setRating(value)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      void persist(value)
    }, 350)
  }

  async function persist(value: number) {
    const entry: FeedbackEntry = {
      contentHash: meta.contentHash,
      ts: Date.now(),
      rating: value,
      title: article.title.slice(0, 140),
      url: article.url,
      wordCount: meta.wordCount,
      provider: meta.provider,
      model: meta.model,
      latencyMs: meta.latencyMs,
      metrics: buildMetrics(result),
    }
    await send({ kind: "feedback.append", entry })
    setSavedRating(value)
  }

  const display = rating ?? 5
  const isSaved = savedRating != null && savedRating === rating

  return (
    <div className="rounded-md border border-neutral-200 p-3 dark:border-neutral-800">
      <div className="mb-2 flex items-baseline justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          Rate this analysis
        </p>
        <span className="text-sm font-medium tabular-nums">
          {rating != null ? `${rating}/10` : "—/10"}
        </span>
      </div>
      <input
        type="range"
        min={1}
        max={10}
        step={1}
        value={display}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="Rate this analysis from 1 (worst) to 10 (best)"
        className="deepread-slider w-full"
      />
      <div className="mt-1 flex justify-between text-[10px] uppercase tracking-wide text-neutral-400">
        <span>1 · poor</span>
        <span>10 · great</span>
      </div>
      {isSaved && rating != null ? (
        <p className="mt-2 text-[11px] text-green-700 dark:text-green-400">Saved · {rating}/10</p>
      ) : null}
    </div>
  )
}

function PhaseLine({ phase }: { phase: AnalysisPhase }) {
  const labels: Record<AnalysisPhase, string> = {
    idle: "",
    extracting: "Extracting article…",
    "cache-hit": "Loaded from cache",
    "calling-llm": "Calling LLM…",
    streaming: "Analyzing…",
    done: "Done",
    error: "Error",
  }
  return (
    <p className="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
      {labels[phase]}
    </p>
  )
}

function VerdictCard({ partial }: { partial: PartialAnalysisResult }) {
  const v = partial.verdict
  if (!v?.decision) {
    return (
      <div className="rounded-md border border-dashed border-neutral-300 p-4 text-sm text-neutral-400 dark:border-neutral-700">
        Awaiting verdict…
      </div>
    )
  }
  const tone =
    v.decision === "read"
      ? "bg-green-50 text-green-900 dark:bg-green-950 dark:text-green-200"
      : v.decision === "skim"
        ? "bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
        : "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
  return (
    <div className={`rounded-md p-4 ${tone}`}>
      <div className="flex items-baseline gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide">Verdict</span>
        <span className="text-base font-semibold uppercase">{v.decision}</span>
        {partial.est_read_time_min ? (
          <span className="text-xs">· {partial.est_read_time_min} min</span>
        ) : null}
        {partial.difficulty ? <span className="text-xs">· {partial.difficulty}</span> : null}
      </div>
      {v.reason ? <p className="mt-2 text-sm leading-snug">{v.reason}</p> : null}
    </div>
  )
}

function BriefCard({ partial }: { partial: PartialAnalysisResult }) {
  const bullets = partial.brief ?? []
  if (bullets.length === 0) return null
  return (
    <div className="rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        Brief
      </p>
      <ul className="space-y-2 text-sm">
        {bullets.map((b, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: bullets stream into fixed positional slots
          <li key={`brief-${i}`} className="flex gap-2">
            <span className="text-neutral-400">·</span>
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function TopicsRow({ partial }: { partial: PartialAnalysisResult }) {
  const topics = partial.topics ?? []
  if (topics.length === 0) return null
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        Topics
      </p>
      <div className="flex flex-wrap gap-1.5">
        {topics.map((t, i) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: topics stream into fixed positional slots
            key={`topic-${i}`}
            className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  )
}

function humanizeError(reason: string): string {
  if (reason.includes("no_api_key")) return "No API key set. Add one in Settings to analyze pages."
  if (reason.startsWith("auth")) return "Invalid API key. Check it in Settings."
  if (reason.startsWith("network")) return "Network error. Check your connection and retry."
  if (reason.startsWith("rate_limit")) return "Rate limited. Try again in a minute."
  if (reason.startsWith("endpoint_unreachable"))
    return "Cannot reach the configured endpoint. Check Settings."
  if (reason.startsWith("model_missing"))
    return "Model not found. Check the model name in Settings."
  if (reason.startsWith("no_tool_use"))
    return "This model doesn't support tool calling. Pick another model in Settings."
  if (reason.includes("missing_config"))
    return "Provider configuration is incomplete. See Settings."
  if (reason.includes("not_readerable"))
    return "This page doesn't look like an article. Open a long-form article and try again."
  if (reason.includes("Could not establish connection"))
    return "Can't reach this page. Reload the tab and try again."
  if (reason.includes("permission_denied"))
    return "Permission denied. The extension needs access to this site to read it."
  if (reason.includes("gdoc_not_authorized"))
    return "This Google Doc isn't accessible with your current browser session. Open it in your browser first, or ask the owner to share it."
  if (reason.includes("gdoc_not_found")) return "Google Doc not found."
  if (reason.includes("invalid_url")) return "This doesn't look like a supported document URL."
  return reason
}
