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
import type {
  AnalysisPhase,
  ExtractedArticle,
  PortMessage,
  ProviderTestResult,
  RuntimeMessage,
} from "@/shared/types"
import {
  appendFeedback,
  getCachedAnalysis,
  getCachedDefinition,
  getFeedback,
  hashText,
  listFeedback,
  setCachedAnalysis,
  setCachedDefinition,
} from "./cache/analysis"
import { appendSession, appendWpmSample, getStatsSummary } from "./cache/stats"
import { LLMError } from "./llm/client"
import { createLLMClient } from "./llm/factory"
import { getSecret, getSecretStatus, getSettings, setSecret, updateSettings } from "./settings"

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
      // Pre-flight privacy guard
      const tab = await chrome.tabs.get(msg.tabId)
      const url = tab.url ?? ""
      const settings = await getSettings()
      const host = hostnameOf(url)
      if (host && !isAllowedHost(host, url, settings.privacy)) {
        send({ kind: "analysis.error", reason: "blocked_sensitive_domain" })
        return
      }

      status("extracting")
      const article = await requestExtraction(msg.tabId)

      const contentHash = await hashText(article.text)
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
      const result = await client.analyze(
        { title: article.title, url: article.url, text: article.text },
        (partial) => send({ kind: "analysis.partial", result: partial }),
      )
      const latencyMs = Date.now() - startedAt

      await setCachedAnalysis(contentHash, result)
      send({
        kind: "analysis.complete",
        result,
        contentHash,
        wordCount,
        provider,
        model,
        latencyMs,
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

async function requestExtraction(tabId: number): Promise<ExtractedArticle> {
  const response = await chrome.tabs.sendMessage<RuntimeMessage, RuntimeMessage>(tabId, {
    kind: "extract.request",
  })
  if (response.kind === "extract.response") return response.article
  if (response.kind === "extract.error") throw new Error(`Extraction failed: ${response.reason}`)
  throw new Error("Unexpected extraction response")
}
