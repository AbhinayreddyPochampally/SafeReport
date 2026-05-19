import "server-only"
import { NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"
import { revalidateTag } from "next/cache"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { classify } from "@/lib/classify"

/**
 * POST /api/classify — AI category suggestion for a report.
 *
 * Body: { report_id: string }
 *
 * Pilot iteration (mig 007, May 2026):
 *   - Text-in-text-out classifier on gpt-4o-mini. NO image input —
 *     just text. We accept either source: the English transcript from
 *     /api/transcribe (voice-note path) OR the reporter's typed
 *     description (text-only path). The classifier doesn't care which.
 *   - The only reports that skip AI classification are photo-only ones
 *     where the reporter neither spoke nor typed — those land on HO
 *     with no AI suggestion and the dropdown is the only path.
 *   - Live (not batched). The Phase Azure rollout will switch to the
 *     OpenAI Batch API for the 50% discount; the pilot runs live so
 *     HO sees the AI's pick within seconds of the manager submitting
 *     a resolution.
 *
 * Idempotent: skips if reports.suggested_category is already set. Safe
 * to call from multiple paths — both the transcribe route on Stage B
 * success and a manual replay don't double-charge.
 *
 * Persisted columns (see migration 007):
 *   - suggested_category : AI's pick, one of the 8 report_category enums
 *   - confidence         : 0..100 integer
 *   - category_source    : 'ai' (HO confirm flips it to 'ho-confirmed'
 *                          or 'ho-corrected' via /api/ho-actions)
 *
 * Fired fire-and-forget from /api/transcribe after a successful Stage B.
 */

export const runtime = "nodejs"
export const maxDuration = 60

const REPORT_ID = /^SR-\d{6,}$/

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

export async function POST(req: NextRequest) {
  const openaiKey = process.env.OPENAI_API_KEY
  if (!openaiKey) {
    console.warn("[classify] OPENAI_API_KEY is not set — skipping classification")
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

  // Pull all the grounding inputs in one round trip — transcript +
  // source-language transcript + typed description + store metadata.
  // The classifier uses everything it can to anchor the classification;
  // missing fields are silently dropped from the user message.
  const { data: report, error: lookupErr } = await admin
    .from("reports")
    .select(
      "id, transcript, transcript_source, transcript_source_lang, description, suggested_category, category, category_source, stores!inner(brand, name)",
    )
    .eq("id", reportId)
    .maybeSingle<{
      id: string
      transcript: string | null
      transcript_source: string | null
      transcript_source_lang: string | null
      description: string | null
      suggested_category: string | null
      category: string | null
      category_source: string | null
      stores: { brand: string; name: string } | null
    }>()

  if (lookupErr) {
    console.error("[classify] lookup failed", { reportId, lookupErr })
    return NextResponse.json({ error: "Lookup failed." }, { status: 500 })
  }
  if (!report) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 })
  }

  // Idempotency: skip if there's already a suggestion OR HO has already
  // confirmed a category (in which case the AI pick would be discarded
  // anyway).
  if (report.suggested_category) {
    return NextResponse.json(
      { skipped: true, reason: "already classified" },
      { status: 200 },
    )
  }
  if (report.category && report.category_source !== "ai") {
    return NextResponse.json(
      { skipped: true, reason: "ho already confirmed" },
      { status: 200 },
    )
  }
  // Need *some* text to classify on — either an English transcript from
  // /api/transcribe or a reporter-typed description. The submit rule
  // (photo + voice OR description) guarantees at least one of the two
  // for every report; photo-only is not allowed in the first place.
  // The only path that lands here with no text is "voice note attached
  // but transcription failed" — for those we leave suggested_category
  // null and HO picks via the dropdown.
  const transcriptText = report.transcript?.trim() ?? ""
  const descriptionText = report.description?.trim() ?? ""
  if (transcriptText.length === 0 && descriptionText.length === 0) {
    return NextResponse.json(
      { skipped: true, reason: "no text content available" },
      { status: 200 },
    )
  }

  const openai = new OpenAI({ apiKey: openaiKey })

  let result
  try {
    result = await classify(openai, {
      // Primary signal: the English transcript when present, otherwise
      // the typed description. The classifier prompt is generic enough
      // to handle either source — it just sees English text.
      transcript: transcriptText || descriptionText,
      // Pass the raw source-language transcript too. When translation
      // sands off nuance (Hinglish idiom, retail-floor slang) the source
      // sometimes carries information the English version doesn't.
      source_transcript: report.transcript_source,
      source_lang: report.transcript_source_lang,
      // Typed description as a second signal when both exist (e.g. the
      // reporter spoke AND typed something — rare but possible). When
      // ONLY description is present we pass it as the primary above; in
      // that case this field is redundant and the classify helper de-
      // dupes string-equal inputs.
      description:
        transcriptText.length > 0 ? report.description : null,
      // Store grounding. "Allen Solly · Mumbai" tells the model this is
      // a clothing retail store, biasing it toward trial-room /
      // mannequin / billing-counter vocabulary.
      brand: report.stores?.brand,
      store_name: report.stores?.name,
    })
  } catch (e) {
    const msg = errMessage(e)
    console.error("[classify] failed", { reportId, msg })
    // Note: we don't write a "classification_error" column — the HO UI
    // already handles a null suggested_category gracefully (dropdown-
    // only path). Logging is enough for ops follow-up.
    return NextResponse.json({ error: msg }, { status: 502 })
  }

  const { error: writeErr } = await admin
    .from("reports")
    .update({
      suggested_category: result.category,
      confidence: result.confidence,
      category_source: "ai",
    })
    .eq("id", reportId)

  if (writeErr) {
    console.error("[classify] DB write failed", { reportId, writeErr })
    return NextResponse.json(
      { error: "Classifier ran but DB write failed." },
      { status: 500 },
    )
  }

  // Structured success log — feeds offline calibration analysis once we
  // have a few hundred rows of HO confirm-vs-correct decisions. Fields
  // chosen so we can later compute per-category accuracy without a JOIN.
  console.info("[classify] ok", {
    reportId,
    category: result.category,
    confidence: result.confidence,
    sourceLang: report.transcript_source_lang ?? null,
    transcriptChars: transcriptText.length,
    descriptionChars: descriptionText.length,
    primarySource: transcriptText.length > 0 ? "transcript" : "description",
    hasSourceTranscript: Boolean(report.transcript_source),
  })

  // The HO Reports tab caches an "AI-suggested" filter set via this tag
  // (introduced in /ho/all-reports queries). Bust it so the report
  // surfaces on next render.
  revalidateTag("ho-overview-data")

  return NextResponse.json({
    ok: true,
    report_id: reportId,
    category: result.category,
    confidence: result.confidence,
  })
}
