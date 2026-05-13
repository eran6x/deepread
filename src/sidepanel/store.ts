import type { Provider } from "@/shared/constants"
import type { AnalysisResult } from "@/shared/schema"
import type { Source } from "@/shared/source"
import type { AnalysisPhase, ConversationTurn, PartialAnalysisResult } from "@/shared/types"
import { create } from "zustand"
import type { ArticleMeta } from "./format"

export interface AnalysisMeta {
  contentHash: string
  wordCount: number
  provider: Provider
  model: string
  latencyMs: number | null
  tabId: number
}

export interface PaywallNotice {
  suspected: boolean
  reason: string | null
  dismissed: boolean
}

export const NO_PAYWALL: PaywallNotice = {
  suspected: false,
  reason: null,
  dismissed: false,
}

export interface TruncationNotice {
  truncated: boolean
  originalLength: number
  truncatedLength: number
  dismissed: boolean
}

export const NO_TRUNCATION: TruncationNotice = {
  truncated: false,
  originalLength: 0,
  truncatedLength: 0,
  dismissed: false,
}

export type BriefState =
  | { kind: "idle" }
  | {
      kind: "running"
      phase: AnalysisPhase
      partial: PartialAnalysisResult
      article: ArticleMeta
      source: Source
      paywall: PaywallNotice
      truncation: TruncationNotice
    }
  | {
      kind: "done"
      result: AnalysisResult
      article: ArticleMeta
      meta: AnalysisMeta
      source: Source
      paywall: PaywallNotice
      truncation: TruncationNotice
    }
  | { kind: "error"; reason: string }

interface SidepanelStore {
  state: BriefState
  conversations: Record<string, ConversationTurn[]>
  setState: (next: BriefState | ((prev: BriefState) => BriefState)) => void
  resetIfRunning: () => void
  clear: () => void
  setConversation: (contentHash: string, turns: ConversationTurn[]) => void
}

export const useSidepanelStore = create<SidepanelStore>((set) => ({
  state: { kind: "idle" },
  conversations: {},
  setState: (next) => set((s) => ({ state: typeof next === "function" ? next(s.state) : next })),
  resetIfRunning: () => set((s) => (s.state.kind === "running" ? { state: { kind: "idle" } } : {})),
  clear: () => set({ state: { kind: "idle" }, conversations: {} }),
  setConversation: (contentHash, turns) =>
    set((s) => ({ conversations: { ...s.conversations, [contentHash]: turns } })),
}))
