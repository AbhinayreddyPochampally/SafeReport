import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { getHoSession } from "@/lib/ho-auth"

/**
 * GET /api/ho-analytics — aggregated data for the HO analytics page.
 *
 * Query params (all optional):
 *   from     YYYY-MM-DD  (inclusive, interpreted as UTC midnight)
 *   to       YYYY-MM-DD  (inclusive, interpreted as next-day UTC midnight)
 *   brand    repeatable  (?brand=Pantaloons&brand=Van+Heusen)
 *   city     repeatable
 *   category repeatable  (one of the eight ReportCategory enum values)
 *
 * Returns:
 *   {
 *     filters: { brands, cities, categories },   // distinct values for the filter UI
 *     totals:  { reports, closed, returned, voided, awaiting_ho, avg_resolution_hours },
 *     weekly:  [{ week_start, new, in_progress, awaiting_ho, returned, closed, voided }, …],
 *     category_mix: [{ month, near_miss, unsafe_act, …, fatality }, …],  // one row per month in range
 *     leaderboard:  [{ sap_code, name, brand, city, total, first_attempt_rate }, …]  // top 20 by volume
 *     heatmap:      [{ category, month, count }, …]                                  // dense 12 cats × N months
 *   }
 *
 * All aggregation is done in Node (Supabase's PostgREST doesn't give us the
 * grouping shape we want without views). The dataset is small (≤ a few k rows
 * in the pilot), so this is fine for now. If it grows we'll push this into a
 * Postgres function or materialised view.
 */

type Row = {
  id: string
  store_code: string
  category: string
  status: string
  reported_at: string
  brand: string
  city: string
}

type Weekly = {
  week_start: string
  new: number
  in_progress: number
  awaiting_ho: number
  returned: number
  closed: number
  voided: number
}

type MonthlyMix = Record<string, number | string> & { month: string }

type LeaderboardRow = {
  sap_code: string
  name: string
  brand: string
  city: string
  total: number
  first_attempt_rate: number
}

type HeatmapCell = { category: string; month: string; count: number }

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

function parseDate(s: string | null, fallback: Date): Date {
  if (!s) return fallback
  // Expect YYYY-MM-DD — anything else falls back silently.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return fallback
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
  return Number.isNaN(d.getTime()) ? fallback : d
}

function mondayOfWeekUTC(d: Date): Date {
  // ISO week starts Monday. getUTCDay() returns 0 (Sun) … 6 (Sat).
  // Convert Sunday → 7 so Monday (1) subtracts 0, Sunday (7) subtracts 6.
  const day = d.getUTCDay() || 7
  const monday = new Date(d)
  monday.setUTCHours(0, 0, 0, 0)
  monday.setUTCDate(d.getUTCDate() - (day - 1))
  return monday
}

function startOfMonthUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export async function GET(req: NextRequest) {
  const session = await getHoSession()
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 })
  }

  const url = new URL(req.url)
  const now = new Date()
  const defaultFrom = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1),
  )
  const from = parseDate(url.searchParams.get("from"), defaultFrom)
  const to = parseDate(url.searchParams.get("to"), now)
  // Treat `to` as inclusive — push to end-of-day.
  const toExclusive = new Date(to)
  toExclusive.setUTCHours(23, 59, 59, 999)

  const brandFilter = url.searchParams.getAll("brand").filter(Boolean)
  const cityFilter = url.searchParams.getAll("city").filter(Boolean)
  const categoryFilter = url.searchParams.getAll("category").filter(Boolean)

  const admin = createSupabaseAdminClient()

  // Pull the filter-option corpus alongside the main query. These are small
  // (≤20 rows each on the pilot) and cheap to fetch every call.
  const [storesResp, reportsResp, resolutionsResp] = await Promise.all([
    admin
      .from("stores")
      .select("sap_code, name, brand, city, status")
      .eq("status", "active"),
    (() => {
      let q = admin
        .from("reports")
        .select(
          "id, store_code, category, status, reported_at, stores!inner(brand, city, name)",
        )
        .gte("reported_at", from.toISOString())
        .lte("reported_at", toExclusive.toISOString())
      if (brandFilter.length > 0) {
        q = q.in("stores.brand", brandFilter)
      }
      if (cityFilter.length > 0) {
        q = q.in("stores.city", cityFilter)
      }
      if (categoryFilter.length > 0) {
        q = q.in("category", categoryFilter)
      }
      return q
    })(),
    admin
      .from("resolutions")
      .select("report_id, attempt_number"),
  ])

  if (storesResp.error) {
    console.error("[analytics] stores", storesResp.error)
    return NextResponse.json({ error: "Query failed." }, { status: 500 })
  }
  if (reportsResp.error) {
    console.error("[analytics] reports", reportsResp.error)
    return NextResponse.json({ error: "Query failed." }, { status: 500 })
  }

  // Flatten the joined `stores` column.
  const rows: Row[] = (reportsResp.data ?? []).map((r) => {
    const s = (r as unknown as {
      stores: { brand: string; city: string; name: string }
    }).stores
    return {
      id: r.id as string,
      store_code: r.store_code as string,
      category: r.category as string,
      status: r.status as string,
      reported_at: r.reported_at as string,
      brand: s?.brand ?? "—",
      city: s?.city ?? "—",
    }
  })

  // ----- filters corpus ----------------------------------------------------
  const brands = Array.from(
    new Set((storesResp.data ?? []).map((s) => s.brand as string)),
  ).sort()
  const cities = Array.from(
    new Set((storesResp.data ?? []).map((s) => s.city as string)),
  ).sort()

  // ----- totals ------------------------------------------------------------
  const totals = {
    reports: rows.length,
    closed: rows.filter((r) => r.status === "closed").length,
    returned: rows.filter((r) => r.status === "returned").length,
    voided: rows.filter((r) => r.status === "voided").length,
    awaiting_ho: rows.filter((r) => r.status === "awaiting_ho").length,
  }

  // ----- weekly stacked area ----------------------------------------------
  // Build every week bucket across [from, to] so the chart x-axis is
  // continuous even when a week has zero reports.
  const weeks: Weekly[] = []
  const weekIndex = new Map<string, number>()
  {
    let cursor = mondayOfWeekUTC(from)
    const end = mondayOfWeekUTC(toExclusive)
    while (cursor <= end) {
      const key = isoDate(cursor)
      weekIndex.set(key, weeks.length)
      weeks.push({
        week_start: key,
        new: 0,
        in_progress: 0,
        awaiting_ho: 0,
        returned: 0,
        closed: 0,
        voided: 0,
      })
      cursor = new Date(cursor)
      cursor.setUTCDate(cursor.getUTCDate() + 7)
    }
  }
  for (const r of rows) {
    const wk = isoDate(mondayOfWeekUTC(new Date(r.reported_at)))
    const idx = weekIndex.get(wk)
    if (idx == null) continue
    const bucket = weeks[idx]
    if (r.status in bucket) {
      ;(bucket as unknown as Record<string, number>)[r.status] += 1
    }
  }

  // ----- category mix per month -------------------------------------------
  const months: MonthlyMix[] = []
  const monthIndex = new Map<string, number>()
  {
    let cursor = startOfMonthUTC(from)
    const end = startOfMonthUTC(toExclusive)
    while (cursor <= end) {
      const key = isoDate(cursor)
      monthIndex.set(key, months.length)
      const row = { month: key } as MonthlyMix
      for (const c of CATEGORY_KEYS) row[c] = 0
      months.push(row)
      cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1))
    }
  }
  for (const r of rows) {
    const m = isoDate(startOfMonthUTC(new Date(r.reported_at)))
    const idx = monthIndex.get(m)
    if (idx == null) continue
    const row = months[idx]
    if (CATEGORY_KEYS.includes(r.category as (typeof CATEGORY_KEYS)[number])) {
      row[r.category] = (row[r.category] as number) + 1
    }
  }

  // ----- leaderboard ------------------------------------------------------
  // First-attempt rate: share of this store's reports that were closed on
  // attempt #1 (i.e. no return round). Approximation: if the only resolution
  // row for a report has attempt_number = 1 AND status = 'closed', it's a
  // first-attempt close. If a report was returned at any point, attempt_number
  // will have climbed past 1 so we can detect it from the max attempt.
  const maxAttemptByReport = new Map<string, number>()
  for (const row of resolutionsResp.data ?? []) {
    const rid = row.report_id as string
    const n = row.attempt_number as number
    const prev = maxAttemptByReport.get(rid) ?? 0
    if (n > prev) maxAttemptByReport.set(rid, n)
  }

  const storeAgg = new Map<
    string,
    { name: string; brand: string; city: string; total: number; firstAttempt: number; closed: number }
  >()
  // Seed with ALL active stores so a zero-volume store still shows up
  // (avoids a "my store is missing" surprise).
  for (const s of storesResp.data ?? []) {
    storeAgg.set(s.sap_code as string, {
      name: s.name as string,
      brand: s.brand as string,
      city: s.city as string,
      total: 0,
      firstAttempt: 0,
      closed: 0,
    })
  }
  for (const r of rows) {
    const agg = storeAgg.get(r.store_code)
    if (!agg) continue
    agg.total += 1
    if (r.status === "closed") {
      agg.closed += 1
      if ((maxAttemptByReport.get(r.id) ?? 0) === 1) {
        agg.firstAttempt += 1
      }
    }
  }
  const leaderboard: LeaderboardRow[] = Array.from(storeAgg.entries())
    .map(([sap_code, v]) => ({
      sap_code,
      name: v.name,
      brand: v.brand,
      city: v.city,
      total: v.total,
      first_attempt_rate: v.closed === 0 ? 0 : v.firstAttempt / v.closed,
    }))
    .sort((a, b) => b.total - a.total || a.sap_code.localeCompare(b.sap_code))
    .slice(0, 20)

  // ----- dense heatmap ----------------------------------------------------
  const heatmap: HeatmapCell[] = []
  for (const cat of CATEGORY_KEYS) {
    for (const m of months) {
      heatmap.push({
        category: cat,
        month: m.month,
        count: (m[cat] as number) ?? 0,
      })
    }
  }

  return NextResponse.json({
    range: { from: isoDate(from), to: isoDate(to) },
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
    weekly: weeks,
    category_mix: months,
    leaderboard,
    heatmap,
  })
}
