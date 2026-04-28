import type { Provider } from "@/shared/constants"
import { type FeedbackEntry, buildMetrics } from "@/shared/feedback"
import type { AnalysisResult } from "@/shared/schema"
import type { AnalysisPhase, PartialAnalysisResult } from "@/shared/types"
import { useEffect, useMemo, useRef, useState } from "react"
import { type ArticleMeta, downloadMarkdown, formatAsMarkdown, slug } from "../format"
import { getActiveTab, openAnalysisPort, send } from "../messaging"

interface AnalysisMeta {
  contentHash: string
  wordCount: number
  provider: Provider
  model: string
  latencyMs: number | null
}

type State =
  | { kind: "idle" }
  | {
      kind: "running"
      phase: AnalysisPhase
      partial: PartialAnalysisResult
      article: ArticleMeta
    }
  | {
      kind: "done"
      result: AnalysisResult
      article: ArticleMeta
      meta: AnalysisMeta
    }
  | { kind: "error"; reason: string }

export function Brief() {
  const [state, setState] = useState<State>({ kind: "idle" })
  const portRef = useRef<ReturnType<typeof openAnalysisPort> | null>(null)

  useEffect(() => {
    return () => portRef.current?.close()
  }, [])

  async function startAnalysis() {
    const tab = await getActiveTab()
    if (!tab?.id) {
      setState({ kind: "error", reason: "No active tab" })
      return
    }
    const article: ArticleMeta = {
      title: tab.title ?? "Untitled",
      url: tab.url ?? "",
    }

    setState({ kind: "running", phase: "extracting", partial: {}, article })

    const port = openAnalysisPort((msg) => {
      if (msg.kind === "analysis.status") {
        setState((prev) => (prev.kind === "running" ? { ...prev, phase: msg.phase } : prev))
      } else if (msg.kind === "analysis.partial") {
        setState((prev) => (prev.kind === "running" ? { ...prev, partial: msg.result } : prev))
      } else if (msg.kind === "analysis.complete") {
        const meta: AnalysisMeta = {
          contentHash: msg.contentHash,
          wordCount: msg.wordCount,
          provider: msg.provider,
          model: msg.model,
          latencyMs: msg.latencyMs,
        }
        setState((prev) =>
          prev.kind === "running"
            ? { kind: "done", result: msg.result, article: prev.article, meta }
            : { kind: "done", result: msg.result, article, meta },
        )
      } else if (msg.kind === "analysis.error") {
        setState({ kind: "error", reason: msg.reason })
      }
    })
    portRef.current = port
    port.start(tab.id)
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
        {state.kind === "done" ? <ActionBar result={state.result} article={state.article} /> : null}
      </div>
      <VerdictCard partial={partial} />
      <BriefCard partial={partial} />
      <TopicsRow partial={partial} />
      {state.kind === "done" ? (
        <FeedbackBar result={state.result} article={state.article} meta={state.meta} />
      ) : null}
    </div>
  )
}

function ActionBar({ result, article }: { result: AnalysisResult; article: ArticleMeta }) {
  const [copied, setCopied] = useState(false)
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

  return (
    <div className="flex shrink-0 gap-1.5">
      <ActionButton onClick={copy}>{copied ? "Copied" : "Copy"}</ActionButton>
      <ActionButton onClick={save}>Save .md</ActionButton>
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
  return reason
}
