import "server-only"
import { NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

/**
 * POST /api/transcribe — voice-note transcription + English translation.
 *
 * Body: { report_id: string }
 *
 * Pipeline v2 (May 2026):
 *   1. Stage A — transcribe with `gpt-4o-transcribe` (auto-detects source
 *      language; better recall than whisper-1 on Indian languages
 *      especially Kannada/Tamil/Telugu — verified via OpenAI's published
 *      WER benchmarks). Falls back to `whisper-1` if the new model errors.
 *   2. Stage B — translate the source-language transcript to English with
 *      `gpt-4o-mini` chat completion. Domain-aware system prompt that
 *      preserves location/equipment/time details and uses formal English.
 *      Skipped when the source is already English.
 *
 * Stored fields:
 *   transcript              English translation (or original if English)
 *   transcript_source       The raw source-language transcript
 *   transcript_source_lang  ISO-639-1 code returned by the transcriber
 *   transcript_error        Set on failure; the UI surfaces a banner
 *
 * Why two stages instead of `audio.translations.create`:
 *   - Whisper's translations endpoint outputs English directly but loses
 *     the source-language transcript (audit trail).
 *   - The new model + GPT-4o translator measurably improves accuracy on
 *     domain-specific vocab (equipment names, store-floor terminology)
 *     because we can prompt the translator with safety-domain context.
 *
 * Invoked fire-and-forget from /api/reports right after the row insert.
 * Up to 3 attempts per stage with exponential backoff.
 */

export const runtime = "nodejs"
export const maxDuration = 90 // two-stage pipeline; some headroom

const REPORT_ID = /^SR-\d{6,}$/
const MAX_ATTEMPTS = 3
const BASE_BACKOFF_MS = 1000

const TRANSCRIBE_PRIMARY_MODEL = "gpt-4o-transcribe"
const TRANSCRIBE_FALLBACK_MODEL = "whisper-1"
const TRANSLATE_MODEL = "gpt-4o-mini"

/** Whisper / gpt-4o-transcribe accept an optional `prompt` to bias decoding.
 * We include workplace-safety vocabulary so domain terms (PPE, LOTO, fire
 * extinguisher, mannequin, mezzanine, billing counter) come through right. */
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRetryable(err: unknown): boolean {
  if (!err || typeof err !== "object") return true
  const e = err as { status?: number }
  if (typeof e.status === "number") {
    if (e.status === 429) return true
    if (e.status >= 500 && e.status < 600) return true
    return false
  }
  return true
}

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

/** Stricter "is this already English?" gate. The previous version trusted
 * ASCII-char ratio alone, which let transliterated Hinglish ("didi gir gayi
 * billing counter ke paas") through to HO un-translated. Now we require
 * BOTH that the text be ASCII-only AND contain at least two whole-word
 * English stopwords. When in doubt we fall through to the translator —
 * GPT-4o-mini's system prompt returns English-as-input verbatim, so
 * over-translating costs pennies; under-translating leaves Hindi text in
 * HO's inbox. */
function looksLikeEnglish(text: string): boolean {
  if (!text) return false
  const trimmed = text.trim()
  if (trimmed.length === 0) return false
  // Reject anything with non-ASCII chars (Devanagari/Tamil/Kannada/Telugu).
  for (const ch of trimmed) {
    if (ch.charCodeAt(0) >= 128) return false
  }
  // Require at least 2 whole-word English stopword hits.
  const stops = /\b(the|a|an|is|are|was|were|and|or|to|of|in|on|at|for|with|from|that|this|it|i|we|they|he|she|you|have|has|had|did|not|no|so|as|near|when|after|before)\b/gi
  return (trimmed.match(stops)?.length ?? 0) >= 2
}

type TranscribeResult = {
  text: string
  language: string | null
  modelUsed: string
}

/**
 * Detect the ISO 639-1 language code from a transcript using Unicode-block
 * heuristics first (fast, deterministic, zero-cost), then fall back to a
 * tiny chat-completion call for ambiguous Latin-script inputs.
 *
 * Why this exists: `gpt-4o-transcribe` with `response_format: "json"` does
 * not currently return a `language` field, so `stageA.language` was null
 * on every transcription and the downstream pipeline lost two things:
 *   (a) the ability to skip Stage B for genuinely-English audio,
 *   (b) a useful `transcript_source_lang` value on the report row.
 * The Unicode pass covers Devanagari/Kannada/Telugu/Tamil/Gujarati/Bengali
 * without an extra API call; only Latin-script ambiguity (English vs.
 * romanised Hindi etc.) falls through to the LLM.
 */
function detectLanguageFromScript(text: string): string | null {
  // Devanagari covers Hindi + Marathi. Disambiguating between them from a
  // single sentence is unreliable; we tag both as "hi" because Whisper /
  // gpt-4o-transcribe historically returns "hi" for either, and the
  // downstream translator handles both identically.
  if (/[ऀ-ॿ]/.test(text)) return "hi"
  if (/[ಀ-೿]/.test(text)) return "kn" // Kannada
  if (/[ఀ-౿]/.test(text)) return "te" // Telugu
  if (/[஀-௿]/.test(text)) return "ta" // Tamil
  if (/[઀-૿]/.test(text)) return "gu" // Gujarati
  if (/[ঀ-৿]/.test(text)) return "bn" // Bengali
  if (/[਀-੿]/.test(text)) return "pa" // Punjabi (Gurmukhi)
  if (/[ഀ-ൿ]/.test(text)) return "ml" // Malayalam
  return null
}

async function detectLanguageWithLLM(
  openai: OpenAI,
  text: string,
): Promise<string | null> {
  // 60-token cap, near-zero temperature. The whole call costs a few
  // hundredths of a cent and adds ~300ms — well worth it to give HO a
  // meaningful language label.
  try {
    const result = await openai.chat.completions.create({
      model: TRANSLATE_MODEL,
      temperature: 0,
      max_tokens: 8,
      messages: [
        {
          role: "system",
          content:
            "Return only the ISO 639-1 two-letter language code (e.g. 'en', 'hi', 'kn', 'te', 'mr', 'ta', 'bn') of the user's text. If mixed, return the dominant language. No punctuation, no quotes.",
        },
        { role: "user", content: text.slice(0, 400) },
      ],
    })
    const code = result.choices[0]?.message?.content?.trim().toLowerCase() ?? ""
    if (/^[a-z]{2}$/.test(code)) return code
    return null
  } catch (e) {
    console.warn("[transcribe] language detect via LLM failed", errMessage(e))
    return null
  }
}

async function runTranscription(
  openai: OpenAI,
  audioFile: File,
): Promise<TranscribeResult> {
  let lastError: unknown = null

  for (const model of [TRANSCRIBE_PRIMARY_MODEL, TRANSCRIBE_FALLBACK_MODEL]) {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        // For both models we ask for verbose_json so we get language code +
        // transcript; gpt-4o-transcribe returns text+language, whisper-1
        // returns the full verbose payload. Field shape is compatible.
        const result = await openai.audio.transcriptions.create({
          model,
          file: audioFile,
          // gpt-4o-transcribe currently supports response_format "json" or
          // "text" (no verbose_json yet). whisper-1 supports verbose_json.
          // We branch on model so each gets the richest format it supports.
          ...(model === TRANSCRIBE_FALLBACK_MODEL
            ? { response_format: "verbose_json" as const }
            : { response_format: "json" as const }),
          prompt: TRANSCRIPTION_PROMPT,
        })

        const text =
          typeof result === "string"
            ? result
            : ((result as { text?: string }).text ?? "")
        const language =
          typeof result === "object" && result !== null
            ? ((result as { language?: string }).language ?? null)
            : null

        return {
          text: text.trim(),
          language: language?.toLowerCase() ?? null,
          modelUsed: model,
        }
      } catch (e) {
        lastError = e
        const retryable = isRetryable(e)
        console.warn("[transcribe] stage A attempt failed", {
          model,
          attempt,
          retryable,
          message: errMessage(e),
        })
        if (!retryable) break // try next model
        if (attempt === MAX_ATTEMPTS) break
        await sleep(BASE_BACKOFF_MS * Math.pow(2, attempt - 1))
      }
    }
  }

  throw lastError ?? new Error("All transcription attempts failed")
}

async function runTranslation(
  openai: OpenAI,
  sourceText: string,
  sourceLang: string | null,
): Promise<string> {
  let lastError: unknown = null
  const langHint = sourceLang
    ? `\n\nThe source language is "${sourceLang}".`
    : ""

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const result = await openai.chat.completions.create({
        model: TRANSLATE_MODEL,
        temperature: 0.1,
        max_tokens: 800,
        messages: [
          {
            role: "system",
            content: TRANSLATION_SYSTEM_PROMPT + langHint,
          },
          {
            role: "user",
            content: sourceText,
          },
        ],
      })
      const text = result.choices[0]?.message?.content?.trim() ?? ""
      return text
    } catch (e) {
      lastError = e
      const retryable = isRetryable(e)
      console.warn("[transcribe] stage B attempt failed", {
        attempt,
        retryable,
        message: errMessage(e),
      })
      if (!retryable || attempt === MAX_ATTEMPTS) break
      await sleep(BASE_BACKOFF_MS * Math.pow(2, attempt - 1))
    }
  }

  throw lastError ?? new Error("All translation attempts failed")
}

export async function POST(req: NextRequest) {
  const openaiKey = process.env.OPENAI_API_KEY
  if (!openaiKey) {
    console.warn("[transcribe] OPENAI_API_KEY is not set — skipping transcription")
    return NextResponse.json(
      { skipped: true, reason: "OPENAI_API_KEY missing" },
      { status: 200 },
    )
  }

  let body: { report_id?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 })
  }

  const reportId = body.report_id?.trim() ?? ""
  if (!REPORT_ID.test(reportId)) {
    return NextResponse.json({ error: "Invalid report_id." }, { status: 400 })
  }

  const admin = createSupabaseAdminClient()

  const { data: report, error: lookupErr } = await admin
    .from("reports")
    .select("id, audio_url, transcript")
    .eq("id", reportId)
    .maybeSingle<{
      id: string
      audio_url: string | null
      transcript: string | null
    }>()

  if (lookupErr) {
    console.error("[transcribe] lookup failed", { reportId, lookupErr })
    return NextResponse.json({ error: "Lookup failed." }, { status: 500 })
  }
  if (!report) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 })
  }
  if (!report.audio_url) {
    return NextResponse.json(
      { skipped: true, reason: "no audio attached" },
      { status: 200 },
    )
  }
  if (report.transcript) {
    return NextResponse.json(
      { skipped: true, reason: "already transcribed" },
      { status: 200 },
    )
  }

  // Fetch audio bytes ----------------------------------------------------
  let audioBuffer: ArrayBuffer
  let mimeHint = "audio/webm"
  try {
    const fetchResp = await fetch(report.audio_url)
    if (!fetchResp.ok) throw new Error(`audio fetch ${fetchResp.status}`)
    mimeHint = fetchResp.headers.get("content-type") ?? mimeHint
    audioBuffer = await fetchResp.arrayBuffer()
  } catch (e) {
    const msg = errMessage(e)
    console.error("[transcribe] audio fetch failed", { reportId, msg })
    await admin
      .from("reports")
      .update({ transcript_error: `Could not fetch audio: ${msg}` })
      .eq("id", reportId)
    return NextResponse.json({ error: "Audio fetch failed." }, { status: 500 })
  }

  let ext = "webm"
  if (mimeHint.includes("mpeg") || mimeHint.includes("mp3")) ext = "mp3"
  else if (mimeHint.includes("mp4") || mimeHint.includes("m4a")) ext = "m4a"
  else if (mimeHint.includes("ogg")) ext = "ogg"
  else if (mimeHint.includes("wav")) ext = "wav"

  const audioFile = new File([audioBuffer], `${reportId}.${ext}`, {
    type: mimeHint.split(";")[0].trim() || "audio/webm",
  })

  const openai = new OpenAI({ apiKey: openaiKey })

  // Stage A — transcribe ------------------------------------------------
  let stageA: TranscribeResult
  try {
    stageA = await runTranscription(openai, audioFile)
  } catch (e) {
    const msg = errMessage(e)
    await admin
      .from("reports")
      .update({ transcript_error: `Transcription failed: ${msg.slice(0, 400)}` })
      .eq("id", reportId)
    return NextResponse.json({ error: msg }, { status: 502 })
  }

  if (stageA.text.length === 0) {
    await admin
      .from("reports")
      .update({
        transcript_error: "No speech detected in the voice note.",
        transcript_source: "",
        transcript_source_lang: stageA.language,
      })
      .eq("id", reportId)
    return NextResponse.json({ transcript: "", empty: true })
  }

  // Resolve the source language. gpt-4o-transcribe with response_format
  // "json" returns no `language` field, so we fall back to a Unicode-block
  // sniff and (if still ambiguous) a tiny LLM call. Without this fix the
  // pipeline persisted `transcript_source_lang = null` for every report.
  let resolvedLang: string | null = stageA.language
  if (!resolvedLang) {
    resolvedLang = detectLanguageFromScript(stageA.text)
  }
  if (!resolvedLang) {
    resolvedLang = await detectLanguageWithLLM(openai, stageA.text)
  }

  // Stage B — translate (skip if source is already English) -------------
  let englishText = stageA.text
  let translationSkipped = false
  const isEnglishSource =
    (resolvedLang && resolvedLang.startsWith("en")) ||
    looksLikeEnglish(stageA.text)

  if (!isEnglishSource) {
    try {
      englishText = await runTranslation(openai, stageA.text, resolvedLang)
      if (englishText === "NO_INTELLIGIBLE_SPEECH") {
        await admin
          .from("reports")
          .update({
            transcript_error: "Voice note was not intelligible.",
            transcript_source: stageA.text,
            transcript_source_lang: resolvedLang,
          })
          .eq("id", reportId)
        return NextResponse.json({ transcript: "", unintelligible: true })
      }
    } catch (e) {
      // Translation failed but transcription succeeded — store the source
      // and surface the error. HO can still read the source-language text
      // if they happen to speak it; the manager UI shows transcript_source
      // when translation is missing.
      const msg = errMessage(e)
      console.error("[transcribe] translation failed", { reportId, msg })
      await admin
        .from("reports")
        .update({
          transcript_source: stageA.text,
          transcript_source_lang: resolvedLang,
          transcript_error: `Translation failed: ${msg.slice(0, 400)}`,
        })
        .eq("id", reportId)
      return NextResponse.json(
        { error: "Translation failed (transcript saved)." },
        { status: 502 },
      )
    }
  } else {
    translationSkipped = true
  }

  // Persist --------------------------------------------------------------
  const { error: writeErr } = await admin
    .from("reports")
    .update({
      transcript: englishText,
      transcript_source: stageA.text,
      transcript_source_lang: resolvedLang,
      transcript_error: null,
    })
    .eq("id", reportId)

  if (writeErr) {
    console.error("[transcribe] DB write failed", { reportId, writeErr })
    return NextResponse.json(
      { error: "Pipeline succeeded but DB write failed." },
      { status: 500 },
    )
  }

  console.info("[transcribe] ok", {
    reportId,
    sourceModel: stageA.modelUsed,
    sourceLang: resolvedLang,
    sourceLangFromModel: stageA.language,
    englishChars: englishText.length,
    sourceChars: stageA.text.length,
    translationSkipped,
  })

  return NextResponse.json({
    transcript: englishText,
    transcript_source: stageA.text,
    transcript_source_lang: stageA.language,
    translation_skipped: translationSkipped,
  })
}
