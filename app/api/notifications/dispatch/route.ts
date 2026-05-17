import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { dispatchPush } from "@/lib/notify/push"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

/**
 * POST /api/notifications/dispatch — fire notifications for a lifecycle event.
 *
 * Called fire-and-forget from:
 *   - POST /api/reports         →  event: 'new_report'
 *   - POST /api/resolutions     →  event: 'resolution_filed' (awaiting HO)
 *   - POST /api/ho-actions      →  event: 'approved' | 'returned' | 'voided'
 *
 * Channels dispatched per event:
 *   new_report        → push to store's managers
 *   resolution_filed  → (audit-only for now; email deferred per user)
 *   approved          → push to store's managers
 *   returned          → push to store's managers (with HO comment)
 *   voided            → push to store's managers
 *
 * Each channel dispatcher is gated on its env-var presence and logs
 * every attempt to `notification_log` for the audit trail.
 *
 * We do NOT require a session on this endpoint — it's a private
 * service called from the same origin. Front door security is the
 * fact that no user-facing surface POSTs here directly.
 */

const EVENTS = new Set([
  "new_report",
  "resolution_filed",
  "approved",
  "returned",
  "voided",
])

type Body = {
  event?: string
  report_id?: string
  sap_code?: string
  category?: string
  type?: string
  ho_comment?: string
}

/**
 * Notification copy uses the plain-language category labels from the
 * Phase 2 facelift (the same strings the reporter sees in the i18n table).
 * Manager surface is English-only so we keep these inline rather than
 * routing through the i18n loader.
 */
const CATEGORY_LABEL: Record<string, string> = {
  near_miss: "Near miss",
  unsafe_act: "Working unsafely",
  unsafe_condition: "Unsafe condition",
  first_aid_case: "Minor injury",
  medical_treatment_case: "Needed a doctor",
  restricted_work_case: "Working with restrictions",
  lost_time_injury: "Couldn't come to work",
  fatality: "Someone died",
}

function label(cat: string | undefined): string {
  if (!cat) return "Safety report"
  return CATEGORY_LABEL[cat] ?? cat
}

export async function POST(req: NextRequest) {
  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 })
  }

  const event = body.event ?? ""
  if (!EVENTS.has(event)) {
    return NextResponse.json({ error: "Invalid event." }, { status: 400 })
  }
  if (!body.report_id) {
    return NextResponse.json({ error: "Missing report_id." }, { status: 400 })
  }

  // Resolve the sap_code if the caller didn't pass it. Saves the other
  // endpoints from having to look it up just to tell us.
  let sapCode = body.sap_code
  if (!sapCode) {
    const admin = createSupabaseAdminClient()
    const { data } = await admin
      .from("reports")
      .select("store_code")
      .eq("id", body.report_id)
      .maybeSingle<{ store_code: string }>()
    sapCode = data?.store_code
  }
  if (!sapCode) {
    return NextResponse.json(
      { error: "Could not resolve store_code." },
      { status: 400 },
    )
  }

  const results: Record<string, unknown> = {}

  switch (event) {
    case "new_report": {
      // v6 notification copy. Split incident vs observation in the TITLE
      // so the manager can triage urgency at the lock-screen glance.
      // Fatality is special-cased — its category label IS "Someone died"
      // and the title format becomes "Incident reported — Someone died".
      const cat = label(body.category)
      const titleVerb =
        body.type === "incident" ? "Incident reported" : "Safety observation"
      const payload = {
        title: `${titleVerb} — ${cat}`,
        body: "just now",
        url: `/m/${sapCode}/r/${body.report_id}`,
        tag: `report-${body.report_id}`,
      }
      results.push = await dispatchPush(
        { role: "manager", sap_code: sapCode },
        payload,
        { report_id: body.report_id, event_type: event },
      )
      break
    }
    case "resolution_filed": {
      // Email to HO was deferred per pilot decision. We still log
      // an audit row so the trail is complete.
      const admin = createSupabaseAdminClient()
      await admin.from("notification_log").insert({
        report_id: body.report_id,
        recipient_type: "ho",
        recipient_identifier: "all",
        channel: "email",
        event_type: event,
        payload: {
          note: "email dispatch deferred at pilot; audit-only entry",
        } as Record<string, unknown>,
        delivery_status: "pending",
      })
      results.audit_only = true
      break
    }
    case "approved": {
      // Per v6 design — manager doesn't need a push for approval (the
      // inbox status pill flip is enough; this is informational closure,
      // not an action moment). Just log an audit row.
      //
      // Reporter-side push ("your safety report has been resolved") is a
      // future phase — push_subscriptions table is currently keyed by
      // role + sap_code, not by report_id, so subscribing a one-shot
      // reporter device to a specific SR-ID requires a small schema
      // extension (nullable report_id column). Deferred until Phase 9.
      const admin = createSupabaseAdminClient()
      await admin.from("notification_log").insert({
        report_id: body.report_id,
        recipient_type: "manager",
        recipient_identifier: "all",
        channel: "push",
        event_type: event,
        payload: {
          note: "manager push suppressed for approval per v6 facelift",
        } as Record<string, unknown>,
        delivery_status: "skipped",
      })
      results.skipped = "manager push suppressed for approval per v6"
      break
    }
    case "returned": {
      // v6 copy: "Revise SR-XXXXXX" with HO's first ~40 chars of comment.
      // Tap target is the report DETAIL (not /resolve directly) so the
      // manager sees the HO return alert + report context before opening
      // the rework form.
      const comment = (body.ho_comment ?? "").trim()
      const truncated =
        comment.length > 40 ? comment.slice(0, 37).trimEnd() + "…" : comment
      const payload = {
        title: `Revise ${body.report_id}`,
        body: truncated
          ? `Head Office: "${truncated}"`
          : "Head Office sent back this resolution — tap to open.",
        url: `/m/${sapCode}/r/${body.report_id}`,
        tag: `report-${body.report_id}`,
      }
      results.push = await dispatchPush(
        { role: "manager", sap_code: sapCode },
        payload,
        { report_id: body.report_id, event_type: event },
      )
      break
    }
    case "voided": {
      const payload = {
        title: `${body.report_id} was voided`,
        body: "Head Office voided this report (e.g. duplicate). No action needed.",
        url: `/m/${sapCode}/r/${body.report_id}`,
        tag: `report-${body.report_id}`,
      }
      results.push = await dispatchPush(
        { role: "manager", sap_code: sapCode },
        payload,
        { report_id: body.report_id, event_type: event },
      )
      break
    }
  }

  return NextResponse.json({ ok: true, event, results })
}
