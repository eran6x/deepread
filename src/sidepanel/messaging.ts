import { PORTS } from "@/shared/constants"
import type { PortMessage, RuntimeMessage } from "@/shared/types"

export type AnalysisListener = (msg: PortMessage) => void

export function openAnalysisPort(onMessage: AnalysisListener): {
  start: (tabId: number) => void
  cancel: () => void
  close: () => void
} {
  const port = chrome.runtime.connect({ name: PORTS.analysis })
  port.onMessage.addListener(onMessage)

  return {
    start: (tabId: number) => {
      port.postMessage({ kind: "analyze.start", tabId } satisfies RuntimeMessage)
    },
    cancel: () => {
      port.postMessage({ kind: "analyze.cancel" } satisfies RuntimeMessage)
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
