import { requireHoSession } from "@/lib/ho-auth"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { StoresClient, type StoreRow } from "./stores-client"

export const dynamic = "force-dynamic"

/**
 * HO store registry — /ho/stores.
 *
 * Server component: guards the session, loads the full store roster, and
 * computes per-store adoption aggregates in Node:
 *   - last_report_at (drives the Active/Quiet/Dormant/Never activity tier)
 *   - reports this month + last month (the "month-over-month delta" the
 *     client surfaces as +N / −N alongside the count)
 *   - distinct reporter phones (lifetime unique reporters)
 *   - median acknowledgement time + % acknowledged within 24h
 *     (manager engagement signal — drawn from reports.acknowledged_at)
 *
 * The pilot reports table is small (≪ 10k rows for 20 stores), so a single
 * unfiltered fetch is cheaper than a per-store aggregate round trip.
 * If scale changes, move to the existing v_store_metrics view + a new
 * v_store_engagement view.
 */

type StoresRow = {
  sap_code: string
  name: string
  brand: string
  city: string
  state: string
  location: string | null
  manager_name: string | null
  manager_phone: string | null
  manager_password_hash: string | null
  status: "active" | "temporarily_closed" | "permanently_closed"
  opening_date: string | null
  qr_downloaded_at: string | null
  created_at: string | null
}

type ReportRow = {
  store_code: string
  reported_at: string
  acknowledged_at: string | null
  reporter_phone: string
}

type Agg = {
  total: number
  this_month: number
  last_month: number
  last_report_at: string | null
  reporters: Set<string>
  ack_hours: number[]
  ack_within_24h: number
}

function emptyAgg(): Agg {
  return {
    total: 0,
    this_month: 0,
    last_month: 0,
    last_report_at: null,
    reporters: new Set<string>(),
    ack_hours: [],
    ack_within_24h: 0,
  }
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null
  const sorted = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

export default async function HoStoresPage() {
  await requireHoSession("/ho/stores")

  const admin = createSupabaseAdminClient()

  const [storesResp, reportsResp] = await Promise.all([
    admin
      .from("stores")
      .select(
        "sap_code, name, brand, city, state, location, manager_name, manager_phone, manager_password_hash, status, opening_date, qr_downloaded_at, created_at",
      )
      .order("brand", { ascending: true })
      .order("city", { ascending: true })
      .order("name", { ascending: true }),
    admin
      .from("reports")
      .select("store_code, reported_at, acknowledged_at, reporter_phone"),
  ])

  if (storesResp.error) {
    console.error("[ho/stores] stores query failed", storesResp.error)
    return (
      <div className="max-w-3xl mx-auto p-10">
        <h1 className="text-xl font-semibold text-slate-900">
          Store registry unavailable
        </h1>
        <p className="text-slate-600 mt-2 text-sm">
          Could not load the store list. Try refreshing. If this persists, the
          Supabase service role key may be out of date.
        </p>
      </div>
    )
  }

  // Month boundaries computed once. Server timezone matches the Railway box
  // (UTC); the client renders relative times so the small UTC/IST drift on
  // "this month" boundaries is not user-visible inside the working day.
  const now = new Date()
  const startOfThisMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  ).getTime()
  const startOfLastMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
  ).getTime()

  const aggByStore = new Map<string, Agg>()
  for (const r of (reportsResp.data as ReportRow[] | null) ?? []) {
    let a = aggByStore.get(r.store_code)
    if (!a) {
      a = emptyAgg()
      aggByStore.set(r.store_code, a)
    }
    a.total += 1
    const reportedAt = Date.parse(r.reported_at)
    if (!Number.isNaN(reportedAt)) {
      if (reportedAt >= startOfThisMonth) a.this_month += 1
      else if (reportedAt >= startOfLastMonth) a.last_month += 1
      if (
        a.last_report_at == null ||
        Date.parse(a.last_report_at) < reportedAt
      ) {
        a.last_report_at = r.reported_at
      }
    }
    if (r.reporter_phone) a.reporters.add(r.reporter_phone.trim())
    if (r.acknowledged_at) {
      const ackedAt = Date.parse(r.acknowledged_at)
      if (!Number.isNaN(ackedAt) && !Number.isNaN(reportedAt)) {
        const hours = Math.max(0, (ackedAt - reportedAt) / 36e5)
        a.ack_hours.push(hours)
        if (hours < 24) a.ack_within_24h += 1
      }
    }
  }

  const rows: StoreRow[] = (
    (storesResp.data as StoresRow[] | null) ?? []
  ).map((s) => {
    const a = aggByStore.get(s.sap_code) ?? emptyAgg()
    const medAck = median(a.ack_hours)
    const pct24 =
      a.ack_hours.length > 0
        ? Math.round((a.ack_within_24h / a.ack_hours.length) * 100)
        : null
    return {
      sap_code: s.sap_code,
      name: s.name,
      brand: s.brand,
      city: s.city,
      state: s.state,
      location: s.location,
      manager_name: s.manager_name,
      manager_phone: s.manager_phone,
      has_password: Boolean(s.manager_password_hash),
      status: s.status,
      opening_date: s.opening_date,
      report_count: a.total,
      qr_downloaded_at: s.qr_downloaded_at,
      created_at: s.created_at,
      last_report_at: a.last_report_at,
      reports_this_month: a.this_month,
      reports_last_month: a.last_month,
      distinct_reporters: a.reporters.size,
      median_ack_hours: medAck,
      pct_acked_within_24h: pct24,
    }
  })

  return <StoresClient rows={rows} />
}
