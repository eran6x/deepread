import { FEEDBACK_MAX_ENTRIES, type FeedbackEntry } from "@/shared/feedback"
import type { AnalysisResult, DefinitionResult } from "@/shared/schema"
import Dexie, { type EntityTable } from "dexie"

interface CachedAnalysis {
  contentHash: string
  result: AnalysisResult
  cachedAt: number
}

interface CachedDefinition {
  word: string
  result: DefinitionResult
  cachedAt: number
}

class DeepreadDB extends Dexie {
  analyses!: EntityTable<CachedAnalysis, "contentHash">
  definitions!: EntityTable<CachedDefinition, "word">
  feedback!: EntityTable<FeedbackEntry, "contentHash">

  constructor() {
    super("Deepread")
    this.version(1).stores({
      analyses: "&contentHash, cachedAt",
      definitions: "&word, cachedAt",
    })
    this.version(2).stores({
      analyses: "&contentHash, cachedAt",
      definitions: "&word, cachedAt",
      feedback: "&contentHash, ts, rating, provider",
    })
  }
}

const db = new DeepreadDB()

export async function appendFeedback(entry: FeedbackEntry): Promise<void> {
  await db.feedback.put(entry)
  await pruneFeedback(FEEDBACK_MAX_ENTRIES)
}

async function pruneFeedback(max: number): Promise<void> {
  const count = await db.feedback.count()
  if (count <= max) return
  const toRemove = count - max
  const oldest = await db.feedback.orderBy("ts").limit(toRemove).primaryKeys()
  if (oldest.length > 0) await db.feedback.bulkDelete(oldest)
}

export async function getFeedback(contentHash: string): Promise<FeedbackEntry | null> {
  return (await db.feedback.get(contentHash)) ?? null
}

export async function listFeedback(): Promise<FeedbackEntry[]> {
  return db.feedback.orderBy("ts").reverse().toArray()
}

export async function getCachedAnalysis(
  contentHash: string,
  ttlMs: number,
): Promise<AnalysisResult | null> {
  const row = await db.analyses.get(contentHash)
  if (!row) return null
  if (Date.now() - row.cachedAt > ttlMs) {
    await db.analyses.delete(contentHash)
    return null
  }
  return row.result
}

export async function setCachedAnalysis(
  contentHash: string,
  result: AnalysisResult,
): Promise<void> {
  await db.analyses.put({ contentHash, result, cachedAt: Date.now() })
}

export async function getCachedDefinition(
  word: string,
  ttlMs: number,
): Promise<DefinitionResult | null> {
  const row = await db.definitions.get(word)
  if (!row) return null
  if (Date.now() - row.cachedAt > ttlMs) {
    await db.definitions.delete(word)
    return null
  }
  return row.result
}

export async function setCachedDefinition(word: string, result: DefinitionResult): Promise<void> {
  await db.definitions.put({ word, result, cachedAt: Date.now() })
}

export async function hashText(text: string): Promise<string> {
  const encoded = new TextEncoder().encode(text)
  const buf = await crypto.subtle.digest("SHA-256", encoded)
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}
