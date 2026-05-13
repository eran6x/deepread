import type { Provider } from "@/shared/constants"
import Dexie, { type EntityTable } from "dexie"

interface WpmSampleRow {
  /** Auto-incremented primary key. */
  id?: number
  contentHash: string
  wpm: number
  wordCount: number
  durationMs: number
  ts: number
}

interface SessionRow {
  contentHash: string
  regressions: number
  completed: boolean
  ts: number
}

export interface TokenSampleRow {
  id?: number
  contentHash: string
  provider: Provider
  model: string
  inputTokens: number
  outputTokens: number
  ts: number
}

class StatsDB extends Dexie {
  wpm!: EntityTable<WpmSampleRow, "id">
  sessions!: EntityTable<SessionRow, "contentHash">
  tokens!: EntityTable<TokenSampleRow, "id">

  constructor() {
    super("DeepreadStats")
    this.version(1).stores({
      wpm: "++id, ts, contentHash",
      sessions: "&contentHash, ts",
    })
    this.version(2).stores({
      wpm: "++id, ts, contentHash",
      sessions: "&contentHash, ts",
      tokens: "++id, ts, contentHash, provider",
    })
  }
}

const db = new StatsDB()
const WPM_KEEP = 5_000

export async function appendWpmSample(s: Omit<WpmSampleRow, "id">): Promise<void> {
  await db.wpm.add(s)
  const count = await db.wpm.count()
  if (count > WPM_KEEP) {
    const oldest = await db.wpm
      .orderBy("ts")
      .limit(count - WPM_KEEP)
      .primaryKeys()
    if (oldest.length > 0) await db.wpm.bulkDelete(oldest)
  }
}

export async function appendSession(s: SessionRow): Promise<void> {
  await db.sessions.put(s)
}

const TOKENS_KEEP = 5_000

export async function appendTokenSample(s: Omit<TokenSampleRow, "id">): Promise<void> {
  await db.tokens.add(s)
  const count = await db.tokens.count()
  if (count > TOKENS_KEEP) {
    const oldest = await db.tokens
      .orderBy("ts")
      .limit(count - TOKENS_KEEP)
      .primaryKeys()
    if (oldest.length > 0) await db.tokens.bulkDelete(oldest)
  }
}

export interface TokenUsageSummary {
  totalInputTokens: number
  totalOutputTokens: number
  totalAnalyses: number
  byProvider: Array<{
    provider: Provider
    inputTokens: number
    outputTokens: number
    analyses: number
  }>
}

export interface StatsSummary {
  totalSamples: number
  totalArticles: number
  completedArticles: number
  averageWpm: number
  medianWpm: number
  bestWpm: number
  last7DaysWpm: Array<{ date: string; avgWpm: number; samples: number }>
  totalRegressions: number
  tokens: TokenUsageSummary
}

export async function getStatsSummary(): Promise<StatsSummary> {
  const samples = await db.wpm.toArray()
  const sessions = await db.sessions.toArray()
  const tokens = await db.tokens.toArray()

  const wpms = samples.map((s) => s.wpm)
  const sorted = [...wpms].sort((a, b) => a - b)
  const median = sorted.length === 0 ? 0 : (sorted[Math.floor(sorted.length / 2)] ?? 0)
  const average = wpms.length === 0 ? 0 : Math.round(wpms.reduce((a, b) => a + b, 0) / wpms.length)
  const best = wpms.length === 0 ? 0 : Math.max(...wpms)

  const now = Date.now()
  const days: Array<{ date: string; avgWpm: number; samples: number }> = []
  for (let i = 6; i >= 0; i--) {
    const dayEnd = now - i * 24 * 60 * 60 * 1000
    const dayStart = dayEnd - 24 * 60 * 60 * 1000
    const dayDate = new Date(dayEnd).toISOString().slice(0, 10)
    const inDay = samples.filter((s) => s.ts >= dayStart && s.ts < dayEnd)
    const avg =
      inDay.length === 0 ? 0 : Math.round(inDay.reduce((a, b) => a + b.wpm, 0) / inDay.length)
    days.push({ date: dayDate, avgWpm: avg, samples: inDay.length })
  }

  const totalRegressions = sessions.reduce((a, s) => a + s.regressions, 0)
  const completedArticles = sessions.filter((s) => s.completed).length

  const byProviderMap = new Map<
    Provider,
    { inputTokens: number; outputTokens: number; analyses: number }
  >()
  for (const t of tokens) {
    const entry = byProviderMap.get(t.provider) ?? {
      inputTokens: 0,
      outputTokens: 0,
      analyses: 0,
    }
    entry.inputTokens += t.inputTokens
    entry.outputTokens += t.outputTokens
    entry.analyses += 1
    byProviderMap.set(t.provider, entry)
  }
  const tokensSummary: TokenUsageSummary = {
    totalInputTokens: tokens.reduce((a, t) => a + t.inputTokens, 0),
    totalOutputTokens: tokens.reduce((a, t) => a + t.outputTokens, 0),
    totalAnalyses: tokens.length,
    byProvider: Array.from(byProviderMap.entries())
      .map(([provider, v]) => ({ provider, ...v }))
      .sort((a, b) => b.inputTokens + b.outputTokens - (a.inputTokens + a.outputTokens)),
  }

  return {
    totalSamples: samples.length,
    totalArticles: sessions.length,
    completedArticles,
    averageWpm: average,
    medianWpm: median,
    bestWpm: best,
    last7DaysWpm: days,
    totalRegressions,
    tokens: tokensSummary,
  }
}
