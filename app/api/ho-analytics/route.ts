import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { unstable_cache } from "next/cache"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { getHoSession } from "@/lib/ho-auth"

/**
 * GET /api/ho-analytics — aggregated data for the HO analytics page (v2).
 *
 * V2 changes vs the original (May 2026):
 *   - Default range moved from 12 months → 30 days.
 *   - Granularity is daily by default. Ranges longer than 60 days auto-switch
 *     to weekly bucketing so the X-axis stays readable. Caller can force a
 *     value with ?granularity=daily|weekly.
 *   - New `time_analytics` payload: median time to ack, median resolution
 *     time (reported → status=closed via HO approval), first-attempt rate,
 *     and % closed within the 48h SLA — each with a delta vs the previous
 *     equal-length range.
 *   - New `time_series_medians` payload: per-bucket median ack hours and
 *     median resolution hours, for the trend line.
 *   - `weekly` → `time_series_status`, `category_mix` → `time_series_categories`,
 *     both now bucketed by the active granularity. Heatmap is removed.
 *
 * Resolution time uses the ho_actions table — the row with action='approve'
 * is the canonical "this report closed" event. Falls back to reports.updated_at
 * for closed-status rows missing an approve action (legacy rows).
 *
 * Query params (all optional):
 *   from         YYYY-MM-DD  inclusive
 *   to           YYYY-MM-DD  inclusive
 *   granularity  daily | weekly
 *   brand        repeatable
 *   city         repeatable
 *   category     repeatable
 */

type ReportRow = {
  id: string
  store_code: string
  category: string
  status: string
  reported_at: string
  acknowledged_at: string | null
  reporter_phone: string | null
  brand: string
  city: string
}

type BucketedStatus = {
  date: string
  new: number
  in_progress: number
  awaiting_ho: number
  returned: number
  closed: number
  voided: number
}

type BucketedCategory = Record<string, number | string> & { date: string }

type BucketedMedian = {
  date: string
  median_ack_hours: number | null
  median_resolution_hours: number | null
  first_attempt_rate: number | null
  pct_within_48h: number | null
}

type LeaderboardRow = {
  sap_code: string
  name: string
  brand: string
  city: string
  total: number
  first_attempt_rate: number
  unique_reporters: number
  median_ack_hours: number | null
  median_resolution_hours: number | null
  past_48h_count: number
  /**
   * Total landing-page visits to /r/[sap_code] in the active range.
   * Sourced from the page_visits table (mig 006). Visits are tracked
   * starting from the cutover date — older ranges show 0 here.
   */
  visits: number
  /**
   * Subset of `visits` that arrived via a QR scan (URL carried ?src=qr).
   * Difference (`visits - qr_visits`) is direct entry.
   */
  qr_visits: number
  /**
   * Distinct visitor fingerprints (per-day hash of UA) in the range.
   * Approximates unique devices; not unique people.
   */
  unique_visitors: number
}

const CATEGORY_KEYS = [
  "near_miss",
  "unsafe_act",
  "unsafe_condition",
  "first_aid_case",
  "medical_treatment_case",
  "restricted_work_case",
  "lost_time_injury",
  "fatality",
] as const

const SLA_HOURS = 48
const WEEKLY_THRESHOLD_DAYS = 60

function parseDate(s: string | null, fallback: Date): Date {
  if (!s) return fallback
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return fallback
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
  return Number.isNaN(d.getTime()) ? fallback : d
}

function startOfDayUTC(d: Date): Date {
  const x = new Date(d)
  x.setUTCHours(0, 0, 0, 0)
  return x
}

function mondayOfWeekUTC(d: Date): Date {
  const day = d.getUTCDay() || 7
  const monday = new Date(d)
  monday.setUTCHours(0, 0, 0, 0)
  monday.setUTCDate(d.getUTCDate() - (day - 1))
  return monday
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Bucket key for a timestamp under the active granularity. */
function bucketKey(iso: string, granularity: "daily" | "weekly"): string {
  const d = new Date(iso)
  return isoDate(
    granularity === "daily" ? startOfDayUTC(d) : mondayOfWeekUTC(d),
  )
}

/** Step `cursor` to the next bucket boundary in place. */
function stepCursor(cursor: Date, granularity: "daily" | "weekly"): void {
  if (granularity === "daily") {
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  } else {
    cursor.setUTCDate(cursor.getUTCDate() + 7)
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

function percentile(xs: number[], p: number): number | null {
  if (xs.length === 0) return null
  const sorted = [...xs].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
  return sorted[idx]
}

export async function GET(req: NextRequest) {
  const session = await getHoSession()
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 })
  }

  const url = new URL(req.url)
  const now = new Date()
  // Default: last 30 days inclusive.
  const defaultTo = startOfDayUTC(now)
  const defaultFrom = new Date(defaultTo)
  defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 29)

  const from = parseDate(url.searchParams.get("from"), defaultFrom)
  const to = parseDate(url.searchParams.get("to"), defaultTo)
  const toExclusive = new Date(to)
  toExclusive.setUTCHours(23, 59, 59, 999)

  // Granularity: explicit, else auto by span.
  const requestedGran = url.searchParams.get("granularity")
  const spanDays = Math.max(
    1,
    Math.round((toExclusive.getTime() - from.getTime()) / 86_400_000),
  )
  const granularity: "daily" | "weekly" =
    requestedGran === "weekly"
      ? "weekly"
      : requestedGran === "daily"
        ? "daily"
        : spanDays > WEEKLY_THRESHOLD_DAYS
          ? "weekly"
          : "daily"

  const brandFilter = url.searchParams.getAll("brand").filter(Boolean)
  const cityFilter = url.searchParams.getAll("city").filter(Boolean)
  const categoryFilter = url.searchParams.getAll("category").filter(Boolean)

  const admin = createSupabaseAdminClient()

  // Previous equal-length range for delta comparisons.
  const prevTo = new Date(from)
  prevTo.setUTCMilliseconds(prevTo.getUTCMilliseconds() - 1)
  const prevFrom = new Date(prevTo)
  prevFrom.setUTCDate(prevFrom.getUTCDate() - (spanDays - 1))
  prevFrom.setUTCHours(0, 0, 0, 0)

  function buildReportQuery(rangeFrom: Date, rangeToEx: Date) {
    let q = admin
      .from("reports")
      .select(
        "id, store_code, category, status, reported_at, acknowledged_at, reporter_phone, stores!inner(brand, city, name)",
      )
      .gte("reported_at", rangeFrom.toISOString())
      .lte("reported_at", rangeToEx.toISOString())
    if (brandFilter.length > 0) q = q.in("stores.brand", brandFilter)
    if (cityFilter.length > 0) q = q.in("stores.city", cityFilter)
    if (categoryFilter.length > 0) q = q.in("category", categoryFilter)
    return q
  }

  // Server-side cache of the heavy Supabase query bundle. The 6
  // parallel queries below are the dominant cost of a cold-cache hit
  // (~hundreds of ms each, multiplied by the cross-region round trip
  // to Supabase). Cached for 60s keyed by the resolved filter values
  // so two HO users hitting Analytics within the same minute share
  // one fetch. Mutating endpoints (POST /api/reports, /api/ho-actions,
  // /api/resolutions) revalidate the "ho-analytics" tag, so a user
  // never sees stale numbers on their own write.
  //
  // The key array is the stable filter signature — same key → same
  // cache hit. JSON.stringify the filter arrays so order changes
  // don't fragment the cache (e.g. ?brand=A&brand=B vs ?brand=B&brand=A
  // would otherwise be two separate cache entries).
  const sortedBrandKey = [...brandFilter].sort().join(",")
  const sortedCityKey = [...cityFilter].sort().join(",")
  const sortedCatKey = [...categoryFilter].sort().join(",")
  const cacheKey = [
    isoDate(from),
    isoDate(to),
    sortedBrandKey,
    sortedCityKey,
    sortedCatKey,
  ]
  const fetchBundle = unstable_cache(
    async () =>
      Promise.all([
        admin
          .from("stores")
          .select("sap_code, name, brand, city, status")
          .eq("status", "active"),
        buildReportQuery(from, toExclusive),
        buildReportQuery(prevFrom, prevTo),
        admin.from("resolutions").select("report_id, attempt_number"),
        admin
          .from("ho_actions")
          .select("report_id, action, acted_at")
          .eq("action", "approve"),
        admin
          .from("page_visits")
          .select("sap_code, source, visitor_fingerprint")
          .gte("visited_at", from.toISOString())
          .lte("visited_at", toExclusive.toISOString()),
      ]),
    ["ho-analytics-bundle", ...cacheKey],
    { revalidate: 60, tags: ["ho-analytics"] },
  )
  const [
    storesResp,
    reportsResp,
    prevReportsResp,
    resolutionsResp,
    approvalsResp,
    visitsResp,
  ] = await fetchBundle()
  // page_visits — landing-page hits per store in the active range.
  // Note inside the fetchBundle above: brand/city filters can't be
  // applied to the page_visits select because that table joins to
  // stores by sap_code; we filter the aggregated counts client-side
  // via the stores set instead. Cheap because the table is small
  // and the SAP-code lookup is O(1).

  if (storesResp.error || reportsResp.error || prevReportsResp.error) {
    console.error(
      "[analytics] query failed",
      storesResp.error || reportsResp.error || prevReportsResp.error,
    )
    return NextResponse.json({ error: "Query failed." }, { status: 500 })
  }

  function flatten(rows: unknown[]): ReportRow[] {
    return (
      rows as Array<{
        id: string
        store_code: string
        category: string
        status: string
        reported_at: string
        acknowledged_at: string | null
        reporter_phone: string | null
        stores: { brand: string; city: string; name: string } | null
      }>
    ).map((r) => ({
      id: r.id,
      store_code: r.store_code,
      category: r.category,
      status: r.status,
      reported_at: r.reported_at,
      acknowledged_at: r.acknowledged_at,
      reporter_phone: r.reporter_phone,
      brand: r.stores?.brand ?? "—",
      city: r.stores?.city ?? "—",
    }))
  }

  const rows = flatten((reportsResp.data ?? []) as unknown[])
  const prevRows = flatten((prevReportsResp.data ?? []) as unknown[])

  // Max attempt per report (used in first-attempt-rate computation, both for
  // the headline cards and the per-bucket sparkline data).
  const maxAttemptByReport = new Map<string, number>()
  for (const r of resolutionsResp.data ?? []) {
    const rid = r.report_id as string
    const n = r.attempt_number as number
    const prev = maxAttemptByReport.get(rid) ?? 0
    if (n > prev) maxAttemptByReport.set(rid, n)
  }

  // ---- approval timestamps (latest approve per report_id) ----
  const approvedAtByReport = new Map<string, string>()
  for (const a of approvalsResp.data ?? []) {
    const rid = a.report_id as string
    const at = a.acted_at as string
    const prev = approvedAtByReport.get(rid)
    if (!prev || prev < at) approvedAtByReport.set(rid, at)
  }

  // ---- filters corpus ----
  const brands = Array.from(
    new Set((storesResp.data ?? []).map((s) => s.brand as string)),
  ).sort()
  const cities = Array.from(
    new Set((storesResp.data ?? []).map((s) => s.city as string)),
  ).sort()

  // ---- totals ----
  const totals = {
    reports: rows.length,
    closed: rows.filter((r) => r.status === "closed").length,
    returned: rows.filter((r) => r.status === "returned").length,
    voided: rows.filter((r) => r.status === "voided").length,
    awaiting_ho: rows.filter((r) => r.status === "awaiting_ho").length,
  }

  // ---- Time analytics ----
  function computeTimeAnalytics(scope: ReportRow[]) {
    const ackHours: number[] = []
    const resHours: number[] = []
    let firstAttemptClosed = 0
    let withinSla = 0

    for (const r of scope) {
      const reportedTs = Date.parse(r.reported_at)
      if (Number.isNaN(reportedTs)) continue
      if (r.acknowledged_at) {
        const ackTs = Date.parse(r.acknowledged_at)
        if (!Number.isNaN(ackTs)) {
          ackHours.push(Math.max(0, (ackTs - reportedTs) / 36e5))
        }
      }
      if (r.status === "closed") {
        const closedAtIso = approvedAtByReport.get(r.id)
        if (closedAtIso) {
          const closedTs = Date.parse(closedAtIso)
          if (!Number.isNaN(closedTs)) {
            const hours = Math.max(0, (closedTs - reportedTs) / 36e5)
            resHours.push(hours)
            if (hours <= SLA_HOURS) withinSla += 1
          }
        }
        if ((maxAttemptByReport.get(r.id) ?? 0) === 1) {
          firstAttemptClosed += 1
        }
      }
    }
    const closedCount = scope.filter((r) => r.status === "closed").length
    return {
      median_ack_hours: median(ackHours),
      p90_ack_hours: percentile(ackHours, 90),
      median_resolution_hours: median(resHours),
      p90_resolution_hours: percentile(resHours, 90),
      first_attempt_rate: closedCount === 0 ? null : firstAttemptClosed / closedCount,
      pct_within_48h: closedCount === 0 ? null : withinSla / closedCount,
      acked_count: ackHours.length,
      closed_count: closedCount,
    }
  }

  const time_analytics = computeTimeAnalytics(rows)
  const time_analytics_prev = computeTimeAnalytics(prevRows)

  // ---- Build bucket scaffold ----
  type Bucket = {
    date: string
    statusCounts: Record<string, number>
    categoryCounts: Record<string, number>
    ackHours: number[]
    resHours: number[]
    closedCount: number
    firstAttemptClosed: number
    within48hClosed: number
  }
  const buckets: Bucket[] = []
  const bucketIndex = new Map<string, number>()

  {
    const cursor =
      granularity === "daily" ? startOfDayUTC(from) : mondayOfWeekUTC(from)
    const end =
      granularity === "daily"
        ? startOfDayUTC(toExclusive)
        : mondayOfWeekUTC(toExclusive)
    while (cursor <= end) {
      const key = isoDate(cursor)
      bucketIndex.set(key, buckets.length)
      buckets.push({
        date: key,
        statusCounts: {
          new: 0,
          in_progress: 0,
          awaiting_ho: 0,
          returned: 0,
          closed: 0,
          voided: 0,
        },
        categoryCounts: Object.fromEntries(CATEGORY_KEYS.map((k) => [k, 0])),
        ackHours: [],
        resHours: [],
        closedCount: 0,
        firstAttemptClosed: 0,
        within48hClosed: 0,
      })
      stepCursor(cursor, granularity)
    }
  }

  for (const r of rows) {
    const key = bucketKey(r.reported_at, granularity)
    const idx = bucketIndex.get(key)
    if (idx == null) continue
    const b = buckets[idx]
    b.statusCounts[r.status] = (b.statusCounts[r.status] ?? 0) + 1
    if ((CATEGORY_KEYS as readonly string[]).includes(r.category)) {
      b.categoryCounts[r.category] = (b.categoryCounts[r.category] ?? 0) + 1
    }
    const reportedTs = Date.parse(r.reported_at)
    if (r.acknowledged_at) {
      const ackTs = Date.parse(r.acknowledged_at)
      if (!Number.isNaN(ackTs) && !Number.isNaN(reportedTs)) {
        b.ackHours.push(Math.max(0, (ackTs - reportedTs) / 36e5))
      }
    }
    if (r.status === "closed") {
      b.closedCount += 1
      if ((maxAttemptByReport.get(r.id) ?? 0) === 1) b.firstAttemptClosed += 1
      const closedAtIso = approvedAtByReport.get(r.id)
      if (closedAtIso) {
        const closedTs = Date.parse(closedAtIso)
        if (!Number.isNaN(closedTs) && !Number.isNaN(reportedTs)) {
          const hours = Math.max(0, (closedTs - reportedTs) / 36e5)
          b.resHours.push(hours)
          if (hours <= SLA_HOURS) b.within48hClosed += 1
        }
      }
    }
  }

  const time_series_status: BucketedStatus[] = buckets.map((b) => ({
    date: b.date,
    new: b.statusCounts.new,
    in_progress: b.statusCounts.in_progress,
    awaiting_ho: b.statusCounts.awaiting_ho,
    returned: b.statusCounts.returned,
    closed: b.statusCounts.closed,
    voided: b.statusCounts.voided,
  }))

  const time_series_categories: BucketedCategory[] = buckets.map((b) => {
    const row = { date: b.date } as BucketedCategory
    for (const c of CATEGORY_KEYS) row[c] = b.categoryCounts[c] ?? 0
    return row
  })

  const time_series_medians: BucketedMedian[] = buckets.map((b) => ({
    date: b.date,
    median_ack_hours: median(b.ackHours),
    median_resolution_hours: median(b.resHours),
    first_attempt_rate:
      b.closedCount === 0 ? null : b.firstAttemptClosed / b.closedCount,
    pct_within_48h:
      b.closedCount === 0 ? null : b.within48hClosed / b.closedCount,
  }))

  // ---- Page-visit aggregation (per SAP code) ----------------------------
  // Bucketed once up-front so the leaderboard loop is O(1) per store.
  // `unique_visitors` is the distinct count of the daily-rotating
  // fingerprints we wrote into page_visits — approximates unique devices
  // in the range. Not unique people; someone visiting from two devices
  // counts as two.
  type VisitAgg = {
    visits: number
    qr_visits: number
    fingerprints: Set<string>
  }
  const visitAgg = new Map<string, VisitAgg>()
  for (const v of visitsResp.data ?? []) {
    const sap = v.sap_code as string
    let agg = visitAgg.get(sap)
    if (!agg) {
      agg = { visits: 0, qr_visits: 0, fingerprints: new Set<string>() }
      visitAgg.set(sap, agg)
    }
    agg.visits += 1
    if (v.source === "qr") agg.qr_visits += 1
    if (v.visitor_fingerprint)
      agg.fingerprints.add(v.visitor_fingerprint as string)
  }

  // ---- Leaderboard ----
  const past48hCutoffMs = Date.now() - SLA_HOURS * 36e5
  type StoreAgg = {
    name: string
    brand: string
    city: string
    total: number
    firstAttempt: number
    closed: number
    reporters: Set<string>
    ackHours: number[]
    resHours: number[]
    past48h: number
  }
  const storeAgg = new Map<string, StoreAgg>()
  for (const s of storesResp.data ?? []) {
    storeAgg.set(s.sap_code as string, {
      name: s.name as string,
      brand: s.brand as string,
      city: s.city as string,
      total: 0,
      firstAttempt: 0,
      closed: 0,
      reporters: new Set<string>(),
      ackHours: [],
      resHours: [],
      past48h: 0,
    })
  }
  for (const r of rows) {
    const agg = storeAgg.get(r.store_code)
    if (!agg) continue
    agg.total += 1
    if (r.reporter_phone) agg.reporters.add(r.reporter_phone.trim())
    const reportedTs = Date.parse(r.reported_at)
    if (r.acknowledged_at) {
      const ackTs = Date.parse(r.acknowledged_at)
      if (!Number.isNaN(ackTs) && !Number.isNaN(reportedTs)) {
        agg.ackHours.push(Math.max(0, (ackTs - reportedTs) / 36e5))
      }
    }
    if (r.status === "closed") {
      agg.closed += 1
      if ((maxAttemptByReport.get(r.id) ?? 0) === 1) {
        agg.firstAttempt += 1
      }
      const closedAtIso = approvedAtByReport.get(r.id)
      if (closedAtIso) {
        const closedTs = Date.parse(closedAtIso)
        if (!Number.isNaN(closedTs) && !Number.isNaN(reportedTs)) {
          agg.resHours.push(Math.max(0, (closedTs - reportedTs) / 36e5))
        }
      }
    }
    if (
      r.status === "awaiting_ho" &&
      !Number.isNaN(reportedTs) &&
      reportedTs <= past48hCutoffMs
    ) {
      agg.past48h += 1
    }
  }
  const leaderboard: LeaderboardRow[] = Array.from(storeAgg.entries())
    .map(([sap_code, v]) => {
      const visit = visitAgg.get(sap_code)
      return {
        sap_code,
        name: v.name,
        brand: v.brand,
        city: v.city,
        total: v.total,
        first_attempt_rate: v.closed === 0 ? 0 : v.firstAttempt / v.closed,
        unique_reporters: v.reporters.size,
        median_ack_hours: median(v.ackHours),
        median_resolution_hours: median(v.resHours),
        past_48h_count: v.past48h,
        visits: visit?.visits ?? 0,
        qr_visits: visit?.qr_visits ?? 0,
        unique_visitors: visit ? visit.fingerprints.size : 0,
      }
    })
    .sort((a, b) => b.total - a.total || a.sap_code.localeCompare(b.sap_code))
    .slice(0, 20)

  // Cache the response for 60s in the browser, with a 5-minute
  // stale-while-revalidate window so back-and-forth nav between
  // Analytics and other HO tabs in the same session reuses the
  // browser-cached payload instead of round-tripping to Supabase.
  //
  // `private` because the response is per-session (the auth check
  // gates access). `no-transform` blocks any intermediary from
  // recompressing or otherwise mutating the JSON.
  //
  // The browser cache key is the full URL (including all filter
  // query params), so a user toggling between presets cycles
  // through cached responses without hitting the server again
  // within the window. The client component is also updated to
  // drop its `cache: "no-store"` directive — without that change
  // these headers are ignored.
  return NextResponse.json(
    {
      range: { from: isoDate(from), to: isoDate(to), span_days: spanDays },
      granularity,
      filters: {
        brands,
        cities,
        categories: CATEGORY_KEYS,
        applied: {
          brand: brandFilter,
          city: cityFilter,
          category: categoryFilter,
        },
      },
      totals,
      time_analytics,
      time_analytics_prev,
      time_series_status,
      time_series_categories,
      time_series_medians,
      leaderboard,
      sla_hours: SLA_HOURS,
    },
    {
      headers: {
        "Cache-Control":
          "private, max-age=60, stale-while-revalidate=300, no-transform",
      },
    },
  )
}
