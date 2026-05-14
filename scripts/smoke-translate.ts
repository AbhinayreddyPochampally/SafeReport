/**
 * scripts/smoke-translate.ts
 *
 * Smoke test for the translation pipeline (gpt-4o-transcribe → gpt-4o-mini
 * translate). Runs the same two-stage flow that /api/transcribe runs, but
 * against local audio files so we can iterate on prompts and language
 * coverage without spinning up the full app.
 *
 * Usage:
 *   1. Drop test audio files into scripts/test-audio/ named with their
 *      language code as a prefix:
 *        kn_loose-tile.webm
 *        hi_wet-floor.m4a
 *        ta_fire-extinguisher.mp3
 *        te_emergency-exit.webm
 *        en_first-aid.webm
 *      The two-letter prefix is informational only — the pipeline still
 *      auto-detects the language. It just helps you label the report.
 *   2. Set OPENAI_API_KEY in .env.local (already there for the app).
 *   3. Run:
 *        npx tsx scripts/smoke-translate.ts
 *      or to test a single file:
 *        npx tsx scripts/smoke-translate.ts scripts/test-audio/kn_loose-tile.webm
 *
 * Output:
 *   - Per-file stdout report (model used, source language, source transcript,
 *     English translation, latency).
 *   - A markdown summary written to scripts/test-audio/_results.md so you
 *     can review across languages and share with the team.
 *
 * Exit code: 0 if every file produced a non-empty English translation,
 *            1 otherwise.
 */

// Load .env.local first (where the live key lives), then fall back to .env.
import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.local" })
loadEnv()

import fs from "node:fs"
import path from "node:path"
import OpenAI from "openai"

const TRANSCRIBE_PRIMARY_MODEL = "gpt-4o-transcribe"
const TRANSCRIBE_FALLBACK_MODEL = "whisper-1"
const TRANSLATE_MODEL = "gpt-4o-mini"

const TRANSCRIPTION_PROMPT =
  "Workplace safety incident report from an Indian retail clothing store. " +
  "Common terms: store, mall, billing counter, trial room, fitting room, " +
  "mannequin, hanger, ladder, mezzanine, stockroom, fire extinguisher, " +
  "first aid kit, electrical wiring, water leak, slip, spill, manager, " +
  "customer, near miss, unsafe condition, unsafe act, fatality, injury."

const TRANSLATION_SYSTEM_PROMPT = `You translate workplace safety incident reports from Indian retail stores into clear, formal English.

Rules:
- Output only the English translation. No preamble, no notes, no quotes around it.
- Preserve every concrete detail: locations (e.g. "near trial room 3"), equipment names, times, body parts, severity descriptions.
- Handle code-mixing gracefully: Indian retail floor speech freely mixes Hindi/Kannada/Telugu/Tamil/Marathi grammar with English nouns ("billing counter", "trial room", "mannequin", "AC unit", "first aid kit"). Keep the English nouns as English nouns; translate only the surrounding language.
- Use formal English suitable for a Head Office safety officer to read.
- If the input is already English, return it as-is with only minimal cleanup (punctuation, capitalisation).
- Be generous with imperfect transcripts: voice-note transcription introduces minor spelling/word errors. If you can reasonably infer the intended safety meaning, translate it. Only output NO_INTELLIGIBLE_SPEECH when the input is genuinely random characters, pure noise, or empty — never for a transcript that mostly makes sense but has rough spots.
- Do not add interpretation, recommendations, or context that wasn't in the source.`

// Mirror of detectLanguageFromScript() in app/api/transcribe/route.ts so
// the smoke output matches what the production pipeline will report.
function detectLanguageFromScript(text: string): string | null {
  if (/[ऀ-ॿ]/.test(text)) return "hi"
  if (/[ಀ-೿]/.test(text)) return "kn"
  if (/[ఀ-౿]/.test(text)) return "te"
  if (/[஀-௿]/.test(text)) return "ta"
  if (/[઀-૿]/.test(text)) return "gu"
  if (/[ঀ-৿]/.test(text)) return "bn"
  if (/[਀-੿]/.test(text)) return "pa"
  if (/[ഀ-ൿ]/.test(text)) return "ml"
  return null
}

type FileResult = {
  file: string
  langPrefix: string | null
  detectedLang: string | null
  transcribeModel: string
  sourceText: string
  englishText: string
  transcribeMs: number
  translateMs: number
  totalMs: number
  ok: boolean
  error?: string
}

async function transcribeFile(
  openai: OpenAI,
  filePath: string,
): Promise<{ text: string; lang: string | null; model: string; ms: number }> {
  const started = Date.now()
  let lastError: unknown = null

  for (const model of [TRANSCRIBE_PRIMARY_MODEL, TRANSCRIBE_FALLBACK_MODEL]) {
    try {
      const file = fs.createReadStream(filePath)
      const result = await openai.audio.transcriptions.create({
        model,
        file,
        ...(model === TRANSCRIBE_FALLBACK_MODEL
          ? { response_format: "verbose_json" as const }
          : { response_format: "json" as const }),
        prompt: TRANSCRIPTION_PROMPT,
      })
      const text =
        typeof result === "string"
          ? result
          : ((result as { text?: string }).text ?? "")
      const lang =
        typeof result === "object" && result !== null
          ? ((result as { language?: string }).language ?? null)
          : null
      return {
        text: text.trim(),
        lang: lang?.toLowerCase() ?? null,
        model,
        ms: Date.now() - started,
      }
    } catch (e) {
      lastError = e
      console.warn(`  [transcribe] ${model} failed:`, errMessage(e))
    }
  }
  throw lastError ?? new Error("All transcription models failed")
}

async function translateText(
  openai: OpenAI,
  sourceText: string,
  sourceLang: string | null,
): Promise<{ text: string; ms: number }> {
  const started = Date.now()
  const langHint = sourceLang
    ? `\n\nThe source language is "${sourceLang}".`
    : ""
  const result = await openai.chat.completions.create({
    model: TRANSLATE_MODEL,
    temperature: 0.1,
    max_tokens: 800,
    messages: [
      { role: "system", content: TRANSLATION_SYSTEM_PROMPT + langHint },
      { role: "user", content: sourceText },
    ],
  })
  const text = result.choices[0]?.message?.content?.trim() ?? ""
  return { text, ms: Date.now() - started }
}

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

function looksLikeEnglish(text: string): boolean {
  if (!text) return false
  let asciiCount = 0
  for (const ch of text) if (ch.charCodeAt(0) < 128) asciiCount += 1
  return asciiCount / text.length > 0.95 && /[aeiouAEIOU]/.test(text)
}

async function processFile(
  openai: OpenAI,
  filePath: string,
): Promise<FileResult> {
  const file = path.basename(filePath)
  const langPrefix = (file.match(/^([a-z]{2})[_-]/i)?.[1] ?? null)?.toLowerCase() ?? null

  const result: FileResult = {
    file,
    langPrefix,
    detectedLang: null,
    transcribeModel: "",
    sourceText: "",
    englishText: "",
    transcribeMs: 0,
    translateMs: 0,
    totalMs: 0,
    ok: false,
  }

  const t0 = Date.now()
  try {
    const stageA = await transcribeFile(openai, filePath)
    result.detectedLang = stageA.lang
    result.transcribeModel = stageA.model
    result.sourceText = stageA.text
    result.transcribeMs = stageA.ms

    if (!stageA.text) {
      result.englishText = ""
      result.error = "no speech detected"
    } else {
      // Fill in a language code when the transcription model didn't
      // return one — Unicode-block sniff, no extra API call required.
      if (!result.detectedLang) {
        result.detectedLang = detectLanguageFromScript(stageA.text)
      }
      const isEnglish =
        (result.detectedLang && result.detectedLang.startsWith("en")) ||
        looksLikeEnglish(stageA.text)
      if (isEnglish) {
        result.englishText = stageA.text
        result.ok = true
      } else {
        const stageB = await translateText(
          openai,
          stageA.text,
          result.detectedLang,
        )
        result.englishText = stageB.text
        result.translateMs = stageB.ms
        result.ok = stageB.text.length > 0 && stageB.text !== "NO_INTELLIGIBLE_SPEECH"
        if (!result.ok) result.error = stageB.text || "empty translation"
      }
    }
  } catch (e) {
    result.error = errMessage(e)
  }
  result.totalMs = Date.now() - t0
  return result
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY missing. Add it to .env.local and retry.")
    process.exit(1)
  }

  const argFile = process.argv[2]
  const audioDir = path.join("scripts", "test-audio")

  let files: string[]
  if (argFile) {
    files = [argFile]
  } else {
    if (!fs.existsSync(audioDir)) {
      console.error(`Test audio folder ${audioDir} doesn't exist.`)
      console.error("Drop your .webm/.mp3/.m4a samples in there and retry.")
      console.error("Suggested naming: <lang2>_<short-description>.<ext>")
      console.error("  kn_loose-tile.webm  hi_wet-floor.m4a  ta_pallet.mp3  te_exit.webm")
      process.exit(1)
    }
    files = fs
      .readdirSync(audioDir)
      .filter((f) => /\.(webm|mp3|m4a|ogg|wav|mp4)$/i.test(f))
      .sort()
      .map((f) => path.join(audioDir, f))
  }

  if (files.length === 0) {
    console.error(`No audio files found in ${audioDir}.`)
    process.exit(1)
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  console.log(`\nRunning translation smoke test on ${files.length} file(s)…\n`)
  const results: FileResult[] = []
  for (const fp of files) {
    process.stdout.write(`• ${path.basename(fp)} … `)
    const r = await processFile(openai, fp)
    results.push(r)
    if (r.ok) {
      console.log(
        `ok (${r.detectedLang ?? "?"}, ${r.totalMs}ms) — ${r.englishText.slice(0, 80)}${r.englishText.length > 80 ? "…" : ""}`,
      )
    } else {
      console.log(`FAIL — ${r.error ?? "unknown"}`)
    }
  }

  // Detailed per-file dump
  console.log("\n" + "=".repeat(72))
  for (const r of results) {
    console.log(`\nFile: ${r.file}`)
    console.log(`  Prefix lang:   ${r.langPrefix ?? "(none)"}`)
    console.log(`  Detected lang: ${r.detectedLang ?? "(none)"}`)
    console.log(`  Model A:       ${r.transcribeModel}`)
    console.log(`  Stage A: ${r.transcribeMs}ms, Stage B: ${r.translateMs}ms, Total: ${r.totalMs}ms`)
    console.log(`  Source:  ${r.sourceText || "(empty)"}`)
    console.log(`  English: ${r.englishText || "(empty)"}`)
    if (r.error) console.log(`  Error:   ${r.error}`)
  }

  // Markdown summary
  const md: string[] = []
  md.push("# Translation pipeline smoke test")
  md.push("")
  md.push(`Run at: ${new Date().toISOString()}`)
  md.push(`Models: transcribe=${TRANSCRIBE_PRIMARY_MODEL} (fallback ${TRANSCRIBE_FALLBACK_MODEL}), translate=${TRANSLATE_MODEL}`)
  md.push("")
  md.push("| File | Prefix | Detected | Model A | Total ms | Source | English | OK |")
  md.push("|---|---|---|---|---:|---|---|:---:|")
  for (const r of results) {
    const src = (r.sourceText || "").replace(/\|/g, "\\|").slice(0, 80)
    const eng = (r.englishText || "").replace(/\|/g, "\\|").slice(0, 80)
    md.push(
      `| ${r.file} | ${r.langPrefix ?? "—"} | ${r.detectedLang ?? "—"} | ${r.transcribeModel} | ${r.totalMs} | ${src} | ${eng} | ${r.ok ? "✓" : "✗"} |`,
    )
  }
  md.push("")
  md.push(`**Pass rate: ${results.filter((r) => r.ok).length}/${results.length}**`)
  if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true })
  fs.writeFileSync(path.join(audioDir, "_results.md"), md.join("\n"))
  console.log(`\nSummary written to ${path.join(audioDir, "_results.md")}`)

  const failed = results.filter((r) => !r.ok)
  process.exit(failed.length === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error("Smoke test crashed:", e)
  process.exit(2)
})
