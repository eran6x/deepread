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
  dimOpacity: 0.6,
  pacerStyle: "band" as "band" | "underline" | "chunk",
  longPageTokenThreshold: 15_000,
  analysisCacheTtlMs: 1000 * 60 * 60 * 24 * 7,
  definitionCacheTtlMs: 1000 * 60 * 60 * 24 * 365,
  provider: "anthropic" as Provider,
}

export const PALETTES = {
  default: {
    entity: { color: "oklch(0.88 0.12 240 / 0.55)", dark: "oklch(0.42 0.16 240 / 0.7)" },
    claim: { color: "oklch(0.9 0.16 90 / 0.6)", dark: "oklch(0.5 0.18 85 / 0.6)" },
    evidence: { color: "oklch(0.88 0.16 145 / 0.5)", dark: "oklch(0.45 0.18 145 / 0.6)" },
    number: { color: "oklch(0.88 0.16 25 / 0.5)", dark: "oklch(0.45 0.18 25 / 0.6)" },
  },
  "high-contrast": {
    entity: { color: "oklch(0.78 0.22 240 / 0.7)", dark: "oklch(0.55 0.22 240 / 0.85)" },
    claim: { color: "oklch(0.85 0.22 95 / 0.75)", dark: "oklch(0.6 0.22 90 / 0.8)" },
    evidence: { color: "oklch(0.78 0.22 145 / 0.7)", dark: "oklch(0.55 0.22 145 / 0.8)" },
    number: { color: "oklch(0.78 0.22 25 / 0.7)", dark: "oklch(0.55 0.22 25 / 0.8)" },
  },
  mono: {
    entity: { color: "oklch(0.88 0 0 / 0.6)", dark: "oklch(0.45 0 0 / 0.7)" },
    claim: { color: "oklch(0.85 0 0 / 0.6)", dark: "oklch(0.5 0 0 / 0.7)" },
    evidence: { color: "oklch(0.82 0 0 / 0.6)", dark: "oklch(0.55 0 0 / 0.7)" },
    number: { color: "oklch(0.78 0 0 / 0.6)", dark: "oklch(0.6 0 0 / 0.7)" },
  },
} as const

export const PORTS = {
  analysis: "deepread.analysis",
} as const

export const STORAGE_KEYS = {
  apiKey: "deepread.apiKey",
  deepseekKey: "deepread.deepseekKey",
  settings: "deepread.settings",
  consent: "deepread.consent",
} as const

export const TELEMETRY_LOG_PREFIX = "[Deepread.telemetry]"
