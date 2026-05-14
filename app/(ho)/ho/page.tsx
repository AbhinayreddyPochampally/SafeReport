import Link from "next/link"
import {
  Activity,
  ArrowRight,
  Gauge,
  Info,
  Layers,
  Repeat,
  Target,
  Timer,
  TrendingDown,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react"
import { requireHoSession } from "@/lib/ho-auth"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { CATEGORIES } from "@/lib/categories"
import type { ReportCategory } from "@/lib/reporter-state"
import { QueueList, type QueueRow, type QueueStatus } from "./queue-list"

export const dynamic = "force-dynamic"

/**
 * HO landing — /ho.
 *
 * Layout (top → bottom):
 *   1. Page header
 *   2. Velocity strip — four ops metrics (median ack, median close,
 *      % closed within 48h, first-attempt rate) each with a WoW delta.
 *      Replaces the previous "Reports this month / Awaiting / Closed /
 *      Returned" cards as of May 2026 — those duplicated state that's
 *      visible in the queues below and offered no decision-relevant signal.
 *   3. Pulse row — three panels: Today (last 24h activity), Coverage
 *      (stores reporting this week, donut), Category mix (top 5 categories
 *      this week with WoW arrows).
 *   4. Trend chart — 14-day median ack + resolution time-series with
 *      48h SLA reference, lifted from the Analytics page so HO can see
 *      whether the velocity tiles' WoW snapshot is a blip or a real trend.
 *   5. Approval + Pipeline queues (unchanged).
 *
 * The "Stores needing attention" panel that lived above the queues was
 * dropped in this rev — the past-48h-waiting subsection duplicated the
 * Approval queue's SLA-breach pill, and the quiet-stores subsection
 * didn't drive any action HO was actually taking. The Stores tab carries
 * the same data for anyone who wants it.
 *
 * Window definitions:
 *   - "this week" = last 7 days from now (rolling, not calendar-aligned)
 *   - "prev week" = 8–14 days ago, equal length for WoW deltas
 *   - "today" = last 24 hours from now
 *   - trend chart = 14 daily buckets ending today (UTC day boundary)
 *
 * All data fetched in parallel on the server; no polling, no realtime.
 *
 * Data shape notes:
 *  - `reports.store_code` joins to `stores.sap_code`
 *  - Resolution time uses ho_actions.acted_at for the latest 'approve' row
 *    per report — the same canonical "closed" event /api/ho-analytics uses.
 *  - Scope is pilot-wide (national) for every HO user.
 */

const SLA_HOURS = 48
const WEEK_MS = 7 * 24 * 36e5
const DAY_MS = 24 * 36e5
const TREND_DAYS = 14

/** A pair of values used to render WoW velocity tiles. */
type Metric = {
  value: number | null
  prev: number | null
}

type Velocity = {
  median_ack_hours: Metric
  median_close_hours: Metric
  pct_within_48h: Metric
  first_attempt_rate: Metric
}

type TodayEvent = {
  id: string
  store_code: string
  store_name: string
  brand: string
  category: ReportCategory
  kind: "observation" | "incident"
  reported_at: string
}

type Coverage = {
  reporting: number
  total: number
  /** Fraction 0..1; 0 if total is 0. */
  pct: number
}

type CategoryMixRow = {
  key: ReportCategory
  label: string
  kind: "observation" | "incident"
  count: number
  prev: number
}

type DailyMedian = {
  /** ISO date, YYYY-MM-DD, in UTC. */
  date: string
  /** Median ack hours for reports reported this day (null if none acked). */
  median_ack: number | null
  /** Median resolution hours for reports reported this day (null if none closed). */
  median_resolution: number | null
}

/* ----------------------------- Utility helpers ---------------------------- */

function median(xs: number[]): number | null {
  if (xs.length === 0) return null
  const sorted = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

function startOfDayUTC(d: Date): Date {
  const x = new Date(d)
  x.setUTCHours(0, 0, 0, 0)
  return x
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/* ------------------------------ Data fetch -------------------------------- */

/**
 * Pulls everything the landing needs in one parallel batch. The past-14d
 * reports query is shared across velocity / today / coverage / categories /
 * trend chart — pilot-scale (~hundreds of rows at most) so the partition is
 * cheap. The open-queue query is separate because open reports can predate
 * the 14-day window.
 */
async function fetchLandingData() {
  const admin = createSupabaseAdminClient()
  const now = new Date()
  const weekStartMs = now.getTime() - WEEK_MS
  const prevWeekStartMs = now.getTime() - 2 * WEEK_MS
  const dayStartMs = now.getTime() - DAY_MS
  const prevWeekStartIso = new Date(prevWeekStartMs).toISOString()

  const [past14dReportsResp, resolutionsResp, approvalsResp, openRowsResp, activeStoresResp] =
    await Promise.all([
      admin
        .from("reports")
        .select(
          "id, store_code, category, status, reported_at, acknowledged_at, stores!inner(name, brand)",
        )
        .gte("reported_at", prevWeekStartIso)
        .order("reported_at", { ascending: false }),
      admin.from("resolutions").select("report_id, attempt_number"),
      admin
        .from("ho_actions")
        .select("report_id, acted_at")
        .eq("action", "approve"),
      admin
        .from("reports")
        .select(
          "id, store_code, category, status, reported_at, transcript, description, stores!inner(name, brand, manager_name)",
        )
        .in("status", ["new", "in_progress", "awaiting_ho", "returned"])
        .order("reported_at", { ascending: true })
        .limit(100),
      admin
        .from("stores")
        .select("sap_code", { count: "exact" })
        .eq("status", "active"),
    ])

  type RawReport = {
    id: string
    store_code: string
    category: ReportCategory
    status: string
    reported_at: string
    acknowledged_at: string | null
    stores: { name: string; brand: string } | null
  }
  const past14d = (past14dReportsResp.data ?? []) as unknown as RawReport[]

  // Latest 'approve' acted_at per report — the canonical "closed at" timestamp.
  const approvedAt = new Map<string, number>()
  for (const a of approvalsResp.data ?? []) {
    const rid = a.report_id as string
    const ts = Date.parse(a.acted_at as string)
    if (Number.isNaN(ts)) continue
    const prev = approvedAt.get(rid) ?? 0
    if (ts > prev) approvedAt.set(rid, ts)
  }

  // Max attempt per report — drives first-attempt-rate.
  const maxAttempt = new Map<string, number>()
  for (const r of resolutionsResp.data ?? []) {
    const rid = r.report_id as string
    const n = (r.attempt_number as number) ?? 0
    const prev = maxAttempt.get(rid) ?? 0
    if (n > prev) maxAttempt.set(rid, n)
  }

  // -- Velocity: compute thisWeek + prevWeek metrics over past14d --
  function computeWindow(fromMs: number, toMs: number): {
    median_ack_hours: number | null
    median_close_hours: number | null
    pct_within_48h: number | null
    first_attempt_rate: number | null
  } {
    const ackHours: number[] = []
    const closeHours: number[] = []
    let closedCount = 0
    let withinSla = 0
    let firstAttempt = 0
    for (const r of past14d) {
      const reportedTs = Date.parse(r.reported_at)
      if (!Number.isFinite(reportedTs)) continue
      if (reportedTs < fromMs || reportedTs >= toMs) continue
      if (r.acknowledged_at) {
        const ackTs = Date.parse(r.acknowledged_at)
        if (Number.isFinite(ackTs)) {
          ackHours.push(Math.max(0, (ackTs - reportedTs) / 36e5))
        }
      }
      if (r.status === "closed") {
        closedCount += 1
        const closedTs = approvedAt.get(r.id)
        if (closedTs) {
          const hours = Math.max(0, (closedTs - reportedTs) / 36e5)
          closeHours.push(hours)
          if (hours <= SLA_HOURS) withinSla += 1
        }
        if ((maxAttempt.get(r.id) ?? 0) === 1) firstAttempt += 1
      }
    }
    return {
      median_ack_hours: median(ackHours),
      median_close_hours: median(closeHours),
      pct_within_48h: closedCount === 0 ? null : withinSla / closedCount,
      first_attempt_rate: closedCount === 0 ? null : firstAttempt / closedCount,
    }
  }
  const thisW = computeWindow(weekStartMs, now.getTime())
  const prevW = computeWindow(prevWeekStartMs, weekStartMs)
  const velocity: Velocity = {
    median_ack_hours: { value: thisW.median_ack_hours, prev: prevW.median_ack_hours },
    median_close_hours: { value: thisW.median_close_hours, prev: prevW.median_close_hours },
    pct_within_48h: { value: thisW.pct_within_48h, prev: prevW.pct_within_48h },
    first_attempt_rate: { value: thisW.first_attempt_rate, prev: prevW.first_attempt_rate },
  }

  // -- Today strip: most-recent 5 reports from past 24h --
  const todayEvents: TodayEvent[] = []
  for (const r of past14d) {
    const ts = Date.parse(r.reported_at)
    if (!Number.isFinite(ts) || ts < dayStartMs) continue
    const def = CATEGORIES.find((c) => c.key === r.category)
    todayEvents.push({
      id: r.id,
      store_code: r.store_code,
      store_name: r.stores?.name ?? "—",
      brand: r.stores?.brand ?? "—",
      category: r.category,
      kind: def?.kind ?? "observation",
      reported_at: r.reported_at,
    })
    if (todayEvents.length >= 5) break
  }

  // -- Coverage: distinct stores with at least one report this week --
  const reportingThisWeek = new Set<string>()
  for (const r of past14d) {
    const ts = Date.parse(r.reported_at)
    if (Number.isFinite(ts) && ts >= weekStartMs) {
      reportingThisWeek.add(r.store_code)
    }
  }
  const totalActiveStores = activeStoresResp.count ?? (activeStoresResp.data?.length ?? 0)
  const coverage: Coverage = {
    reporting: reportingThisWeek.size,
    total: totalActiveStores,
    pct: totalActiveStores === 0 ? 0 : reportingThisWeek.size / totalActiveStores,
  }

  // -- Category mix: this week vs prev week, top 5 by this-week count --
  const thisCounts = new Map<string, number>()
  const prevCounts = new Map<string, number>()
  for (const r of past14d) {
    const ts = Date.parse(r.reported_at)
    if (!Number.isFinite(ts)) continue
    const target = ts >= weekStartMs ? thisCounts : prevCounts
    target.set(r.category, (target.get(r.category) ?? 0) + 1)
  }
  const categoryMix: CategoryMixRow[] = CATEGORIES.map((c) => ({
    key: c.key,
    label: c.label,
    kind: c.kind,
    count: thisCounts.get(c.key) ?? 0,
    prev: prevCounts.get(c.key) ?? 0,
  }))
    .filter((r) => r.count > 0 || r.prev > 0)
    .sort((a, b) => b.count - a.count || b.prev - a.prev)
    .slice(0, 5)

  // -- Trend chart: 14 daily buckets ending today (UTC), median ack + close --
  const dailyMedians: DailyMedian[] = []
  const cursor = startOfDayUTC(new Date(now.getTime() - (TREND_DAYS - 1) * DAY_MS))
  const dailyBuckets = new Map<string, { ack: number[]; close: number[] }>()
  for (let i = 0; i < TREND_DAYS; i += 1) {
    const key = isoDate(cursor)
    dailyBuckets.set(key, { ack: [], close: [] })
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  for (const r of past14d) {
    const reportedTs = Date.parse(r.reported_at)
    if (!Number.isFinite(reportedTs)) continue
    const key = isoDate(startOfDayUTC(new Date(reportedTs)))
    const bucket = dailyBuckets.get(key)
    if (!bucket) continue
    if (r.acknowledged_at) {
      const ackTs = Date.parse(r.acknowledged_at)
      if (Number.isFinite(ackTs)) {
        bucket.ack.push(Math.max(0, (ackTs - reportedTs) / 36e5))
      }
    }
    if (r.status === "closed") {
      const closedTs = approvedAt.get(r.id)
      if (closedTs) {
        bucket.close.push(Math.max(0, (closedTs - reportedTs) / 36e5))
      }
    }
  }
  for (const [date, b] of dailyBuckets.entries()) {
    dailyMedians.push({
      date,
      median_ack: median(b.ack),
      median_resolution: median(b.close),
    })
  }
  dailyMedians.sort((a, b) => a.date.localeCompare(b.date))

  // -- Open queues (unchanged from prior rev) --
  const openRaw = (openRowsResp.data ?? []) as unknown as Array<{
    id: string
    store_code: string
    category: ReportCategory
    status: QueueStatus
    reported_at: string
    transcript: string | null
    description: string | null
    stores: { name: string; brand: string; manager_name: string | null } | null
  }>
  const allOpen: QueueRow[] = openRaw.map((r) => {
    const transcript = r.transcript?.trim() ?? ""
    const description = r.description?.trim() ?? ""
    const headline = (transcript || description || "").slice(0, 110) || null
    return {
      id: r.id,
      store_code: r.store_code,
      store_name: r.stores?.name ?? "—",
      brand: r.stores?.brand ?? "—",
      category: r.category,
      status: r.status,
      reported_at: r.reported_at,
      manager_name: r.stores?.manager_name ?? null,
      headline,
    }
  })
  const approvalRows = allOpen
    .filter((r) => r.status === "awaiting_ho")
    .sort((a, b) => a.reported_at.localeCompare(b.reported_at))
  const pipelineRows = allOpen
    .filter((r) => r.status !== "awaiting_ho")
    .sort((a, b) => b.reported_at.localeCompare(a.reported_at))

  return {
    velocity,
    todayEvents,
    coverage,
    categoryMix,
    dailyMedians,
    approvalRows,
    pipelineRows,
    /** Total reports counted toward this-week's mix (denominator for % math). */
    thisWeekTotal: Array.from(thisCounts.values()).reduce((a, b) => a + b, 0),
  }
}

/* ------------------------------- Page shell ------------------------------- */

export default async function HoLandingPage() {
  await requireHoSession("/ho")
  const data = await fetchLandingData()

  return (
    <div className="max-w-[1400px] mx-auto px-8 py-8">
      {/* Page header */}
      <header className="mb-6">
        <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-slate-500">
          Pilot · ABFRL · 20 stores
        </p>
        <div className="mt-1 flex items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-[26px] font-semibold tracking-tight text-slate-900">
              Overview
            </h1>
            <p className="mt-1 text-[13px] text-slate-600">
              A pulse on the safety program — and where to act this morning.
            </p>
          </div>
          <p className="text-[11.5px] text-slate-500 tabular-nums shrink-0">
            Updated{" "}
            {new Date().toLocaleString("en-IN", {
              day: "2-digit",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            })}{" "}
            IST
          </p>
        </div>
      </header>

      {/* Velocity strip — four ops metrics, WoW deltas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <VelocityTile
          icon={Timer}
          label="Median time to acknowledge"
          metric={data.velocity.median_ack_hours}
          format="hours"
          lowerIsBetter
          tooltip="Median time from a reporter filing to the store manager acknowledging. Lower is better."
        />
        <VelocityTile
          icon={Gauge}
          label="Median time to close"
          metric={data.velocity.median_close_hours}
          format="hours"
          lowerIsBetter
          tooltip="Median time from filing to HO approval of the manager's resolution. Lower is better."
        />
        <VelocityTile
          icon={Target}
          label="Closed within 48h"
          metric={data.velocity.pct_within_48h}
          format="percent"
          lowerIsBetter={false}
          tooltip="Of reports closed in the last 7 days, fraction that closed inside the 48-hour SLA. Higher is better."
        />
        <VelocityTile
          icon={Repeat}
          label="First-attempt fix rate"
          metric={data.velocity.first_attempt_rate}
          format="percent"
          lowerIsBetter={false}
          tooltip="Of reports closed in the last 7 days, fraction where the manager's first resolution was approved without a return. Higher is better."
        />
      </div>

      {/* Pulse row — Today / Coverage / Category mix */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-5">
        <TodayPanel events={data.todayEvents} />
        <CoveragePanel coverage={data.coverage} />
        <CategoryMixPanel rows={data.categoryMix} total={data.thisWeekTotal} />
      </div>

      {/* Trend — 14-day median ack + resolution, with 48h SLA reference */}
      <TrendPanel dailyMedians={data.dailyMedians} />

      {/* Queues — Approval (left) + Pipeline (right) */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-stretch">
        <QueueList
          variant="approval"
          rows={data.approvalRows}
          viewAllHref="/ho/all-reports?status=awaiting_ho"
        />
        <QueueList
          variant="pipeline"
          rows={data.pipelineRows}
          viewAllHref="/ho/all-reports?status=open"
        />
      </div>
    </div>
  )
}

/* ------------------------------ Velocity tile ----------------------------- */

/**
 * One ops metric with a WoW delta. Mirrors the visual convention of the
 * matching tile on the Analytics page: teal value when present, sentence-
 * style delta line below, polarity-aware colouring (teal-700 = improving,
 * orange-700 = worsening, slate-500 = unchanged). The `lowerIsBetter`
 * flag flips the polarity for time-based metrics.
 */
function VelocityTile({
  icon: Icon,
  label,
  metric,
  format,
  lowerIsBetter,
  tooltip,
}: {
  icon: LucideIcon
  label: string
  metric: Metric
  format: "hours" | "percent"
  lowerIsBetter: boolean
  tooltip: string
}) {
  const { value, prev } = metric
  const hasValue = value !== null
  const hasDelta = hasValue && prev !== null
  const delta = hasDelta ? (value as number) - (prev as number) : 0
  const epsilon = format === "hours" ? 0.005 : 0.0005
  const unchanged = hasDelta && Math.abs(delta) < epsilon
  const better = hasDelta && !unchanged && (lowerIsBetter ? delta < 0 : delta > 0)
  const worse = hasDelta && !unchanged && (lowerIsBetter ? delta > 0 : delta < 0)

  const deltaText = !hasDelta
    ? "No prior-week comparison"
    : unchanged
      ? "Unchanged vs last week"
      : format === "hours"
        ? `${formatHoursDelta(Math.abs(delta))} ${better ? "faster" : "slower"} vs last week`
        : `${(Math.abs(delta) * 100).toFixed(1)} pp ${better ? "up" : "down"} vs last week`

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            aria-hidden
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-teal-50 text-teal-700 shrink-0"
          >
            <Icon className="h-4 w-4" />
          </span>
          <span className="text-[12.5px] font-medium text-slate-700 leading-tight">
            {label}
          </span>
        </div>
        <span
          title={tooltip}
          aria-label={tooltip}
          className="text-slate-400 hover:text-slate-600 shrink-0 mt-0.5 cursor-help"
        >
          <Info className="h-3.5 w-3.5" />
        </span>
      </div>

      <div
        className={`mt-3 text-[32px] font-semibold tabular-nums leading-none ${
          hasValue ? "text-teal-700" : "text-slate-400"
        }`}
      >
        {format === "hours" ? formatHoursValue(value) : formatPercentValue(value)}
      </div>

      <div
        className={`mt-2 inline-flex items-center gap-1.5 text-[11.5px] ${
          better
            ? "text-teal-700"
            : worse
              ? "text-orange-700"
              : "text-slate-500"
        }`}
      >
        {!hasDelta || unchanged ? (
          <Info className="h-3 w-3" aria-hidden />
        ) : better ? (
          lowerIsBetter ? (
            <TrendingDown className="h-3 w-3" aria-hidden />
          ) : (
            <TrendingUp className="h-3 w-3" aria-hidden />
          )
        ) : lowerIsBetter ? (
          <TrendingUp className="h-3 w-3" aria-hidden />
        ) : (
          <TrendingDown className="h-3 w-3" aria-hidden />
        )}
        <span className="font-medium">{deltaText}</span>
      </div>
    </div>
  )
}

function formatHoursValue(h: number | null): string {
  if (h === null) return "—"
  if (h < 1) return `${Math.round(h * 60)}m`
  if (h < 48) return `${h.toFixed(1)}h`
  return `${(h / 24).toFixed(1)}d`
}

function formatHoursDelta(absH: number): string {
  if (absH < 1) return `${Math.round(absH * 60)}m`
  if (absH < 48) return `${absH.toFixed(1)}h`
  return `${(absH / 24).toFixed(1)}d`
}

function formatPercentValue(p: number | null): string {
  if (p === null) return "—"
  return `${Math.round(p * 100)}%`
}

/* ------------------------------- Today panel ------------------------------ */

function TodayPanel({ events }: { events: TodayEvent[] }) {
  return (
    <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <header className="flex items-center justify-between px-4 pt-3.5 pb-2">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-indigo-700" aria-hidden />
          <h2 className="text-[10.5px] font-bold uppercase tracking-[0.10em] text-slate-600">
            Today · last 24 hours
          </h2>
        </div>
        <span className="text-[11px] font-medium tabular-nums text-slate-700">
          {events.length} {events.length === 1 ? "event" : "events"}
        </span>
      </header>
      {events.length === 0 ? (
        <p className="px-4 pb-4 pt-1 text-[12px] text-slate-500 italic">
          No new reports in the last 24 hours.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {events.map((e) => (
            <li key={e.id}>
              <Link
                href={`/ho/reports/${e.id}`}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors"
              >
                <span
                  aria-hidden
                  className={`h-2 w-2 rounded-full shrink-0 ${
                    e.kind === "incident" ? "bg-amber-700" : "bg-slate-400"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] font-medium text-slate-900 truncate">
                    {labelFor(e.category)}{" "}
                    <span className="text-slate-500 font-normal">·</span>{" "}
                    <span className="font-mono text-[11px] text-slate-600">
                      {e.store_code}
                    </span>
                  </p>
                  <p className="text-[11px] text-slate-500 truncate">
                    {e.store_name} · {e.brand}
                  </p>
                </div>
                <span className="text-[11px] tabular-nums text-slate-500 shrink-0">
                  {agoShort(e.reported_at)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function labelFor(key: ReportCategory): string {
  return CATEGORIES.find((c) => c.key === key)?.label ?? key
}

function agoShort(iso: string): string {
  const ms = Date.now() - Date.parse(iso)
  if (!Number.isFinite(ms) || ms < 0) return "now"
  const mins = Math.round(ms / 60_000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.round(hrs / 24)}d ago`
}

/* ----------------------------- Coverage panel ----------------------------- */

function CoveragePanel({ coverage }: { coverage: Coverage }) {
  const pct = coverage.pct
  // Donut math: 24px radius, circumference ≈ 150.8.
  const C = 2 * Math.PI * 24
  const filled = pct * C
  const empty = C - filled
  return (
    <section className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-4">
      <svg
        viewBox="0 0 60 60"
        className="h-[68px] w-[68px] shrink-0"
        role="img"
        aria-label={`${coverage.reporting} of ${coverage.total} stores reporting`}
      >
        <circle cx="30" cy="30" r="24" fill="none" stroke="#E2E8F0" strokeWidth="8" />
        <circle
          cx="30"
          cy="30"
          r="24"
          fill="none"
          stroke="#4338CA"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${empty}`}
          transform="rotate(-90 30 30)"
        />
        <text
          x="30"
          y="34"
          textAnchor="middle"
          fontSize="14"
          fontWeight="600"
          className="fill-slate-900 tabular-nums"
        >
          {Math.round(pct * 100)}%
        </text>
      </svg>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Users className="h-3.5 w-3.5 text-indigo-700" aria-hidden />
          <h2 className="text-[10.5px] font-bold uppercase tracking-[0.10em] text-slate-600">
            Coverage · this week
          </h2>
        </div>
        <p className="mt-1 text-[14.5px] font-semibold text-slate-900 tabular-nums">
          {coverage.reporting} of {coverage.total} stores
        </p>
        <p className="text-[11.5px] text-slate-600">filed at least one report</p>
        <Link
          href="/ho/stores"
          className="mt-1.5 inline-flex items-center gap-0.5 text-[11px] font-medium text-indigo-700 hover:text-indigo-900"
        >
          Open Stores
          <ArrowRight className="h-3 w-3" aria-hidden />
        </Link>
      </div>
    </section>
  )
}

/* ---------------------------- Category mix panel -------------------------- */

function CategoryMixPanel({
  rows,
  total,
}: {
  rows: CategoryMixRow[]
  total: number
}) {
  const max = rows.reduce((m, r) => Math.max(m, r.count), 0) || 1
  return (
    <section className="bg-white border border-slate-200 rounded-xl p-4">
      <header className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-indigo-700" aria-hidden />
          <h2 className="text-[10.5px] font-bold uppercase tracking-[0.10em] text-slate-600">
            This week by category
          </h2>
        </div>
        <span className="text-[11px] tabular-nums text-slate-500">n={total}</span>
      </header>
      {rows.length === 0 ? (
        <p className="text-[12px] text-slate-500 italic">
          No reports this week — every floor was quiet.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const delta = r.count - r.prev
            const up = delta > 0
            const down = delta < 0
            return (
              <li key={r.key} className="flex items-center gap-2.5 text-[11.5px]">
                <span className="w-[88px] shrink-0 truncate text-slate-800">
                  {r.label}
                </span>
                <span className="flex-1 h-1.5 bg-slate-100 rounded-sm overflow-hidden">
                  <span
                    className={`block h-full ${
                      r.kind === "incident" ? "bg-amber-700" : "bg-slate-500"
                    }`}
                    style={{ width: `${Math.round((r.count / max) * 100)}%` }}
                  />
                </span>
                <span className="w-[58px] shrink-0 text-right tabular-nums text-slate-900 font-medium">
                  {r.count}
                  {up && (
                    <TrendingUp
                      className="inline h-3 w-3 ml-1 text-orange-700"
                      aria-label={`up from ${r.prev} last week`}
                    />
                  )}
                  {down && (
                    <TrendingDown
                      className="inline h-3 w-3 ml-1 text-teal-700"
                      aria-label={`down from ${r.prev} last week`}
                    />
                  )}
                  {!up && !down && r.prev > 0 && (
                    <span
                      aria-label={`unchanged from ${r.prev} last week`}
                      className="inline-block w-3 h-3 ml-1 text-slate-400"
                    >
                      ·
                    </span>
                  )}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

/* ------------------------------- Trend panel ------------------------------ */

/**
 * 14-day median ack + resolution time-series, with a dotted 48h SLA line.
 * Server-rendered as inline SVG — no Recharts, no client JS — because the
 * Overview pre-renders fast and a static SVG paints in the first byte.
 * Click-through to /ho/analytics for the interactive version.
 *
 * Visual:
 *   - X axis: 14 daily ticks (1 label every 2 days, all ticks drawn)
 *   - Y axis: 0..max(72h, 1.2 × p100), label every 24h
 *   - Ack line: slate-600 (#475569)
 *   - Resolution line: teal-700 (#0F766E)
 *   - SLA line: dashed orange-300 (#FDBA74) at y=48
 *   - Null buckets break the line (no point drawn, segment skipped)
 */
function TrendPanel({ dailyMedians }: { dailyMedians: DailyMedian[] }) {
  const hasAnyData = dailyMedians.some(
    (d) => d.median_ack !== null || d.median_resolution !== null,
  )

  // Chart geometry (SVG viewBox units; CSS scales it).
  const W = 920
  const H = 200
  const padLeft = 36
  const padRight = 18
  const padTop = 14
  const padBottom = 28
  const innerW = W - padLeft - padRight
  const innerH = H - padTop - padBottom

  // Y scale: at least up to 72h, or 1.2x of the data max so the line breathes.
  const dataMax = dailyMedians.reduce(
    (m, d) =>
      Math.max(m, d.median_ack ?? 0, d.median_resolution ?? 0),
    0,
  )
  const yMax = Math.max(72, Math.ceil((dataMax * 1.2) / 24) * 24)
  const yTicks: number[] = []
  for (let v = 0; v <= yMax; v += 24) yTicks.push(v)

  const x = (i: number) =>
    padLeft + (i / Math.max(1, dailyMedians.length - 1)) * innerW
  const y = (hours: number) => padTop + innerH - (hours / yMax) * innerH

  // Build a polyline string skipping null buckets — we split into multiple
  // <polyline> segments so a gap doesn't draw a misleading slope through it.
  function segments(getter: (d: DailyMedian) => number | null): string[] {
    const out: string[] = []
    let current: string[] = []
    dailyMedians.forEach((d, i) => {
      const v = getter(d)
      if (v === null) {
        if (current.length > 1) out.push(current.join(" "))
        current = []
      } else {
        current.push(`${x(i)},${y(v)}`)
      }
    })
    if (current.length > 1) out.push(current.join(" "))
    return out
  }
  const ackSegments = segments((d) => d.median_ack)
  const resSegments = segments((d) => d.median_resolution)

  // X-axis label every other day, plus first + last always.
  function labelForIdx(i: number): string {
    if (
      i !== 0 &&
      i !== dailyMedians.length - 1 &&
      i % 2 !== 0
    ) {
      return ""
    }
    const d = new Date(dailyMedians[i].date + "T00:00:00Z")
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })
  }

  return (
    <section className="bg-white border border-slate-200 rounded-xl p-5 mb-5">
      <header className="flex items-end justify-between gap-3 mb-3">
        <div>
          <div className="flex items-center gap-2">
            <Gauge className="h-4 w-4 text-teal-700" aria-hidden />
            <h2 className="text-[10.5px] font-bold uppercase tracking-[0.10em] text-slate-600">
              Past 14 days · daily median response time
            </h2>
          </div>
          <p className="mt-1 text-[12px] text-slate-600">
            Whether this week&apos;s velocity is a blip or a real trend.
          </p>
        </div>
        <div className="flex items-center gap-4 text-[11px] text-slate-600">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-[2px] w-4 bg-slate-600" />
            Acknowledge
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-[2px] w-4 bg-teal-700" />
            Close
          </span>
          <span className="inline-flex items-center gap-1.5 text-orange-700">
            <span
              className="inline-block h-[2px] w-4"
              style={{
                backgroundImage:
                  "linear-gradient(90deg, currentColor 50%, transparent 50%)",
                backgroundSize: "6px 2px",
              }}
            />
            48h SLA
          </span>
          <Link
            href="/ho/analytics"
            className="inline-flex items-center gap-0.5 font-medium text-indigo-700 hover:text-indigo-900"
          >
            Open Analytics
            <ArrowRight className="h-3 w-3" aria-hidden />
          </Link>
        </div>
      </header>

      {!hasAnyData ? (
        <p className="px-2 py-12 text-center text-[12.5px] text-slate-500 italic">
          No closed or acknowledged reports in the past 14 days yet — the line
          will draw itself once data lands.
        </p>
      ) : (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-[200px]"
          role="img"
          aria-label="Daily median acknowledge and resolution times for the past 14 days"
        >
          {/* Y gridlines + labels */}
          {yTicks.map((v) => (
            <g key={v}>
              <line
                x1={padLeft}
                x2={W - padRight}
                y1={y(v)}
                y2={y(v)}
                stroke="#F1F5F9"
                strokeWidth={1}
              />
              <text
                x={padLeft - 6}
                y={y(v) + 3}
                fontSize={10}
                textAnchor="end"
                className="fill-slate-500 tabular-nums"
              >
                {v}h
              </text>
            </g>
          ))}

          {/* 48h SLA reference line */}
          <line
            x1={padLeft}
            x2={W - padRight}
            y1={y(SLA_HOURS)}
            y2={y(SLA_HOURS)}
            stroke="#FDBA74"
            strokeWidth={1.5}
            strokeDasharray="4 4"
          />
          <text
            x={W - padRight - 4}
            y={y(SLA_HOURS) - 4}
            fontSize={9.5}
            textAnchor="end"
            className="fill-orange-700"
          >
            48h SLA
          </text>

          {/* Acknowledge polyline(s) */}
          {ackSegments.map((s, i) => (
            <polyline
              key={`ack-${i}`}
              fill="none"
              stroke="#475569"
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
              points={s}
            />
          ))}
          {/* Ack dots */}
          {dailyMedians.map((d, i) =>
            d.median_ack === null ? null : (
              <circle
                key={`ackd-${i}`}
                cx={x(i)}
                cy={y(d.median_ack)}
                r={2.4}
                fill="#475569"
              />
            ),
          )}

          {/* Resolution polyline(s) */}
          {resSegments.map((s, i) => (
            <polyline
              key={`res-${i}`}
              fill="none"
              stroke="#0F766E"
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
              points={s}
            />
          ))}
          {/* Res dots */}
          {dailyMedians.map((d, i) =>
            d.median_resolution === null ? null : (
              <circle
                key={`resd-${i}`}
                cx={x(i)}
                cy={y(d.median_resolution)}
                r={2.4}
                fill="#0F766E"
              />
            ),
          )}

          {/* X-axis labels */}
          {dailyMedians.map((d, i) => {
            const label = labelForIdx(i)
            if (!label) return null
            return (
              <text
                key={`xl-${i}`}
                x={x(i)}
                y={H - padBottom + 14}
                fontSize={10}
                textAnchor="middle"
                className="fill-slate-500 tabular-nums"
              >
                {label}
              </text>
            )
          })}
        </svg>
      )}
    </section>
  )
}
