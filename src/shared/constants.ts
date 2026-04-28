export const PROVIDERS = ["anthropic", "ollama", "deepseek"] as const
export type Provider = (typeof PROVIDERS)[number]

export const PROVIDER_LABELS: Record<Provider, string> = {
  anthropic: "Anthropic",
  ollama: "Ollama (local)",
  deepseek: "DeepSeek",
}

export const ANTHROPIC_MODELS = {
  analysis: "claude-sonnet-4-6",
  define: "claude-haiku-4-5-20251001",
  longPageCompress: "claude-haiku-4-5-20251001",
} as const

export const DEEPSEEK_MODELS = {
  analysis: "deepseek-chat",
  define: "deepseek-chat",
} as const

export const OLLAMA_DEFAULTS = {
  endpoint: "http://localhost:11434",
  model: "llama3.1",
} as const

export const DEEPSEEK_DEFAULTS = {
  baseURL: "https://api.deepseek.com/v1",
} as const

export const DEFAULTS = {
  wpm: 250,
  dimOpacity: 0.4,
  pacerStyle: "band" as "band" | "underline" | "chunk",
  longPageTokenThreshold: 15_000,
  analysisCacheTtlMs: 1000 * 60 * 60 * 24 * 7,
  definitionCacheTtlMs: 1000 * 60 * 60 * 24 * 365,
  provider: "anthropic" as Provider,
}

export const PORTS = {
  analysis: "deepread.analysis",
} as const

export const STORAGE_KEYS = {
  apiKey: "deepread.apiKey",
  deepseekKey: "deepread.deepseekKey",
  settings: "deepread.settings",
  consent: "deepread.consent",
} as const
