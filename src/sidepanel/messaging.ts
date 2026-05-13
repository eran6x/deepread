import { PORTS } from "@/shared/constants"
import type { Source } from "@/shared/source"
import type { AskPortMessage, PortMessage, RuntimeMessage } from "@/shared/types"

export type AnalysisListener = (msg: PortMessage) => void

export function openAnalysisPort(onMessage: AnalysisListener): {
  start: (source: Source) => void
  cancel: () => void
  close: () => void
} {
  const port = chrome.runtime.connect({ name: PORTS.analysis })
  port.onMessage.addListener(onMessage)

  return {
    start: (source: Source) => {
      port.postMessage({ kind: "analyze.start", source } satisfies RuntimeMessage)
    },
    cancel: () => {
      port.postMessage({ kind: "analyze.cancel" } satisfies RuntimeMessage)
    },
    close: () => port.disconnect(),
  }
}

export function openAskPort(onMessage: (msg: AskPortMessage) => void): {
  start: (args: {
    contentHash: string
    turnId: string
    question: string
    history: Array<{ role: "user" | "assistant"; content: string }>
  }) => void
  cancel: () => void
  close: () => void
} {
  const port = chrome.runtime.connect({ name: PORTS.ask })
  port.onMessage.addListener(onMessage as (msg: unknown) => void)
  return {
    start: (args) => {
      port.postMessage({ kind: "ask.start", ...args } satisfies RuntimeMessage)
    },
    cancel: () => {
      port.postMessage({ kind: "ask.cancel" } satisfies RuntimeMessage)
    },
    close: () => port.disconnect(),
  }
}

export function send<T = unknown>(msg: RuntimeMessage): Promise<T> {
  return chrome.runtime.sendMessage<RuntimeMessage, T>(msg)
}

export async function getActiveTabId(): Promise<number | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  return tab?.id ?? null
}

export async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  return tab ?? null
}
