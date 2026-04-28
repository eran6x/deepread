/**
 * Scoped CSS for the reader-mode shadow root. Returned as a string so we can
 * inject it into a `<style>` element inside the shadow.
 */
export const READER_CSS = `
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

.brand {
  font-weight: 600;
  letter-spacing: -0.01em;
}

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

.close-btn {
  border: 1px solid oklch(0.85 0 0);
  background: white;
  color: oklch(0.25 0 0);
  border-radius: 6px;
  padding: 6px 12px;
  font: inherit;
  font-weight: 500;
  cursor: pointer;
}
.close-btn:hover { background: oklch(0.95 0 0); }
@media (prefers-color-scheme: dark) {
  .close-btn {
    border-color: oklch(0.32 0 0);
    background: oklch(0.22 0 0);
    color: oklch(0.92 0 0);
  }
  .close-btn:hover { background: oklch(0.28 0 0); }
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

.article-content {
  position: relative;
}

/*
 * Asymmetric focus transitions: snap into focus on entry, fade out slowly
 * on exit. The base rule's transition applies whenever an element matches
 * only the base — i.e., when .is-active is removed, the slow timing kicks in
 * to dim. The .is-active rule's faster transition applies when the class is
 * added, snapping into full opacity.
 */
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
  opacity: 0.6;
}

.article-content[data-focus="on"] .is-active {
  opacity: 1;
  transition: opacity 80ms ease-out;
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
  mix-blend-mode: multiply;
}

.hl--entity   { background: oklch(0.88 0.12 240 / 0.55); }
.hl--claim    { background: oklch(0.9  0.16 90  / 0.6 ); }
.hl--evidence { background: oklch(0.88 0.16 145 / 0.5 ); }
.hl--number   { background: oklch(0.88 0.16 25  / 0.5 ); }

@media (prefers-color-scheme: dark) {
  .hl { mix-blend-mode: screen; }
  .hl--entity   { background: oklch(0.42 0.16 240 / 0.7); }
  .hl--claim    { background: oklch(0.5  0.18 85  / 0.6); }
  .hl--evidence { background: oklch(0.45 0.18 145 / 0.6); }
  .hl--number   { background: oklch(0.45 0.18 25  / 0.6); }
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
`
