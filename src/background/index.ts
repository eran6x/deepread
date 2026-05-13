import {
  ANTHROPIC_MODELS,
  DEEPSEEK_MODELS,
  DEFAULTS,
  PORTS,
  type Provider,
  TELEMETRY_LOG_PREFIX,
} from "@/shared/constants"
import { hostnameOf, isSensitiveHost, matchesPattern } from "@/shared/domains"
import { approxWordCount } from "@/shared/feedback"
import type { Source } from "@/shared/source"
import type {
  AnalysisPhase,
  ExtractedArticle,
  PdfExtractResult,
  PortMessage,
  ProviderTestResult,
  RuntimeMessage,
} from "@/shared/types"
import {
  appendFeedback,
  getCachedAnalysis,
  getCachedArticle,
  getCachedDefinition,
  getFeedback,
  hashText,
  listFeedback,
  listRecentArticles,
  setCachedAnalysis,
  setCachedArticle,
  setCachedDefinition,
} from "./cache/analysis"
import { appendSession, appendTokenSample, appendWpmSample, getStatsSummary } from "./cache/stats"
import { LLMError } from "./llm/client"
import { createLLMClient } from "./llm/factory"
import { getSecret, getSecretStatus, getSettings, setSecret, updateSettings } from "./settings"
import { GoogleDocError, extractGoogleDoc } from "./sources/gdoc"

chrome.runtime.onInstalled.addListener(() => {
  // With a default_popup set, clicking the action opens the popup instead of
  // the side panel. The popup has an "Open side panel" button.
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: false })
    .catch((err) => console.error("[Deepread] sidePanel.setPanelBehavior failed", err))
})

chrome.runtime.onMessage.addListener((msg: RuntimeMessage, _sender, sendResponse) => {
  switch (msg.kind) {
    case "settings.get":
      getSettings().then(sendResponse)
      return true

    case "settings.update":
      updateSettings(msg.patch).then(sendResponse)
      return true

    case "secrets.set":
      setSecret(msg.provider, msg.key).then(() => sendResponse({ ok: true }))
      return true

    case "secrets.status":
      getSecretStatus(msg.provider).then(sendResponse)
      return true

    case "provider.test":
      testProvider(msg.provider).then(sendResponse)
      return true

    case "feedback.append":
      appendFeedback(msg.entry).then(() => sendResponse({ ok: true }))
      return true

    case "feedback.list":
      listFeedback().then(sendResponse)
      return true

    case "feedback.get":
      getFeedback(msg.contentHash).then(sendResponse)
      return true

    case "define.request":
      handleDefine(msg.word, msg.sentence, msg.lang).then(sendResponse)
      return true

    case "stats.wpmSample":
      appendWpmSample({
        contentHash: msg.contentHash,
        wpm: msg.wpm,
        wordCount: msg.wordCount,
        durationMs: msg.durationMs,
        ts: msg.ts,
      }).then(() => sendResponse({ ok: true }))
      return true

    case "stats.session":
      appendSession({
        contentHash: msg.contentHash,
        regressions: msg.regressions,
        completed: msg.completed,
        ts: msg.ts,
      }).then(() => sendResponse({ ok: true }))
      return true

    case "stats.summary":
      getStatsSummary().then(sendResponse)
      return true

    case "articles.recent":
      listRecentArticles(msg.limit).then(sendResponse)
      return true

    case "telemetry.log":
      console.info(TELEMETRY_LOG_PREFIX, msg.event, msg.payload)
      sendResponse({ ok: true })
      return true

    default:
      return false
  }
})

async function handleDefine(word: string, sentence: string, lang: string) {
  const cacheKey = `${lang}::${word.toLowerCase()}`
  const cached = await getCachedDefinition(cacheKey, DEFAULTS.definitionCacheTtlMs)
  if (cached) return cached
  try {
    const settings = await getSettings()
    const secrets = {
      anthropicKey: await getSecret("anthropic"),
      deepseekKey: await getSecret("deepseek"),
    }
    const client = createLLMClient(settings.provider, settings, secrets)
    const result = await client.define({ word, sentence })
    await setCachedDefinition(cacheKey, result)
    return result
  } catch (err) {
    console.warn("[Deepread] define failed:", err)
    return null
  }
}

async function testProvider(provider: Provider): Promise<ProviderTestResult> {
  try {
    const settings = await getSettings()
    const secrets = {
      anthropicKey: await getSecret("anthropic"),
      deepseekKey: await getSecret("deepseek"),
    }
    const client = createLLMClient(provider, settings, secrets)
    return await client.test()
  } catch (err) {
    if (err instanceof LLMError) return { ok: false, reason: err.kind, detail: err.message }
    return {
      ok: false,
      reason: "unknown",
      detail: err instanceof Error ? err.message : String(err),
    }
  }
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== PORTS.analysis) return
  let cancelled = false

  port.onDisconnect.addListener(() => {
    cancelled = true
  })

  port.onMessage.addListener(async (msg: RuntimeMessage) => {
    if (msg.kind === "analyze.cancel") {
      cancelled = true
      return
    }
    if (msg.kind !== "analyze.start") return

    const send = (m: PortMessage) => {
      if (cancelled) return
      try {
        port.postMessage(m)
      } catch {
        cancelled = true
      }
    }
    const status = (phase: AnalysisPhase) => send({ kind: "analysis.status", phase })

    try {
      const source = msg.source
      // Pre-flight privacy guard
      const sourceUrl =
        source.kind === "html" ? ((await chrome.tabs.get(source.tabId)).url ?? "") : source.url
      const settings = await getSettings()
      const host = hostnameOf(sourceUrl)
      if (host && !isAllowedHost(host, sourceUrl, settings.privacy)) {
        send({ kind: "analysis.error", reason: "blocked_sensitive_domain" })
        return
      }

      status("extracting")
      let article: ExtractedArticle
      try {
        article = await extractForSource(source)
      } catch (err) {
        if (err instanceof GoogleDocError) {
          send({ kind: "analysis.error", reason: err.reason })
          return
        }
        throw err
      }

      send({
        kind: "analysis.paywall",
        suspected: article.paywallSuspected,
        reason: article.paywallReason,
      })

      if (article.text.length > DEFAULTS.maxInputChars) {
        const originalLength = article.text.length
        article = { ...article, text: article.text.slice(0, DEFAULTS.maxInputChars) }
        send({
          kind: "analysis.truncated",
          originalLength,
          truncatedLength: DEFAULTS.maxInputChars,
        })
      }

      const contentHash = await hashText(article.text)
      await setCachedArticle({
        contentHash,
        title: article.title,
        url: article.url,
        text: article.text,
        cachedAt: Date.now(),
      })
      const wordCount = approxWordCount(article.text)
      const provider = settings.provider
      const model = providerModelName(provider, settings)

      const cached = await getCachedAnalysis(contentHash, DEFAULTS.analysisCacheTtlMs)
      if (cached) {
        status("cache-hit")
        send({
          kind: "analysis.complete",
          result: cached,
          contentHash,
          wordCount,
          provider,
          model,
          latencyMs: null,
          inputTokens: null,
          outputTokens: null,
        })
        return
      }

      const secrets = {
        anthropicKey: await getSecret("anthropic"),
        deepseekKey: await getSecret("deepseek"),
      }

      let client: ReturnType<typeof createLLMClient>
      try {
        client = createLLMClient(provider, settings, secrets)
      } catch (err) {
        if (err instanceof LLMError && err.kind === "missing_credentials") {
          send({ kind: "analysis.error", reason: "no_api_key" })
          return
        }
        if (err instanceof LLMError && err.kind === "missing_config") {
          send({ kind: "analysis.error", reason: `missing_config: ${err.message}` })
          return
        }
        throw err
      }

      status("calling-llm")
      status("streaming")
      const startedAt = Date.now()
      let lastUsage: { inputTokens: number; outputTokens: number } | null = null
      const result = await client.analyze(
        { title: article.title, url: article.url, text: article.text },
        (partial) => send({ kind: "analysis.partial", result: partial }),
        (usage) => {
          lastUsage = usage
        },
      )
      const latencyMs = Date.now() - startedAt

      if (lastUsage) {
        const usage: { inputTokens: number; outputTokens: number } = lastUsage
        await appendTokenSample({
          contentHash,
          provider,
          model,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          ts: Date.now(),
        })
      }

      await setCachedAnalysis(contentHash, result)
      send({
        kind: "analysis.complete",
        result,
        contentHash,
        wordCount,
        provider,
        model,
        latencyMs,
        inputTokens: lastUsage ? (lastUsage as { inputTokens: number }).inputTokens : null,
        outputTokens: lastUsage ? (lastUsage as { outputTokens: number }).outputTokens : null,
      })
      status("done")
    } catch (err) {
      const reason = err instanceof LLMError ? `${err.kind}: ${err.message}` : String(err)
      send({ kind: "analysis.error", reason })
      status("error")
    }
  })
})

function isAllowedHost(
  host: string,
  url: string,
  privacy: { allowedDomains: string[]; blockedDomains: string[] },
): boolean {
  for (const p of privacy.allowedDomains) if (matchesPattern(host, p)) return true
  for (const p of privacy.blockedDomains) if (matchesPattern(host, p)) return false
  return !isSensitiveHost(url)
}

function providerModelName(
  provider: Provider,
  settings: Awaited<ReturnType<typeof getSettings>>,
): string {
  switch (provider) {
    case "anthropic":
      return ANTHROPIC_MODELS.analysis
    case "ollama":
      return settings.ollama.model
    case "deepseek":
      return settings.deepseek.model || DEEPSEEK_MODELS.analysis
  }
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== PORTS.ask) return
  let cancelled = false
  port.onDisconnect.addListener(() => {
    cancelled = true
  })

  port.onMessage.addListener(async (msg: RuntimeMessage) => {
    if (msg.kind === "ask.cancel") {
      cancelled = true
      return
    }
    if (msg.kind !== "ask.start") return
    const turnId = msg.turnId

    const post = (m: { kind: string; turnId: string; text?: string; reason?: string }) => {
      if (cancelled) return
      try {
        port.postMessage(m)
      } catch {
        cancelled = true
      }
    }

    try {
      const article = await getCachedArticle(msg.contentHash, DEFAULTS.analysisCacheTtlMs)
      if (!article) {
        post({ kind: "ask.error", turnId, reason: "no_cached_article" })
        return
      }
      const settings = await getSettings()
      const secrets = {
        anthropicKey: await getSecret("anthropic"),
        deepseekKey: await getSecret("deepseek"),
      }
      const client = createLLMClient(settings.provider, settings, secrets)

      const answer = await client.ask(
        {
          article: { title: article.title, url: article.url, text: article.text },
          history: msg.history,
          question: msg.question,
        },
        (text) => post({ kind: "ask.partial", turnId, text }),
      )
      post({ kind: "ask.complete", turnId, text: answer })
    } catch (err) {
      const reason = err instanceof LLMError ? `${err.kind}: ${err.message}` : String(err)
      post({ kind: "ask.error", turnId, reason })
    }
  })
})

async function requestExtraction(tabId: number): Promise<ExtractedArticle> {
  const response = await chrome.tabs.sendMessage<RuntimeMessage, RuntimeMessage>(tabId, {
    kind: "extract.request",
  })
  if (response.kind === "extract.response") return response.article
  if (response.kind === "extract.error") throw new Error(`Extraction failed: ${response.reason}`)
  throw new Error("Unexpected extraction response")
}

async function extractForSource(source: Source): Promise<ExtractedArticle> {
  if (source.kind === "html") return requestExtraction(source.tabId)
  if (source.kind === "gdoc") return extractGoogleDoc(source.url)
  return requestPdfExtraction(source.url)
}

async function requestPdfExtraction(url: string): Promise<ExtractedArticle> {
  const result = (await chrome.runtime.sendMessage({
    kind: "extract.pdf.request",
    url,
  } satisfies RuntimeMessage)) as PdfExtractResult | undefined
  if (!result) {
    throw new Error("PDF extraction unavailable. Open the side panel and try again.")
  }
  if (!result.ok) throw new Error(`PDF extraction failed: ${result.reason}`)
  return result.article
}
