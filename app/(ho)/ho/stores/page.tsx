import { unstable_cache } from "next/cache"
import { requireHoSession } from "@/lib/ho-auth"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import {
  StoresClient,
  type AttentionItem,
  type StoreRow,
  type StoresSummary,
} from "./stores-client"

export const dynamic = "force-dynamic"

/**
 * HO store registry — /ho/stores.
 *
 * Server component: guards the session, loads the full store roster, and
 * computes per-store adoption aggregates in Node:
 *   - last_report_at (drives the Active/Quiet/Dormant/Never activity tier)
 *   - reports this month + last month (the "month-over-month delta" the
 *     client surfaces as +N / −N alongside the count)
 *   - reports in the trailing 30 days (drives the "N last 30d" sub-line
 *     in the Activity cell — preferred over calendar-month-last because it
 *     reads sensibly mid-month)
 *   - distinct reporter phones (lifetime unique reporters)
 *   - median acknowledgement time + % acknowledged within 24h
 *     (manager engagement signal — drawn from reports.acknowledged_at)
 *
 * Plus a global `summary` object the redesigned stats-card row consumes
 * (total stores, active vs quiet split, active-this-month, distinct
 * lifetime reporters, MoM growth, % of reports acknowledged within 2h).
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
  manager_email: string | null
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
  last_30d: number
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
    last_30d: 0,
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

/**
 * Compute the entire page data — stores roster + per-store aggregates +
 * attention candidates + summary stats — wrapped in unstable_cache with
 * a 30-second TTL.
 *
 * Why: this fetch was the dominant cost of a Stores-tab page load. Two
 * Supabase queries, one of them a full reports-table scan, plus an O(N)
 * pass to build per-store aggregates. With force-dynamic the whole thing
 * ran on every navigation, and tab switches felt a beat slow because of
 * it.
 *
 * 30 s is short enough that newly-added stores / freshly-resolved
 * attention rows appear within a refresh, and long enough that walking
 * between HO tabs in the same minute is instant. The mutation endpoints
 * (ho-stores POST/PATCH, ho-store-attention POST/DELETE) call
 * revalidateTag("ho-stores-data") to bust the cache immediately on
 * write, so the user never sees stale state on their own action.
 */
const getStoresPageData = unstable_cache(
  fetchStoresPageData,
  ["ho-stores-data"],
  // 60-second TTL — see layout.tsx commentary. Mutating endpoints
  // revalidate the tag immediately on write, so the user never sees
  // stale state on their own action.
  { revalidate: 60, tags: ["ho-stores-data"] },
)

async function fetchStoresPageData(): Promise<{
  rows: StoreRow[]
  summary: StoresSummary
  attention: AttentionItem[]
}> {
  const admin = createSupabaseAdminClient()

  // Two-step stores fetch so the page works whether migration 005
  // (which adds attention_handled_at + attention_handled_by) has been
  // applied yet or not. The base select only touches columns that have
  // existed since day 1; the optional select pulls the new column and
  // silently degrades if it's not there.
  //
  // This was load-bearing — the previous code SELECTed the new column
  // unconditionally and a missing column threw, taking down the whole
  // Stores tab with a "Store registry unavailable" 500. Now the
  // attention panel just shows zero rows on a pre-mig deploy.
  const [storesResp, attentionResp, reportsResp] = await Promise.all([
    admin
      .from("stores")
      .select(
        "sap_code, name, brand, city, state, location, manager_name, manager_phone, manager_email, status, opening_date, qr_downloaded_at, created_at",
      )
      .order("brand", { ascending: true })
      .order("city", { ascending: true })
      .order("name", { ascending: true }),
    admin
      .from("stores")
      .select("sap_code, attention_handled_at"),
    admin
      .from("reports")
      .select("store_code, reported_at, acknowledged_at, reporter_phone"),
  ])

  // Build a sap_code → handled-at map from the optional fetch. On a DB
  // without mig 005 applied, attentionResp.error is set (column not found
  // / table missing) and the map stays empty — the attention panel will
  // still derive candidates from criteria, it just won't be able to
  // suppress already-handled rows. Once the migration runs, the map
  // populates and the suppression starts working without a code change.
  const handledByCode = new Map<string, string | null>()
  if (!attentionResp.error && Array.isArray(attentionResp.data)) {
    for (const row of attentionResp.data as Array<{
      sap_code: string
      attention_handled_at: string | null
    }>) {
      handledByCode.set(row.sap_code, row.attention_handled_at)
    }
  } else if (attentionResp.error) {
    // Surface the degraded state in logs so the operator notices the
    // migration is pending; the panel keeps working in best-effort mode.
    console.warn(
      "[ho/stores] attention_handled_at unavailable — has migration 005 run?",
      { code: attentionResp.error.code, msg: attentionResp.error.message },
    )
  }

  if (storesResp.error) {
    console.error("[ho/stores] stores query failed", storesResp.error)
    // Throw so the page-level catch renders the error UI and the cache
    // doesn't store a broken response. Subsequent loads will retry.
    throw new Error("ho-stores-load-failed")
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
  const startOfLast30d = now.getTime() - 30 * 86_400_000

  // Global aggregates the stats-card row consumes.
  const globalReporters = new Set<string>()
  let globalAckCount = 0
  let globalAckUnder2h = 0
  let globalReportsThisMonth = 0
  let globalReportsLastMonth = 0

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
      if (reportedAt >= startOfThisMonth) {
        a.this_month += 1
        globalReportsThisMonth += 1
      } else if (reportedAt >= startOfLastMonth) {
        a.last_month += 1
        globalReportsLastMonth += 1
      }
      if (reportedAt >= startOfLast30d) a.last_30d += 1
      if (
        a.last_report_at == null ||
        Date.parse(a.last_report_at) < reportedAt
      ) {
        a.last_report_at = r.reported_at
      }
    }
    if (r.reporter_phone) {
      const phone = r.reporter_phone.trim()
      a.reporters.add(phone)
      globalReporters.add(phone)
    }
    if (r.acknowledged_at) {
      const ackedAt = Date.parse(r.acknowledged_at)
      if (!Number.isNaN(ackedAt) && !Number.isNaN(reportedAt)) {
        const hours = Math.max(0, (ackedAt - reportedAt) / 36e5)
        a.ack_hours.push(hours)
        if (hours < 24) a.ack_within_24h += 1
        globalAckCount += 1
        if (hours <= 2) globalAckUnder2h += 1
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
      manager_email: s.manager_email,
      // Manager can log in iff BOTH email and phone are on file (mig 004).
      has_credentials: Boolean(s.manager_email) && Boolean(s.manager_phone),
      status: s.status,
      opening_date: s.opening_date,
      report_count: a.total,
      qr_downloaded_at: s.qr_downloaded_at,
      created_at: s.created_at,
      attention_handled_at: handledByCode.get(s.sap_code) ?? null,
      last_report_at: a.last_report_at,
      reports_this_month: a.this_month,
      reports_last_month: a.last_month,
      reports_last_30d: a.last_30d,
      distinct_reporters: a.reporters.size,
      median_ack_hours: medAck,
      pct_acked_within_24h: pct24,
    }
  })

  // Stores-needing-attention derivation. Three triggers, in priority order:
  //   1. never_reported  — store has never had a report submitted
  //   2. dormant         — last report > 30 days ago (Stage 3 of the
  //                        activity tier model, but flagged here as
  //                        actionable because it usually means the manager
  //                        has stopped using the QR poster)
  //   3. low_traffic     — last 30 days has 0 OR 1 report AND the QR is
  //                        distributed AND there has ever been a report
  //                        (so we don't double-flag with `never_reported`)
  //
  // Suppressed when:
  //   - store is permanently_closed (no longer expected to report)
  //   - attention_handled_at is non-null (HO has already actioned this row)
  //   - store is `active` (has a report in the last 7 days) — recently active
  //     stores aren't an attention case even if traffic is otherwise low
  //
  // Surfaced ones get sorted oldest-last-report-first so the most-stale
  // store is at the top of the panel.
  type AttentionReason = "never_reported" | "dormant" | "low_traffic"
  const attention: AttentionItem[] = []
  for (const r of rows) {
    if (r.status === "permanently_closed") continue
    if (r.attention_handled_at) continue
    const daysSinceLast =
      r.last_report_at == null
        ? Infinity
        : (Date.now() - Date.parse(r.last_report_at)) / 86_400_000
    let reason: AttentionReason | null = null
    let detail = ""
    if (r.last_report_at == null) {
      reason = "never_reported"
      detail = r.qr_downloaded_at
        ? "Never reported · QR distributed"
        : "Never reported · QR not yet sent"
    } else if (daysSinceLast > 30) {
      reason = "dormant"
      detail = `Last report ${Math.round(daysSinceLast)} days ago`
    } else if (daysSinceLast > 7 && r.reports_last_30d <= 1 && r.qr_downloaded_at) {
      // Quiet stores with 0-or-1 report in the last 30 days are flagged
      // for outreach. Excludes "active" stores (≤7 day) because they're
      // ramping fine — a low monthly count doesn't matter if the trickle
      // is recent.
      reason = "low_traffic"
      detail = `Only ${r.reports_last_30d} report${r.reports_last_30d === 1 ? "" : "s"} in last 30 days`
    }
    if (!reason) continue
    attention.push({
      sap_code: r.sap_code,
      name: r.name,
      brand: r.brand,
      city: r.city,
      manager_name: r.manager_name,
      manager_phone: r.manager_phone,
      manager_email: r.manager_email,
      reason,
      detail,
      last_report_at: r.last_report_at,
    })
  }
  // Most-stale first — never_reported (Infinity) ranks above any
  // last_report timestamp, so brand-new stores show at the top.
  attention.sort((a, b) => {
    const aMs = a.last_report_at ? Date.parse(a.last_report_at) : 0
    const bMs = b.last_report_at ? Date.parse(b.last_report_at) : 0
    return aMs - bMs
  })

  // Stats-card aggregates. MoM growth is computed against the prior calendar
  // month — null when there is no baseline (avoids a misleading "+∞" pill).
  const momGrowthPct =
    globalReportsLastMonth > 0
      ? Math.round(
          ((globalReportsThisMonth - globalReportsLastMonth) /
            globalReportsLastMonth) *
            100,
        )
      : null
  const pctAckUnder2h =
    globalAckCount > 0
      ? Math.round((globalAckUnder2h / globalAckCount) * 100)
      : null

  const summary: StoresSummary = {
    total_stores: rows.length,
    active_status: rows.filter((r) => r.status === "active").length,
    reports_this_month: globalReportsThisMonth,
    reports_last_month: globalReportsLastMonth,
    mom_growth_pct: momGrowthPct,
    total_reporters: globalReporters.size,
    pct_acked_within_2h: pctAckUnder2h,
  }

  return { rows, summary, attention }
}

export default async function HoStoresPage() {
  await requireHoSession("/ho/stores")
  try {
    const { rows, summary, attention } = await getStoresPageData()
    return <StoresClient rows={rows} summary={summary} attention={attention} />
  } catch (err) {
    console.error("[ho/stores] page load failed", err)
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
}
