import type { AnalysisResult } from "@/shared/schema"

export interface ArticleMeta {
  title: string
  url: string
}

export function formatAsMarkdown(result: AnalysisResult, article: ArticleMeta): string {
  const lines: string[] = []

  lines.push(`# ${article.title}`)
  lines.push("")
  lines.push(article.url)
  lines.push("")
  lines.push(
    `**Verdict: ${result.verdict.decision.toUpperCase()}** · ${result.est_read_time_min} min · ${result.difficulty}`,
  )
  lines.push("")
  lines.push(`> ${result.verdict.reason}`)
  lines.push("")

  lines.push("## Brief")
  lines.push("")
  for (const bullet of result.brief) lines.push(`- ${bullet}`)
  lines.push("")

  if (result.topics.length > 0) {
    lines.push("## Topics")
    lines.push("")
    lines.push(result.topics.join(" · "))
    lines.push("")
  }

  if (result.sections.length > 0) {
    lines.push("## Sections")
    lines.push("")
    for (const s of result.sections) {
      lines.push(`- **${s.heading}** — ${s.one_liner} *(${s.relevance})*`)
    }
    lines.push("")
  }

  lines.push("---")
  lines.push(`*Analyzed by Deepread on ${dateStamp()}*`)

  return lines.join("\n")
}

export function slug(s: string): string {
  const cleaned = s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
  return cleaned.length > 0 ? cleaned : "article"
}

export function dateStamp(): string {
  return new Date().toISOString().slice(0, 10)
}

export function downloadMarkdown(markdown: string, filename: string): void {
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
