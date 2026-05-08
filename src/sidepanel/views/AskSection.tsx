import type { ConversationTurn } from "@/shared/types"
import { useEffect, useRef, useState } from "react"
import type { ArticleMeta } from "../format"
import { openAskPort } from "../messaging"
import { type AnalysisMeta, useSidepanelStore } from "../store"

const EMPTY_CONVERSATION: ConversationTurn[] = []

export function AskSection({
  article: _article,
  meta,
  suggestions,
}: {
  article: ArticleMeta
  meta: AnalysisMeta
  suggestions: string[]
}) {
  const [collapsed, setCollapsed] = useState(false)
  const conversation = useSidepanelStore(
    (s) => s.conversations[meta.contentHash] ?? EMPTY_CONVERSATION,
  )
  const setStoreConversation = useSidepanelStore((s) => s.setConversation)
  const [pending, setPending] = useState<ConversationTurn | null>(null)
  const [draft, setDraft] = useState("")
  const portRef = useRef<ReturnType<typeof openAskPort> | null>(null)
  const threadRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    return () => {
      portRef.current?.close()
      portRef.current = null
    }
  }, [])

  // biome-ignore lint/correctness/useExhaustiveDependencies: pending?.answer drives the scroll
  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight
    }
  }, [pending?.answer])

  function submit(question: string) {
    const q = question.trim()
    if (!q || pending) return

    const turn: ConversationTurn = {
      id: crypto.randomUUID(),
      question: q,
      answer: "",
      state: "streaming",
    }
    setPending(turn)
    setDraft("")

    const history = conversation
      .filter((t) => t.state === "done")
      .flatMap((t) => [
        { role: "user" as const, content: t.question },
        { role: "assistant" as const, content: t.answer },
      ])

    portRef.current?.close()
    const port = openAskPort((msg) => {
      if (msg.turnId !== turn.id) return
      if (msg.kind === "ask.partial") {
        setPending((p) => (p ? { ...p, answer: msg.text } : p))
      } else if (msg.kind === "ask.complete") {
        const current = useSidepanelStore.getState().conversations[meta.contentHash] ?? []
        setStoreConversation(meta.contentHash, [
          ...current,
          { ...turn, answer: msg.text, state: "done" },
        ])
        setPending(null)
        port.close()
        if (portRef.current === port) portRef.current = null
      } else if (msg.kind === "ask.error") {
        const current = useSidepanelStore.getState().conversations[meta.contentHash] ?? []
        setStoreConversation(meta.contentHash, [
          ...current,
          { ...turn, state: "error", errorReason: msg.reason },
        ])
        setPending(null)
        port.close()
        if (portRef.current === port) portRef.current = null
      }
    })
    portRef.current = port
    port.start({ contentHash: meta.contentHash, turnId: turn.id, question: q, history })
  }

  function retry(failed: ConversationTurn) {
    const current = useSidepanelStore.getState().conversations[meta.contentHash] ?? []
    setStoreConversation(
      meta.contentHash,
      current.filter((t) => t.id !== failed.id),
    )
    submit(failed.question)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      submit(draft)
    }
  }

  const showSuggestions = conversation.length === 0 && pending == null

  return (
    <div className="rounded-md border border-neutral-200 dark:border-neutral-800">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center justify-between p-3 text-left"
        aria-expanded={!collapsed}
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          Ask about this article
        </span>
        <span className="text-xs text-neutral-400">{collapsed ? "▸" : "▾"}</span>
      </button>

      {!collapsed ? (
        <div className="space-y-3 border-t border-neutral-200 p-3 dark:border-neutral-800">
          {showSuggestions ? (
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((s, i) => (
                <button
                  // biome-ignore lint/suspicious/noArrayIndexKey: suggestions are static positional
                  key={`sugg-${i}`}
                  type="button"
                  onClick={() => submit(s)}
                  className="rounded-full border border-neutral-300 bg-white px-2.5 py-1 text-xs text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
                >
                  {s}
                </button>
              ))}
            </div>
          ) : null}

          {conversation.length > 0 || pending ? (
            <div ref={threadRef} className="max-h-80 space-y-3 overflow-y-auto">
              {conversation.map((turn) => (
                <Turn key={turn.id} turn={turn} onRetry={retry} />
              ))}
              {pending ? <Turn turn={pending} /> : null}
            </div>
          ) : null}

          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={pending != null}
              rows={2}
              placeholder="Ask a question about this article…"
              className="min-h-[40px] flex-1 resize-none rounded-md border border-neutral-300 bg-white p-2 text-sm text-neutral-900 placeholder:text-neutral-400 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
            />
            <button
              type="button"
              onClick={() => submit(draft)}
              disabled={pending != null || draft.trim().length === 0}
              className="rounded-md bg-neutral-900 px-3 py-2 text-xs font-medium text-white hover:bg-neutral-700 disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
            >
              {pending != null ? "…" : "Send"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function Turn({
  turn,
  onRetry,
}: {
  turn: ConversationTurn
  onRetry?: (turn: ConversationTurn) => void
}) {
  return (
    <div className="space-y-1.5">
      <div className="rounded-md bg-neutral-100 p-2 text-sm dark:bg-neutral-800">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          You
        </p>
        <p className="mt-0.5 whitespace-pre-wrap">{turn.question}</p>
      </div>
      <div className="rounded-md border border-neutral-200 p-2 text-sm dark:border-neutral-800">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          Assistant
        </p>
        {turn.state === "error" ? (
          <div className="mt-0.5 space-y-1">
            <p className="text-red-700 dark:text-red-400">{humanizeAskError(turn.errorReason)}</p>
            {onRetry ? (
              <button
                type="button"
                onClick={() => onRetry(turn)}
                className="text-xs text-neutral-600 underline hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200"
              >
                Retry
              </button>
            ) : null}
          </div>
        ) : (
          <p className="mt-0.5 whitespace-pre-wrap">
            {turn.answer || (turn.state === "streaming" ? "…" : "")}
          </p>
        )}
      </div>
    </div>
  )
}

function humanizeAskError(reason: string | undefined): string {
  if (!reason) return "Something went wrong."
  if (reason.includes("no_cached_article"))
    return "Article text isn't cached anymore. Re-analyze the page and try again."
  if (reason.startsWith("auth")) return "Invalid API key. Check it in Settings."
  if (reason.startsWith("network")) return "Network error. Check your connection and retry."
  if (reason.startsWith("rate_limit")) return "Rate limited. Try again in a minute."
  if (reason.startsWith("endpoint_unreachable"))
    return "Cannot reach the configured endpoint. Check Settings."
  if (reason.startsWith("model_missing"))
    return "Model not found. Check the model name in Settings."
  return reason
}
