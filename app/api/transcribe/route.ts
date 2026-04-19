import "server-only"
import { NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

/**
 * POST /api/transcribe — Whisper transcription worker.
 *
 * Body: { report_id: string }
 *
 * Invoked fire-and-forget from /api/reports right after the row is
 * inserted. Downloads the report's audio from Supabase Storage, calls
 * `openai.audio.translations.create` (always-English output, language-
 * agnostic input — the reporter might be speaking Hindi, Marathi,
 * Tamil, etc.), and writes the result back to `reports.transcript`.
 *
 * Error handling:
 *   - Up to 3 attempts with exponential backoff (1s, 2s, 4s)
 *   - On final failure, writes `transcript_error = <message>` so the
 *     manager detail surfaces a "Transcript unavailable — play the
 *     audio" banner (the UI already honours this column)
 *
 * This endpoint is intentionally publicly invocable from the same
 * origin — it only exposes audio URLs that are already public, and
 * it validates report_id shape. For extra belt-and-braces we check
 * that the report exists and has an audio_url before doing anything.
 *
 * Not exposed as a user-facing action — no cookie auth needed.
 */

export const runtime = "nodejs"
export const maxDuration = 60 // seconds — Whisper can take a while on long clips

const REPORT_ID = /^SR-\d{6,}$/
const MAX_ATTEMPTS = 3
const BASE_BACKOFF_MS = 1000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Decide whether the Whisper error is worth retrying. Rate limits /
 * timeouts / 5xx should retry; a 400 "audio too short" or 401 is
 * permanent and wastes an attempt.
 */
function isRetryable(err: unknown): boolean {
  if (!err || typeof err !== "object") return true
  const e = err as { status?: number; code?: string }
  if (typeof e.status === "number") {
    if (e.status === 429) return true
    if (e.status >= 500 && e.status < 600) return true
    return false
  }
  // Network-ish — retry.
  return true
}

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
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

  // Pull the audio URL. Guard against double-invocation: if a transcript
  // already exists, don't redo the work.
  const { data: report, error: lookupErr } = await admin
    .from("reports")
    .select("id, audio_url, transcript")
    .eq("id", reportId)
    .maybeSingle<{ id: string; audio_url: string | null; transcript: string | null }>()

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

  // Download the audio bytes. The URL is the public storage URL we
  // stored at submit time, so a plain fetch works.
  let audioBuffer: ArrayBuffer
  let mimeHint = "audio/webm"
  try {
    const fetchResp = await fetch(report.audio_url)
    if (!fetchResp.ok) {
      throw new Error(`audio fetch ${fetchResp.status}`)
    }
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

  const openai = new OpenAI({ apiKey: openaiKey })

  // Whisper's SDK wants a File-like object; in Node 20 the global File
  // constructor is fine to use with the OpenAI node-fetch shim.
  let ext = "webm"
  if (mimeHint.includes("mpeg") || mimeHint.includes("mp3")) ext = "mp3"
  else if (mimeHint.includes("mp4") || mimeHint.includes("m4a")) ext = "m4a"
  else if (mimeHint.includes("ogg")) ext = "ogg"
  else if (mimeHint.includes("wav")) ext = "wav"

  const audioFile = new File([audioBuffer], `${reportId}.${ext}`, {
    type: mimeHint.split(";")[0].trim() || "audio/webm",
  })

  let transcript: string | null = null
  let lastError: unknown = null

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const result = await openai.audio.translations.create({
        model: "whisper-1",
        file: audioFile,
        response_format: "text",
      })
      // With response_format: "text" the SDK returns a raw string.
      const text = typeof result === "string" ? result : (result as { text?: string }).text ?? ""
      transcript = text.trim()
      break
    } catch (e) {
      lastError = e
      const retryable = isRetryable(e)
      console.warn("[transcribe] attempt failed", {
        reportId,
        attempt,
        retryable,
        message: errMessage(e),
      })
      if (!retryable || attempt === MAX_ATTEMPTS) break
      await sleep(BASE_BACKOFF_MS * Math.pow(2, attempt - 1))
    }
  }

  if (transcript === null) {
    const msg = errMessage(lastError ?? new Error("unknown transcription error"))
    await admin
      .from("reports")
      .update({ transcript_error: msg.slice(0, 500) })
      .eq("id", reportId)
    return NextResponse.json({ error: msg }, { status: 502 })
  }

  if (transcript.length === 0) {
    // Whisper returned nothing — treat as "no speech detected" rather
    // than an error. Still flag it so the UI doesn't look broken.
    await admin
      .from("reports")
      .update({ transcript_error: "No speech detected in the voice note." })
      .eq("id", reportId)
    return NextResponse.json({ transcript: "", empty: true })
  }

  const { error: writeErr } = await admin
    .from("reports")
    .update({ transcript, transcript_error: null })
    .eq("id", reportId)

  if (writeErr) {
    console.error("[transcribe] DB write failed", { reportId, writeErr })
    return NextResponse.json(
      { error: "Transcript computed but DB write failed." },
      { status: 500 },
    )
  }

  console.info("[transcribe] ok", {
    reportId,
    chars: transcript.length,
    mime: mimeHint,
  })

  return NextResponse.json({ transcript })
}
