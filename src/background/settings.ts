import {
  DEEPSEEK_MODELS,
  DEFAULTS,
  OLLAMA_DEFAULTS,
  type Provider,
  STORAGE_KEYS,
} from "@/shared/constants"
import type { ApiKeyStatus, AppSettings } from "@/shared/types"

const DEFAULT_SETTINGS: AppSettings = {
  wpm: DEFAULTS.wpm,
  dimOpacity: DEFAULTS.dimOpacity,
  pacerStyle: DEFAULTS.pacerStyle,
  provider: DEFAULTS.provider,
  ollama: { ...OLLAMA_DEFAULTS },
  deepseek: { model: DEEPSEEK_MODELS.analysis },
}

export async function getSettings(): Promise<AppSettings> {
  const raw = await chrome.storage.local.get(STORAGE_KEYS.settings)
  const stored = raw[STORAGE_KEYS.settings] as Partial<AppSettings> | undefined
  return mergeWithDefaults(stored)
}

export async function updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getSettings()
  const next: AppSettings = {
    ...current,
    ...patch,
    ollama: { ...current.ollama, ...(patch.ollama ?? {}) },
    deepseek: { ...current.deepseek, ...(patch.deepseek ?? {}) },
  }
  await chrome.storage.local.set({ [STORAGE_KEYS.settings]: next })
  return next
}

function mergeWithDefaults(stored: Partial<AppSettings> | undefined): AppSettings {
  if (!stored) return DEFAULT_SETTINGS
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    ollama: { ...DEFAULT_SETTINGS.ollama, ...(stored.ollama ?? {}) },
    deepseek: { ...DEFAULT_SETTINGS.deepseek, ...(stored.deepseek ?? {}) },
  }
}

const SECRET_STORAGE_KEYS: Record<"anthropic" | "deepseek", string> = {
  anthropic: STORAGE_KEYS.apiKey,
  deepseek: STORAGE_KEYS.deepseekKey,
}

export async function getSecret(provider: "anthropic" | "deepseek"): Promise<string | null> {
  const storageKey = SECRET_STORAGE_KEYS[provider]
  const raw = await chrome.storage.local.get(storageKey)
  const key = raw[storageKey]
  return typeof key === "string" && key.length > 0 ? key : null
}

export async function setSecret(provider: "anthropic" | "deepseek", key: string): Promise<void> {
  await chrome.storage.local.set({ [SECRET_STORAGE_KEYS[provider]]: key })
}

export async function clearSecret(provider: "anthropic" | "deepseek"): Promise<void> {
  await chrome.storage.local.remove(SECRET_STORAGE_KEYS[provider])
}

export async function getSecretStatus(provider: "anthropic" | "deepseek"): Promise<ApiKeyStatus> {
  const key = await getSecret(provider)
  if (!key) return { present: false, masked: null, validated: false }
  return { present: true, masked: maskKey(key), validated: false }
}

export async function getCurrentProvider(): Promise<Provider> {
  const settings = await getSettings()
  return settings.provider
}

function maskKey(key: string): string {
  if (key.length <= 12) return "•".repeat(key.length)
  return `${key.slice(0, 7)}•••••${key.slice(-4)}`
}
