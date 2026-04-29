import { PALETTES } from "@/shared/constants"
import type { HighlightPalette, ReaderUISettings } from "@/shared/types"

export function buildReaderCSS(settings: ReaderUISettings): string {
  const palette = settings.palette in PALETTES ? settings.palette : "default"
  const colors = PALETTES[palette as HighlightPalette]
  const dim = settings.dimOpacity
  const cats = settings.categories
  const isUnderline = settings.highlightStyle === "underline"

  // Underline mode: 3px colored bar at the bottom via box-shadow, transparent
  // background. Always readable.
  // Fill mode: classic highlighter look. In light mode uses multiply blend.
  // In dark mode we tone down the alpha and skip the screen blend entirely
  // so text stays legible.
  const fillBg = (cat: keyof typeof cats, mode: "light" | "dark") =>
    cats[cat] && !isUnderline ? colors[cat][mode === "dark" ? "dark" : "color"] : "transparent"

  const underlineShadow = (cat: keyof typeof cats, mode: "light" | "dark") =>
    cats[cat] && isUnderline
      ? `inset 0 -3px 0 ${colors[cat][mode === "dark" ? "dark" : "color"]}`
      : "none"

  return `
:host {
  all: initial;
  position: fixed;
  inset: 0;
  z-index: 2147483647;
}

.root {
  position: fixed;
  inset: 0;
  background: oklch(0.99 0 0);
  color: oklch(0.18 0 0);
  font-family: ui-serif, Georgia, "Times New Roman", serif;
  font-size: 18px;
  line-height: 1.65;
  overflow-y: auto;
  overflow-x: hidden;
}

@media (prefers-color-scheme: dark) {
  .root {
    background: oklch(0.16 0 0);
    color: oklch(0.92 0 0);
  }
}

.toolbar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  background: oklch(0.99 0 0 / 0.95);
  backdrop-filter: saturate(180%) blur(8px);
  border-bottom: 1px solid oklch(0.92 0 0);
  font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
  font-size: 13px;
}

@media (prefers-color-scheme: dark) {
  .toolbar {
    background: oklch(0.16 0 0 / 0.95);
    border-bottom-color: oklch(0.28 0 0);
  }
}

.brand { font-weight: 600; letter-spacing: -0.01em; }

.brand-tag {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 999px;
  background: oklch(0.92 0 0);
  color: oklch(0.42 0 0);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

@media (prefers-color-scheme: dark) {
  .brand-tag {
    background: oklch(0.28 0 0);
    color: oklch(0.78 0 0);
  }
}

.toolbar-buttons { display: flex; gap: 6px; align-items: center; }

.tool-btn {
  border: 1px solid oklch(0.85 0 0);
  background: white;
  color: oklch(0.25 0 0);
  border-radius: 6px;
  padding: 5px 10px;
  font: inherit;
  font-weight: 500;
  cursor: pointer;
}
.tool-btn:hover { background: oklch(0.95 0 0); }
.tool-btn[data-active="true"] {
  background: oklch(0.25 0 0);
  color: white;
  border-color: oklch(0.25 0 0);
}

@media (prefers-color-scheme: dark) {
  .tool-btn {
    border-color: oklch(0.32 0 0);
    background: oklch(0.22 0 0);
    color: oklch(0.92 0 0);
  }
  .tool-btn:hover { background: oklch(0.28 0 0); }
  .tool-btn[data-active="true"] {
    background: oklch(0.95 0 0);
    color: oklch(0.18 0 0);
    border-color: oklch(0.95 0 0);
  }
}

.pacer-status {
  font-size: 11px;
  color: oklch(0.45 0 0);
  white-space: nowrap;
}

.article-wrap {
  position: relative;
  max-width: 720px;
  margin: 24px auto 96px;
  padding: 0 24px;
}

.article-title {
  font-family: ui-serif, Georgia, serif;
  font-weight: 700;
  font-size: 32px;
  line-height: 1.2;
  margin: 16px 0 8px;
}

.article-meta {
  font-family: ui-sans-serif, system-ui, sans-serif;
  font-size: 13px;
  color: oklch(0.5 0 0);
  margin-bottom: 28px;
}

.section-oneliner {
  font-family: ui-sans-serif, system-ui, sans-serif;
  font-size: 13px;
  font-style: italic;
  color: oklch(0.45 0.06 270);
  margin: 4px 0 12px 0;
  padding: 6px 10px;
  border-left: 2px solid oklch(0.7 0.12 270);
  background: oklch(0.97 0.02 270);
  border-radius: 0 4px 4px 0;
}

@media (prefers-color-scheme: dark) {
  .section-oneliner {
    color: oklch(0.78 0.1 270);
    background: oklch(0.22 0.04 270);
    border-left-color: oklch(0.55 0.15 270);
  }
}

.article-content { position: relative; }

/* Asymmetric focus transitions: snap-in fast, fade-out slow. */
.article-content p,
.article-content li,
.article-content blockquote,
.article-content h1,
.article-content h2,
.article-content h3,
.article-content h4 {
  transition: opacity 600ms ease-out;
}

.article-content[data-focus="on"] p:not(.is-active),
.article-content[data-focus="on"] li:not(.is-active),
.article-content[data-focus="on"] blockquote:not(.is-active),
.article-content[data-focus="on"] h1:not(.is-active),
.article-content[data-focus="on"] h2:not(.is-active),
.article-content[data-focus="on"] h3:not(.is-active),
.article-content[data-focus="on"] h4:not(.is-active) {
  opacity: ${dim};
}

.article-content[data-focus="on"] .is-active {
  opacity: 1;
  transition: opacity 80ms ease-out;
}

/* Tangent / boilerplate dimming. */
.article-content[data-tangents="hide"] [data-tangent="true"] {
  opacity: 0.3 !important;
  filter: saturate(0.5);
}
.article-content[data-tangents="hide"] [data-tangent="boilerplate"] {
  opacity: 0.2 !important;
}

.article-content img,
.article-content figure {
  max-width: 100%;
  height: auto;
}

.article-content pre,
.article-content code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.92em;
  background: oklch(0.96 0 0);
  border-radius: 4px;
}
.article-content pre {
  padding: 12px;
  overflow-x: auto;
}
.article-content code { padding: 1px 4px; }
@media (prefers-color-scheme: dark) {
  .article-content pre,
  .article-content code { background: oklch(0.22 0 0); }
}

.article-content blockquote {
  margin: 16px 0;
  padding: 4px 0 4px 16px;
  border-left: 3px solid oklch(0.85 0 0);
  color: oklch(0.45 0 0);
}

.highlight-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 0;
}

.hl {
  position: absolute;
  border-radius: 2px;
  pointer-events: none;
  ${isUnderline ? "" : "mix-blend-mode: multiply;"}
}

.hl--entity   { background: ${fillBg("entity", "light")};   box-shadow: ${underlineShadow("entity", "light")}; }
.hl--claim    { background: ${fillBg("claim", "light")};    box-shadow: ${underlineShadow("claim", "light")}; }
.hl--evidence { background: ${fillBg("evidence", "light")}; box-shadow: ${underlineShadow("evidence", "light")}; }
.hl--number   { background: ${fillBg("number", "light")};   box-shadow: ${underlineShadow("number", "light")}; }

@media (prefers-color-scheme: dark) {
  .hl {
    ${isUnderline ? "" : "mix-blend-mode: normal;"}
  }
  /* In dark + fill mode, use lower-alpha tints so text remains readable. */
  .hl--entity   { background: ${cats.entity && !isUnderline ? "oklch(0.55 0.18 240 / 0.3)" : "transparent"}; box-shadow: ${underlineShadow("entity", "dark")}; }
  .hl--claim    { background: ${cats.claim && !isUnderline ? "oklch(0.6 0.18 85 / 0.3)" : "transparent"}; box-shadow: ${underlineShadow("claim", "dark")}; }
  .hl--evidence { background: ${cats.evidence && !isUnderline ? "oklch(0.55 0.18 145 / 0.3)" : "transparent"}; box-shadow: ${underlineShadow("evidence", "dark")}; }
  .hl--number   { background: ${cats.number && !isUnderline ? "oklch(0.55 0.18 25 / 0.3)" : "transparent"}; box-shadow: ${underlineShadow("number", "dark")}; }
}

.legend {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  font-family: ui-sans-serif, system-ui, sans-serif;
  font-size: 11px;
  color: oklch(0.45 0 0);
}
.legend-item { display: inline-flex; align-items: center; gap: 4px; }
.legend-swatch {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  display: inline-block;
}
/* Legend swatches are always solid fills regardless of highlight style. */
.swatch-entity   { background: ${colors.entity.color}; }
.swatch-claim    { background: ${colors.claim.color}; }
.swatch-evidence { background: ${colors.evidence.color}; }
.swatch-number   { background: ${colors.number.color}; }
@media (prefers-color-scheme: dark) {
  .swatch-entity   { background: ${colors.entity.dark}; }
  .swatch-claim    { background: ${colors.claim.dark}; }
  .swatch-evidence { background: ${colors.evidence.dark}; }
  .swatch-number   { background: ${colors.number.dark}; }
}

/* Pacer cursor */
.pacer-cursor {
  position: absolute;
  pointer-events: none;
  z-index: 1;
  border-radius: 3px;
  background: oklch(0.6 0.2 270 / 0.35);
  box-shadow: 0 0 0 1px oklch(0.55 0.2 270 / 0.6);
  transition: left 80ms linear, top 80ms linear, width 80ms linear;
}
@media (prefers-color-scheme: dark) {
  .pacer-cursor {
    background: oklch(0.7 0.2 270 / 0.4);
    box-shadow: 0 0 0 1px oklch(0.7 0.2 270 / 0.7);
  }
}

/* Click-to-define popover */
.define-popover {
  font-family: ui-sans-serif, system-ui, sans-serif;
  background: oklch(0.99 0 0);
  color: oklch(0.18 0 0);
  border: 1px solid oklch(0.85 0 0);
  border-radius: 8px;
  padding: 10px 12px;
  width: 280px;
  font-size: 13px;
  line-height: 1.45;
  box-shadow: 0 6px 20px oklch(0 0 0 / 0.18);
  animation: pop-in 120ms ease-out;
}
@keyframes pop-in {
  from { opacity: 0; transform: translateY(2px); }
  to   { opacity: 1; transform: translateY(0); }
}
@media (prefers-color-scheme: dark) {
  .define-popover {
    background: oklch(0.22 0 0);
    color: oklch(0.92 0 0);
    border-color: oklch(0.32 0 0);
  }
}
.define-word {
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 4px;
}
.define-meaning { color: oklch(0.32 0 0); }
@media (prefers-color-scheme: dark) {
  .define-meaning { color: oklch(0.85 0 0); }
}
.define-loading { color: oklch(0.5 0 0); font-style: italic; }
.define-error { color: oklch(0.45 0.18 25); }
.define-synonyms {
  margin-top: 6px;
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}
.define-syn {
  background: oklch(0.94 0 0);
  border-radius: 999px;
  padding: 1px 8px;
  font-size: 11px;
  color: oklch(0.4 0 0);
}
@media (prefers-color-scheme: dark) {
  .define-syn {
    background: oklch(0.28 0 0);
    color: oklch(0.78 0 0);
  }
}
`
}
