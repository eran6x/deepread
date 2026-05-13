import type { AppSettings } from "@/shared/types"
import { useEffect, useState } from "react"
import { send } from "./messaging"
import { Brief } from "./views/Brief"
import { Help } from "./views/Help"
import { Onboarding } from "./views/Onboarding"
import { Settings } from "./views/Settings"
import { Stats } from "./views/Stats"

type Tab = "brief" | "stats" | "settings" | "help"

export function App() {
  const [tab, setTab] = useState<Tab>("brief")
  const [settings, setSettings] = useState<AppSettings | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const next = await send<AppSettings>({ kind: "settings.get" })
      if (!cancelled) setSettings(next)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (!settings) return <div className="p-4 text-sm text-neutral-500">Loading…</div>

  if (!settings.privacy.onboardingComplete) {
    return <Onboarding onDone={(next) => setSettings(next)} />
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold tracking-tight">Deepread</span>
          <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
            alpha
          </span>
        </div>
        <nav className="flex items-center gap-1 text-sm">
          <TabButton active={tab === "brief"} onClick={() => setTab("brief")}>
            Brief
          </TabButton>
          <TabButton active={tab === "stats"} onClick={() => setTab("stats")}>
            Stats
          </TabButton>
          <TabButton active={tab === "settings"} onClick={() => setTab("settings")}>
            Settings
          </TabButton>
          <button
            type="button"
            onClick={() => setTab("help")}
            aria-label="Help"
            title="Help"
            className={
              tab === "help"
                ? "ml-1 flex h-6 w-6 items-center justify-center rounded-full border border-neutral-300 text-neutral-900 dark:border-neutral-600 dark:text-white"
                : "ml-1 flex h-6 w-6 items-center justify-center rounded-full border border-neutral-300 text-neutral-500 hover:text-neutral-800 dark:border-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
            }
          >
            ?
          </button>
        </nav>
      </header>
      <main className="flex-1 overflow-y-auto">
        {tab === "brief" ? (
          <Brief />
        ) : tab === "stats" ? (
          <Stats />
        ) : tab === "settings" ? (
          <Settings />
        ) : (
          <Help />
        )}
      </main>
    </div>
  )
}

function TabButton(props: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={
        props.active
          ? "rounded px-2 py-1 font-medium text-neutral-900 dark:text-white"
          : "rounded px-2 py-1 text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
      }
    >
      {props.children}
    </button>
  )
}
