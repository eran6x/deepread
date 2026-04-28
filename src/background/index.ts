import { DEFAULTS, PORTS, type Provider } from "@/shared/constants"
import type {
  AnalysisPhase,
  ExtractedArticle,
  PortMessage,
  ProviderTestResult,
  RuntimeMessage,
} from "@/shared/types"
import { getCachedAnalysis, hashText, setCachedAnalysis } from "./cache/analysis"
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
      const cached = await getCachedAnalysis(contentHash, DEFAULTS.analysisCacheTtlMs)
      if (cached) {
        status("cache-hit")
        send({ kind: "analysis.complete", result: cached })
        return
      }

      const settings = await getSettings()
      const secrets = {
        anthropicKey: await getSecret("anthropic"),
        deepseekKey: await getSecret("deepseek"),
      }

      let client: ReturnType<typeof createLLMClient>
      try {
        client = createLLMClient(settings.provider, settings, secrets)
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
      const result = await client.analyze(
        { title: article.title, url: article.url, text: article.text },
        (partial) => send({ kind: "analysis.partial", result: partial }),
      )

      await setCachedAnalysis(contentHash, result)
      send({ kind: "analysis.complete", result })
      status("done")
    } catch (err) {
      const reason = err instanceof LLMError ? `${err.kind}: ${err.message}` : String(err)
      send({ kind: "analysis.error", reason })
      status("error")
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
