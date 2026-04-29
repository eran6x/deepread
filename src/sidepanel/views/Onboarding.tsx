import type { AppSettings } from "@/shared/types"
import { useState } from "react"
import { send } from "../messaging"

export function Onboarding({ onDone }: { onDone: (s: AppSettings) => void }) {
  const [telemetry, setTelemetry] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function finish() {
    setSubmitting(true)
    const next = await send<AppSettings>({
      kind: "settings.update",
      patch: {
        privacy: {
          allowedDomains: [],
          blockedDomains: [],
          onboardingComplete: true,
          telemetryConsent: telemetry,
        },
      },
    })
    onDone(next)
  }

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold tracking-tight">Deepread</span>
          <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
            alpha
          </span>
        </div>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          Read faster and understand more.
        </p>
      </header>
      <main className="flex-1 space-y-5 overflow-y-auto p-5">
        <Step n={1} title="Pick a provider in Settings">
          Anthropic, Ollama (local), or DeepSeek. Bring your own API key, or run a model locally.
          Deepread sends extracted article text to the provider you choose; nothing else, ever.
        </Step>

        <Step n={2} title="Off by default everywhere">
          Deepread won't run on a page until you click <b>Analyze this page</b>. It's blocked
          entirely on banking, email, calendar, workspace, and admin-console domains by default. You
          can grant per-domain "always on" later from the toolbar popup.
        </Step>

        <Step n={3} title="Three-tier reading flow">
          A 5-second triage <b>verdict</b>, a 60-second <b>scan</b> with section one-liners, and a
          full <b>read</b> with active-paragraph focus, color-coded highlights, and an optional
          word-by-word pacer.
        </Step>

        <section className="rounded-md border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-900">
          <label className="flex cursor-pointer items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={telemetry}
              onChange={(e) => setTelemetry(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              <b>Help improve Deepread (optional).</b>
              <span className="block text-xs text-neutral-600 dark:text-neutral-400">
                Logs structured events locally to your browser console (e.g. span-mapping success
                rate, time-to-verdict). No URLs, no page text, no identity. Disabled by default; you
                can change this in Settings any time.
              </span>
            </span>
          </label>
        </section>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={finish}
            disabled={submitting}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
          >
            {submitting ? "Setting up…" : "Get started"}
          </button>
        </div>
      </main>
    </div>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="flex gap-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-xs font-semibold text-white dark:bg-white dark:text-neutral-900">
        {n}
      </div>
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="mt-0.5 text-sm leading-snug text-neutral-600 dark:text-neutral-400">
          {children}
        </p>
      </div>
    </section>
  )
}
