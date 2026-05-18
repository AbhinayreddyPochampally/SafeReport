import { notFound } from "next/navigation"
import { requireHoSession } from "@/lib/ho-auth"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { HoReportDetail } from "./report-detail"

/**
 * HO report detail — /ho/reports/[report_id].
 *
 * Server component: resolves session, loads the report (reporter PII included,
 * unlike the manager view), loads all resolutions, and loads the most recent
 * HO `return` action's comment so we can surface "HO returned this with note…"
 * inline alongside the latest resolution.
 *
 * RLS / scope filtering lands in Phase E. For the pilot all HO users are
 * `national` scope, so we intentionally do not filter by scope here.
 */

const REPORT_ID = /^SR-\d{6,}$/

type Store = {
  sap_code: string
  name: string
  brand: string
  city: string
  state: string
}

type Report = {
  id: string
  store_code: string
  // Mig 007: type + category are nullable until HO confirms the AI
  // category on this page. The detail UI surfaces the pending state.
  type: "observation" | "incident" | null
  category: string | null
  /** AI's pick — gpt-4o-mini text-in classifier. Null when no voice
   * note was attached (photo-only / text-only reports) or when the
   * classifier failed. */
  suggested_category: string | null
  /** AI confidence 0..100. Null whenever suggested_category is null. */
  confidence: number | null
  /** 'ai' before HO confirms; 'ho-confirmed' / 'ho-corrected' after. */
  category_source: "ai" | "ho-confirmed" | "ho-corrected" | null
  status:
    | "new"
    | "in_progress"
    | "awaiting_ho"
    | "returned"
    | "closed"
    | "voided"
  description: string | null
  transcript: string | null
  transcript_error: string | null
  photo_url: string
  audio_url: string | null
  incident_datetime: string
  reported_at: string
  acknowledged_at: string | null
  reporter_name: string | null
  reporter_phone: string | null
}

type Resolution = {
  id: string
  attempt_number: number
  note: string
  photo_url: string | null
  resolved_at: string
}

type HoActionEntry = {
  id: string
  action: "approve" | "return" | "void"
  rejection_reason: string | null
  acted_at: string
  actor_display_name: string | null
}

export type BackTarget = "overview" | "action" | "reports"

function parseBackTarget(s: string | string[] | undefined): BackTarget {
  const v = Array.isArray(s) ? s[0] : s
  if (v === "action" || v === "reports") return v
  return "overview"
}

export default async function HoReportDetailPage({
  params,
  searchParams,
}: {
  params: { report_id: string }
  searchParams?: { from?: string | string[] }
}) {
  if (!REPORT_ID.test(params.report_id)) {
    notFound()
  }

  const session = await requireHoSession(`/ho/reports/${params.report_id}`)
  const backTarget = parseBackTarget(searchParams?.from)

  const admin = createSupabaseAdminClient()

  // Report + joined store — one round trip.
  const { data: reportRow, error: repErr } = await admin
    .from("reports")
    .select(
      "id, store_code, type, category, suggested_category, confidence, category_source, status, description, transcript, transcript_error, photo_url, audio_url, incident_datetime, reported_at, acknowledged_at, reporter_name, reporter_phone, stores!inner(sap_code, name, brand, city, state)",
    )
    .eq("id", params.report_id)
    .maybeSingle()

  if (repErr) {
    console.error("[ho/reports] lookup failed", { id: params.report_id, repErr })
    notFound()
  }
  if (!reportRow) notFound()

  const storeRaw = (reportRow as unknown as {
    stores: {
      sap_code: string
      name: string
      brand: string
      city: string
      state: string
    }
  }).stores

  const store: Store = {
    sap_code: storeRaw.sap_code,
    name: storeRaw.name,
    brand: storeRaw.brand,
    city: storeRaw.city,
    state: storeRaw.state,
  }

  const report: Report = {
    id: reportRow.id as string,
    store_code: reportRow.store_code as string,
    type: reportRow.type as Report["type"],
    category: reportRow.category as string | null,
    suggested_category: reportRow.suggested_category as string | null,
    confidence: reportRow.confidence as number | null,
    category_source: reportRow.category_source as Report["category_source"],
    status: reportRow.status as Report["status"],
    description: reportRow.description as string | null,
    transcript: reportRow.transcript as string | null,
    transcript_error: reportRow.transcript_error as string | null,
    photo_url: reportRow.photo_url as string,
    audio_url: reportRow.audio_url as string | null,
    incident_datetime: reportRow.incident_datetime as string,
    reported_at: reportRow.reported_at as string,
    acknowledged_at: reportRow.acknowledged_at as string | null,
    reporter_name: reportRow.reporter_name as string | null,
    reporter_phone: reportRow.reporter_phone as string | null,
  }

  // Resolutions — oldest first so the UI reads like a conversation.
  const { data: resolutionsRaw } = await admin
    .from("resolutions")
    .select("id, attempt_number, note, photo_url, resolved_at")
    .eq("report_id", params.report_id)
    .order("attempt_number", { ascending: true })

  const resolutions: Resolution[] = (resolutionsRaw ?? []) as Resolution[]

  // HO action history — include the actor's display_name via ho_users join so
  // the UI can say "Returned by Priya at 12 Apr 14:30".
  const { data: historyRaw } = await admin
    .from("ho_actions")
    .select(
      "id, action, rejection_reason, acted_at, actor_user_id, ho_users!left(display_name)",
    )
    .eq("report_id", params.report_id)
    .order("acted_at", { ascending: true })

  const history: HoActionEntry[] = (historyRaw ?? []).map((h) => {
    const user = (h as unknown as {
      ho_users: { display_name: string } | null
    }).ho_users
    return {
      id: h.id as string,
      action: h.action as HoActionEntry["action"],
      rejection_reason: h.rejection_reason as string | null,
      acted_at: h.acted_at as string,
      actor_display_name: user?.display_name ?? null,
    }
  })

  return (
    <HoReportDetail
      store={store}
      report={report}
      resolutions={resolutions}
      history={history}
      viewer={{ display_name: session.display_name }}
      backTarget={backTarget}
    />
  )
}
