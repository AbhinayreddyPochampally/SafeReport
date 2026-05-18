import Link from "next/link"
import { unstable_cache } from "next/cache"
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Check,
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
import { MetricInfo } from "@/components/metric-info"
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

/**
 * One row in the Today activity feed. Mixes HO actions with manager
 * acknowledgements over the same 24-hour window the Today panel covers.
 * Distinct from `TodayEvent` (which represents a freshly-filed report)
 * because the rendered row needs a verb and an actor name, not a
 * category dot.
 */
type ActivityEvent = {
  /** Stable id for React key. Prefixed by kind so collisions are impossible. */
  id: string
  kind: "approval" | "return" | "void" | "ack"
  /** Sentence-form description, e.g. "Approved SR-001234 · spill cleaned up". */
  text: string
  /** Display name of the actor (HO user or store manager). */
  actor: string
  /** ISO timestamp the event happened. */
  at: string
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
/**
 * 30 s cache around the Overview data fetch. Five parallel Supabase queries
 * + an O(N) aggregate pass; running on every navigation was the visible
 * cause of "tab switch takes a second". Mutating endpoints (POST /api/reports,
 * /api/ho-actions, /api/resolutions) revalidate the tag to keep the page
 * honest within a tab-switch round trip.
 */
const fetchLandingData = unstable_cache(
  fetchLandingDataImpl,
  ["ho-overview-data"],
  // 60-second TTL — see layout.tsx commentary. Halves cold-cache
  // misses during a typical HO session; mutating endpoints revalidate
  // the tag if a fresh snapshot is needed sooner.
  { revalidate: 60, tags: ["ho-overview-data"] },
)

async function fetchLandingDataImpl() {
  const admin = createSupabaseAdminClient()
  const now = new Date()
  const weekStartMs = now.getTime() - WEEK_MS
  const prevWeekStartMs = now.getTime() - 2 * WEEK_MS
  const dayStartMs = now.getTime() - DAY_MS
  const prevWeekStartIso = new Date(prevWeekStartMs).toISOString()

  const dayStartIso = new Date(dayStartMs).toISOString()
  const [
    past14dReportsResp,
    resolutionsResp,
    approvalsResp,
    openRowsResp,
    activeStoresResp,
    recentHoActionsResp,
    recentAcksResp,
  ] = await Promise.all([
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
        "id, store_code, category, suggested_category, status, reported_at, transcript, description, stores!inner(name, brand, manager_name)",
      )
      .in("status", ["new", "in_progress", "awaiting_ho", "returned"])
      .order("reported_at", { ascending: true })
      .limit(100),
    admin
      .from("stores")
      .select("sap_code", { count: "exact" })
      .eq("status", "active"),
    // Activity feed — last 24h of HO actions. Joins ho_users for actor
    // name and reports → stores for the per-event headline. Limit 20;
    // we'll show the top 3 once interleaved with manager acks below.
    admin
      .from("ho_actions")
      .select(
        "id, action, acted_at, report_id, ho_users!left(display_name), reports!inner(store_code, stores!inner(name))",
      )
      .gte("acted_at", dayStartIso)
      .in("action", ["approve", "return", "void"])
      .order("acted_at", { ascending: false })
      .limit(20),
    // Activity feed — last 24h of manager acknowledgements. There's no
    // separate "acked by" actor column on reports, so the row's store
    // manager_name is the best available stand-in.
    admin
      .from("reports")
      .select(
        "id, store_code, acknowledged_at, stores!inner(name, manager_name)",
      )
      .gte("acknowledged_at", dayStartIso)
      .not("acknowledged_at", "is", null)
      .order("acknowledged_at", { ascending: false })
      .limit(20),
  ])

  type RawReport = {
    id: string
    store_code: string
    // Mig 007: nullable until HO confirms. Velocity / today / coverage
    // / trend computations ignore null-category rows; category-mix
    // excludes them too. Only meaningful loss is during the transient
    // window between AI suggest and HO confirm.
    category: ReportCategory | null
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
    // Mig 007: skip reports whose category hasn't been confirmed yet —
    // the Today strip dot relies on a category to colour itself, and
    // the strip is meant for at-a-glance triage signal. Pending rows
    // show up in the Approval/Pipeline queues below instead.
    if (!r.category) continue
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
    // Mig 007: skip null-category rows from the mix. They land in the
    // mix once HO confirms.
    if (!r.category) continue
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

  // -- Open queues (mig 007: nullable category + AI suggested_category
  // pass-through so the queue rows can show "AI: <pick>" while HO
  // hasn't confirmed yet). --
  const openRaw = (openRowsResp.data ?? []) as unknown as Array<{
    id: string
    store_code: string
    category: ReportCategory | null
    suggested_category: ReportCategory | null
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
      suggested_category: r.suggested_category,
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

  // Stale-new count for the Action Hero band. Mirrors the sidebar-counts
  // calculation: status=new, no ack, > 24h since reported.
  const staleNewCount = openRaw.filter(
    (r) =>
      r.status === "new" &&
      Date.parse(r.reported_at) < Date.now() - 24 * 36e5,
  ).length

  // ---- Activity feed: interleave HO actions and manager acks from
  // the last 24h. Most-recent first; the top 3 surface under the
  // Today report list.
  type RawHoAction = {
    id: string
    action: "approve" | "return" | "void"
    acted_at: string
    report_id: string
    ho_users: { display_name: string } | null
    reports: { store_code: string; stores: { name: string } | null } | null
  }
  type RawAck = {
    id: string
    store_code: string
    acknowledged_at: string
    stores: { name: string; manager_name: string | null } | null
  }
  const hoActionsRaw = (recentHoActionsResp.data ??
    []) as unknown as RawHoAction[]
  const acksRaw = (recentAcksResp.data ?? []) as unknown as RawAck[]
  const activity: ActivityEvent[] = []
  for (const a of hoActionsRaw) {
    const store = a.reports?.stores?.name ?? a.reports?.store_code ?? "—"
    const verb =
      a.action === "approve"
        ? "Approved"
        : a.action === "return"
          ? "Returned"
          : "Voided"
    activity.push({
      id: `ho-${a.id}`,
      kind:
        a.action === "approve"
          ? "approval"
          : a.action === "return"
            ? "return"
            : "void",
      text: `${verb} ${a.report_id} · ${store}`,
      actor: a.ho_users?.display_name ?? "Head Office",
      at: a.acted_at,
    })
  }
  for (const a of acksRaw) {
    const store = a.stores?.name ?? a.store_code
    const mgr = a.stores?.manager_name ?? "Store manager"
    activity.push({
      id: `ack-${a.id}`,
      kind: "ack",
      text: `Acknowledged ${a.id} · ${store}`,
      actor: mgr,
      at: a.acknowledged_at,
    })
  }
  activity.sort((a, b) => b.at.localeCompare(a.at))
  const recentActivity = activity.slice(0, 3)

  return {
    velocity,
    todayEvents,
    coverage,
    categoryMix,
    dailyMedians,
    approvalRows,
    pipelineRows,
    staleNewCount,
    recentActivity,
    /** Total reports counted toward this-week's mix (denominator for % math). */
    thisWeekTotal: Array.from(thisCounts.values()).reduce((a, b) => a + b, 0),
  }
}

/* ------------------------------- Page shell ------------------------------- */

export default async function HoLandingPage() {
  await requireHoSession("/ho")
  const data = await fetchLandingData()

  const awaitingCount = data.approvalRows.length
  const breachedCount = data.approvalRows.filter(
    (r) => hoursSinceIso(r.reported_at) >= SLA_HOURS,
  ).length
  const topAwaiting = [...data.approvalRows].sort(
    (a, b) => hoursSinceIso(b.reported_at) - hoursSinceIso(a.reported_at),
  )[0]

  return (
    // Flat slate-50 page bg. Redesign rule: cards do the visual work,
    // the shell stays out of the way. Dropped the page-bg gradient.
    <div className="max-w-[1400px] mx-auto px-8 py-8">
      {/* Page header — flat eyebrow + display title + sub layout, with
        * the "Updated" timestamp aligned to the right. Replaces the
        * slate-to-white gradient band that read as another card. */}
      <header className="mb-6 flex items-end justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
            Pilot · ABF · 20 stores
          </p>
          <h1 className="mt-1 font-display text-[28px] leading-9 font-semibold tracking-tight text-slate-900">
            Overview
          </h1>
          <p className="mt-1.5 text-[13.5px] text-slate-600 max-w-[720px] leading-relaxed">
            Snapshot of the program right now. Lead with what needs you,
            then the trend, then the floor.
          </p>
        </div>
        <p className="text-[11.5px] text-slate-500 tabular-nums shrink-0 inline-flex items-center gap-1.5">
          <Timer className="h-3.5 w-3.5" aria-hidden />
          Updated{" "}
          {new Date().toLocaleString("en-IN", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })}{" "}
          IST
        </p>
      </header>

      {/* Action Hero — the one thing HO must do today. Replaces the
        * buried "Approval queue" link as the page's lead. Sky-tinted
        * when just awaiting; orange-tinted when there's an SLA breach.
        * CTA routes to the existing /ho/action inbox — no new route. */}
      <ActionHero
        awaiting={awaitingCount}
        breached={breachedCount}
        staleNew={data.staleNewCount}
        topItem={topAwaiting}
      />

      {/* Velocity strip — four ops metrics, WoW deltas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6 mb-6">
        <VelocityTile
          icon={Timer}
          label="Median time to acknowledge"
          metric={data.velocity.median_ack_hours}
          format="hours"
          lowerIsBetter
          info={{
            title: "Median time to acknowledge",
            body: "Time from a reporter filing to the store manager opening the report (Acknowledged status). Median = the middle report; outliers don't drag it. Window is the last 7 days; delta compares to the prior 7 days.",
            formula:
              "median( acknowledged_at − reported_at )  over reports filed in last 7d",
          }}
        />
        <VelocityTile
          icon={Gauge}
          label="Median time to close"
          metric={data.velocity.median_close_hours}
          format="hours"
          lowerIsBetter
          info={{
            title: "Median time to close",
            body: "Time from a reporter filing to HO approving the manager's resolution (Closed status). Median = the middle report. Window is the last 7 days; delta compares to the prior 7 days.",
            formula:
              "median( closed_at − reported_at )  over reports closed in last 7d",
          }}
        />
        <VelocityTile
          icon={Target}
          label="Closed within 48h"
          metric={data.velocity.pct_within_48h}
          format="percent"
          lowerIsBetter={false}
          info={{
            title: "Closed within 48h",
            body: "Of the reports closed in the last 7 days, the share that closed inside the 48-hour SLA from the moment they were filed. Higher is better.",
            formula:
              "closed_within_48h  ÷  closed_reports  (last 7 days)",
            example:
              "Delta is in percentage points (pp). A move from 86% to 76% is 10.0 pp down, independent of the underlying counts.",
          }}
        />
        <VelocityTile
          icon={Repeat}
          label="First-attempt fix rate"
          metric={data.velocity.first_attempt_rate}
          format="percent"
          lowerIsBetter={false}
          info={{
            title: "First-attempt fix rate",
            body: "Of the reports closed in the last 7 days, the share where the manager's very first resolution was approved by HO — no return, no rework. Higher is better.",
            formula:
              "closed_with_attempt = 1  ÷  closed_reports  (last 7 days)",
            example:
              "Delta is in percentage points (pp). 86% → 76% = 10.0 pp down.",
          }}
        />
      </div>

      {/* Trend — 14-day median ack + resolution, with 48h SLA reference.
        * Promoted above the Pulse row so the trend reads as a follow-up
        * to the velocity tiles ("is this a blip or the trend?"). */}
      <TrendPanel dailyMedians={data.dailyMedians} />

      {/* Pulse row — Today + activity (left) + Coverage + Category mix
        * (right column). Today gets the wider slot so the activity
        * feed has room to breathe under the report list. */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="md:col-span-1">
          <TodayPanel
            events={data.todayEvents}
            activity={data.recentActivity}
          />
        </div>
        <div className="md:col-span-2 grid grid-cols-1 lg:grid-cols-2 gap-4">
          <CoveragePanel coverage={data.coverage} />
          <CategoryMixPanel
            rows={data.categoryMix}
            total={data.thisWeekTotal}
          />
        </div>
      </div>

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
  info,
}: {
  icon: LucideIcon
  label: string
  metric: Metric
  format: "hours" | "percent"
  lowerIsBetter: boolean
  info: {
    title: string
    body: string
    formula?: string
    example?: string
  }
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
    // Flat-fill tile: white, 1px slate-200, 12px radius. No icon gradient,
    // no card gradient — the redesign's "one card style" rule.
    <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <span
          aria-hidden
          className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-slate-100 text-slate-700 shrink-0"
        >
          <Icon className="h-4 w-4" />
        </span>
        <MetricInfo
          title={info.title}
          body={info.body}
          formula={info.formula}
          example={info.example}
        />
      </div>

      <p className="mt-3 text-[12.5px] font-medium text-slate-600 leading-tight">
        {label}
      </p>

      <div
        className={`mt-2 font-display text-[32px] font-semibold tabular-nums leading-9 tracking-tight ${
          hasValue ? "text-slate-900" : "text-slate-400"
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

/**
 * Today panel — last 24h of activity in the system. Renders two stacked
 * sections under one header:
 *
 *  1. New reports — the 5 most-recent reports in the last 24h. Each row
 *     links to /ho/reports/[id].
 *  2. Activity feed — up to 3 most-recent HO actions (approve / return /
 *     void) and manager acks from the last 24h, type-coded. Read-only
 *     awareness; the action lives on the report detail page.
 *
 * The "Live" indicator in the header is decorative — the page refetches
 * on navigation, not via push or polling.
 */
function TodayPanel({
  events,
  activity,
}: {
  events: TodayEvent[]
  activity: ActivityEvent[]
}) {
  return (
    <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <header className="border-b border-slate-100 px-5 pt-4 pb-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-slate-500">
            Last 24 hours
          </p>
          <h2 className="mt-0.5 font-display text-[15px] font-semibold text-slate-900">
            Today · activity feed
          </h2>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[11.5px] text-teal-700">
          <span
            aria-hidden
            className="inline-block h-1.5 w-1.5 rounded-full bg-teal-600"
          />
          Live
        </span>
      </header>

      {events.length === 0 && activity.length === 0 ? (
        <p className="px-5 py-5 text-[12.5px] text-slate-500 italic">
          No new reports or actions in the last 24 hours.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {events.map((e) => (
            <li key={e.id}>
              <Link
                href={`/ho/reports/${e.id}`}
                prefetch={false}
                className="grid grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-2.5 px-5 py-3 hover:bg-slate-50 transition-colors"
              >
                <span
                  aria-hidden
                  className={`h-2 w-2 rounded-full shrink-0 ${
                    e.kind === "incident" ? "bg-amber-700" : "bg-slate-400"
                  }`}
                />
                <CategoryAcr category={e.category} />
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-slate-900 truncate">
                    {labelFor(e.category)}
                  </p>
                  <p className="text-[11px] text-slate-500 truncate mt-0.5">
                    <span className="font-mono">{e.store_code}</span> ·{" "}
                    {e.store_name}
                  </p>
                </div>
                <span className="text-[11px] tabular-nums text-slate-500 shrink-0 whitespace-nowrap">
                  {agoShort(e.reported_at)}
                </span>
              </Link>
            </li>
          ))}
          {activity.map((a) => (
            <li
              key={a.id}
              className="bg-slate-50 px-5 py-2.5 flex items-center gap-3"
            >
              <ActivityIconChip kind={a.kind} />
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] text-slate-800 truncate">
                  {a.text}
                </p>
                <p className="text-[11px] text-slate-500 truncate mt-0.5">
                  {a.actor} · {agoShort(a.at)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/**
 * Small type-coded square next to each activity row. Verb-aware so
 * approval/return/ack reads at a glance. No status colours — the feed
 * is awareness-only.
 */
function ActivityIconChip({ kind }: { kind: ActivityEvent["kind"] }) {
  const tone =
    kind === "approval"
      ? { bg: "bg-teal-100", fg: "text-teal-700", Icon: Check }
      : kind === "return"
        ? { bg: "bg-orange-100", fg: "text-orange-700", Icon: Repeat }
        : kind === "void"
          ? { bg: "bg-slate-200", fg: "text-slate-700", Icon: AlertTriangle }
          : { bg: "bg-slate-200", fg: "text-slate-700", Icon: Activity }
  return (
    <span
      aria-hidden
      className={`inline-flex h-[22px] w-[22px] items-center justify-center rounded-md shrink-0 ${tone.bg} ${tone.fg}`}
    >
      <tone.Icon className="h-3 w-3" />
    </span>
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
    <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 flex items-center gap-4">
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
        <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-slate-500 inline-flex items-center gap-1.5">
          <Users className="h-3 w-3" aria-hidden />
          Coverage · this week
        </p>
        <p className="mt-1 font-display text-[18px] font-semibold text-slate-900 tabular-nums leading-tight">
          {coverage.reporting} of {coverage.total} stores
        </p>
        <p className="text-[12px] text-slate-600 mt-0.5">filed at least one report</p>
        <Link
          href="/ho/stores"
          className="mt-1.5 inline-flex items-center gap-0.5 text-[12px] font-medium text-indigo-700 hover:text-indigo-900"
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
    <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
      <header className="flex items-end justify-between mb-3 gap-2">
        <div className="min-w-0">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-slate-500 inline-flex items-center gap-1.5">
            <Layers className="h-3 w-3" aria-hidden />
            This week
          </p>
          <h2 className="mt-0.5 font-display text-[15px] font-semibold text-slate-900">
            By category
          </h2>
        </div>
        <span className="text-[11.5px] tabular-nums text-slate-500">
          n={total}
        </span>
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

  // Build polyline segments AND the bridges between adjacent segments.
  //
  // Each segment is a contiguous run of measured days; we draw it solid.
  // Each bridge connects the last point of segment N to the first point
  // of segment N+1 across a stretch of null buckets — drawn as a dotted,
  // low-opacity line. Previously gaps just left the line blank, which
  // made it impossible to see at a glance whether the trend was rising
  // or falling across a missing day. The dotted bridge preserves the
  // overall trajectory without claiming there's measured data in the gap.
  function buildLine(getter: (d: DailyMedian) => number | null): {
    polylines: string[]
    bridges: Array<{ x1: number; y1: number; x2: number; y2: number }>
  } {
    const segments: Array<Array<{ x: number; y: number }>> = []
    let current: Array<{ x: number; y: number }> = []
    dailyMedians.forEach((d, i) => {
      const v = getter(d)
      if (v === null) {
        if (current.length > 0) segments.push(current)
        current = []
      } else {
        current.push({ x: x(i), y: y(v) })
      }
    })
    if (current.length > 0) segments.push(current)
    const polylines = segments
      .filter((s) => s.length > 1)
      .map((s) => s.map((p) => `${p.x},${p.y}`).join(" "))
    const bridges: Array<{ x1: number; y1: number; x2: number; y2: number }> = []
    for (let i = 0; i < segments.length - 1; i++) {
      const a = segments[i][segments[i].length - 1]
      const b = segments[i + 1][0]
      bridges.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y })
    }
    return { polylines, bridges }
  }
  const ackLine = buildLine((d) => d.median_ack)
  const resLine = buildLine((d) => d.median_resolution)
  const ackSegments = ackLine.polylines
  const resSegments = resLine.polylines

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
    <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 mb-6">
      <header className="flex items-end justify-between gap-3 mb-3 pb-3 border-b border-slate-100">
        <div className="min-w-0">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-slate-500 inline-flex items-center gap-1.5">
            <Gauge className="h-3 w-3" aria-hidden />
            Past 14 days
          </p>
          <h2 className="mt-0.5 font-display text-[15px] font-semibold text-slate-900">
            Response time trend
          </h2>
          <p className="mt-1 text-[12.5px] text-slate-600 max-w-[560px]">
            Daily median acknowledge and close times — is this week&apos;s
            velocity a blip or the trend?
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

          {/* Acknowledge bridges (dotted across gap days) */}
          {ackLine.bridges.map((b, i) => (
            <line
              key={`ackb-${i}`}
              x1={b.x1}
              y1={b.y1}
              x2={b.x2}
              y2={b.y2}
              stroke="#475569"
              strokeWidth={1.25}
              strokeDasharray="2 3"
              strokeLinecap="round"
              opacity={0.35}
            />
          ))}
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

          {/* Resolution bridges (dotted across gap days) */}
          {resLine.bridges.map((b, i) => (
            <line
              key={`resb-${i}`}
              x1={b.x1}
              y1={b.y1}
              x2={b.x2}
              y2={b.y2}
              stroke="#0F766E"
              strokeWidth={1.25}
              strokeDasharray="2 3"
              strokeLinecap="round"
              opacity={0.35}
            />
          ))}
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

/* ------------------------------- Action Hero ----------------------------- */

/**
 * Full-width band at the top of Overview. Surfaces the one decision HO has
 * waiting on them: awaiting_ho count, breached-past-48h subcount, and a
 * one-click into /ho/action. Sky-tinted when the queue is just waiting,
 * orange-tinted when there's an SLA breach. Empty state ("You're caught
 * up") swaps the band for a calm teal-tinted variant.
 *
 * Data comes from already-fetched approvalRows + staleNewCount — no new
 * query. The "top item" preview is the oldest awaiting row.
 */
function ActionHero({
  awaiting,
  breached,
  staleNew,
  topItem,
}: {
  awaiting: number
  breached: number
  staleNew: number
  topItem: QueueRow | undefined
}) {
  const total = awaiting + staleNew
  if (total === 0) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white px-6 py-5 flex items-center gap-4 shadow-sm">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
          <Check className="h-5 w-5" aria-hidden />
        </span>
        <div>
          <p className="font-display text-[17px] font-semibold text-slate-900">
            You&apos;re caught up
          </p>
          <p className="mt-0.5 text-[13px] text-slate-600">
            Nothing waiting on Head Office right now.
          </p>
        </div>
      </section>
    )
  }
  const hasBreach = breached > 0
  // Tone-aware fill: orange-50 when SLA is breached, sky-50 otherwise.
  // The 4px left rail uses the saturated form of the same hue so
  // colour-blind users still see urgency through bar position.
  const fillClass = hasBreach ? "bg-orange-50" : "bg-sky-50"
  const railClass = hasBreach ? "bg-orange-700" : "bg-sky-700"
  const accentText = hasBreach ? "text-orange-700" : "text-sky-700"
  const eyebrowText = hasBreach
    ? "SLA Breach · attention needed"
    : "Today's queue"
  return (
    <section
      className={`rounded-xl border border-slate-200 overflow-hidden grid grid-cols-[auto_minmax(0,1fr)_auto] ${fillClass} shadow-sm`}
    >
      <span aria-hidden className={`w-1 ${railClass}`} />
      <div className="px-6 py-5">
        <p
          className={`text-[11px] font-bold uppercase tracking-[0.14em] ${accentText}`}
        >
          {eyebrowText}
        </p>
        <h2 className="mt-1 font-display text-[24px] leading-8 font-semibold text-slate-900 tracking-tight">
          {total} {total === 1 ? "item" : "items"} waiting on you
          {hasBreach && (
            <span className="text-orange-700">
              {" — "}
              {breached} past 48 hours
            </span>
          )}
        </h2>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[12.5px] text-slate-700">
          <BreakdownPill
            color="bg-sky-700"
            label="Awaiting your decision"
            value={awaiting}
          />
          {breached > 0 && (
            <BreakdownPill
              color="bg-orange-700"
              label="Past 48h"
              value={breached}
            />
          )}
          {staleNew > 0 && (
            <BreakdownPill
              color="bg-slate-500"
              label="Stale · manager hasn't ack'd"
              value={staleNew}
            />
          )}
        </div>
        {topItem && (
          <Link
            href={`/ho/reports/${topItem.id}?from=overview`}
            prefetch={false}
            className="mt-3.5 inline-flex items-center gap-3 max-w-[720px] rounded-lg border border-slate-200/70 bg-white/70 hover:bg-white px-3 py-2.5 transition-colors"
          >
            <CategoryAcr category={topItem.category} />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-[12.5px] text-slate-900 font-medium truncate">
                <span className="font-mono text-[11px] text-slate-500 font-normal shrink-0">
                  {topItem.id}
                </span>
                <span aria-hidden className="text-slate-400">
                  ·
                </span>
                <span className="truncate">
                  {topItem.headline ?? labelFor(topItem.category)}
                </span>
              </p>
              <p className="mt-0.5 text-[11.5px] text-slate-500 truncate">
                <span className="font-mono">{topItem.store_code}</span> ·{" "}
                {topItem.store_name}
              </p>
            </div>
            <span
              className={`text-[12px] font-semibold tabular-nums whitespace-nowrap ${accentText}`}
            >
              {formatWaitingShort(hoursSinceIso(topItem.reported_at))} waiting
            </span>
          </Link>
        )}
      </div>
      <div className="flex items-center px-5 py-5">
        <Link
          href="/ho/action"
          className="inline-flex items-center gap-1.5 h-10 px-4 rounded-lg bg-indigo-700 hover:bg-indigo-900 text-white text-[13px] font-semibold transition-colors"
        >
          Open Action inbox
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
    </section>
  )
}

function BreakdownPill({
  color,
  label,
  value,
}: {
  color: string
  label: string
  value: number
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden
        className={`inline-block h-1.5 w-1.5 rounded-full ${color}`}
      />
      <strong className="tabular-nums text-slate-900 font-semibold">
        {value}
      </strong>
      <span className="text-slate-600">{label}</span>
    </span>
  )
}

function CategoryAcr({ category }: { category: ReportCategory }) {
  const def = CATEGORIES.find((c) => c.key === category)
  const isIncident = def?.kind === "incident"
  const acr =
    def?.acronym ?? (category as string).slice(0, 3).toUpperCase()
  return (
    <span
      className={`inline-flex h-[22px] items-center justify-center px-1.5 rounded font-mono text-[10px] font-semibold border ${
        isIncident
          ? "bg-amber-100 text-amber-800 border-amber-300"
          : "bg-slate-100 text-slate-700 border-slate-200"
      }`}
      title={def?.label ?? category}
    >
      {acr}
    </span>
  )
}

function hoursSinceIso(iso: string): number {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return 0
  return Math.max(0, (Date.now() - t) / 36e5)
}

function formatWaitingShort(h: number): string {
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}m`
  if (h < 24) return `${Math.round(h)}h`
  const d = Math.floor(h / 24)
  const rem = Math.round(h - d * 24)
  return rem > 0 && d < 7 ? `${d}d ${rem}h` : `${d}d`
}
