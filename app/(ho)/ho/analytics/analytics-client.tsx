"use client"

import dynamic from "next/dynamic"
import {
  Calendar,
  Clock,
  Download,
  Gauge,
  Info,
  Loader2,
  MessageCircle,
  Target,
  Timer,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
} from "lucide-react"
import { memo, useEffect, useMemo, useState } from "react"
import { CATEGORIES } from "@/lib/categories"
import { MetricInfo } from "@/components/metric-info"

// Recharts is ~70KB gzipped and the only place we use it is these two
// stacked bar charts. Load them lazily so the KPI tiles, filter card, and
// store leaderboard can paint without waiting on Recharts to download.
// ssr:false because Recharts needs window to measure and there's no SEO
// reason to render these on the server. A small skeleton holds the layout
// height so the page doesn't reflow when the chart streams in.
const StatusBars = dynamic(
  () => import("./analytics-charts").then((m) => m.StatusBars),
  {
    ssr: false,
    loading: () => <ChartSkeleton />,
  },
)
const CategoryBars = dynamic(
  () => import("./analytics-charts").then((m) => m.CategoryBars),
  {
    ssr: false,
    loading: () => <ChartSkeleton />,
  },
)

function ChartSkeleton() {
  return (
    <div className="h-[240px] rounded-md bg-gradient-to-b from-slate-50 to-white border border-slate-100 animate-pulse" />
  )
}

/**
 * HO analytics client (v2).
 *
 * Range pills (7d / 30d / 90d / Custom) drive a single date window. Default
 * = last 30 days. Granularity is daily for ranges ≤ 60 days, weekly above
 * that (server enforces this, client just reflects what came back).
 *
 * Layout, top to bottom:
 *   1. Header (title + Export to Excel)
 *   2. Range + filter card
 *   3. Time analytics — four cards with deltas vs the previous equal-length range
 *   4. Daily-median trend (acknowledge vs resolution, with 48h SLA reference)
 *   5. Reports per day, stacked by status
 *   6. Category mix per day (observation vs incident shading)
 *   7. Store leaderboard
 *
 * The heatmap that used to live below was removed in this rev.
 */

type Totals = {
  reports: number
  closed: number
  returned: number
  voided: number
  awaiting_ho: number
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

type BucketedCategory = { date: string } & Record<string, number | string>

type BucketedMedian = {
  date: string
  median_ack_hours: number | null
  median_resolution_hours: number | null
  first_attempt_rate: number | null
  pct_within_48h: number | null
}

type TimeAnalytics = {
  median_ack_hours: number | null
  p90_ack_hours: number | null
  median_resolution_hours: number | null
  p90_resolution_hours: number | null
  first_attempt_rate: number | null
  pct_within_48h: number | null
  acked_count: number
  closed_count: number
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
  /** Landing-page visits in range (mig 006). */
  visits: number
  /** Subset of `visits` that arrived via QR scan (?src=qr). */
  qr_visits: number
  /** Distinct visitor fingerprints in range — approx unique devices. */
  unique_visitors: number
}

type Payload = {
  range: { from: string; to: string; span_days: number }
  granularity: "daily" | "weekly"
  filters: {
    brands: string[]
    cities: string[]
    categories: readonly string[]
    applied: { brand: string[]; city: string[]; category: string[] }
  }
  totals: Totals
  time_analytics: TimeAnalytics
  time_analytics_prev: TimeAnalytics
  time_series_status: BucketedStatus[]
  time_series_categories: BucketedCategory[]
  time_series_medians: BucketedMedian[]
  leaderboard: LeaderboardRow[]
  sla_hours: number
}

type RangePreset = "7d" | "30d" | "90d" | "custom"

function isoToday(): string {
  return new Date().toISOString().slice(0, 10)
}

function isoDaysAgo(n: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

export function AnalyticsClient() {
  const [preset, setPreset] = useState<RangePreset>("30d")
  const [from, setFrom] = useState<string>(isoDaysAgo(29))
  const [to, setTo] = useState<string>(isoToday())
  const [brands, setBrands] = useState<string[]>([])
  const [categories, setCategories] = useState<string[]>([])
  // City filter exists on the API but isn't wired to UI yet — keep it
  // off the client until the mockup calls for it. The state below was
  // intentionally removed.
  const [data, setData] = useState<Payload | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  function applyPreset(p: RangePreset) {
    setPreset(p)
    if (p === "7d") {
      setFrom(isoDaysAgo(6))
      setTo(isoToday())
    } else if (p === "30d") {
      setFrom(isoDaysAgo(29))
      setTo(isoToday())
    } else if (p === "90d") {
      setFrom(isoDaysAgo(89))
      setTo(isoToday())
    }
    // custom keeps current from/to
  }

  useEffect(() => {
    // Cancel any in-flight request when the filter/date inputs change. Two
    // benefits: (1) saves bandwidth when the HO clicks several chips in a
    // row, (2) prevents an older request's body from clobbering newer state
    // if it happens to come back last. The AbortError is silenced so it
    // doesn't surface as a user-visible error message.
    const ctrl = new AbortController()
    let cancelled = false
    async function run() {
      setBusy(true)
      setError(null)
      try {
        const qs = new URLSearchParams()
        qs.set("from", from)
        qs.set("to", to)
        for (const b of brands) qs.append("brand", b)
        for (const k of categories) qs.append("category", k)
        const res = await fetch(`/api/ho-analytics?${qs.toString()}`, {
          cache: "no-store",
          signal: ctrl.signal,
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const body = (await res.json()) as Payload
        if (!cancelled) setData(body)
      } catch (e) {
        if (cancelled) return
        if (e instanceof DOMException && e.name === "AbortError") return
        setError(e instanceof Error ? e.message : "Couldn't load analytics.")
      } finally {
        if (!cancelled) setBusy(false)
      }
    }
    run()
    return () => {
      cancelled = true
      ctrl.abort()
    }
  }, [from, to, brands, categories])

  function toggle(key: string, list: string[], setList: (v: string[]) => void) {
    setList(list.includes(key) ? list.filter((x) => x !== key) : [...list, key])
  }

  // Memoize the four sparkline arrays so each <TimeCard> gets a stable
  // reference between renders. Without this, `data?.time_series_medians.map(...)`
  // produced a brand-new array on every render, defeating the React.memo
  // around <Sparkline> and forcing the SVG path to recompute every time a
  // user hovered an info popover or clicked a filter chip. Sparklines are
  // the biggest source of avoidable re-render work on this page because
  // each one rebuilds a per-point SVG path in `Sparkline()`.
  const sparkAck = useMemo(
    () => data?.time_series_medians.map((b) => b.median_ack_hours) ?? [],
    [data?.time_series_medians],
  )
  const sparkRes = useMemo(
    () => data?.time_series_medians.map((b) => b.median_resolution_hours) ?? [],
    [data?.time_series_medians],
  )
  const sparkFirst = useMemo(
    () => data?.time_series_medians.map((b) => b.first_attempt_rate) ?? [],
    [data?.time_series_medians],
  )
  const sparkSla = useMemo(
    () => data?.time_series_medians.map((b) => b.pct_within_48h) ?? [],
    [data?.time_series_medians],
  )

  async function downloadXlsx() {
    if (downloading) return
    setDownloading(true)
    setDownloadError(null)
    try {
      const qs = new URLSearchParams()
      qs.set("from", from)
      qs.set("to", to)
      for (const b of brands) qs.append("brand", b)
      for (const k of categories) qs.append("category", k)
      const res = await fetch(`/api/excel/export?${qs.toString()}`, {
        cache: "no-store",
      })
      if (!res.ok) {
        let msg = `HTTP ${res.status}`
        try {
          const j = (await res.json()) as { error?: string }
          if (j?.error) msg = j.error
        } catch {
          /* not json */
        }
        throw new Error(msg)
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `safereport-${from}-to-${to}.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e) {
      setDownloadError(
        e instanceof Error ? e.message : "Couldn't download.",
      )
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Header — same slate band the other HO pages use. The date-range
        * + totals line stays here because it's load-bearing context for
        * what the page is showing (this page IS the report on a window). */}
      <header className="mb-5 rounded-xl bg-gradient-to-r from-slate-100 to-white border border-slate-200 px-5 py-4 shadow-sm flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-[24px] font-semibold tracking-tight text-slate-900">
            Analytics
          </h1>
          {data && (
            <p className="text-[12px] text-slate-600 mt-0.5 tabular-nums">
              {prettyDate(data.range.from)} → {prettyDate(data.range.to)} ·{" "}
              {data.totals.reports} reports · {data.granularity} bars
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {busy && (
            <span className="inline-flex items-center gap-2 text-xs text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Refreshing…
            </span>
          )}
          <button
            type="button"
            onClick={downloadXlsx}
            disabled={downloading}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium disabled:opacity-60"
          >
            {downloading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {downloading ? "Preparing…" : "Export range to Excel"}
          </button>
        </div>
      </header>

      {downloadError && (
        <div className="rounded-md bg-orange-50 border border-orange-200 px-3 py-2 text-sm text-orange-700 mb-4">
          Download failed: {downloadError}
        </div>
      )}

      {/* Range + filter card.
        *
        * Filter chips were a mix of pill (rounded-full) and rectangular
        * (rounded-md) shapes at different heights across the page. Unified
        * here as `FilterChip` — rectangular with rounded corners, h-8,
        * consistent typography. Range / Brand / Category groups share the
        * same eyebrow label treatment so the rows line up vertically. */}
      <section className="bg-white border border-slate-200 rounded-xl p-4 mb-5 space-y-2.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <FilterLabel>Range</FilterLabel>
          <FilterChip active={preset === "7d"} onClick={() => applyPreset("7d")}>
            7d
          </FilterChip>
          <FilterChip
            active={preset === "30d"}
            onClick={() => applyPreset("30d")}
          >
            30d
          </FilterChip>
          <FilterChip
            active={preset === "90d"}
            onClick={() => applyPreset("90d")}
          >
            90d
          </FilterChip>
          <FilterChip
            active={preset === "custom"}
            onClick={() => setPreset("custom")}
          >
            <Calendar className="h-3.5 w-3.5 mr-1" strokeWidth={1.8} aria-hidden />
            Custom
          </FilterChip>
          {preset === "custom" && (
            <div className="flex items-center gap-1.5 ml-1.5">
              <input
                type="date"
                value={from}
                max={to}
                onChange={(e) => setFrom(e.target.value)}
                className="px-2.5 h-8 border border-slate-300 rounded-md text-[12px] text-slate-700 tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
              />
              <span className="text-[11px] text-slate-400">→</span>
              <input
                type="date"
                value={to}
                min={from}
                max={isoToday()}
                onChange={(e) => setTo(e.target.value)}
                className="px-2.5 h-8 border border-slate-300 rounded-md text-[12px] text-slate-700 tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
              />
            </div>
          )}
          {data && (
            <span className="ml-1.5 inline-flex items-center px-2.5 h-8 rounded-md bg-slate-100 text-[11.5px] text-slate-700 font-mono tabular-nums">
              {prettyDate(data.range.from)} → {prettyDate(data.range.to)}
            </span>
          )}
          {data && data.range.span_days > 60 && (
            <span className="text-[10.5px] text-slate-500 italic">
              Bars are weekly above 60 days
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <FilterLabel>Brand</FilterLabel>
          <FilterChip
            active={brands.length === 0}
            onClick={() => setBrands([])}
          >
            All
          </FilterChip>
          {(data?.filters.brands ?? []).map((b) => (
            <FilterChip
              key={b}
              active={brands.includes(b)}
              onClick={() => toggle(b, brands, setBrands)}
            >
              {b}
            </FilterChip>
          ))}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <FilterLabel>Category</FilterLabel>
          <FilterChip
            active={categories.length === 0}
            onClick={() => setCategories([])}
          >
            All
          </FilterChip>
          {CATEGORIES.map((c) => (
            <FilterChip
              key={c.key}
              active={categories.includes(c.key)}
              onClick={() => toggle(c.key, categories, setCategories)}
              incident={c.kind === "incident"}
            >
              {c.label}
            </FilterChip>
          ))}
        </div>
      </section>

      {error && (
        <div className="rounded-md bg-orange-50 border border-orange-200 px-3 py-2 text-sm text-orange-700 mb-4">
          {error}
        </div>
      )}

      {/* Time analytics — section header + 4 KPI cards.
          Restyled per the v3 mockup: a flat icon-led header, then four
          freestanding cards (no outer wrapper card). Each KPI card carries
          an iconified label, a large teal value, a sentence-style delta
          line, a small trend sparkline (kept per HO ask — direction within
          the range matters on top of the prior-period delta), and a
          contextual "supporting band" at the bottom. */}
      <header className="flex items-start gap-3 mb-4">
        <span
          aria-hidden
          className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-indigo-50 text-indigo-700 shrink-0 ring-1 ring-indigo-100 shadow-sm"
        >
          <Clock className="h-5 w-5" strokeWidth={1.8} />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-[20px] font-semibold text-slate-900 leading-tight">
            Time Analytics
          </h2>
          <p className="mt-0.5 text-[13px] text-slate-600">
            Track how quickly your team acknowledges and resolves safety
            reports.
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <TimeCard
            icon={MessageCircle}
            label="Median time to acknowledge"
            info={{
              title: "Median time to acknowledge",
              body:
                "Time between a reporter filing a report and the store manager opening it (Acknowledged status). Median = the middle value, so half of reports were acknowledged faster than this number and half slower. Outliers don't skew it.",
              formula:
                "median( acknowledged_at − reported_at )  over reports filed in range",
              example:
                "Delta is the change in median vs. the previous equal-length window (a 30-day view compares to the 30 days before it).",
            }}
            value={data?.time_analytics.median_ack_hours ?? null}
            prev={data?.time_analytics_prev.median_ack_hours ?? null}
            format="hours"
            sparkline={sparkAck}
            sparklineColor="#0F766E"
            lowerIsBetter
            supportPrimary={
              data
                ? `90% acknowledged within ${formatHours(data.time_analytics.p90_ack_hours)}`
                : "—"
            }
            supportSecondary={
              data ? `${data.time_analytics.acked_count} reports acknowledged` : ""
            }
          />
          <TimeCard
            icon={Timer}
            label="Median resolution time"
            info={{
              title: "Median resolution time",
              body:
                "Time from a report being filed to it being closed end-to-end (manager submits a resolution, HO approves it). Median = the middle report — outliers like a single 5-day case can't drag the number around.",
              formula:
                "median( closed_at − reported_at )  over reports closed in range",
              example:
                "Delta compares to the previous equal-length window.",
            }}
            value={data?.time_analytics.median_resolution_hours ?? null}
            prev={data?.time_analytics_prev.median_resolution_hours ?? null}
            format="hours"
            sparkline={sparkRes}
            sparklineColor="#4338CA"
            lowerIsBetter
            supportPrimary={
              data
                ? `90% resolved within ${formatHours(data.time_analytics.p90_resolution_hours)}`
                : "—"
            }
            supportSecondary="From reported to closed"
          />
          <TimeCard
            icon={Target}
            label="First-attempt resolution"
            info={{
              title: "First-attempt resolution",
              body:
                "Of the reports closed in this range, the share where the store manager's very first resolution was approved by HO — no return, no rework. Higher is better; it signals the manager is fixing the right thing the first time.",
              formula:
                "closed_reports_with_attempt = 1  ÷  closed_reports",
              example:
                "Delta is in percentage points (pts). A change from 86% to 76% is a 10.0 pts drop, regardless of how big the underlying counts are.",
            }}
            value={data?.time_analytics.first_attempt_rate ?? null}
            prev={data?.time_analytics_prev.first_attempt_rate ?? null}
            format="percent"
            sparkline={sparkFirst}
            sparklineColor="#0F766E"
            supportProgress={
              data && data.time_analytics.closed_count > 0
                ? {
                    numerator: Math.round(
                      (data.time_analytics.first_attempt_rate ?? 0) *
                        data.time_analytics.closed_count,
                    ),
                    denominator: data.time_analytics.closed_count,
                    label: "resolved on first attempt",
                  }
                : null
            }
          />
          <TimeCard
            icon={Gauge}
            label={`Resolved within ${data?.sla_hours ?? 48}h`}
            info={{
              title: `Resolved within ${data?.sla_hours ?? 48}h`,
              body: `Of the reports closed in this range, the share that were closed within the ${data?.sla_hours ?? 48}-hour Service-Level Agreement window from the moment they were filed. Higher is better.`,
              formula: `closed_within_${data?.sla_hours ?? 48}h  ÷  closed_reports`,
              example:
                "Delta is in percentage points (pts) — a drop from 95% to 57% is 38.0 pts. Use the value (57%) for the level, the pts delta for the change.",
            }}
            value={data?.time_analytics.pct_within_48h ?? null}
            prev={data?.time_analytics_prev.pct_within_48h ?? null}
            format="percent"
            sparkline={sparkSla}
            sparklineColor="#0F766E"
            supportProgress={
              data && data.time_analytics.closed_count > 0
                ? {
                    numerator: Math.round(
                      (data.time_analytics.pct_within_48h ?? 0) *
                        data.time_analytics.closed_count,
                    ),
                    denominator: data.time_analytics.closed_count,
                    label: `resolved within ${data.sla_hours ?? 48} hours`,
                  }
                : null
            }
          />
        </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChartCard
          title={`Reports per ${data?.granularity === "weekly" ? "week" : "day"}, stacked by status`}
          subtitle="Stacked from closed (bottom) upward."
          yAxisLabel="Reports"
        >
          <StatusBars rows={data?.time_series_status ?? []} />
        </ChartCard>

        <ChartCard
          title={`Category mix per ${data?.granularity === "weekly" ? "week" : "day"}`}
          subtitle="Observations, incidents, and outcomes."
          yAxisLabel="Reports"
        >
          <CategoryBars rows={data?.time_series_categories ?? []} />
        </ChartCard>
      </div>

      {/* Footer note matching the mockup. Helpful because reports come in
          from store managers in their local time and the chart bars are
          bucketed in the viewer's local time too. */}
      <p className="mt-4 flex items-center justify-center gap-1.5 text-[11.5px] text-slate-500">
        <Clock className="h-3 w-3" aria-hidden />
        All times are shown in your local time zone.
      </p>

      {/* Store-level analytics. Replaced the older single 'Store leaderboard'
        * table with three slices on the same data:
        *   1. StoreTierCards — 4 mini-cards summarising how many stores
        *      fall into each activity tier (Active / Quiet / Dormant / Never).
        *      Lifted from /ho/stores so HO can see roster health from this
        *      page too.
        *   2. StoreInsightCards — three scattered insight tiles: top brand
        *      by volume, top city by volume, store with the longest median
        *      ack time. Spreads the analytical signal across the page
        *      rather than burying it in one big table.
        *   3. StoreAnalyticsTable — the per-store table, now sortable.
        *      Click a column header to sort by that column; click again
        *      (or double-click) to flip direction. */}
      <div className="mt-8 space-y-5">
        <StoreTierCards rows={data?.leaderboard ?? []} />
        <StoreInsightCards rows={data?.leaderboard ?? []} />
        <ChartCard
          title="Per-store analytics"
          subtitle="Click a column header to sort · click again to flip direction"
        >
          <StoreAnalyticsTable rows={data?.leaderboard ?? []} />
        </ChartCard>
      </div>
    </div>
  )
}

/* ----------------------------- Small bits -------------------------------- */

/**
 * Tiny uppercase eyebrow label that sits at the start of each filter row.
 * Pulled out so every filter group shares the same typography and width
 * cadence — keeps Range / Brand / Category vertically aligned.
 */
function FilterLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center h-8 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500 mr-1 min-w-[58px]">
      {children}
    </span>
  )
}

/**
 * Unified filter chip — rectangular with rounded corners, fixed height.
 *
 * Replaces the earlier mix of `RangeChip` (rounded-full pill) and the
 * previous `FilterChip` (rounded-full, different padding/height). All
 * filter buttons across the HO surface now share this shape so the rows
 * read as one consistent control set, not three different ones.
 *
 * The `incident` flag swaps the active tone to amber-700 to preserve the
 * palette's "observation → slate / incident → amber" semantic, but the
 * geometry stays identical so the chips look like siblings.
 */
function FilterChip({
  active,
  onClick,
  children,
  incident,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  incident?: boolean
}) {
  const activeCls = incident
    ? "bg-amber-700 border-amber-700 text-white shadow-sm"
    : "bg-indigo-700 border-indigo-700 text-white shadow-sm"
  const inactiveCls = incident
    ? "bg-white border-amber-200 text-amber-800 hover:bg-amber-50 hover:border-amber-300"
    : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-slate-400"
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center px-3 h-8 rounded-md border text-[12px] font-medium transition-colors ${
        active ? activeCls : inactiveCls
      }`}
    >
      {children}
    </button>
  )
}

/**
 * Time-analytics KPI card.
 *
 * Mockup-aligned layout (v3):
 *  • Header row — icon in a tinted circle + label + info tooltip.
 *  • Big teal value, line-broken at the bottom by a sentence-style delta:
 *      "2.0h faster vs previous period" / "Down 7.7 pts vs previous period".
 *  • Sparkline strip (kept per HO ask — direction within the range matters
 *    on top of the prior-period delta).
 *  • Support band — either a two-line "primary | secondary" pill set for
 *    median-time cards, or a "N of M" progress bar for share-of-whole
 *    percentages (first-attempt and within-SLA).
 *
 * Polarity: a "lowerIsBetter" flag drives the colour of the delta. The big
 * value stays teal regardless of polarity — keeps the cards visually
 * balanced; the delta carries the goodness signal.
 */
function TimeCard({
  icon: Icon,
  label,
  info,
  value,
  prev,
  format,
  sparkline,
  sparklineColor,
  lowerIsBetter,
  supportPrimary,
  supportSecondary,
  supportProgress,
}: {
  icon: LucideIcon
  label: string
  info: {
    title: string
    body: string
    formula?: string
    example?: string
  }
  value: number | null
  prev: number | null
  format: "hours" | "percent"
  sparkline: (number | null)[]
  sparklineColor: string
  lowerIsBetter?: boolean
  supportPrimary?: string
  supportSecondary?: string
  supportProgress?: {
    numerator: number
    denominator: number
    label: string
  } | null
}) {
  const hasValue = value !== null
  const hasDelta = hasValue && prev !== null
  const delta = hasDelta ? (value as number) - (prev as number) : 0
  const better = lowerIsBetter ? delta < 0 : delta > 0
  const worse = lowerIsBetter ? delta > 0 : delta < 0
  const deltaMagnitude =
    format === "hours" ? formatDelta(delta, "h") : `${Math.abs(delta * 100).toFixed(1)} pts`
  const deltaPhrase = !hasDelta
    ? ""
    : Math.abs(delta) < (format === "hours" ? 0.005 : 0.0005)
      ? "Unchanged vs previous period"
      : better
        ? `${deltaMagnitude} ${format === "hours" ? "faster" : "up"} vs previous period`
        : worse
          ? `Down ${deltaMagnitude} vs previous period`
          : `${deltaMagnitude} vs previous period`
  return (
    <div className="bg-gradient-to-br from-white via-slate-50 to-slate-200 border border-slate-200 rounded-xl p-4 flex flex-col shadow-sm">
      {/* Header row.
        *
        * Icon tile uses indigo-50 with indigo-700 lucide stroke — same
        * tone as the section header above. This trades the older
        * slate-gradient circle (low contrast, blended into the card
        * background) for a clear, palette-aligned mark that reads at
        * a glance against the slate gradient card. */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            aria-hidden
            className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-indigo-50 text-indigo-700 shrink-0 ring-1 ring-indigo-100 shadow-sm"
          >
            <Icon className="h-4 w-4" strokeWidth={1.8} />
          </span>
          <span className="text-[12.5px] font-medium text-slate-700 leading-tight">
            {label}
          </span>
        </div>
        <MetricInfo
          title={info.title}
          body={info.body}
          formula={info.formula}
          example={info.example}
        />
      </div>

      {/* Big value */}
      <div
        className={`mt-3 text-[34px] font-semibold tabular-nums leading-none ${
          hasValue ? "text-teal-700" : "text-slate-400"
        }`}
      >
        {format === "hours" ? formatHours(value) : formatPercent(value)}
      </div>

      {/* Delta line */}
      {hasDelta ? (
        <div
          className={`mt-2 inline-flex items-center gap-1.5 text-[11.5px] ${
            better
              ? "text-teal-700"
              : worse
                ? "text-orange-700"
                : "text-slate-500"
          }`}
        >
          {Math.abs(delta) < (format === "hours" ? 0.005 : 0.0005) ? (
            <Info className="h-3 w-3" />
          ) : better === lowerIsBetter && lowerIsBetter ? (
            <TrendingDown className="h-3 w-3" />
          ) : better ? (
            <TrendingUp className="h-3 w-3" />
          ) : (
            <TrendingDown className="h-3 w-3" />
          )}
          <span className="font-medium">{deltaPhrase}</span>
        </div>
      ) : (
        <div className="mt-2 text-[11.5px] text-slate-400">
          No prior-period comparison
        </div>
      )}

      {/* Sparkline */}
      <div className="mt-3">
        <Sparkline data={sparkline} color={sparklineColor} />
      </div>

      {/* Support band */}
      <div className="mt-3 rounded-md bg-slate-50 border border-slate-100 px-3 py-2">
        {supportProgress ? (
          <SupportProgress {...supportProgress} />
        ) : (
          <SupportPills primary={supportPrimary} secondary={supportSecondary} />
        )}
      </div>
    </div>
  )
}

function SupportPills({
  primary,
  secondary,
}: {
  primary?: string
  secondary?: string
}) {
  return (
    <div className="flex items-center gap-2.5 text-[10.5px] text-slate-600">
      <div className="flex items-center gap-1.5 min-w-0">
        <Clock className="h-3 w-3 text-slate-400 shrink-0" aria-hidden />
        <span className="truncate">{primary || "—"}</span>
      </div>
      {secondary && (
        <>
          <span className="h-3 w-px bg-slate-200" aria-hidden />
          <span className="truncate">{secondary}</span>
        </>
      )}
    </div>
  )
}

function SupportProgress({
  numerator,
  denominator,
  label,
}: {
  numerator: number
  denominator: number
  label: string
}) {
  const pct = denominator > 0 ? Math.min(1, Math.max(0, numerator / denominator)) : 0
  return (
    <div>
      <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden">
        <div
          className="h-full bg-teal-600 rounded-full transition-[width]"
          style={{ width: `${(pct * 100).toFixed(1)}%` }}
          aria-hidden
        />
      </div>
      <p className="mt-1.5 text-[10.5px] text-slate-600">
        <span className="font-medium text-slate-800 tabular-nums">
          {numerator} of {denominator}
        </span>{" "}
        {label}
      </p>
    </div>
  )
}

/**
 * Tiny inline trend chart for a metric card. Auto-scales to the data range
 * so even a metric that hovers in a narrow band reads as a visible curve.
 *
 * Gap handling (v2): days with no data still produce a "gap" in the solid
 * line — but we now bridge the endpoints of each gap with a thin dotted
 * line in the same colour at 35% opacity. Previously the line just stopped
 * and a viewer's eye couldn't tell whether (a) the series ended or (b) we
 * had a missing day. The dotted bridge keeps the overall trajectory
 * legible without lying about where real measurements exist.
 *
 * Visual hierarchy of the rendered marks:
 *   - solid 1.4px stroke for measured runs
 *   - dotted 1px stroke at 0.35 opacity for "no data here, but the trend
 *     continues" bridges
 *   - 1.2r filled dot for an isolated single-day measurement
 */
const Sparkline = memo(SparklineImpl)
function SparklineImpl({
  data,
  color,
  height = 32,
}: {
  data: (number | null)[]
  color: string
  height?: number
}) {
  const valid = data
    .map((v, i) => ({ v, i }))
    .filter((p): p is { v: number; i: number } => p.v !== null && Number.isFinite(p.v))

  if (valid.length < 2) {
    return (
      <div
        className="w-full text-[10px] text-slate-300 flex items-center"
        style={{ height }}
      >
        Not enough data
      </div>
    )
  }
  const min = Math.min(...valid.map((p) => p.v))
  const max = Math.max(...valid.map((p) => p.v))
  const range = max - min || 1
  const len = Math.max(1, data.length - 1)
  // viewBox is normalized 0..100 horizontally so the SVG fills its container.
  const xStep = 100 / len
  const padY = 2
  const drawY = (v: number) =>
    height - padY - ((v - min) / range) * (height - 2 * padY)

  // Build segments — break path when we hit a null gap so we don't connect
  // through missing days.
  const segments: { i: number; v: number }[][] = []
  let cur: { i: number; v: number }[] = []
  for (let i = 0; i < data.length; i++) {
    const v = data[i]
    if (v === null || !Number.isFinite(v as number)) {
      if (cur.length > 0) segments.push(cur)
      cur = []
    } else {
      cur.push({ i, v: v as number })
    }
  }
  if (cur.length > 0) segments.push(cur)

  // Bridges — one per adjacent pair of segments. Each bridge connects the
  // last point of segment N to the first point of segment N+1, drawn as a
  // dotted, low-opacity line so the eye reads it as "interpolated".
  const bridges: Array<{ x1: number; y1: number; x2: number; y2: number }> = []
  for (let i = 0; i < segments.length - 1; i++) {
    const a = segments[i][segments[i].length - 1]
    const b = segments[i + 1][0]
    bridges.push({
      x1: a.i * xStep,
      y1: drawY(a.v),
      x2: b.i * xStep,
      y2: drawY(b.v),
    })
  }

  return (
    <svg
      viewBox={`0 0 100 ${height}`}
      preserveAspectRatio="none"
      width="100%"
      height={height}
      role="img"
      aria-label="Trend"
    >
      {/* Bridges painted first so the solid runs sit on top. */}
      {bridges.map((b, idx) => (
        <line
          key={`b-${idx}`}
          x1={b.x1}
          y1={b.y1}
          x2={b.x2}
          y2={b.y2}
          stroke={color}
          strokeWidth={1}
          strokeDasharray="1.5 2"
          strokeLinecap="round"
          opacity={0.35}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {segments.map((seg, idx) => {
        if (seg.length === 1) {
          // Lone point — render as a small dot.
          const p = seg[0]
          return (
            <circle
              key={idx}
              cx={p.i * xStep}
              cy={drawY(p.v)}
              r={1.2}
              fill={color}
            />
          )
        }
        const d = seg
          .map((p, j) => {
            const x = p.i * xStep
            const y = drawY(p.v)
            return `${j === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`
          })
          .join(" ")
        return (
          <path
            key={idx}
            d={d}
            fill="none"
            stroke={color}
            strokeWidth={1.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        )
      })}
    </svg>
  )
}

function ChartCard({
  title,
  subtitle,
  yAxisLabel,
  children,
}: {
  title: string
  subtitle?: string
  /** Optional small axis-name label rendered above the chart canvas
   * (e.g. "Reports"). Matches the mockup's tiny axis-name treatment. */
  yAxisLabel?: string
  children: React.ReactNode
}) {
  return (
    <section className="bg-gradient-to-br from-white via-slate-50 to-slate-100 border border-slate-200 rounded-xl overflow-hidden shadow-sm">
      {/* Header had two dead-mockup affordances — a bare Info icon that
        * hooked up to nothing and a decorative 3-dot menu placeholder for
        * an actions menu that was never built. Both removed. */}
      <header className="px-5 py-4">
        <h3 className="font-display text-[15px] font-semibold text-slate-900">
          {title}
        </h3>
        {subtitle && (
          <p className="text-[12px] text-slate-500 mt-0.5">{subtitle}</p>
        )}
      </header>
      <div className="px-5 pb-5">
        {yAxisLabel && (
          <p className="text-[10.5px] text-slate-500 mb-1">{yAxisLabel}</p>
        )}
        {children}
      </div>
    </section>
  )
}

/* ---------------- Store tier summary ----------------------------------- */

type StoreTier = "active" | "quiet" | "dormant" | "never"

/** Approximate activity tier from the leaderboard row data alone.
 * Reports-per-store doesn't carry last_report_at from the API, but
 * past_48h_count + total are enough for a useful approximation:
 *   - past_48h_count > 0     → active
 *   - total > 0 and no past_48h → quiet
 *   - total === 0            → never
 * The /ho/stores page has the authoritative tier — this is a quick
 * approximation suitable for an Analytics summary, not for SLA work. */
function tierFor(r: LeaderboardRow): StoreTier {
  if (r.total === 0) return "never"
  if (r.past_48h_count > 0) return "active"
  return "quiet"
}

const StoreTierCards = memo(StoreTierCardsImpl)
function StoreTierCardsImpl({ rows }: { rows: LeaderboardRow[] }) {
  const counts = useMemo(() => {
    const acc: Record<StoreTier, number> = {
      active: 0,
      quiet: 0,
      dormant: 0,
      never: 0,
    }
    for (const r of rows) acc[tierFor(r)] += 1
    return acc
  }, [rows])
  const total = rows.length || 1
  const tiers: Array<{ key: StoreTier; label: string; tone: string; sub: string }> = [
    {
      key: "active",
      label: "Active",
      tone: "from-indigo-50 to-indigo-100 border-indigo-200 text-indigo-800",
      sub: "Reported in last 48h",
    },
    {
      key: "quiet",
      label: "Quiet",
      tone: "from-sky-50 to-sky-100 border-sky-200 text-sky-800",
      sub: "Some history, not active",
    },
    {
      key: "dormant",
      label: "Dormant",
      tone: "from-slate-50 to-slate-100 border-slate-200 text-slate-700",
      sub: "Inferred from criteria",
    },
    {
      key: "never",
      label: "Never",
      tone: "from-orange-50 to-orange-100 border-orange-200 text-orange-800",
      sub: "Zero reports filed",
    },
  ]
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {tiers.map((t) => (
        <div
          key={t.key}
          className={`bg-gradient-to-br ${t.tone} border rounded-xl px-4 py-3 shadow-sm`}
        >
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] opacity-80">
            {t.label}
          </p>
          <p className="mt-1 flex items-baseline gap-1.5">
            <span className="text-[24px] font-semibold tabular-nums leading-none">
              {counts[t.key]}
            </span>
            <span className="text-[11px] opacity-70 tabular-nums">
              / {rows.length} ({Math.round((counts[t.key] / total) * 100)}%)
            </span>
          </p>
          <p className="mt-0.5 text-[10.5px] opacity-70">{t.sub}</p>
        </div>
      ))}
    </div>
  )
}

/* ---------------- Scattered insights ----------------------------------- */

const StoreInsightCards = memo(StoreInsightCardsImpl)
function StoreInsightCardsImpl({ rows }: { rows: LeaderboardRow[] }) {
  // Three quick aggregations from the same leaderboard data. Each one
  // surfaces a single number + a "winner" label so HO doesn't need to
  // scan the table to find a top performer or an outlier.
  const insights = useMemo(() => {
    if (rows.length === 0) return null
    // Top brand by total volume.
    const byBrand = new Map<string, number>()
    for (const r of rows) byBrand.set(r.brand, (byBrand.get(r.brand) ?? 0) + r.total)
    const brandSorted = [...byBrand.entries()].sort((a, b) => b[1] - a[1])
    const topBrand = brandSorted[0] ?? null

    // Top city by total volume.
    const byCity = new Map<string, number>()
    for (const r of rows) byCity.set(r.city, (byCity.get(r.city) ?? 0) + r.total)
    const citySorted = [...byCity.entries()].sort((a, b) => b[1] - a[1])
    const topCity = citySorted[0] ?? null

    // Slowest manager ack — useful as an outlier signal.
    const withAck = rows.filter(
      (r) => r.median_ack_hours != null && r.median_ack_hours > 0,
    )
    const slowest = withAck.length
      ? [...withAck].sort(
          (a, b) => (b.median_ack_hours ?? 0) - (a.median_ack_hours ?? 0),
        )[0]
      : null
    return { topBrand, topCity, slowest }
  }, [rows])

  if (!insights) return null
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <InsightCard
        eyebrow="Top brand by volume"
        primary={insights.topBrand ? insights.topBrand[0] : "—"}
        secondary={
          insights.topBrand
            ? `${insights.topBrand[1]} reports in range`
            : "No reports in range"
        }
      />
      <InsightCard
        eyebrow="Top city by volume"
        primary={insights.topCity ? insights.topCity[0] : "—"}
        secondary={
          insights.topCity
            ? `${insights.topCity[1]} reports in range`
            : "No reports in range"
        }
      />
      <InsightCard
        eyebrow="Slowest manager ack"
        primary={insights.slowest ? insights.slowest.name : "—"}
        secondary={
          insights.slowest
            ? `Median ${formatHours(insights.slowest.median_ack_hours)} · ${insights.slowest.sap_code}`
            : "No acknowledgements yet"
        }
        warn
      />
    </div>
  )
}

function InsightCard({
  eyebrow,
  primary,
  secondary,
  warn = false,
}: {
  eyebrow: string
  primary: string
  secondary: string
  warn?: boolean
}) {
  const tone = warn
    ? "from-orange-50 to-orange-100 border-orange-200"
    : "from-white via-slate-50 to-slate-100 border-slate-200"
  const text = warn ? "text-orange-700" : "text-indigo-600"
  return (
    <div
      className={`bg-gradient-to-br ${tone} border rounded-xl px-4 py-3 shadow-sm`}
    >
      <p
        className={`text-[10px] font-bold uppercase tracking-[0.12em] ${text}`}
      >
        {eyebrow}
      </p>
      <p className="mt-1 font-display text-[18px] font-semibold text-slate-900 truncate">
        {primary}
      </p>
      <p className="mt-0.5 text-[11.5px] text-slate-600 truncate">
        {secondary}
      </p>
    </div>
  )
}

/* ---------------- Sortable per-store table ----------------------------- */

type SortKey =
  | "name"
  | "brand"
  | "total"
  | "unique_reporters"
  | "median_ack_hours"
  | "median_resolution_hours"
  | "first_attempt_rate"
  | "past_48h_count"
  | "visits"
  | "submit_rate"

type SortDir = "asc" | "desc"

/**
 * Click a header → sort by that column (default direction picked per
 * column: text columns asc, numeric columns desc — what most people
 * expect). Click the same header again → flip direction. The user
 * asked for double-click-to-flip; we also accept a second single
 * click on the active column as the same intent, because for keyboard
 * users it's the only path.
 */
const StoreAnalyticsTable = memo(StoreAnalyticsTableImpl)
function StoreAnalyticsTableImpl({ rows }: { rows: LeaderboardRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("total")
  const [sortDir, setSortDir] = useState<SortDir>("desc")

  // Default direction per column — text asc, numeric desc.
  const defaultDir: Record<SortKey, SortDir> = {
    name: "asc",
    brand: "asc",
    total: "desc",
    unique_reporters: "desc",
    median_ack_hours: "asc", // lower ack hours = faster = first
    median_resolution_hours: "asc",
    first_attempt_rate: "desc",
    past_48h_count: "desc",
    visits: "desc",
    submit_rate: "desc",
  }

  function onHeaderClick(key: SortKey) {
    if (sortKey === key) {
      // Toggle direction on a re-click of the active column.
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir(defaultDir[key])
    }
  }

  // Some keys map to nullable values — push nulls to the end regardless
  // of direction so they don't crowd whichever side a sort is pointing.
  function cmp(a: LeaderboardRow, b: LeaderboardRow): number {
    let av: number | string | null = null
    let bv: number | string | null = null
    switch (sortKey) {
      case "name":
        av = a.name
        bv = b.name
        break
      case "brand":
        av = a.brand
        bv = b.brand
        break
      case "total":
        av = a.total
        bv = b.total
        break
      case "unique_reporters":
        av = a.unique_reporters
        bv = b.unique_reporters
        break
      case "median_ack_hours":
        av = a.median_ack_hours
        bv = b.median_ack_hours
        break
      case "median_resolution_hours":
        av = a.median_resolution_hours
        bv = b.median_resolution_hours
        break
      case "first_attempt_rate":
        av = a.first_attempt_rate
        bv = b.first_attempt_rate
        break
      case "past_48h_count":
        av = a.past_48h_count
        bv = b.past_48h_count
        break
      case "visits":
        av = a.visits
        bv = b.visits
        break
      case "submit_rate":
        // Reports / visits. Stores with no visits sort to the end (null
        // handling below), regardless of how many reports they have —
        // those rows pre-date the visit-tracker cutover and the rate
        // would be a false 0%.
        av = a.visits === 0 ? null : a.total / a.visits
        bv = b.visits === 0 ? null : b.total / b.visits
        break
    }
    // Nulls last
    if (av === null && bv === null) return 0
    if (av === null) return 1
    if (bv === null) return -1
    if (typeof av === "number" && typeof bv === "number") {
      return sortDir === "asc" ? av - bv : bv - av
    }
    const s = String(av).localeCompare(String(bv))
    return sortDir === "asc" ? s : -s
  }
  const sorted = useMemo(() => [...rows].sort(cmp), [rows, sortKey, sortDir])

  if (rows.length === 0) return <EmptyState label="No stores in range." />

  const headers: Array<{
    key: SortKey
    label: string
    align: "left" | "right"
    title?: string
  }> = [
    { key: "name", label: "Store", align: "left" },
    { key: "brand", label: "Brand · city", align: "left" },
    {
      key: "visits",
      label: "Visits",
      align: "right",
      title:
        "Landing-page visits in range. The smaller line below is the share that arrived via QR scan vs direct.",
    },
    {
      key: "submit_rate",
      label: "Submit %",
      align: "right",
      title:
        "Reports filed ÷ visits. Low rate = staff are reaching the page but not filing — copy or trust issue.",
    },
    { key: "total", label: "Volume", align: "right" },
    { key: "unique_reporters", label: "Reporters", align: "right" },
    {
      key: "median_ack_hours",
      label: "Mgr ack",
      align: "right",
      title: "Median time from filing to manager acknowledgement",
    },
    {
      key: "median_resolution_hours",
      label: "Resolution",
      align: "right",
      title: "Median time from filing to HO approval (close)",
    },
    {
      key: "first_attempt_rate",
      label: "1st-try",
      align: "right",
      title: "Share of closed reports resolved on attempt 1",
    },
    {
      key: "past_48h_count",
      label: "Past 48h",
      align: "right",
      title: "Reports filed in the trailing 48 hours",
    },
  ]

  const maxTotal = sorted.reduce((m, r) => (r.total > m ? r.total : m), 0)
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12.5px]">
        <thead>
          <tr className="text-[10.5px] uppercase tracking-wide text-slate-500 border-b border-slate-100">
            {headers.map((h) => {
              const active = sortKey === h.key
              return (
                <th
                  key={h.key}
                  className={`${h.align === "right" ? "text-right" : "text-left"} px-2 py-2 font-medium`}
                  title={h.title}
                >
                  <button
                    type="button"
                    onClick={() => onHeaderClick(h.key)}
                    onDoubleClick={() => onHeaderClick(h.key)}
                    className={`inline-flex items-center gap-1 ${active ? "text-indigo-700" : "text-slate-500 hover:text-slate-700"} ${h.align === "right" ? "flex-row-reverse" : ""}`}
                  >
                    {h.label}
                    <span
                      aria-hidden
                      className={`text-[10px] ${active ? "opacity-100" : "opacity-30"}`}
                    >
                      {active && sortDir === "desc" ? "▼" : "▲"}
                    </span>
                  </button>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const volPct =
              maxTotal === 0 ? 0 : Math.round((r.total / maxTotal) * 100)
            const firstPct = Math.round(r.first_attempt_rate * 100)
            const ackHealthy =
              r.median_ack_hours != null && r.median_ack_hours < 24
            const resHealthy =
              r.median_resolution_hours != null &&
              r.median_resolution_hours < 48
            return (
              <tr
                key={r.sap_code}
                className="border-t border-slate-100 hover:bg-slate-50/60 transition-colors"
              >
                <td className="px-2 py-2">
                  <div className="text-slate-900 font-medium truncate max-w-[220px]">
                    {r.name}
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono">
                    {r.sap_code}
                  </div>
                </td>
                <td className="px-2 py-2 text-slate-700">
                  <div>{r.brand}</div>
                  <div className="text-[11px] text-slate-500">{r.city}</div>
                </td>
                {/* Visits — primary number on top, source split as
                  * micro-info below. Stores with zero visits in range
                  * (or pre-cutover) show an em dash so the row doesn't
                  * read as a real "0% QR" data point. */}
                <td className="px-2 py-2 text-right tabular-nums">
                  {r.visits === 0 ? (
                    <span className="text-slate-300">—</span>
                  ) : (
                    <div>
                      <div className="text-slate-900">{r.visits}</div>
                      <div className="text-[10.5px] text-slate-500">
                        {Math.round((r.qr_visits / r.visits) * 100)}% QR
                        {r.unique_visitors > 0 && (
                          <>
                            {" · "}
                            {r.unique_visitors}{" "}
                            {r.unique_visitors === 1 ? "device" : "devices"}
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </td>
                {/* Submit % — reports / visits. Tinted teal when ≥10%
                  * (good engagement), orange when <2% with non-trivial
                  * traffic (looks like leak: people landing but not
                  * filing), slate otherwise. Em dash when there's no
                  * traffic data to divide by. */}
                <td
                  className={`px-2 py-2 text-right tabular-nums ${
                    r.visits === 0
                      ? "text-slate-300"
                      : r.total / r.visits >= 0.1
                        ? "text-teal-700"
                        : r.visits >= 20 && r.total / r.visits < 0.02
                          ? "text-orange-700"
                          : "text-slate-700"
                  }`}
                >
                  {r.visits === 0
                    ? "—"
                    : `${Math.round((r.total / r.visits) * 100)}%`}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  <div className="flex items-center justify-end gap-2">
                    <span className="text-slate-900">{r.total}</span>
                    <span className="w-20 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <span
                        className="block h-full bg-indigo-500"
                        style={{ width: `${volPct}%` }}
                      />
                    </span>
                  </div>
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-slate-700">
                  {r.unique_reporters || (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
                <td
                  className={`px-2 py-2 text-right tabular-nums ${
                    r.median_ack_hours == null
                      ? "text-slate-300"
                      : ackHealthy
                        ? "text-teal-700"
                        : "text-orange-700"
                  }`}
                >
                  {formatHours(r.median_ack_hours)}
                </td>
                <td
                  className={`px-2 py-2 text-right tabular-nums ${
                    r.median_resolution_hours == null
                      ? "text-slate-300"
                      : resHealthy
                        ? "text-teal-700"
                        : "text-orange-700"
                  }`}
                >
                  {formatHours(r.median_resolution_hours)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {r.total === 0 ? (
                    <span className="text-slate-300">—</span>
                  ) : (
                    <span className="text-slate-700">{firstPct}%</span>
                  )}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {r.past_48h_count > 0 ? (
                    <span className="text-orange-700">
                      {r.past_48h_count}
                    </span>
                  ) : (
                    <span className="text-slate-300">0</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="h-[240px] flex items-center justify-center text-sm text-slate-400">
      {label}
    </div>
  )
}

/* ----------------------------- Formatters -------------------------------- */

// tickDateFmt previously lived here too; it moved to analytics-charts.tsx
// alongside the Recharts BarChart components. The Recharts axes are the
// only place it was ever used.

function prettyDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })
  } catch {
    return iso
  }
}

function formatHours(h: number | null): string {
  if (h == null) return "—"
  if (h < 1) return `${Math.round(h * 60)}m`
  if (h < 48) return `${h.toFixed(1)}h`
  return `${(h / 24).toFixed(1)}d`
}

function formatDelta(delta: number, unit: "h"): string {
  if (Math.abs(delta) < 1) return `${(delta * 60).toFixed(0)}m`
  if (Math.abs(delta) < 48) return `${delta.toFixed(1)}${unit}`
  return `${(delta / 24).toFixed(1)}d`
}

function formatPercent(p: number | null): string {
  if (p == null) return "—"
  return `${Math.round(p * 100)}%`
}
