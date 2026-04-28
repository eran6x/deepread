export const ANALYSIS_SYSTEM_PROMPT = `You are Deepread, an analysis engine for a reading-aid Chrome extension whose users are professionals triaging long-form content. Your job is to produce a single structured analysis of an article that helps the user decide whether to read it and, if so, lets them read it faster without losing comprehension.

You will receive the article's title, URL, and extracted main text.

Call the submit_analysis tool exactly once with the full analysis. Do not produce any other output.

Guidelines:

VERDICT
- "skip": low signal, redundant with common knowledge, mostly opinion without evidence, or off-topic for the apparent intent of the title.
- "skim": some useful information but heavy boilerplate or low signal density.
- "read": dense in claims, evidence, or novel perspective worth full attention.
- The reason must be a single sentence specific to THIS article. Never generic.

BRIEF
- Exactly 3 bullets, each <=20 words.
- Cover the article's actual claims, not its topic. "The author argues X" not "this is about X".
- Lead with the most consequential claim.

SECTIONS
- One entry per logical section, not per HTML heading. Group short adjacent sections that share a thesis.
- char_range refers to offsets in the extracted text we sent you (0-indexed, end-exclusive).
- relevance:
  - "core": load-bearing for the main argument
  - "supporting": context, examples, caveats
  - "tangent": author digression, unrelated anecdote
  - "boilerplate": author bio, "subscribe to my newsletter", related-articles list, navigation, ads, cookie disclosures
- Be conservative on "tangent" and "boilerplate" — when in doubt, mark "supporting". A false boilerplate hurts the user more than a false core.

SPANS
- Highlight 4 categories of substantive content. Total spans should not exceed ~80 per 1000 words; aim for signal, not coverage.
  - "entity": named people, organizations, products, places that matter to the argument (skip ones mentioned only in passing)
  - "claim": author assertions, especially load-bearing ones
  - "evidence": numbers, citations, study names, concrete examples supporting a claim
  - "number": standalone notable figures (years, percentages, magnitudes)
- char_range must be valid (start < end, within text length, no overlap within the same category).
- Skip span detection inside code blocks and pre-formatted text.
- IMPORTANT: spans.category is ONLY ONE OF: entity, claim, evidence, number. NEVER use "core", "supporting", "tangent", or "boilerplate" here — those are section relevance values, NOT span categories.

DIFFICULTY
- "easy": general-audience prose, <=8th grade reading level
- "medium": some jargon or technical concepts, advanced reader
- "hard": dense technical, academic, or specialist content requiring background

EST_READ_TIME_MIN
- Compute from word count assuming 250 WPM. Round up. Minimum 1.

TOPICS
- Up to 5 short topic chips (1-3 words each). Order by importance.`

export const ANALYSIS_TOOL = {
  name: "submit_analysis",
  description: "Submit the structured analysis of the article.",
  input_schema: {
    type: "object",
    properties: {
      verdict: {
        type: "object",
        properties: {
          decision: { type: "string", enum: ["skip", "skim", "read"] },
          reason: { type: "string", maxLength: 160 },
        },
        required: ["decision", "reason"],
      },
      brief: {
        type: "array",
        items: { type: "string", maxLength: 120 },
        minItems: 3,
        maxItems: 3,
      },
      topics: {
        type: "array",
        items: { type: "string" },
        maxItems: 5,
      },
      est_read_time_min: { type: "integer", minimum: 1 },
      difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
      sections: {
        type: "array",
        items: {
          type: "object",
          properties: {
            heading: { type: "string" },
            char_range: {
              type: "array",
              items: { type: "integer", minimum: 0 },
              minItems: 2,
              maxItems: 2,
            },
            one_liner: { type: "string", maxLength: 140 },
            relevance: {
              type: "string",
              enum: ["core", "supporting", "tangent", "boilerplate"],
            },
          },
          required: ["heading", "char_range", "one_liner", "relevance"],
        },
      },
      spans: {
        type: "array",
        items: {
          type: "object",
          properties: {
            char_range: {
              type: "array",
              items: { type: "integer", minimum: 0 },
              minItems: 2,
              maxItems: 2,
            },
            category: {
              type: "string",
              enum: ["entity", "claim", "evidence", "number"],
            },
          },
          required: ["char_range", "category"],
        },
      },
    },
    required: [
      "verdict",
      "brief",
      "topics",
      "est_read_time_min",
      "difficulty",
      "sections",
      "spans",
    ],
  },
} as const

export const DEFINE_SYSTEM_PROMPT = `You are a dictionary lookup. Given a word and the sentence it appears in, return its definition in that context plus up to 3 synonyms.

Definition <=25 words. Plain prose, no quotation marks around the word. Synonyms must be single words or short phrases.

Call the submit_definition tool exactly once.`

export const DEFINE_TOOL = {
  name: "submit_definition",
  description: "Submit the definition and synonyms.",
  input_schema: {
    type: "object",
    properties: {
      definition: { type: "string", maxLength: 200 },
      synonyms: {
        type: "array",
        items: { type: "string" },
        maxItems: 3,
      },
    },
    required: ["definition", "synonyms"],
  },
} as const

/**
 * OpenAI-compatible representation of the analysis tool. Used by Ollama and
 * DeepSeek (and any other OpenAI-compatible provider) which expect the
 * `{ type: "function", function: {...} }` shape.
 */
export const ANALYSIS_TOOL_OPENAI = {
  type: "function" as const,
  function: {
    name: ANALYSIS_TOOL.name,
    description: ANALYSIS_TOOL.description,
    parameters: ANALYSIS_TOOL.input_schema,
  },
}

export const DEFINE_TOOL_OPENAI = {
  type: "function" as const,
  function: {
    name: DEFINE_TOOL.name,
    description: DEFINE_TOOL.description,
    parameters: DEFINE_TOOL.input_schema,
  },
}

export function buildAnalysisUserMessage(input: {
  title: string
  url: string
  text: string
}): string {
  return `Title: ${input.title}
URL: ${input.url}

---ARTICLE TEXT---
${input.text}`
}

export function buildDefineUserMessage(word: string, sentence: string): string {
  return `word: "${word}"
sentence: "${sentence}"`
}
