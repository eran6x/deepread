import type { StatsSummary } from "@/background/cache/stats"
import { useEffect, useState } from "react"
import { send } from "../messaging"

export function Stats() {
  const [summary, setSummary] = useState<StatsSummary | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const next = await send<StatsSummary>({ kind: "stats.summary" })
      if (!cancelled) setSummary(next)
    })()
    const id = window.setInterval(async () => {
      const next = await send<StatsSummary>({ kind: "stats.summary" })
      if (!cancelled) setSummary(next)
    }, 5000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [])

  if (!summary) {
    return <div className="p-4 text-sm text-neutral-500">Loading…</div>
  }

  if (summary.totalSamples === 0) {
    return (
      <div className="p-4 text-sm text-neutral-600 dark:text-neutral-400">
        No reading data yet. Open the reader on an article and start scrolling — paragraphs that
        spend time in the focus band become WPM samples.
      </div>
    )
  }

  return (
    <div className="space-y-5 p-4">
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
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: number; sub?: string }) {
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
