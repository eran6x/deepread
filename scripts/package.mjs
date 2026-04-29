#!/usr/bin/env node
/**
 * Build the extension and zip it into ./releases/ for distribution to testers.
 *
 * Usage: pnpm package
 *
 * Produces: releases/deepread-vX.Y.Z.zip
 *
 * The zip's *contents* (not the dist/ folder itself) are at the archive root,
 * so testers unzipping it get a folder they can point "Load unpacked" at.
 */

import { execSync } from "node:child_process"
import { createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { createGzip } from "node:zlib"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, "..")
const DIST = join(ROOT, "dist")
const RELEASES = join(ROOT, "releases")

function main() {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"))
  const manifest = JSON.parse(readFileSync(join(ROOT, "src", "manifest.json"), "utf8"))

  if (pkg.version !== manifest.version) {
    console.error(
      `\n  ✗ Version mismatch:\n    package.json:       ${pkg.version}\n    src/manifest.json:  ${manifest.version}\n\n  Update both to the same value before packaging.\n`,
    )
    process.exit(1)
  }

  console.log(`Building deepread v${pkg.version}…`)
  execSync("pnpm build", { stdio: "inherit", cwd: ROOT })

  if (!existsSync(DIST)) {
    console.error("dist/ not found after build")
    process.exit(1)
  }

  if (!existsSync(RELEASES)) mkdirSync(RELEASES)
  const zipPath = join(RELEASES, `deepread-v${pkg.version}.zip`)

  console.log(`\nZipping ${DIST} → ${zipPath}`)
  // Use the system zip; built-in to macOS/Linux. On Windows, requires WSL or
  // a separate zip binary on PATH.
  try {
    execSync(`zip -r -X "${zipPath}" .`, { cwd: DIST, stdio: "inherit" })
  } catch {
    console.error("\n  ✗ `zip` command failed. Install zip or run on macOS/Linux/WSL.\n")
    process.exit(1)
  }

  const sizeKB = Math.round(statSync(zipPath).size / 1024)
  console.log(`\n  ✓ Packaged: releases/deepread-v${pkg.version}.zip (${sizeKB} kB)`)
  console.log("\nNext: send the zip + INSTALL_FOR_TESTERS.md to your testers.\n")
}

main()
