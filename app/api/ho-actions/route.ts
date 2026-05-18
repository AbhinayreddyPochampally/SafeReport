import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { revalidateTag } from "next/cache"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { getHoSession } from "@/lib/ho-auth"
import {
  isSeverityFloor,
  typeForCategory,
} from "@/lib/category-derive"
import type { ReportCategory } from "@/lib/reporter-state"

/**
 * POST /api/ho-actions — HO decides on a report.
 *
 * Body shape: { report_id, action, comment?, category?, category_via? }
 *   action = "approve"           → report.status awaiting_ho → closed
 *   action = "return"            → report.status awaiting_ho → returned   (comment 10–300 required)
 *   action = "void"              → report.status *any*       → voided     (comment 20+ required, irreversible)
 *   action = "confirm_category"  → no status change; sets reports.category + .type + .category_source
 *
 * Mig 007 (AI classification, May 2026):
 *   - Reports arrive with category=NULL, type=NULL. The AI classifier
 *     (gpt-4o-mini, text-in) writes suggested_category + confidence
 *     post-submission. HO confirms or overrides on the report-detail
 *     page.
 *   - The "approve" action requires that the report's category is set
 *     by the time HO closes it. If the category is still null at
 *     approve-time, the body MUST include category + category_via; we
 *     set both atomically with the status flip. (Convenience for the
 *     "confirm + approve" single-submit UX path.)
 *   - Severity floor: if the final category is `lost_time_injury` or
 *     `fatality`, category_via MUST be `"corrected"` — i.e. it came
 *     from the explicit dropdown. The single-button "confirm AI's
 *     pick" path (category_via='confirmed') is rejected for those two
 *     categories. The asymmetry argument: under-counting a fatality
 *     has legal / insurance consequences much larger than the cost of
 *     a single extra dropdown click. See lib/category-derive.ts.
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

type ActionType = "approve" | "return" | "void" | "confirm_category"

type CategoryVia = "confirmed" | "corrected"

type Body = {
  report_id?: unknown
  action?: unknown
  comment?: unknown
  category?: unknown
  category_via?: unknown
}

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

function parseAction(x: unknown): ActionType | null {
  if (
    x === "approve" ||
    x === "return" ||
    x === "void" ||
    x === "confirm_category"
  ) {
    return x
  }
  return null
}

function parseCategory(x: unknown): ReportCategory | null {
  if (typeof x !== "string") return null
  if (!ALL_CATEGORIES.has(x)) return null
  return x as ReportCategory
}

function parseVia(x: unknown): CategoryVia | null {
  if (x === "confirmed" || x === "corrected") return x
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
  const bodyCategory = parseCategory(raw.category)
  const bodyVia = parseVia(raw.category_via)

  if (!REPORT_ID.test(report_id)) {
    return NextResponse.json({ error: "Invalid report id." }, { status: 400 })
  }
  if (!action) {
    return NextResponse.json(
      { error: "action must be one of: approve, return, void, confirm_category." },
      { status: 400 },
    )
  }

  // Comment rules per CLAUDE.md / DESIGN.md:
  //  - return: 10–300 chars, required
  //  - void:   20+ chars, required (no upper bound — audit reason is free-form)
  //  - approve: optional; if present, treated as an internal note
  //  - confirm_category: no comment expected; ignored if provided
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

  // For category-bearing actions, validate the category fields up front.
  if (action === "confirm_category") {
    if (!bodyCategory) {
      return NextResponse.json(
        { error: "category is required for confirm_category." },
        { status: 400 },
      )
    }
    if (!bodyVia) {
      return NextResponse.json(
        { error: "category_via must be 'confirmed' or 'corrected'." },
        { status: 400 },
      )
    }
    // Severity floor: LTI / Fatality cannot use the single-button
    // confirm path. Must come from the dropdown (`corrected`).
    if (isSeverityFloor(bodyCategory) && bodyVia !== "corrected") {
      return NextResponse.json(
        {
          error:
            "High-severity categories (Fatality, Lost Time Injury) must be set via the dropdown.",
        },
        { status: 400 },
      )
    }
  }

  const session = await getHoSession()
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 })
  }

  const admin = createSupabaseAdminClient()

  // Look up current state. We need category alongside status for the
  // approve guard ("can't close without a category").
  const { data: report, error: repErr } = await admin
    .from("reports")
    .select("id, status, category, category_source, suggested_category")
    .eq("id", report_id)
    .maybeSingle<{
      id: string
      status: string
      category: string | null
      category_source: string | null
      suggested_category: string | null
    }>()

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

  // ----- Branch: confirm_category --------------------------------------
  // Stamps category + type + category_source on the row WITHOUT touching
  // the lifecycle status. Allowed at any non-terminal state.
  if (action === "confirm_category") {
    if (report.status === "voided") {
      return NextResponse.json(
        { error: "Cannot set category on a voided report." },
        { status: 409 },
      )
    }
    // bodyCategory + bodyVia were validated above.
    const finalCategory = bodyCategory!
    const finalVia = bodyVia!
    const reportType = typeForCategory(finalCategory)
    const sourceColumn =
      finalVia === "confirmed" ? "ho-confirmed" : "ho-corrected"

    const { error: catErr } = await admin
      .from("reports")
      .update({
        category: finalCategory,
        type: reportType,
        category_source: sourceColumn,
        updated_at: new Date().toISOString(),
      })
      .eq("id", report_id)

    if (catErr) {
      console.error("[api/ho-actions] category update failed", {
        report_id,
        catErr,
      })
      return NextResponse.json({ error: "Update failed." }, { status: 500 })
    }

    revalidateTag("ho-overview-data")
    revalidateTag("ho-sidebar-counts")
    revalidateTag("ho-analytics")

    return NextResponse.json({
      ok: true,
      report_id,
      action,
      category: finalCategory,
      type: reportType,
      category_source: sourceColumn,
    })
  }

  // ----- Branch: approve / return / void -------------------------------
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

  // Mig 007: approve requires a category. If the row's category is still
  // null, HO must have included it in this submit (the "confirm + approve
  // in one click" path on the report-detail UI). Severity floor applies.
  let approveCategoryPatch: {
    category: ReportCategory
    type: ReturnType<typeof typeForCategory>
    category_source: "ho-confirmed" | "ho-corrected"
  } | null = null
  if (action === "approve" && !report.category) {
    if (!bodyCategory || !bodyVia) {
      return NextResponse.json(
        {
          error:
            "Category must be confirmed before approving. Pick from the dropdown or click Confirm AI suggestion.",
        },
        { status: 400 },
      )
    }
    if (isSeverityFloor(bodyCategory) && bodyVia !== "corrected") {
      return NextResponse.json(
        {
          error:
            "High-severity categories (Fatality, Lost Time Injury) must be set via the dropdown.",
        },
        { status: 400 },
      )
    }
    approveCategoryPatch = {
      category: bodyCategory,
      type: typeForCategory(bodyCategory),
      category_source: bodyVia === "confirmed" ? "ho-confirmed" : "ho-corrected",
    }
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
  //    On the "approve + bundle category" path, we patch category/type/source
  //    in the same UPDATE so the audit semantics stay clean ("the same row
  //    transition that closed the report also sealed the category").
  const oldStatus = report.status
  const statusPatch: Record<string, unknown> = {
    status: nextStatus,
    updated_at: new Date().toISOString(),
  }
  if (approveCategoryPatch) {
    statusPatch.category = approveCategoryPatch.category
    statusPatch.type = approveCategoryPatch.type
    statusPatch.category_source = approveCategoryPatch.category_source
  }
  const { error: updErr } = await admin
    .from("reports")
    .update(statusPatch)
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

  // Bust the cached Overview + sidebar counts so the action lands on
  // the next page render. Without this, the queue counts and the
  // velocity tiles would stay stale for up to 60s after an HO approval.
  revalidateTag("ho-overview-data")
  revalidateTag("ho-sidebar-counts")
  // HO approval / return / void changes the closed counts, the
  // first-attempt rate, and the SLA-within numbers — every cached
  // analytics bundle is now stale.
  revalidateTag("ho-analytics")
  return NextResponse.json({
    ok: true,
    report_id,
    status: nextStatus,
    action,
    resolution_id: latestRes?.id ?? null,
  })
}
