import { notFound } from "next/navigation"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { getManagerSession } from "@/lib/manager-auth"
import { ManagerLogin } from "../../manager-login"
import { ReportDetail } from "./report-detail"

/**
 * Manager-side report detail — /m/[sap_code]/r/[report_id].
 *
 * Server component: validates the URL shape, loads the store header,
 * enforces the manager session (scoped to *this* store's SAP code), and
 * fetches the report + resolutions via the service-role client. The
 * client component then renders the view and owns the acknowledge
 * interaction.
 *
 * Hard rule: reporter_name and reporter_phone are NEVER selected here.
 * The manager must not see either column — see CLAUDE.md "Design fidelity".
 */

const SR_ID = /^SR-\d{6,}$/

type StoreHeader = {
  sap_code: string
  name: string
  brand: string
  city: string
  state: string
}

type ReportRow = {
  id: string
  store_code: string
  type: "observation" | "incident"
  category: string
  status: "new" | "in_progress" | "awaiting_ho" | "returned" | "closed"
  description: string | null
  transcript: string | null
  transcript_error: string | null
  photo_url: string
  audio_url: string | null
  incident_datetime: string
  reported_at: string
  acknowledged_at: string | null
}

type ResolutionRow = {
  id: string
  attempt_number: number
  note: string
  photo_url: string
  resolved_at: string
}

async function loadStore(sap_code: string): Promise<StoreHeader | null> {
  const admin = createSupabaseAdminClient()
  const { data, error } = await admin
    .from("stores")
    .select("sap_code, name, brand, city, state, status, manager_pin_hash")
    .eq("sap_code", sap_code)
    .maybeSingle<{
      sap_code: string
      name: string
      brand: string
      city: string
      state: string
      status: string
      manager_pin_hash: string | null
    }>()
  if (error || !data) return null
  if (data.status !== "active" || !data.manager_pin_hash) return null
  return {
    sap_code: data.sap_code,
    name: data.name,
    brand: data.brand,
    city: data.city,
    state: data.state,
  }
}

async function loadReport(
  report_id: string,
  sap_code: string,
): Promise<{ report: ReportRow; resolutions: ResolutionRow[] } | null> {
  const admin = createSupabaseAdminClient()
  const { data, error } = await admin
    .from("reports")
    // Note: reporter_name / reporter_phone are deliberately excluded.
    .select(
      "id, store_code, type, category, status, description, transcript, transcript_error, photo_url, audio_url, incident_datetime, reported_at, acknowledged_at",
    )
    .eq("id", report_id)
    .eq("store_code", sap_code)
    .maybeSingle<ReportRow>()
  if (error || !data) return null

  const { data: resolutions } = await admin
    .from("resolutions")
    .select("id, attempt_number, note, photo_url, resolved_at")
    .eq("report_id", report_id)
    .order("attempt_number", { ascending: true })

  return {
    report: data,
    resolutions: (resolutions as ResolutionRow[] | null) ?? [],
  }
}

export default async function ManagerReportDetailPage({
  params,
}: {
  params: { sap_code: string; report_id: string }
}) {
  // Shape-check the URL first — otherwise Postgres gets asked to look up
  // arbitrary strings, which is fine but a little noisy in logs.
  if (!SR_ID.test(params.report_id)) {
    notFound()
  }

  const store = await loadStore(params.sap_code)
  if (!store) notFound()

  // Scope check: a cookie for a different SAP code is treated as "no
  // session" and the user is bounced to that store's PIN keypad.
  const session = await getManagerSession(store.sap_code)
  if (!session) {
    return <ManagerLogin store={store} />
  }

  const detail = await loadReport(params.report_id, store.sap_code)
  if (!detail) notFound()

  return (
    <ReportDetail
      store={store}
      report={detail.report}
      resolutions={detail.resolutions}
    />
  )
}
