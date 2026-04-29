import { isSensitiveHost } from "@/shared/domains"
import type { AppSettings } from "@/shared/types"
import { StrictMode, useEffect, useState } from "react"
import { createRoot } from "react-dom/client"
import "@/styles/tailwind.css"

function Popup() {
  const [tabUrl, setTabUrl] = useState<string | null>(null)
  const [host, setHost] = useState<string | null>(null)
  const [settings, setSettings] = useState<AppSettings | null>(null)

  useEffect(() => {
    void (async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      const url = tab?.url ?? ""
      let h: string | null = null
      try {
        h = url ? new URL(url).hostname.toLowerCase() : null
      } catch {
        h = null
      }
      setTabUrl(url)
      setHost(h)
      const s = await chrome.runtime.sendMessage<unknown, AppSettings>({ kind: "settings.get" })
      setSettings(s)
    })()
  }, [])

  if (!settings || !host) {
    return (
      <div className="p-3 text-sm text-neutral-500">
        {host == null ? "Open a regular web page to use Deepread." : "Loading…"}
      </div>
    )
  }

  const isBlocked = settings.privacy.blockedDomains.some((p) => matches(host, p))
  const isAllowed = settings.privacy.allowedDomains.some((p) => matches(host, p))
  const isSensitive = !!tabUrl && isSensitiveHost(tabUrl)
  const effectiveStatus = isAllowed ? "allowed" : isBlocked || isSensitive ? "blocked" : "default"

  async function toggleAllow() {
    const next = settings as AppSettings
    const nextAllowed = isAllowed
      ? next.privacy.allowedDomains.filter((p) => !matches(host as string, p))
      : Array.from(new Set([...next.privacy.allowedDomains, host as string]))
    const updated = await chrome.runtime.sendMessage<unknown, AppSettings>({
      kind: "settings.update",
      patch: { privacy: { ...next.privacy, allowedDomains: nextAllowed } },
    })
    setSettings(updated)
  }

  async function openSidePanel() {
    const tab = await chrome.tabs.query({ active: true, currentWindow: true }).then((t) => t[0])
    if (!tab?.id || !tab.windowId) return
    await chrome.sidePanel.open({ tabId: tab.id, windowId: tab.windowId })
    window.close()
  }

  return (
    <div className="w-72 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold">Deepread</span>
        <span className="rounded bg-neutral-100 px-1 py-0.5 text-[10px] font-medium uppercase text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
          alpha
        </span>
      </div>
      <p className="mb-2 truncate text-xs text-neutral-500" title={host}>
        {host}
      </p>
      <StatusPill status={effectiveStatus} />
      {isSensitive && !isAllowed ? (
        <p className="mt-2 text-[11px] leading-relaxed text-neutral-600 dark:text-neutral-400">
          This domain is on Deepread's sensitive-domain list (banking, email, workspace tools,
          etc.). Adding it to your allow-list will let Deepread analyze pages here.
        </p>
      ) : null}
      <button
        type="button"
        onClick={toggleAllow}
        className="mt-3 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
      >
        {isAllowed ? "Remove from allow-list" : "Always allow on this domain"}
      </button>
      <button
        type="button"
        onClick={openSidePanel}
        className="mt-2 w-full rounded-md bg-neutral-900 px-3 py-2 text-xs font-medium text-white dark:bg-white dark:text-neutral-900"
      >
        Open side panel
      </button>
    </div>
  )
}

function StatusPill({ status }: { status: "allowed" | "blocked" | "default" }) {
  const color =
    status === "allowed"
      ? "bg-green-50 text-green-900 dark:bg-green-950 dark:text-green-200"
      : status === "blocked"
        ? "bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-200"
        : "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
  const label =
    status === "allowed"
      ? "Always allowed here"
      : status === "blocked"
        ? "Blocked by default"
        : "Manual activation only"
  return <div className={`rounded-md px-2 py-1 text-[11px] font-medium ${color}`}>{label}</div>
}

function matches(host: string, pattern: string): boolean {
  if (pattern.startsWith("*.")) {
    const suffix = pattern.slice(2)
    return host === suffix || host.endsWith(`.${suffix}`)
  }
  return host === pattern || host.endsWith(`.${pattern}`)
}

const root = document.getElementById("root")
if (!root) throw new Error("Root element not found")
createRoot(root).render(
  <StrictMode>
    <Popup />
  </StrictMode>,
)
