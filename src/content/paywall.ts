/**
 * Heuristic paywall detector. Runs in the content script after Readability
 * extraction. We combine multiple weak signals and only fire the warning when
 * at least two coincide — false positives are more annoying than false
 * negatives because the user still gets analysis either way.
 */

const PAYWALL_HOSTS = new Set([
  "nytimes.com",
  "wsj.com",
  "ft.com",
  "bloomberg.com",
  "theatlantic.com",
  "newyorker.com",
  "economist.com",
  "washingtonpost.com",
  "medium.com",
  "businessinsider.com",
  "wired.com",
  "thetimes.co.uk",
  "telegraph.co.uk",
])

const PAYWALL_TEXT_PATTERNS = [
  /subscribe to (continue|read|keep reading)/i,
  /already a subscriber/i,
  /for subscribers only/i,
  /this article is for subscribers/i,
  /create a free account to (continue|read)/i,
  /you've reached your (article|free) limit/i,
  /sign in to continue reading/i,
]

const PAYWALL_SELECTORS = [
  '[class*="paywall" i]',
  '[id*="paywall" i]',
  "[data-paywall]",
  '[class*="subscription-wall" i]',
  '[class*="meter-wall" i]',
  '[class*="gate-wall" i]',
  '[class*="reg-wall" i]',
  '[class*="regwall" i]',
]

export interface PaywallDetection {
  suspected: boolean
  reason: string | null
}

export function detectPaywall(
  doc: Document,
  extractedText: string,
  hostname: string,
): PaywallDetection {
  const reasons: string[] = []

  if (hasPaywallElement(doc)) reasons.push("subscription overlay detected")
  if (hasPaywallText(doc)) reasons.push("subscriber-gate copy detected")
  if (looksTruncated(extractedText)) reasons.push("truncated mid-sentence")
  if (extractedFallsShortOfDom(doc, extractedText)) reasons.push("most of the body is hidden")

  // Known-paywalled host alone isn't enough — require corroboration.
  const onPaywallHost = isPaywallHost(hostname)
  if (onPaywallHost) reasons.push("known paywalled site")

  // Need at least 2 distinct signals; "known paywalled site" alone shouldn't fire.
  const strongSignals = reasons.filter((r) => r !== "known paywalled site")
  if (strongSignals.length >= 2 || (strongSignals.length >= 1 && onPaywallHost)) {
    return { suspected: true, reason: strongSignals[0] ?? "known paywalled site" }
  }
  return { suspected: false, reason: null }
}

function hasPaywallElement(doc: Document): boolean {
  for (const sel of PAYWALL_SELECTORS) {
    try {
      const el = doc.querySelector(sel)
      if (el && isVisible(el as HTMLElement)) return true
    } catch {
      // invalid selector in some engines — ignore
    }
  }
  return false
}

function hasPaywallText(doc: Document): boolean {
  const main = doc.querySelector("article, main, [role='main']") ?? doc.body
  if (!main) return false
  // Only scan the trailing portion of the body — paywall copy is near the end.
  const text = (main.textContent ?? "").slice(-3000)
  return PAYWALL_TEXT_PATTERNS.some((re) => re.test(text))
}

function looksTruncated(text: string): boolean {
  const trimmed = text.trim()
  if (trimmed.length < 400) return false
  const tail = trimmed.slice(-200)
  // No terminal punctuation in the last 200 chars suggests a mid-sentence cut.
  return !/[.!?…”"')\]]\s*$/.test(tail)
}

function extractedFallsShortOfDom(doc: Document, extractedText: string): boolean {
  const main = doc.querySelector("article, main, [role='main']") ?? doc.body
  if (!main) return false
  const domLen = (main.textContent ?? "").trim().length
  const exLen = extractedText.trim().length
  if (domLen < 1500 || exLen < 200) return false
  // Readability normally returns most of the article body. A big gap suggests
  // it discarded a "subscribe" trailer — or that paywall content is sitting
  // outside the readable region.
  return exLen / domLen < 0.55
}

function isPaywallHost(hostname: string): boolean {
  if (!hostname) return false
  const host = hostname.replace(/^www\./, "").toLowerCase()
  if (PAYWALL_HOSTS.has(host)) return true
  // Also match subdomain matches against base domains.
  for (const known of PAYWALL_HOSTS) {
    if (host.endsWith(`.${known}`)) return true
  }
  return false
}

function isVisible(el: HTMLElement): boolean {
  const style = el.ownerDocument?.defaultView?.getComputedStyle?.(el)
  if (!style) return true // jsdom or other env without computed style — assume visible
  if (style.display === "none" || style.visibility === "hidden") return false
  if (style.opacity && Number(style.opacity) === 0) return false
  return true
}
