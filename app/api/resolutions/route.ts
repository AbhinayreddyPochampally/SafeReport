import { NextResponse, type NextRequest } from "next/server"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { getManagerSession } from "@/lib/manager-auth"

/**
 * POST /api/resolutions — manager files a fix for a report.
 *
 * Multipart body:
 *   report_id  (text — SR-NNNNNN)
 *   note       (text — 20–500 chars, what was done)
 *   photo      (File — proof photo, REQUIRED, image/*, ≤10MB)
 *
 * Effects (server-side, in order):
 *   1. Validate the manager's session scopes to the report's store
 *   2. Load the report; accept only if status is one of {new, in_progress, returned}
 *   3. Upload proof photo to the `resolutions` bucket
 *   4. Insert a resolutions row with attempt_number = (max+1) for this report
 *   5. Flip the report's status to 'awaiting_ho'
 *
 * Response on success: { ok: true, resolution_id, attempt_number, status: 'awaiting_ho' }
 *
 * The attempt_number is computed inside this handler rather than relying on
 * a DB trigger because (a) we need it back in the response and (b) the pilot
 * traffic is tiny — one manager per store, near-zero contention. If we ever
 * see concurrent resolves on the same report we'll lift this into a Postgres
 * function with row-level locking.
 */

export const runtime = "nodejs"

const REPORT_ID = /^SR-\d{6,}$/
const NOTE_MIN = 20
const NOTE_MAX = 500
const MAX_BLOB_BYTES = 10 * 1024 * 1024 // 10 MB

type ReportStatus =
  | "new"
  | "in_progress"
  | "awaiting_ho"
  | "returned"
  | "closed"

const RESOLVABLE: ReadonlySet<ReportStatus> = new Set<ReportStatus>([
  "new",
  "in_progress",
  "returned",
])

function fail(reason: string, status = 400) {
  return NextResponse.json({ error: reason }, { status })
}

function extFromMime(mime: string | undefined, fallback: string): string {
  if (!mime) return fallback
  const m = mime.toLowerCase()
  if (m.includes("jpeg") || m.includes("jpg")) return "jpg"
  if (m.includes("png")) return "png"
  if (m.includes("webp")) return "webp"
  return fallback
}

// Strip codec params — same reason as in /api/reports (Supabase's
// allowed_mime_types is exact-match).
function normaliseMime(mime: string | undefined, fallback: string): string {
  if (!mime) return fallback
  const head = mime.split(";")[0].trim().toLowerCase()
  return head || fallback
}

export async function POST(req: NextRequest) {
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return fail("Expected multipart/form-data body.")
  }

  const report_id = String(form.get("report_id") ?? "").trim()
  const note = String(form.get("note") ?? "").trim()
  const photoFile = form.get("photo")

  if (!REPORT_ID.test(report_id)) return fail("Invalid report id.")
  if (note.length < NOTE_MIN || note.length > NOTE_MAX) {
    return fail(`Resolution note must be ${NOTE_MIN}–${NOTE_MAX} characters.`)
  }

  if (!(photoFile instanceof Blob)) return fail("Proof photo is required.")
  if (photoFile.size === 0) return fail("Proof photo is empty.")
  if (photoFile.size > MAX_BLOB_BYTES) {
    return fail("Proof photo exceeds 10 MB.")
  }
  if (!photoFile.type.startsWith("image/")) {
    return fail("Proof photo must be an image.")
  }

  const admin = createSupabaseAdminClient()

  // --- scope check: fetch store_code + status --------------------------------
  const { data: reportRow, error: reportErr } = await admin
    .from("reports")
    .select("id, store_code, status")
    .eq("id", report_id)
    .maybeSingle<{ id: string; store_code: string; status: ReportStatus }>()

  if (reportErr) {
    console.error("[api/resolutions] report lookup failed", {
      report_id,
      reportErr,
    })
    return fail("Lookup failed.", 500)
  }
  if (!reportRow) return fail("Report not found.", 404)

  const session = await getManagerSession(reportRow.store_code)
  if (!session) return fail("Not signed in.", 401)

  if (!RESOLVABLE.has(reportRow.status)) {
    return fail(
      `This report is ${reportRow.status.replace("_", " ")} — it can't be resolved from here.`,
      409,
    )
  }

  // --- figure out next attempt_number ---------------------------------------
  const { data: maxRow, error: maxErr } = await admin
    .from("resolutions")
    .select("attempt_number")
    .eq("report_id", report_id)
    .order("attempt_number", { ascending: false })
    .limit(1)
    .maybeSingle<{ attempt_number: number }>()

  if (maxErr) {
    console.error("[api/resolutions] attempt lookup failed", {
      report_id,
      maxErr,
    })
    return fail("Lookup failed.", 500)
  }
  const nextAttempt = (maxRow?.attempt_number ?? 0) + 1

  // --- upload proof photo ---------------------------------------------------
  const stamp = Date.now()
  const rand = Math.random().toString(36).slice(2, 8)
  const ext = extFromMime(photoFile.type, "jpg")
  const storagePath = `${reportRow.store_code}/${report_id}/${stamp}-${rand}.${ext}`
  const contentType = normaliseMime(photoFile.type, "image/jpeg")
  const buffer = Buffer.from(await photoFile.arrayBuffer())

  const { error: upErr } = await admin.storage
    .from("resolutions")
    .upload(storagePath, buffer, { contentType, upsert: false })
  if (upErr) {
    console.error(
      "[api/resolutions] photo upload failed",
      { path: storagePath, contentType, incoming: photoFile.type },
      upErr,
    )
    return fail("Proof photo upload failed.", 500)
  }
  const { data: pub } = admin.storage
    .from("resolutions")
    .getPublicUrl(storagePath)
  const photo_url = pub.publicUrl

  // --- insert resolutions row ----------------------------------------------
  const { data: inserted, error: insErr } = await admin
    .from("resolutions")
    .insert({
      report_id,
      attempt_number: nextAttempt,
      photo_url,
      note,
    })
    .select("id, attempt_number, resolved_at")
    .single<{ id: string; attempt_number: number; resolved_at: string }>()

  if (insErr || !inserted) {
    console.error("[api/resolutions] insert failed", { report_id, insErr })
    // Best-effort cleanup so we don't leave an orphan blob.
    await admin.storage
      .from("resolutions")
      .remove([storagePath])
      .catch(() => {})
    // Unique-violation (rare but possible if two managers race): surface a
    // nicer 409 so the UI can tell the user what happened.
    if (insErr && (insErr as { code?: string }).code === "23505") {
      return fail("Another resolution for this report was just filed.", 409)
    }
    return fail("Could not save the resolution.", 500)
  }

  // --- flip report status to awaiting_ho ------------------------------------
  // Guard with a status filter so a race with HO (e.g. a concurrent
  // approve) can't clobber a closed report back to awaiting_ho.
  //
  // If the report was still 'new' at resolve time (manager went straight
  // from inbox → resolve without tapping Acknowledge), stamp
  // `acknowledged_at` on the same update so the audit trail reflects
  // that the manager saw the report before fixing it.
  const updatePayload: Record<string, unknown> = { status: "awaiting_ho" }
  if (reportRow.status === "new") {
    updatePayload.acknowledged_at = new Date().toISOString()
  }
  const { error: updErr } = await admin
    .from("reports")
    .update(updatePayload)
    .eq("id", report_id)
    .in("status", ["new", "in_progress", "returned"])
  if (updErr) {
    console.error("[api/resolutions] status flip failed", {
      report_id,
      updErr,
    })
    // We succeeded at inserting the resolution; leave it in place but
    // surface the error so the UI can show a soft warning.
    return NextResponse.json(
      {
        ok: true,
        resolution_id: inserted.id,
        attempt_number: inserted.attempt_number,
        status: reportRow.status,
        warning:
          "Resolution saved, but the report status couldn't be updated. Refresh and try again.",
      },
      { status: 200 },
    )
  }

  // Fire-and-forget notification dispatch. Per-pilot decision the HO
  // email is audit-only for now; the dispatcher handles that internally.
  const origin =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    new URL(req.url).origin
  void fetch(`${origin}/api/notifications/dispatch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event: "resolution_filed",
      report_id,
      sap_code: reportRow.store_code,
    }),
  }).catch((err) => {
    console.warn("[api/resolutions] dispatch kickoff failed", {
      report_id,
      err: err instanceof Error ? err.message : String(err),
    })
  })

  return NextResponse.json({
    ok: true,
    resolution_id: inserted.id,
    attempt_number: inserted.attempt_number,
    status: "awaiting_ho" as const,
    resolved_at: inserted.resolved_at,
  })
}
