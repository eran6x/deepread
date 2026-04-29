/**
 * Sensitive-domain block-list. Activation is refused on these by default;
 * the user must explicitly override per-domain.
 *
 * Patterns: bare hostnames match exact host or any subdomain. Patterns
 * starting with `*.` match the suffix only.
 */
export const SENSITIVE_DOMAINS: readonly string[] = [
  // Email
  "gmail.com",
  "mail.google.com",
  "outlook.live.com",
  "outlook.office.com",
  "mail.yahoo.com",
  "fastmail.com",
  "proton.me",
  "protonmail.com",
  "hey.com",
  // Calendar
  "calendar.google.com",
  // Banking (top retail; user can add more)
  "chase.com",
  "bankofamerica.com",
  "wellsfargo.com",
  "citi.com",
  "capitalone.com",
  "usbank.com",
  "americanexpress.com",
  "discover.com",
  "ally.com",
  "schwab.com",
  "fidelity.com",
  "vanguard.com",
  // Health portals
  "mychart.com",
  "*.epic.com",
  "*.cerner.com",
  "patientportal.com",
  "healthvault.com",
  // Workspace tools
  "slack.com",
  "notion.so",
  "figma.com",
  "*.atlassian.net",
  "linear.app",
  "asana.com",
  "monday.com",
  "trello.com",
  "*.zendesk.com",
  // SSO providers
  "okta.com",
  "auth0.com",
  "login.microsoftonline.com",
  "accounts.google.com",
  "*.onelogin.com",
  // Government / tax
  "irs.gov",
  "ssa.gov",
  "usa.gov",
  // Cloud admin consoles
  "console.aws.amazon.com",
  "console.cloud.google.com",
  "portal.azure.com",
]

export function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return null
  }
}

export function matchesPattern(hostname: string, pattern: string): boolean {
  if (pattern.startsWith("*.")) {
    const suffix = pattern.slice(2)
    return hostname === suffix || hostname.endsWith(`.${suffix}`)
  }
  return hostname === pattern || hostname.endsWith(`.${pattern}`)
}

export function isSensitiveHost(url: string, extraBlocked: readonly string[] = []): boolean {
  const host = hostnameOf(url)
  if (!host) return false
  // Heuristic: anything that smells like an internal/intranet host
  if (/(^|\.)internal\./.test(host)) return true
  if (/(^|\.)intranet\./.test(host)) return true
  if (/(^|\.)corp\./.test(host)) return true
  if (host.endsWith(".local")) return true
  for (const p of SENSITIVE_DOMAINS) if (matchesPattern(host, p)) return true
  for (const p of extraBlocked) if (matchesPattern(host, p)) return true
  return false
}
