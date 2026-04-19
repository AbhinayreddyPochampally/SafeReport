import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { getManagerSession } from "@/lib/manager-auth"

/**
 * Per-report routes for the manager surface.
 *
 *   GET    /api/reports/:id   → full detail for the manager (PII-free)
 *   PATCH  /api/reports/:id   → `{ action: "acknowledge" }` flips new → in_progress
 *
 * The GET response intentionally excludes `reporter_name` and `reporter_phone`
 * at the SQL layer (not the render layer) per the hard rule in CLAUDE.md:
 *
 *   "Reporter name and phone NEVER appear in the manager's view of the
 *    data — exclude those columns at query time, not at render time."
 *
 * HO gets those fields via a separate route in Phase D.
 *
 * Both handlers verify the manager's signed cookie scopes to the same
 * SAP code the report belongs to — a PNT-MUM-047 manager cannot peek
 * into PNT-DEL-023's reports even by guessing an ID.
 */

const REPORT_ID = /^SR-\d{6,}$/

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const id = params.id?.trim() ?? ""
  if (!REPORT_ID.test(id)) {
    return NextResponse.json({ error: "Invalid report id." }, { status: 400 })
  }

  const admin = createSupabaseAdminClient()

  // First: look up just the store_code — we need it to validate the
  // manager's session scope before we hand back any report-level data.
  const { data: scopeRow, error: scopeErr } = await admin
    .from("reports")
    .select("store_code")
    .eq("id", id)
    .maybeSingle<{ store_code: string }>()

  if (scopeErr) {
    console.error("[api/reports/:id GET] scope lookup failed", { id, scopeErr })
    return NextResponse.json({ error: "Query failed." }, { status: 500 })
  }
  if (!scopeRow) {
    // 404 vs. 403: we return the same "Not found" regardless, so a curious
    // manager can't enumerate report IDs across other stores.
    return NextResponse.json({ error: "Report not found." }, { status: 404 })
  }

  const session = await getManagerSession(scopeRow.store_code)
  if (!session) {
    // Either no cookie, or it belongs to a different SAP code.
    return NextResponse.json({ error: "Not signed in." }, { status: 401 })
  }

  const { data, error } = await admin
    .from("reports")
    .select(
      "id, store_code, type, category, status, description, transcript, transcript_error, photo_url, audio_url, incident_datetime, reported_at, acknowledged_at",
    )
    .eq("id", id)
    .maybeSingle<{
      id: string
      store_code: string
      type: string
      category: string
      status: string
      description: string | null
      transcript: string | null
      transcript_error: string | null
      photo_url: string
      audio_url: string | null
      incident_datetime: string
      reported_at: string
      acknowledged_at: string | null
    }>()

  if (error) {
    console.error("[api/reports/:id GET] detail query failed", { id, error })
    return NextResponse.json({ error: "Query failed." }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 })
  }

  // Resolutions history for this report so the manager sees their own
  // prior attempts on a Returned report.
  const { data: resolutions } = await admin
    .from("resolutions")
    .select("id, attempt_number, note, photo_url, resolved_at")
    .eq("report_id", id)
    .order("attempt_number", { ascending: true })

  return NextResponse.json({
    report: {
      id: data.id,
      store_code: data.store_code,
      type: data.type,
      category: data.category,
      status: data.status,
      description: data.description,
      transcript: data.transcript,
      transcript_error: data.transcript_error,
      photo_url: data.photo_url,
      audio_url: data.audio_url,
      incident_datetime: data.incident_datetime,
      reported_at: data.reported_at,
      acknowledged_at: data.acknowledged_at,
    },
    resolutions: resolutions ?? [],
  })
}

// ---------------------------------------------------------------------------
// PATCH — status transitions the manager is allowed to drive.
//
// Today: { action: "acknowledge" } only. Acknowledging a report flips
//   new → in_progress and stamps `acknowledged_at`. We deliberately gate on
//   status = 'new' so a double-click or a stale tab can't accidentally
//   clobber an already-resolved report's state.
//
// Resolution submission is a separate route (POST /api/resolutions) that
// flips in_progress|returned → awaiting_ho; it's Phase C4.
// ---------------------------------------------------------------------------

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const id = params.id?.trim() ?? ""
  if (!REPORT_ID.test(id)) {
    return NextResponse.json({ error: "Invalid report id." }, { status: 400 })
  }

  let body: unknown = null
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 })
  }
  const action =
    body && typeof body === "object" && "action" in body
      ? String((body as { action?: unknown }).action ?? "")
      : ""

  if (action !== "acknowledge") {
    return NextResponse.json(
      { error: "Unsupported action." },
      { status: 400 },
    )
  }

  const admin = createSupabaseAdminClient()

  // Scope check first — same as GET.
  const { data: scopeRow, error: scopeErr } = await admin
    .from("reports")
    .select("store_code, status")
    .eq("id", id)
    .maybeSingle<{ store_code: string; status: string }>()

  if (scopeErr) {
    console.error("[api/reports/:id PATCH] scope lookup failed", {
      id,
      scopeErr,
    })
    return NextResponse.json({ error: "Query failed." }, { status: 500 })
  }
  if (!scopeRow) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 })
  }

  const session = await getManagerSession(scopeRow.store_code)
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 })
  }

  if (scopeRow.status !== "new") {
    // Already acknowledged or further along — make this idempotent-ish:
    // signal "no change" rather than erroring, so a retry is safe.
    return NextResponse.json(
      {
        ok: true,
        status: scopeRow.status,
        unchanged: true,
      },
      { status: 200 },
    )
  }

  const nowIso = new Date().toISOString()
  const { error: updErr } = await admin
    .from("reports")
    .update({ status: "in_progress", acknowledged_at: nowIso })
    .eq("id", id)
    .eq("status", "new") // guard against race
  if (updErr) {
    console.error("[api/reports/:id PATCH] update failed", { id, updErr })
    return NextResponse.json({ error: "Update failed." }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    status: "in_progress",
    acknowledged_at: nowIso,
  })
}
