#!/usr/bin/env node
/**
 * Rasterize src/icons/deepread.svg into the four Chrome-required PNG sizes.
 * Output goes to public/icons/, which Vite copies to dist/icons/ at build.
 *
 * Usage: pnpm icons
 */

import { Resvg } from "@resvg/resvg-js"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, "..")
const SRC = join(ROOT, "src", "icons", "deepread.svg")
const OUT_DIR = join(ROOT, "public", "icons")

const SIZES = [16, 32, 48, 128]

function main() {
  const svg = readFileSync(SRC)
  mkdirSync(OUT_DIR, { recursive: true })

  for (const size of SIZES) {
    const resvg = new Resvg(svg, {
      fitTo: { mode: "width", value: size },
      // Anti-aliased rendering; the default but worth being explicit.
      shapeRendering: 2,
      textRendering: 2,
      imageRendering: 0,
      // Transparent background outside the rounded rect (the rect itself
      // covers the whole 128x128, so nothing is actually transparent here).
      background: "rgba(0, 0, 0, 0)",
    })
    const png = resvg.render().asPng()
    const outPath = join(OUT_DIR, `${size}.png`)
    writeFileSync(outPath, png)
    console.log(`  ✓ ${size}x${size}  →  public/icons/${size}.png  (${png.length} bytes)`)
  }
}

main()
