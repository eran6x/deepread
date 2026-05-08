import { ASK_SYSTEM_PROMPT_TEMPLATE, buildAskSystemPrompt } from "@/background/llm/prompts"
import { describe, expect, it } from "vitest"

describe("buildAskSystemPrompt", () => {
  it("substitutes title, url, and text into the template", () => {
    const out = buildAskSystemPrompt({
      title: "Rate limiting",
      url: "https://example.com/x",
      text: "Body of the article.",
    })
    expect(out).toContain("Article title: Rate limiting")
    expect(out).toContain("Article URL: https://example.com/x")
    expect(out).toContain("Body of the article.")
    expect(out).not.toContain("{{title}}")
    expect(out).not.toContain("{{url}}")
    expect(out).not.toContain("{{text}}")
  })

  it("matches the snapshot for stable wording", () => {
    expect(ASK_SYSTEM_PROMPT_TEMPLATE).toMatchInlineSnapshot(`
      "You are a Q&A assistant for one specific article. Your only knowledge of this article is the text provided below. You have no other context, no internet access, and no general-knowledge mode.

      Rules:
      - Only answer questions that can be addressed using the article text.
      - If the article does not contain the information needed, say so explicitly. Do not speculate. Do not fill from outside knowledge.
      - If the question is not about this article (general knowledge, unrelated topics, requests to write code, tell jokes, etc.), refuse with one sentence: "I can only answer questions about this article." Then suggest 2-3 questions the article could actually answer.
      - Cite the article by quoting short phrases (under 15 words) or paraphrasing specific claims. Keep answers concise — 2 to 4 sentences unless explicitly asked for more.
      - Do not editorialize or add commentary not in the article.

      Article title: {{title}}
      Article URL: {{url}}

      ---ARTICLE TEXT---
      {{text}}"
    `)
  })
})
