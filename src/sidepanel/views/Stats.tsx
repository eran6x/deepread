import type { RecentArticle } from "@/background/cache/analysis"
import type { StatsSummary, TokenUsageSummary } from "@/background/cache/stats"
import { PROVIDER_LABELS } from "@/shared/constants"
import { useEffect, useState } from "react"
import { send } from "../messaging"

const HISTORY_LIMIT = 10

export function Stats() {
  const [summary, setSummary] = useState<StatsSummary | null>(null)
  const [history, setHistory] = useState<RecentArticle[] | null>(null)

  useEffect(() => {
    let cancelled = false
    async function refresh() {
      const [nextSummary, nextHistory] = await Promise.all([
        send<StatsSummary>({ kind: "stats.summary" }),
        send<RecentArticle[]>({ kind: "articles.recent", limit: HISTORY_LIMIT }),
      ])
      if (cancelled) return
      setSummary(nextSummary)
      setHistory(nextHistory)
    }
    void refresh()
    const id = window.setInterval(refresh, 5000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [])

  if (!summary || !history) {
    return <div className="p-4 text-sm text-neutral-500">Loading…</div>
  }

  const hasReadingData = summary.totalSamples > 0

  return (
    <div className="space-y-5 p-4">
      <HistorySection items={history} />

      <TokenUsageSection tokens={summary.tokens} />

      {hasReadingData ? (
        <>
          <section className="grid grid-cols-3 gap-2">
            <Stat label="Avg WPM" value={summary.averageWpm} />
            <Stat label="Median" value={summary.medianWpm} />
            <Stat label="Best" value={summary.bestWpm} />
          </section>

          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              Last 7 days
            </h2>
            <SevenDayChart days={summary.last7DaysWpm} />
          </section>

          <section className="grid grid-cols-3 gap-2 text-xs">
            <Stat label="Articles" value={summary.totalArticles} sub="opened" />
            <Stat label="Completed" value={summary.completedArticles} sub=">90% scrolled" />
            <Stat label="Regressions" value={summary.totalRegressions} sub="back-scrolls" />
          </section>

          <section className="text-[11px] leading-relaxed text-neutral-500 dark:text-neutral-400">
            <p>
              Samples are recorded locally on your device (no cloud). WPM is computed per paragraph
              while it sits in the reader's focus band. Capped at 5,000 samples (FIFO).
            </p>
          </section>
        </>
      ) : (
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          No reading data yet. Open the reader on an article and start scrolling — paragraphs that
          spend time in the focus band become WPM samples.
        </p>
      )}
    </div>
  )
}

function HistorySection({ items }: { items: RecentArticle[] }) {
  return (
    <section>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        Recent analyses
      </h2>
      {items.length === 0 ? (
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Nothing analyzed yet. Run an analysis on the Brief tab.
        </p>
      ) : (
        <ol className="space-y-1.5">
          {items.map((item) => (
            <li
              key={item.contentHash}
              className="rounded-md border border-neutral-200 p-2 dark:border-neutral-800"
            >
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-sm font-medium text-neutral-900 hover:underline dark:text-neutral-100"
                title={item.url}
              >
                {item.title || hostnameOrUrl(item.url)}
              </a>
              <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-neutral-500 dark:text-neutral-400">
                <span className="truncate">{hostnameOrUrl(item.url)}</span>
                <span className="shrink-0 tabular-nums">{formatRelative(item.cachedAt)}</span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

function TokenUsageSection({ tokens }: { tokens: TokenUsageSummary }) {
  const total = tokens.totalInputTokens + tokens.totalOutputTokens
  return (
    <section>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        Tokens used
      </h2>
      {total === 0 ? (
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          No analyses recorded yet. Run an analysis to see token usage.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Input" value={formatNumber(tokens.totalInputTokens)} sub="tokens" />
            <Stat label="Output" value={formatNumber(tokens.totalOutputTokens)} sub="tokens" />
            <Stat
              label="Analyses"
              value={tokens.totalAnalyses}
              sub={tokens.totalAnalyses === 1 ? "run" : "runs"}
            />
          </div>
          {tokens.byProvider.length > 1 ? (
            <ul className="mt-2 space-y-1 text-[11px] text-neutral-600 dark:text-neutral-400">
              {tokens.byProvider.map((p) => (
                <li key={p.provider} className="flex items-center justify-between gap-2">
                  <span>{PROVIDER_LABELS[p.provider]}</span>
                  <span className="tabular-nums">
                    {formatNumber(p.inputTokens + p.outputTokens)} ({p.analyses}{" "}
                    {p.analyses === 1 ? "run" : "runs"})
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </section>
  )
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function hostnameOrUrl(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

function formatRelative(ts: number): string {
  const diffMs = Date.now() - ts
  const min = Math.floor(diffMs / 60_000)
  if (min < 1) return "just now"
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d ago`
  return new Date(ts).toISOString().slice(0, 10)
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string
  value: number | string
  sub?: string
}) {
  return (
    <div className="rounded-md border border-neutral-200 p-2 text-center dark:border-neutral-800">
      <div className="text-[11px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {label}
      </div>
      <div className="text-xl font-semibold tabular-nums">{value}</div>
      {sub ? <div className="text-[10px] text-neutral-400">{sub}</div> : null}
    </div>
  )
}

function SevenDayChart({
  days,
}: { days: Array<{ date: string; avgWpm: number; samples: number }> }) {
  const max = Math.max(1, ...days.map((d) => d.avgWpm))
  return (
    <div className="space-y-1">
      {days.map((d) => (
        <div key={d.date} className="flex items-center gap-2 text-xs">
          <span className="w-12 shrink-0 font-mono text-[10px] text-neutral-400">
            {d.date.slice(5)}
          </span>
          <div className="relative h-4 flex-1 overflow-hidden rounded bg-neutral-100 dark:bg-neutral-800">
            <div
              className="h-full bg-emerald-500 dark:bg-emerald-400"
              style={{ width: `${Math.round((d.avgWpm / max) * 100)}%` }}
            />
          </div>
          <span className="w-14 shrink-0 text-right tabular-nums">
            {d.avgWpm > 0 ? `${d.avgWpm} WPM` : "—"}
          </span>
        </div>
      ))}
    </div>
  )
}
