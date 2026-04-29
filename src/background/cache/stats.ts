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

class StatsDB extends Dexie {
  wpm!: EntityTable<WpmSampleRow, "id">
  sessions!: EntityTable<SessionRow, "contentHash">

  constructor() {
    super("DeepreadStats")
    this.version(1).stores({
      wpm: "++id, ts, contentHash",
      sessions: "&contentHash, ts",
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

export interface StatsSummary {
  totalSamples: number
  totalArticles: number
  completedArticles: number
  averageWpm: number
  medianWpm: number
  bestWpm: number
  last7DaysWpm: Array<{ date: string; avgWpm: number; samples: number }>
  totalRegressions: number
}

export async function getStatsSummary(): Promise<StatsSummary> {
  const samples = await db.wpm.toArray()
  const sessions = await db.sessions.toArray()

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

  return {
    totalSamples: samples.length,
    totalArticles: sessions.length,
    completedArticles,
    averageWpm: average,
    medianWpm: median,
    bestWpm: best,
    last7DaysWpm: days,
    totalRegressions,
  }
}
