import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { getHoSession } from "@/lib/ho-auth"

/**
 * POST /api/ho-actions — HO decides on a report.
 *
 * Body shape: { report_id, action, comment? }
 *   action = "approve"  → report.status awaiting_ho  → closed
 *   action = "return"   → report.status awaiting_ho  → returned   (comment 10–300 required)
 *   action = "void"     → report.status *any*        → voided     (comment 20+ required, irreversible)
 *
 * For approve/return we ALSO resolve the latest resolution on the report and
 * stamp `ho_actions.resolution_id` so the audit trail pins the decision to the
 * specific resolution attempt HO was looking at.
 *
 * Void does not require a resolution — an HO user can void a fresh NEW report
 * if it's clearly spam, a duplicate, or a mis-filed entry. The only thing void
 * cannot do is un-void: once voided, a report is terminal.
 *
 * Session: requires `getHoSession()` — a valid Supabase Auth session *plus*
 * a row in `ho_users`. Middleware also enforces the same gate up-front, so a
 * stray caller without a session gets bounced at the edge before landing
 * here; the in-handler check is belt-and-braces.
 */

const REPORT_ID = /^SR-\d{6,}$/

type ActionType = "approve" | "return" | "void"

type Body = {
  report_id?: unknown
  action?: unknown
  comment?: unknown
}

function parseAction(x: unknown): ActionType | null {
  if (x === "approve" || x === "return" || x === "void") return x
  return null
}

export async function POST(req: NextRequest) {
  let raw: Body = {}
  try {
    raw = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 })
  }

  const report_id = typeof raw.report_id === "string" ? raw.report_id.trim() : ""
  const action = parseAction(raw.action)
  const commentRaw =
    typeof raw.comment === "string" ? raw.comment.trim() : ""

  if (!REPORT_ID.test(report_id)) {
    return NextResponse.json({ error: "Invalid report id." }, { status: 400 })
  }
  if (!action) {
    return NextResponse.json(
      { error: "action must be one of: approve, return, void." },
      { status: 400 },
    )
  }

  // Comment rules per CLAUDE.md / DESIGN.md:
  //  - return: 10–300 chars, required
  //  - void:   20+ chars, required (no upper bound — audit reason is free-form)
  //  - approve: optional; if present, treated as an internal note
  if (action === "return") {
    if (commentRaw.length < 10 || commentRaw.length > 300) {
      return NextResponse.json(
        { error: "Return comment must be between 10 and 300 characters." },
        { status: 400 },
      )
    }
  }
  if (action === "void") {
    if (commentRaw.length < 20) {
      return NextResponse.json(
        { error: "Void requires a 20+ character audit reason." },
        { status: 400 },
      )
    }
  }

  const session = await getHoSession()
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 })
  }

  const admin = createSupabaseAdminClient()

  // Look up current status + latest resolution (if any). Latest-by-attempt is
  // what HO reviews; the ho_action row is stamped against that resolution.
  const { data: report, error: repErr } = await admin
    .from("reports")
    .select("id, status")
    .eq("id", report_id)
    .maybeSingle<{ id: string; status: string }>()

  if (repErr) {
    console.error("[api/ho-actions] report lookup failed", {
      report_id,
      repErr,
    })
    return NextResponse.json({ error: "Query failed." }, { status: 500 })
  }
  if (!report) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 })
  }

  // Status-transition guards. We treat a no-op attempt as an error (not
  // idempotent-ish) because this surface is user-driven and a confused state
  // should bubble up to the UI rather than silently succeed.
  if (action === "approve" && report.status !== "awaiting_ho") {
    return NextResponse.json(
      { error: `Cannot approve — report is ${report.status}.` },
      { status: 409 },
    )
  }
  if (action === "return" && report.status !== "awaiting_ho") {
    return NextResponse.json(
      { error: `Cannot return — report is ${report.status}.` },
      { status: 409 },
    )
  }
  if (action === "void") {
    if (report.status === "voided") {
      return NextResponse.json(
        { error: "Report is already voided." },
        { status: 409 },
      )
    }
    // Approve/return are terminal-ish but void is allowed across any non-void
    // state per DESIGN.md (HO can void even after closing, for audit cleanup).
  }

  // Latest resolution — nullable for void on a NEW/IN_PROGRESS report.
  const { data: latestRes } = await admin
    .from("resolutions")
    .select("id, attempt_number")
    .eq("report_id", report_id)
    .order("attempt_number", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string; attempt_number: number }>()

  const nextStatus =
    action === "approve"
      ? "closed"
      : action === "return"
        ? "returned"
        : "voided"

  // 1) Flip the report status (guarded by `eq('status', old_status)` to defeat races).
  const oldStatus = report.status
  const { error: updErr } = await admin
    .from("reports")
    .update({ status: nextStatus, updated_at: new Date().toISOString() })
    .eq("id", report_id)
    .eq("status", oldStatus)
  if (updErr) {
    console.error("[api/ho-actions] status update failed", {
      report_id,
      action,
      updErr,
    })
    return NextResponse.json({ error: "Update failed." }, { status: 500 })
  }

  // 2) Stamp the audit row. `action` column is the enum `ho_action_type`.
  //    `rejection_reason` is reused for return comments and void reasons.
  const commentForInsert = commentRaw.length > 0 ? commentRaw : null
  const { error: auditErr } = await admin.from("ho_actions").insert({
    report_id,
    resolution_id: latestRes?.id ?? null,
    action,
    rejection_reason: commentForInsert,
    actor_user_id: session.user_id,
  })
  if (auditErr) {
    console.error("[api/ho-actions] audit insert failed", {
      report_id,
      action,
      auditErr,
    })
    // We've already updated status; returning an error here would put the
    // audit log out of sync with the report state. Best-effort rollback.
    await admin
      .from("reports")
      .update({ status: oldStatus })
      .eq("id", report_id)
      .eq("status", nextStatus)
    return NextResponse.json(
      { error: "Could not record audit entry." },
      { status: 500 },
    )
  }

  // Fire-and-forget notification to the store manager so they see the
  // outcome on their device within seconds (rather than waiting for the
  // 30-second inbox poll). Gated by VAPID env on the dispatcher side —
  // safe to call unconditionally.
  const origin =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    new URL(req.url).origin
  const dispatchEvent =
    action === "approve" ? "approved" : action === "return" ? "returned" : "voided"
  void fetch(`${origin}/api/notifications/dispatch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event: dispatchEvent,
      report_id,
      ho_comment: commentRaw || undefined,
    }),
  }).catch((err) => {
    console.warn("[api/ho-actions] dispatch kickoff failed", {
      report_id,
      err: err instanceof Error ? err.message : String(err),
    })
  })

  return NextResponse.json({
    ok: true,
    report_id,
    status: nextStatus,
    action,
    resolution_id: latestRes?.id ?? null,
  })
}
