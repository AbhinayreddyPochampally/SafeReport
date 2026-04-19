import { notFound, redirect } from "next/navigation"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { getManagerSession } from "@/lib/manager-auth"
import { ManagerLogin } from "../../../manager-login"
import { ResolveForm } from "./resolve-form"

/**
 * Resolve screen — /m/[sap_code]/r/[report_id]/resolve.
 *
 * Server component mirrors the detail page: loads the store, validates
 * the session scope, loads the report (PII-excluded), and — if the
 * report is in a resolvable state — hands off to the client form.
 *
 * States that can reach this page:
 *   new           → first-attempt resolution (we auto-acknowledge on submit)
 *   in_progress   → first-attempt resolution after explicit acknowledge
 *   returned      → re-work after HO pushback (prior attempts rendered inline)
 *
 * Anything else redirects back to the detail view — the CTA only appears
 * in the bottom bar when status is resolvable, but a direct URL visit
 * still needs to be fenced.
 */

const SR_ID = /^SR-\d{6,}$/

type StoreHeader = {
  sap_code: string
  name: string
  brand: string
  city: string
  state: string
}

type ResolvableReport = {
  id: string
  store_code: string
  type: "observation" | "incident"
  category: string
  status: "new" | "in_progress" | "returned"
  description: string | null
  transcript: string | null
  photo_url: string
  audio_url: string | null
  incident_datetime: string
  reported_at: string
}

type PriorResolution = {
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

export default async function ResolvePage({
  params,
}: {
  params: { sap_code: string; report_id: string }
}) {
  if (!SR_ID.test(params.report_id)) notFound()

  const store = await loadStore(params.sap_code)
  if (!store) notFound()

  const session = await getManagerSession(store.sap_code)
  if (!session) {
    return <ManagerLogin store={store} />
  }

  const admin = createSupabaseAdminClient()

  // Load the report WITHOUT reporter_name / reporter_phone.
  const { data: reportRow, error: reportErr } = await admin
    .from("reports")
    .select(
      "id, store_code, type, category, status, description, transcript, photo_url, audio_url, incident_datetime, reported_at",
    )
    .eq("id", params.report_id)
    .eq("store_code", store.sap_code)
    .maybeSingle<{
      id: string
      store_code: string
      type: "observation" | "incident"
      category: string
      status: string
      description: string | null
      transcript: string | null
      photo_url: string
      audio_url: string | null
      incident_datetime: string
      reported_at: string
    }>()

  if (reportErr || !reportRow) notFound()

  if (
    reportRow.status !== "new" &&
    reportRow.status !== "in_progress" &&
    reportRow.status !== "returned"
  ) {
    // Awaiting HO / closed: bounce back to the detail view rather than
    // showing an empty form the user can't actually use.
    redirect(`/m/${store.sap_code}/r/${reportRow.id}`)
  }

  const report: ResolvableReport = {
    id: reportRow.id,
    store_code: reportRow.store_code,
    type: reportRow.type,
    category: reportRow.category,
    status: reportRow.status,
    description: reportRow.description,
    transcript: reportRow.transcript,
    photo_url: reportRow.photo_url,
    audio_url: reportRow.audio_url,
    incident_datetime: reportRow.incident_datetime,
    reported_at: reportRow.reported_at,
  }

  const { data: priors } = await admin
    .from("resolutions")
    .select("id, attempt_number, note, photo_url, resolved_at")
    .eq("report_id", report.id)
    .order("attempt_number", { ascending: true })

  return (
    <ResolveForm
      store={store}
      report={report}
      priorAttempts={(priors as PriorResolution[] | null) ?? []}
    />
  )
}
