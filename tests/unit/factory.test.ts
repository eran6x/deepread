import { normalizeOllamaBaseURL } from "@/background/llm/factory"
import { describe, expect, it } from "vitest"

describe("normalizeOllamaBaseURL", () => {
  it("appends /v1 when missing", () => {
    expect(normalizeOllamaBaseURL("http://localhost:11434")).toBe("http://localhost:11434/v1")
  })

  it("preserves /v1 when already present", () => {
    expect(normalizeOllamaBaseURL("http://localhost:11434/v1")).toBe("http://localhost:11434/v1")
  })

  it("strips trailing slashes before appending", () => {
    expect(normalizeOllamaBaseURL("http://localhost:11434/")).toBe("http://localhost:11434/v1")
    expect(normalizeOllamaBaseURL("http://localhost:11434///")).toBe("http://localhost:11434/v1")
  })

  it("trims whitespace", () => {
    expect(normalizeOllamaBaseURL("  http://localhost:11434  ")).toBe("http://localhost:11434/v1")
  })

  it("works with custom hosts", () => {
    expect(normalizeOllamaBaseURL("http://my-server.lan:8080")).toBe("http://my-server.lan:8080/v1")
  })
})
