import { extractGoogleDocId } from "@/shared/source"
import type { ExtractedArticle } from "@/shared/types"

export class GoogleDocError extends Error {
  constructor(
    message: string,
    readonly reason: "invalid_url" | "gdoc_not_authorized" | "gdoc_not_found" | "network" | "empty",
  ) {
    super(message)
    this.name = "GoogleDocError"
  }
}

export async function extractGoogleDoc(url: string): Promise<ExtractedArticle> {
  const id = extractGoogleDocId(url)
  if (!id) throw new GoogleDocError("Not a Google Docs URL", "invalid_url")

  const exportUrl = `https://docs.google.com/document/d/${id}/export?format=txt`

  let response: Response
  try {
    response = await fetch(exportUrl, { credentials: "include" })
  } catch (err) {
    throw new GoogleDocError(
      `Network error fetching Google Doc: ${err instanceof Error ? err.message : String(err)}`,
      "network",
    )
  }

  if (response.status === 401 || response.status === 403) {
    throw new GoogleDocError(
      "Google Doc is not viewable with your current session. Open the doc in your browser, or ask the owner to share it.",
      "gdoc_not_authorized",
    )
  }
  if (response.status === 404) {
    throw new GoogleDocError("Google Doc not found.", "gdoc_not_found")
  }
  if (!response.ok) {
    throw new GoogleDocError(`Google Doc export failed (HTTP ${response.status})`, "network")
  }

  const text = (await response.text()).replace(/﻿/g, "").trim()
  if (text.length === 0) {
    throw new GoogleDocError("Google Doc is empty.", "empty")
  }

  const title = inferTitle(text) ?? "Google Doc"

  return {
    title,
    byline: null,
    text,
    html: "",
    lang: null,
    excerpt: null,
    siteName: "Google Docs",
    url,
    paywallSuspected: false,
    paywallReason: null,
  }
}

function inferTitle(text: string): string | null {
  const firstLine = text.split(/\r?\n/).find((line) => line.trim().length > 0)
  if (!firstLine) return null
  const trimmed = firstLine.trim()
  return trimmed.length > 140 ? `${trimmed.slice(0, 137)}…` : trimmed
}
