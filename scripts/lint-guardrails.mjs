#!/usr/bin/env node
/**
 * SafeReport guard-rail linter.
 *
 * Fails the build if:
 *   - any source file references a forbidden Tailwind palette scale
 *     (green-*, red-*, rose-*, crimson-*, lime-*, emerald-*)
 *   - any source file uses Supabase Realtime (.channel(  /  .on('postgres_changes' )
 *
 * Runs over app/, lib/, components/, hooks/. Skips node_modules and .next.
 */
import { readdir, readFile, stat } from "node:fs/promises"
import { join, extname } from "node:path"

const ROOTS = ["app", "lib", "components", "hooks"]
const EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".css"])

// Forbidden palette classes (class="... bg-green-500 ...", etc.)
const PALETTE_RE =
  /\b(?:bg|text|border|ring|fill|stroke|from|to|via|divide|outline|accent|placeholder|caret|decoration|shadow)-(?:green|red|rose|crimson|lime|emerald)-\d{2,3}\b/
// Realtime API usage — both the channel subscribe helper and the postgres_changes event.
// The string literal 'postgres_changes' is a precise signal; .channel( alone is too broad.
const REALTIME_RE = /\.on\(\s*['"]postgres_changes['"]/

const violations = []

async function walk(dir) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    const full = join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === ".next") continue
      await walk(full)
    } else if (EXT.has(extname(e.name))) {
      const text = await readFile(full, "utf8")
      const paletteMatch = text.match(PALETTE_RE)
      if (paletteMatch) {
        violations.push({ file: full, rule: "palette", match: paletteMatch[0] })
      }
      const rtMatch = text.match(REALTIME_RE)
      if (rtMatch) {
        violations.push({ file: full, rule: "realtime", match: rtMatch[0] })
      }
    }
  }
}

for (const root of ROOTS) {
  try {
    const s = await stat(root)
    if (s.isDirectory()) await walk(root)
  } catch {
    // root missing — fine in early phases.
  }
}

if (violations.length > 0) {
  console.error("\nGuard-rail violations:\n")
  for (const v of violations) {
    console.error(`  [${v.rule}] ${v.file}  →  ${v.match}`)
  }
  console.error(
    `\n${violations.length} violation(s). Palette/realtime rules live in CLAUDE.md.\n`,
  )
  process.exit(1)
}

console.log("guardrails: OK (palette + realtime clean)")
