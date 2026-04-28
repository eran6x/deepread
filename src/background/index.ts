import {
  ANTHROPIC_MODELS,
  DEEPSEEK_MODELS,
  DEFAULTS,
  PORTS,
  type Provider,
} from "@/shared/constants"
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
  getFeedback,
  hashText,
  listFeedback,
  setCachedAnalysis,
} from "./cache/analysis"
import { LLMError } from "./llm/client"
import { createLLMClient } from "./llm/factory"
import { getSecret, getSecretStatus, getSettings, setSecret, updateSettings } from "./settings"

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
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

    default:
      return false
  }
})

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
      status("extracting")
      const article = await requestExtraction(msg.tabId)

      const contentHash = await hashText(article.text)
      const wordCount = approxWordCount(article.text)
      const settings = await getSettings()
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
