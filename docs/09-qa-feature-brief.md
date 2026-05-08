# Brief — Page-scoped Q&A side-panel feature (V1)

> Paste this entire file into Claude Code as the prompt. The agent should
> read the cited files first, then implement and verify.

## Project context

Chrome MV3 extension at the repo root (run from there). The extension analyzes
articles (verdict, brief, sections, span highlights) using a `LLMClient`
interface implemented by `DirectAnthropicClient` (Anthropic SDK) and
`OpenAICompatibleClient` (Ollama / DeepSeek). The side panel is a React app;
the reader mode is a content-script Shadow DOM overlay.

**Read these files first to mirror existing patterns:**

- `src/background/llm/client.ts` — `LLMClient` interface, `LLMError` taxonomy, `TEST_ARTICLE`
- `src/background/llm/direct.ts` — Anthropic streaming via `messages.stream()`
- `src/background/llm/openai-compat.ts` — SSE-based streaming for Ollama/DeepSeek
- `src/background/llm/prompts.ts` — system prompts and tool schemas
- `src/background/index.ts` — port-based message handling (look at the analyze port handler)
- `src/sidepanel/views/Brief.tsx` — existing layout: `ActionBar`, `FeedbackBar`
- `src/sidepanel/messaging.ts` — `openAnalysisPort()` helper as the pattern to mirror
- `src/shared/types.ts` — `RuntimeMessage` and `PortMessage` discriminated unions

## Goal

Add an inline collapsible Q&A section to `Brief.tsx` (below `FeedbackBar`,
visible only when `state.kind === "done"`) where the user can have a
multi-turn conversation about the analyzed article. The LLM is constrained
via system prompt to refuse off-topic questions.

**In V1 scope:**

- Inline section in Brief, collapsible
- Multi-turn conversation, **in-memory only** (no IndexedDB persistence)
- Article text injected into system prompt; off-topic refusal via prompt
- Streamed responses with partial render
- Works for all three providers (Anthropic, Ollama, DeepSeek)
- 3 suggested-question chips on first open, templated from `result.topics`
- Input disabled while a turn is streaming
- Per-turn error state with one-click retry

**Out of V1 scope** (don't build):

- IndexedDB persistence across panel sessions
- Citation overlays in the reader
- Markdown export of conversations
- Per-article question cap
- Classifier-based topic enforcement
- Pop-out to dedicated tab

## Files to create / modify

```
NEW  src/background/llm/sse-reader.ts          # extracted SSE chunk reader
NEW  src/sidepanel/views/AskSection.tsx        # the chat UI
NEW  tests/unit/ask-prompt.test.ts             # snapshot test for the system prompt

MOD  src/shared/types.ts                       # AskMessage, ConversationTurn
MOD  src/shared/constants.ts                   # PORTS.ask
MOD  src/background/llm/client.ts              # ask() in LLMClient
MOD  src/background/llm/direct.ts              # implement Anthropic ask()
MOD  src/background/llm/openai-compat.ts       # implement OpenAI-compat ask(); refactor to use sse-reader
MOD  src/background/llm/prompts.ts             # ASK_SYSTEM_PROMPT_TEMPLATE
MOD  src/background/cache/analysis.ts          # NEW articles table for raw text caching
MOD  src/background/index.ts                   # ask port handler
MOD  src/sidepanel/views/Brief.tsx             # render <AskSection />
MOD  src/sidepanel/messaging.ts                # openAskPort() helper
```

## System prompt — use verbatim

```ts
// src/background/llm/prompts.ts
export const ASK_SYSTEM_PROMPT_TEMPLATE = `You are a Q&A assistant for one specific article. Your only knowledge of this article is the text provided below. You have no other context, no internet access, and no general-knowledge mode.

Rules:
- Only answer questions that can be addressed using the article text.
- If the article does not contain the information needed, say so explicitly. Do not speculate. Do not fill from outside knowledge.
- If the question is not about this article (general knowledge, unrelated topics, requests to write code, tell jokes, etc.), refuse with one sentence: "I can only answer questions about this article." Then suggest 2-3 questions the article could actually answer.
- Cite the article by quoting short phrases (under 15 words) or paraphrasing specific claims. Keep answers concise — 2 to 4 sentences unless explicitly asked for more.
- Do not editorialize or add commentary not in the article.

Article title: {{title}}
Article URL: {{url}}

---ARTICLE TEXT---
{{text}}`

export function buildAskSystemPrompt(article: { title: string; url: string; text: string }): string {
  return ASK_SYSTEM_PROMPT_TEMPLATE
    .replace("{{title}}", article.title)
    .replace("{{url}}", article.url)
    .replace("{{text}}", article.text)
}
```

## Type additions

```ts
// src/shared/types.ts (additions)

export interface ConversationTurn {
  id: string                    // crypto.randomUUID()
  question: string
  answer: string                // grows during streaming
  state: "streaming" | "done" | "error"
  errorReason?: string
}

export interface AskInput {
  article: { title: string; url: string; text: string }
  history: Array<{ role: "user" | "assistant"; content: string }>
  question: string
}

// add to RuntimeMessage union:
//   | { kind: "ask.start"; contentHash: string; turnId: string; question: string;
//       history: Array<{ role: "user" | "assistant"; content: string }> }
//   | { kind: "ask.cancel" }

export type AskPortMessage =
  | { kind: "ask.partial"; turnId: string; text: string }
  | { kind: "ask.complete"; turnId: string; text: string }
  | { kind: "ask.error"; turnId: string; reason: string }
```

```ts
// src/shared/constants.ts (addition)
export const PORTS = {
  analysis: "deepread.analysis",
  ask: "deepread.ask",
} as const
```

## Critical gap to address: article-text cache

The existing `cache.analyses` Dexie table (in `src/background/cache/analysis.ts`)
stores `AnalysisResult` only, not the original article text. The Q&A handler
needs the text.

**Add a sibling Dexie table** in the same file:

```ts
interface CachedArticle {
  contentHash: string
  title: string
  url: string
  text: string
  cachedAt: number
}

// extend the version chain:
this.version(3).stores({
  analyses: "&contentHash, cachedAt",
  definitions: "&word, cachedAt",
  feedback: "&contentHash, ts, rating, provider",
  articles: "&contentHash, cachedAt",
})

// add table accessor + setCachedArticle / getCachedArticle helpers
```

Then in `src/background/index.ts`, after extraction succeeds (in the analyze
port handler, around line where `setCachedAnalysis` is called), also call
`setCachedArticle({ contentHash, title, url, text, cachedAt: Date.now() })`.
Use the same TTL.

## LLMClient interface addition

```ts
// src/background/llm/client.ts
export interface LLMClient {
  analyze(...)
  define(...)
  test(...)
  ask(input: AskInput, onPartial: (accumulatedText: string) => void): Promise<string>
}
```

## Anthropic implementation

```ts
// src/background/llm/direct.ts (new method on DirectAnthropicClient)
async ask(input: AskInput, onPartial: (text: string) => void): Promise<string> {
  let stream: ReturnType<Anthropic["messages"]["stream"]>
  try {
    stream = this.client.messages.stream({
      model: ANTHROPIC_MODELS.analysis,
      max_tokens: 1024,
      system: buildAskSystemPrompt(input.article),
      messages: [
        ...input.history,
        { role: "user", content: input.question },
      ],
    })
  } catch (err) {
    throw classifyError(err)
  }

  let accumulated = ""
  stream.on("text", (delta: string) => {
    accumulated += delta
    onPartial(accumulated)
  })

  try {
    await stream.finalMessage()
  } catch (err) {
    throw classifyError(err)
  }
  return accumulated
}
```

## OpenAI-compat implementation

Refactor first: extract the SSE-event reader from `streamToolCallArgs` into
`src/background/llm/sse-reader.ts`:

```ts
// src/background/llm/sse-reader.ts
export async function readSseEvents(
  response: Response,
  onData: (data: string) => void,
): Promise<void> {
  if (!response.body) throw new Error("Empty response body")
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    while (true) {
      const sep = buffer.indexOf("\n\n")
      if (sep === -1) break
      const event = buffer.slice(0, sep)
      buffer = buffer.slice(sep + 2)
      const dataLine = event.split("\n").find((l) => l.startsWith("data:"))
      if (!dataLine) continue
      const data = dataLine.slice(5).trim()
      if (!data || data === "[DONE]") continue
      onData(data)
    }
  }
}
```

Then both `streamToolCallArgs` (existing) and the new `ask()` use it. Ask
parses `choices[0].delta.content`:

```ts
// src/background/llm/openai-compat.ts (new method)
async ask(input: AskInput, onPartial: (text: string) => void): Promise<string> {
  const body = {
    model: this.config.model,
    messages: [
      { role: "system", content: buildAskSystemPrompt(input.article) },
      ...input.history,
      { role: "user", content: input.question },
    ],
    stream: true,
    max_tokens: 1024,
  }

  let response: Response
  try {
    response = await fetch(`${this.config.baseURL}/chat/completions`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    })
  } catch (err) {
    throw classifyFetchError(err, this.config.label)
  }
  if (!response.ok) {
    throw classifyHttpError(response.status, await safeReadText(response), this.config.label)
  }

  let accumulated = ""
  await readSseEvents(response, (data) => {
    let parsed: unknown
    try { parsed = JSON.parse(data) } catch { return }
    const delta = (parsed as { choices?: Array<{ delta?: { content?: string } }> })
      .choices?.[0]?.delta?.content
    if (typeof delta === "string" && delta.length > 0) {
      accumulated += delta
      onPartial(accumulated)
    }
  })
  return accumulated
}
```

## Background port handler

```ts
// src/background/index.ts (add alongside the analysis port handler)
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== PORTS.ask) return
  let cancelled = false
  port.onDisconnect.addListener(() => { cancelled = true })

  port.onMessage.addListener(async (msg: RuntimeMessage) => {
    if (msg.kind === "ask.cancel") { cancelled = true; return }
    if (msg.kind !== "ask.start") return
    const turnId = msg.turnId

    try {
      const article = await getCachedArticle(msg.contentHash, DEFAULTS.analysisCacheTtlMs)
      if (!article) {
        port.postMessage({ kind: "ask.error", turnId, reason: "no_cached_article" })
        return
      }
      const settings = await getSettings()
      const secrets = {
        anthropicKey: await getSecret("anthropic"),
        deepseekKey: await getSecret("deepseek"),
      }
      const client = createLLMClient(settings.provider, settings, secrets)

      const answer = await client.ask(
        { article: { title: article.title, url: article.url, text: article.text },
          history: msg.history, question: msg.question },
        (text) => { if (!cancelled) port.postMessage({ kind: "ask.partial", turnId, text }) },
      )
      if (!cancelled) port.postMessage({ kind: "ask.complete", turnId, text: answer })
    } catch (err) {
      const reason = err instanceof LLMError ? `${err.kind}: ${err.message}` : String(err)
      if (!cancelled) port.postMessage({ kind: "ask.error", turnId, reason })
    }
  })
})
```

## Side panel: messaging helper

```ts
// src/sidepanel/messaging.ts (add)
export function openAskPort(onMessage: (msg: AskPortMessage) => void) {
  const port = chrome.runtime.connect({ name: PORTS.ask })
  port.onMessage.addListener(onMessage)
  return {
    start: (args: { contentHash: string; turnId: string; question: string;
      history: Array<{ role: "user" | "assistant"; content: string }> }) => {
      port.postMessage({ kind: "ask.start", ...args } satisfies RuntimeMessage)
    },
    cancel: () => port.postMessage({ kind: "ask.cancel" } satisfies RuntimeMessage),
    close: () => port.disconnect(),
  }
}
```

## AskSection component

```tsx
// src/sidepanel/views/AskSection.tsx
export function AskSection({ article, meta, suggestions }: {
  article: ArticleMeta
  meta: AnalysisMeta
  suggestions: string[]
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [conversation, setConversation] = useState<ConversationTurn[]>([])
  const [pending, setPending] = useState<ConversationTurn | null>(null)
  const [draft, setDraft] = useState("")
  const portRef = useRef<ReturnType<typeof openAskPort> | null>(null)

  useEffect(() => () => portRef.current?.close(), [])

  function submit(question: string) {
    const q = question.trim()
    if (!q || pending) return
    const turn: ConversationTurn = { id: crypto.randomUUID(), question: q, answer: "", state: "streaming" }
    setPending(turn)
    setDraft("")

    const history = conversation
      .filter((t) => t.state === "done")
      .flatMap((t) => [
        { role: "user" as const, content: t.question },
        { role: "assistant" as const, content: t.answer },
      ])

    const port = openAskPort((msg) => {
      if (msg.turnId !== turn.id) return
      if (msg.kind === "ask.partial") {
        setPending((p) => (p ? { ...p, answer: msg.text } : p))
      } else if (msg.kind === "ask.complete") {
        setConversation((c) => [...c, { ...turn, answer: msg.text, state: "done" }])
        setPending(null)
        port.close()
      } else if (msg.kind === "ask.error") {
        setConversation((c) => [...c, { ...turn, state: "error", errorReason: msg.reason }])
        setPending(null)
        port.close()
      }
    })
    portRef.current = port
    port.start({ contentHash: meta.contentHash, turnId: turn.id, question: q, history })
  }

  // RENDER: collapsible header, if conversation.length === 0 show suggestion chips,
  // then conversation thread (each turn: question + answer with retry on error),
  // then input box (textarea + submit button), disabled while pending != null.
  // Press Enter (without Shift) to submit.
}
```

Use `crypto.randomUUID()` directly (available in modern Chrome).

## Suggested questions

```ts
function suggestionsFromResult(result: AnalysisResult): string[] {
  const topic = result.topics[0]
  return [
    "What is the main argument of this article?",
    topic
      ? `What evidence supports the claim about ${topic}?`
      : "What evidence does the author provide?",
    "What does the author conclude?",
  ]
}
```

Pass into `AskSection` from `Brief.tsx` where the result is in scope.

## Brief.tsx integration

```tsx
{state.kind === "done" ? (
  <>
    <FeedbackBar result={state.result} article={state.article} meta={state.meta} />
    <AskSection
      article={state.article}
      meta={state.meta}
      suggestions={suggestionsFromResult(state.result)}
    />
  </>
) : null}
```

## Acceptance criteria

1. After analysis completes, an "Ask about this article" section appears below FeedbackBar.
2. First open: 3 suggestion chips visible. Clicking one fills and submits.
3. Submitting a question streams the answer; first token in <2s on Sonnet, full answer in 2-6s typical.
4. Input field is disabled while a turn is streaming. Submit button shows "…".
5. Asking "What's the weather today?" returns a one-sentence refusal followed by 2-3 article-grounded suggestions.
6. Asking 5 follow-up questions in a row produces a coherent multi-turn conversation; the conversation history is sent with each turn.
7. Analyzing a different article in the same panel resets the conversation (the `<AskSection key={meta.contentHash} />` pattern, or explicit `useEffect` reset).
8. Closing the side panel mid-stream doesn't crash the background (port disconnect is handled).
9. All three providers work: test with Anthropic, Ollama (llama3.1+ or qwen2.5+), and DeepSeek.

## Verification

```sh
pnpm typecheck    # must pass
pnpm lint         # must pass
pnpm test         # must pass; ask-prompt.test.ts is the new test
pnpm build        # produces dist/
```

Then load the unpacked `dist/` in Chrome and run through the 9 acceptance
scenarios. If anything fails, fix and re-verify before claiming done.

## Important constraints (don't violate)

- **Do not** add a settings UI for "ask model selection" in V1. Use whatever the user has configured for analysis.
- **Do not** persist conversations to IndexedDB in V1. Pure React state only.
- **Do not** add a classifier or second LLM pass for off-topic detection. Trust the system prompt.
- **Do not** break existing analyze/define functionality during the SSE refactor — run the full test suite after the refactor before adding the new code.
- **Do** keep the same patterns as the existing codebase: typed message unions, port-based streaming, factory-pattern provider selection, error coercion through `LLMError`.

When done, commit with: `feat(qa): page-scoped Q&A in side panel`.
