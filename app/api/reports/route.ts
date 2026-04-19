import { NextResponse, type NextRequest } from "next/server"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { getManagerSession } from "@/lib/manager-auth"

/**
 * POST /api/reports  — reporter submits a new safety report.
 *
 * Multipart body:
 *   sap_code           (text)
 *   category           (text — one of the 8 enums)
 *   event_at           (ISO 8601)
 *   reporter_name      (text)
 *   reporter_phone     (text)
 *   description        (text, optional — 20–500 chars if present)
 *   photo              (File, REQUIRED — image/*, ≤10MB)
 *   audio              (File, optional — audio/*, ≤10MB)
 *
 * On success: { id: "SR-000057", status: "new" }
 *
 * Uses the service-role Supabase client (RLS bypass) to upload blobs to
 * Storage and insert the row — anon can't do either directly. Whisper
 * transcription is intentionally deferred to Phase E (fire-and-forget
 * from a separate endpoint).
 */

export const runtime = "nodejs"

const OBSERVATION_KEYS = new Set<string>([
  "near_miss",
  "unsafe_act",
  "unsafe_condition",
])
const ALL_CATEGORIES = new Set<string>([
  "near_miss",
  "unsafe_act",
  "unsafe_condition",
  "first_aid_case",
  "medical_treatment_case",
  "restricted_work_case",
  "lost_time_injury",
  "fatality",
])

const MAX_BLOB_BYTES = 10 * 1024 * 1024 // 10 MB
const TEXT_MIN = 20
const TEXT_MAX = 500
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000
const PHONE_RE = /^[+0-9\s()-]{7,}$/

function fail(reason: string, status = 400) {
  return NextResponse.json({ error: reason }, { status })
}

function extFromMime(mime: string | undefined, fallback: string): string {
  if (!mime) return fallback
  const m = mime.toLowerCase()
  if (m.includes("jpeg") || m.includes("jpg")) return "jpg"
  if (m.includes("png")) return "png"
  if (m.includes("webp")) return "webp"
  if (m.includes("webm")) return "webm"
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3"
  if (m.includes("mp4") || m.includes("m4a")) return "m4a"
  if (m.includes("ogg")) return "ogg"
  if (m.includes("wav")) return "wav"
  return fallback
}

/**
 * Strip codec parameters from a MIME type so it matches Supabase Storage's
 * `allowed_mime_types` exactly.
 *
 * MediaRecorder on Chrome hands us `audio/webm;codecs=opus` and Supabase
 * compares the full string against its allowlist of `audio/webm`, so the
 * upload 400s. Normalising to the "type/subtype" root fixes that without
 * needing a SQL migration on the bucket.
 */
function normaliseMime(mime: string | undefined, fallback: string): string {
  if (!mime) return fallback
  const head = mime.split(";")[0].trim().toLowerCase()
  return head || fallback
}

export async function POST(req: Request) {
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return fail("Expected multipart/form-data body.")
  }

  // --- extract + validate text fields ------------------------------------
  const sap_code = String(form.get("sap_code") ?? "").trim()
  const category = String(form.get("category") ?? "").trim()
  const event_at_raw = String(form.get("event_at") ?? "").trim()
  const reporter_name = String(form.get("reporter_name") ?? "").trim()
  const reporter_phone = String(form.get("reporter_phone") ?? "").trim()
  const description_raw = form.get("description")
  const description =
    typeof description_raw === "string" ? description_raw.trim() : ""

  if (!sap_code) return fail("Missing sap_code.")
  if (!ALL_CATEGORIES.has(category)) return fail("Invalid category.")
  if (reporter_name.length < 2) return fail("Reporter name is too short.")
  if (!PHONE_RE.test(reporter_phone)) return fail("Reporter phone is invalid.")

  // event_at: ISO, parseable, within last 7 days, not in the future.
  const event_at = new Date(event_at_raw)
  if (Number.isNaN(event_at.getTime())) return fail("Invalid event_at.")
  const now = Date.now()
  if (event_at.getTime() > now + 60_000) {
    return fail("Event time can't be in the future.")
  }
  if (now - event_at.getTime() > SEVEN_DAYS_MS) {
    return fail("Event time must be within the last 7 days.")
  }

  if (description && (description.length < TEXT_MIN || description.length > TEXT_MAX)) {
    return fail(`Description must be ${TEXT_MIN}–${TEXT_MAX} characters.`)
  }

  // --- files --------------------------------------------------------------
  const photoFile = form.get("photo")
  const audioFile = form.get("audio")

  if (!(photoFile instanceof Blob)) return fail("Photo is required.")
  if (photoFile.size === 0) return fail("Photo is empty.")
  if (photoFile.size > MAX_BLOB_BYTES) return fail("Photo exceeds 10 MB.")
  if (!photoFile.type.startsWith("image/")) {
    return fail("Photo must be an image.")
  }

  let audioBlob: Blob | null = null
  if (audioFile instanceof Blob && audioFile.size > 0) {
    if (audioFile.size > MAX_BLOB_BYTES) return fail("Audio exceeds 10 MB.")
    if (!audioFile.type.startsWith("audio/")) return fail("Audio must be an audio file.")
    audioBlob = audioFile
  }

  // Submit rule: photo + (voice OR description).
  if (!audioBlob && description.length === 0) {
    return fail("Either a voice note or a description is required.")
  }

  // --- DB client + store validation --------------------------------------
  const admin = createSupabaseAdminClient()

  const { data: store, error: storeErr } = await admin
    .from("v_store_public")
    .select("sap_code, status")
    .eq("sap_code", sap_code)
    .maybeSingle<{ sap_code: string; status: string }>()

  if (storeErr) {
    console.error("[api/reports] store lookup failed", storeErr)
    return fail("Store lookup failed.", 500)
  }
  if (!store || store.status !== "active") {
    return fail("Store is not available for new reports.", 404)
  }

  const type: "observation" | "incident" = OBSERVATION_KEYS.has(category)
    ? "observation"
    : "incident"

  // --- upload photo -------------------------------------------------------
  const stamp = Date.now()
  const rand = Math.random().toString(36).slice(2, 8)
  const photoExt = extFromMime(photoFile.type, "jpg")
  const photoPath = `${sap_code}/${stamp}-${rand}.${photoExt}`
  const photoContentType = normaliseMime(photoFile.type, "image/jpeg")

  const photoBuffer = Buffer.from(await photoFile.arrayBuffer())
  const { error: photoUpErr } = await admin.storage
    .from("photos")
    .upload(photoPath, photoBuffer, {
      contentType: photoContentType,
      upsert: false,
    })
  if (photoUpErr) {
    console.error(
      "[api/reports] photo upload failed",
      { path: photoPath, contentType: photoContentType, incoming: photoFile.type },
      photoUpErr,
    )
    return fail("Photo upload failed.", 500)
  }
  const { data: photoPub } = admin.storage.from("photos").getPublicUrl(photoPath)
  const photo_url = photoPub.publicUrl

  // --- upload audio (if any) ---------------------------------------------
  let audio_url: string | null = null
  if (audioBlob) {
    const audioExt = extFromMime(audioBlob.type, "webm")
    // Use a different random suffix so photo and audio can never collide in
    // storage paths even when rendered in the same millisecond.
    const audioRand = Math.random().toString(36).slice(2, 8)
    const audioPath = `${sap_code}/${stamp}-${audioRand}.${audioExt}`
    const audioContentType = normaliseMime(audioBlob.type, "audio/webm")
    const audioBuffer = Buffer.from(await audioBlob.arrayBuffer())
    const { error: audioUpErr } = await admin.storage
      .from("audio")
      .upload(audioPath, audioBuffer, {
        contentType: audioContentType,
        upsert: false,
      })
    if (audioUpErr) {
      console.error(
        "[api/reports] audio upload failed",
        { path: audioPath, contentType: audioContentType, incoming: audioBlob.type },
        audioUpErr,
      )
      // Best-effort clean up of the already-uploaded photo so we don't
      // leave orphans in storage.
      await admin.storage.from("photos").remove([photoPath])
      return fail("Audio upload failed.", 500)
    }
    const { data: audioPub } = admin.storage.from("audio").getPublicUrl(audioPath)
    audio_url = audioPub.publicUrl
  }

  // --- insert reports row -------------------------------------------------
  const insert: Record<string, unknown> = {
    store_code: sap_code,
    type,
    category,
    reporter_name,
    reporter_phone,
    photo_url,
    audio_url,
    description: description || null,
    incident_datetime: event_at.toISOString(),
    // id defaults to next_report_id(), status defaults to 'new'
  }

  const { data: inserted, error: insErr } = await admin
    .from("reports")
    .insert(insert)
    .select("id, status")
    .single<{ id: string; status: string }>()

  if (insErr || !inserted) {
    console.error("[api/reports] insert failed", insErr)
    // Roll back the uploaded blobs so the pair stays consistent.
    await admin.storage.from("photos").remove([photoPath]).catch(() => {})
    if (audio_url) {
      const audioPath = new URL(audio_url).pathname.split("/audio/").pop()
      if (audioPath) await admin.storage.from("audio").remove([audioPath]).catch(() => {})
    }
    return fail("Could not save the report.", 500)
  }

  return NextResponse.json({ id: inserted.id, status: inserted.status }, { status: 201 })
}

// ==========================================================================
// GET /api/reports?sap_code=<SAP>&status=new,returned
//
// Manager inbox feed. Authenticated by the sr_mgr cookie scoped to a single
// SAP code. Returns a PII-free shape:
//
//   { reports: [ { id, category, type, status, filed_at, incident_datetime,
//                  preview, has_photo, has_audio } ] }
//
// Notes:
//   - reporter_name / reporter_phone are intentionally excluded from the
//     SELECT so the manager's view of the data never carries them (hard
//     rule in CLAUDE.md "Design fidelity").
//   - `preview` is the first 80 chars of description or transcript, the
//     bits of a report the manager should see at a glance.
//   - Order: reported_at DESC, capped at 100. The pilot expects a handful
//     of reports per store; we'll revisit if we ever exceed that.
// ==========================================================================

const ALLOWED_STATUS_FILTERS = new Set<string>([
  "new",
  "in_progress",
  "awaiting_ho",
  "returned",
  "closed",
])

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const sap_code = url.searchParams.get("sap_code")?.trim() ?? ""
  const statusParam = url.searchParams.get("status")?.trim() ?? ""

  if (!sap_code) {
    return NextResponse.json({ error: "Missing sap_code." }, { status: 400 })
  }

  const session = await getManagerSession(sap_code)
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 })
  }

  // Parse comma-delimited status filter, or apply the default
  // "inbox that needs attention" set: new + returned.
  const requested = statusParam
    ? statusParam
        .split(",")
        .map((s) => s.trim())
        .filter((s) => ALLOWED_STATUS_FILTERS.has(s))
    : ["new", "returned"]

  if (requested.length === 0) {
    // statusParam was provided but every entry was invalid — return empty
    // rather than silently widening to "everything".
    return NextResponse.json({ reports: [] })
  }

  const admin = createSupabaseAdminClient()
  const { data, error } = await admin
    .from("reports")
    .select(
      "id, category, type, status, reported_at, acknowledged_at, incident_datetime, description, transcript, photo_url, audio_url",
    )
    .eq("store_code", sap_code)
    .in("status", requested)
    .order("reported_at", { ascending: false })
    .limit(100)

  if (error) {
    console.error("[api/reports GET] query failed", { sap_code, error })
    return NextResponse.json({ error: "Query failed." }, { status: 500 })
  }

  const rows = (data ?? []).map((r) => {
    // Prefer transcript (English) over the original description if Whisper
    // has run; otherwise fall back. Trim to 80 chars for the card preview.
    const src = (r.transcript as string | null) || (r.description as string | null) || ""
    const preview =
      src.length > 80 ? src.slice(0, 77).trimEnd() + "…" : src

    return {
      id: r.id as string,
      category: r.category as string,
      type: r.type as string,
      status: r.status as string,
      filed_at: r.reported_at as string,
      acknowledged_at: (r.acknowledged_at as string | null) ?? null,
      incident_datetime: r.incident_datetime as string,
      preview,
      has_photo: Boolean(r.photo_url),
      has_audio: Boolean(r.audio_url),
    }
  })

  return NextResponse.json({ reports: rows })
}

