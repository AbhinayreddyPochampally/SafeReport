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

const CATEGORY_LABEL: Record<string, string> = {
  near_miss: "Near miss",
  unsafe_act: "Unsafe act",
  unsafe_condition: "Unsafe condition",
  first_aid_case: "First aid case",
  medical_treatment_case: "Medical treatment",
  restricted_work_case: "Restricted work",
  lost_time_injury: "Lost time injury",
  fatality: "Fatality",
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
      const payload = {
        title: `New ${label(body.category)} · ${body.report_id}`,
        body:
          body.type === "incident"
            ? "Incident reported at your store. Open to acknowledge."
            : "Observation reported at your store. Open to review.",
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
      const payload = {
        title: `${body.report_id} approved`,
        body: "Head Office approved this report. No further action needed.",
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
    case "returned": {
      const comment = (body.ho_comment ?? "").trim()
      const payload = {
        title: `${body.report_id} returned for rework`,
        body: comment
          ? comment.length > 120
            ? comment.slice(0, 117).trimEnd() + "…"
            : comment
          : "Head Office returned this report. Open to see the reason.",
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
