"use client"

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  Calendar,
  Clock,
  Download,
  Loader2,
  TrendingDown,
  TrendingUp,
} from "lucide-react"
import { useEffect, useState } from "react"
import { CATEGORIES } from "@/lib/categories"

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

// ---- Palette tokens (hex; Recharts needs strings) -----------------------
const STATUS_FILL: Record<keyof Omit<BucketedStatus, "date">, string> = {
  new: "#475569",
  in_progress: "#4338CA",
  awaiting_ho: "#0369A1",
  returned: "#C2410C",
  closed: "#0F766E",
  voided: "#94A3B8",
}

const STATUS_LABEL: Record<keyof Omit<BucketedStatus, "date">, string> = {
  new: "New",
  in_progress: "Acknowledged",
  awaiting_ho: "Awaiting HO",
  returned: "Returned",
  closed: "Closed",
  voided: "Voided",
}

const STATUS_ORDER: readonly (keyof Omit<BucketedStatus, "date">)[] = [
  "closed",
  "awaiting_ho",
  "returned",
  "in_progress",
  "new",
  "voided",
]

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
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const body = (await res.json()) as Payload
        if (!cancelled) setData(body)
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Couldn't load analytics.")
        }
      } finally {
        if (!cancelled) setBusy(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [from, to, brands, categories])

  function toggle(key: string, list: string[], setList: (v: string[]) => void) {
    setList(list.includes(key) ? list.filter((x) => x !== key) : [...list, key])
  }

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
      {/* Header */}
      <header className="mb-5 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-slate-500">
            Pilot · ABFRL
          </p>
          <h1 className="font-display text-[26px] font-semibold tracking-tight text-slate-900 mt-0.5">
            Analytics
          </h1>
          <p className="text-[12.5px] text-slate-600 mt-1">
            {data ? (
              <>
                {prettyDate(data.range.from)} → {prettyDate(data.range.to)} ·{" "}
                {data.totals.reports} reports · {data.granularity} bars
              </>
            ) : (
              "Pilot-wide trends. Adjust the range below."
            )}
          </p>
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

      {/* Range + filter card */}
      <section className="bg-white border border-slate-200 rounded-xl p-4 mb-5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] text-slate-500 mr-1">Range:</span>
          <RangeChip active={preset === "7d"} onClick={() => applyPreset("7d")}>
            7d
          </RangeChip>
          <RangeChip
            active={preset === "30d"}
            onClick={() => applyPreset("30d")}
          >
            30d
          </RangeChip>
          <RangeChip
            active={preset === "90d"}
            onClick={() => applyPreset("90d")}
          >
            90d
          </RangeChip>
          <RangeChip
            active={preset === "custom"}
            onClick={() => setPreset("custom")}
          >
            <Calendar className="h-3 w-3 inline -mt-0.5 mr-1" />
            Custom
          </RangeChip>
          {preset === "custom" && (
            <div className="flex items-center gap-2 ml-2">
              <input
                type="date"
                value={from}
                max={to}
                onChange={(e) => setFrom(e.target.value)}
                className="px-2 py-1 border border-slate-300 rounded-md text-[12.5px]"
              />
              <span className="text-[11px] text-slate-400">→</span>
              <input
                type="date"
                value={to}
                min={from}
                max={isoToday()}
                onChange={(e) => setTo(e.target.value)}
                className="px-2 py-1 border border-slate-300 rounded-md text-[12.5px]"
              />
            </div>
          )}
          {data && (
            <span className="ml-2 px-2.5 py-1 rounded-md bg-slate-100 text-[11px] text-slate-700 font-mono">
              {prettyDate(data.range.from)} → {prettyDate(data.range.to)}
            </span>
          )}
          {data && data.range.span_days > 60 && (
            <span className="text-[10.5px] text-slate-500 italic">
              Bars are weekly above 60 days
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap mt-3">
          <span className="text-[11px] text-slate-500 mr-1">Brand:</span>
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

        <div className="flex items-center gap-1.5 flex-wrap mt-2">
          <span className="text-[11px] text-slate-500 mr-1">Category:</span>
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

      {/* Time analytics cards */}
      <div className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.08em] text-slate-600 flex items-center gap-1">
        <Clock className="h-3 w-3" />
        Time analytics
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <TimeCard
          label="Median time to acknowledge"
          value={data?.time_analytics.median_ack_hours ?? null}
          prev={data?.time_analytics_prev.median_ack_hours ?? null}
          format="hours"
          subline={
            data
              ? `P90 ${formatHours(data.time_analytics.p90_ack_hours)} · ${data.time_analytics.acked_count} acked`
              : "—"
          }
          lowerIsBetter
        />
        <TimeCard
          label="Median resolution time"
          value={data?.time_analytics.median_resolution_hours ?? null}
          prev={data?.time_analytics_prev.median_resolution_hours ?? null}
          format="hours"
          subline={
            data
              ? `P90 ${formatHours(data.time_analytics.p90_resolution_hours)} · reported → closed`
              : "—"
          }
          lowerIsBetter
        />
        <TimeCard
          label="First-attempt resolution"
          value={data?.time_analytics.first_attempt_rate ?? null}
          prev={data?.time_analytics_prev.first_attempt_rate ?? null}
          format="percent"
          subline={
            data
              ? `${Math.round((data.time_analytics.first_attempt_rate ?? 0) * data.time_analytics.closed_count)} first-try / ${data.time_analytics.closed_count}`
              : "—"
          }
        />
        <TimeCard
          label={`Resolved within ${data?.sla_hours ?? 48}h SLA`}
          value={data?.time_analytics.pct_within_48h ?? null}
          prev={data?.time_analytics_prev.pct_within_48h ?? null}
          format="percent"
          subline={
            data
              ? `${Math.round((data.time_analytics.pct_within_48h ?? 0) * data.time_analytics.closed_count)} within SLA / ${data.time_analytics.closed_count}`
              : "—"
          }
        />
      </div>

      {/* Median trend line */}
      <ChartCard
        title={`${data?.granularity === "weekly" ? "Weekly" : "Daily"} median: acknowledge vs resolution`}
        subtitle="Lower is better. Dashed line is the 48h resolution SLA."
      >
        <MedianTrend
          rows={data?.time_series_medians ?? []}
          sla={data?.sla_hours ?? 48}
        />
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5">
        <ChartCard
          title={`Reports per ${data?.granularity === "weekly" ? "week" : "day"}, stacked by status`}
          subtitle="Stacked from closed (bottom) upward."
        >
          <StatusBars rows={data?.time_series_status ?? []} />
        </ChartCard>

        <ChartCard
          title={`Category mix per ${data?.granularity === "weekly" ? "week" : "day"}`}
          subtitle="Observations slate, incidents amber."
        >
          <CategoryBars rows={data?.time_series_categories ?? []} />
        </ChartCard>
      </div>

      <div className="mt-5">
        <ChartCard
          title="Store leaderboard"
          subtitle="Top 20 by report volume. First-attempt rate = share of closed reports resolved on attempt 1."
        >
          <StoreLeaderboard rows={data?.leaderboard ?? []} />
        </ChartCard>
      </div>
    </div>
  )
}

/* ----------------------------- Small bits -------------------------------- */

function RangeChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 h-7 text-[12px] rounded-full border transition-colors ${
        active
          ? "bg-indigo-700 border-indigo-700 text-white"
          : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  )
}

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
    ? "bg-amber-700 border-amber-700 text-white"
    : "bg-slate-900 border-slate-900 text-white"
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 h-7 text-[11.5px] rounded-full border transition-colors ${
        active
          ? activeCls
          : incident
            ? "bg-white border-amber-200 text-amber-800 hover:bg-amber-50"
            : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  )
}

function TimeCard({
  label,
  value,
  prev,
  format,
  subline,
  lowerIsBetter,
}: {
  label: string
  value: number | null
  prev: number | null
  format: "hours" | "percent"
  subline: string
  lowerIsBetter?: boolean
}) {
  const hasValue = value !== null
  const hasDelta = hasValue && prev !== null
  const delta = hasDelta ? (value as number) - (prev as number) : 0
  const better = lowerIsBetter ? delta < 0 : delta > 0
  const worse = lowerIsBetter ? delta > 0 : delta < 0
  return (
    <div className="bg-white border border-slate-200 rounded-md p-3">
      <div className="text-[11px] text-slate-600">{label}</div>
      <div className="mt-2 flex items-baseline gap-2 flex-wrap">
        <span
          className={`text-[22px] font-semibold tabular-nums ${
            hasValue
              ? lowerIsBetter
                ? "text-teal-700"
                : "text-slate-900"
              : "text-slate-400"
          }`}
        >
          {format === "hours" ? formatHours(value) : formatPercent(value)}
        </span>
        {hasDelta && Math.abs(delta) > 0.005 && (
          <span
            className={`inline-flex items-center gap-0.5 text-[10.5px] font-medium ${
              better ? "text-teal-700" : worse ? "text-orange-700" : "text-slate-500"
            }`}
          >
            {delta > 0 ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            )}
            {format === "hours"
              ? `${formatDelta(delta, "h")}`
              : `${(delta * 100).toFixed(1)}pt`}{" "}
            vs prev
          </span>
        )}
      </div>
      <div className="text-[10.5px] text-slate-500 mt-1">{subline}</div>
    </div>
  )
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <header className="px-4 py-3 border-b border-slate-200">
        <h3 className="text-[13px] font-semibold text-slate-900">{title}</h3>
        {subtitle && (
          <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>
        )}
      </header>
      <div className="p-4">{children}</div>
    </section>
  )
}

function MedianTrend({
  rows,
  sla,
}: {
  rows: BucketedMedian[]
  sla: number
}) {
  if (rows.length === 0) {
    return <EmptyState label="No data in range." />
  }
  return (
    <div className="h-[240px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={rows}
          margin={{ top: 10, right: 12, left: 0, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
          <XAxis
            dataKey="date"
            tickFormatter={tickDateFmt}
            fontSize={11}
            stroke="#94A3B8"
          />
          <YAxis
            fontSize={11}
            stroke="#94A3B8"
            width={32}
            label={{
              value: "hrs",
              angle: -90,
              position: "insideLeft",
              fontSize: 10,
              fill: "#94A3B8",
            }}
          />
          <Tooltip
            labelFormatter={(v) => prettyDate(v as string)}
            formatter={(value, name) => {
              const v = typeof value === "number" ? value : null
              const label =
                name === "median_ack_hours" ? "Median ack" : "Median resolution"
              return [v == null ? "—" : `${v.toFixed(1)}h`, label]
            }}
            contentStyle={{
              fontSize: 12,
              borderRadius: 6,
              border: "1px solid #E2E8F0",
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: 11 }}
            formatter={(value) =>
              value === "median_ack_hours"
                ? "Median ack"
                : "Median resolution"
            }
          />
          <ReferenceLine
            y={sla}
            stroke="#C2410C"
            strokeDasharray="3 3"
            label={{
              value: `${sla}h SLA`,
              position: "right",
              fontSize: 10,
              fill: "#C2410C",
            }}
          />
          <Line
            type="monotone"
            dataKey="median_ack_hours"
            stroke="#0F766E"
            strokeWidth={2}
            dot={false}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="median_resolution_hours"
            stroke="#4338CA"
            strokeWidth={2}
            dot={false}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function StatusBars({ rows }: { rows: BucketedStatus[] }) {
  if (rows.length === 0) {
    return <EmptyState label="No reports in range." />
  }
  return (
    <div className="h-[240px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={rows}
          margin={{ top: 10, right: 12, left: 0, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
          <XAxis
            dataKey="date"
            tickFormatter={tickDateFmt}
            fontSize={11}
            stroke="#94A3B8"
          />
          <YAxis
            allowDecimals={false}
            fontSize={11}
            stroke="#94A3B8"
            width={28}
          />
          <Tooltip
            labelFormatter={(v) => prettyDate(v as string)}
            contentStyle={{
              fontSize: 12,
              borderRadius: 6,
              border: "1px solid #E2E8F0",
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: 11 }}
            formatter={(value) =>
              STATUS_LABEL[value as keyof typeof STATUS_LABEL] ?? value
            }
          />
          {STATUS_ORDER.map((s) => (
            <Bar key={s} dataKey={s} stackId="a" fill={STATUS_FILL[s]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function CategoryBars({ rows }: { rows: BucketedCategory[] }) {
  if (rows.length === 0) {
    return <EmptyState label="No reports in range." />
  }
  const stackOrder = [
    { key: "near_miss", fill: "#475569", label: "Near miss" },
    { key: "unsafe_act", fill: "#64748B", label: "Unsafe act" },
    { key: "unsafe_condition", fill: "#94A3B8", label: "Unsafe condition" },
    { key: "first_aid_case", fill: "#FEF3C7", label: "First aid" },
    { key: "medical_treatment_case", fill: "#F59E0B", label: "Medical" },
    { key: "restricted_work_case", fill: "#D97706", label: "Restricted work" },
    { key: "lost_time_injury", fill: "#B45309", label: "Lost time" },
    { key: "fatality", fill: "#7C2D12", label: "Fatality" },
  ]
  return (
    <div className="h-[240px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={rows}
          margin={{ top: 10, right: 12, left: 0, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
          <XAxis
            dataKey="date"
            tickFormatter={tickDateFmt}
            fontSize={11}
            stroke="#94A3B8"
          />
          <YAxis
            allowDecimals={false}
            fontSize={11}
            stroke="#94A3B8"
            width={28}
          />
          <Tooltip
            labelFormatter={(v) => prettyDate(v as string)}
            contentStyle={{
              fontSize: 12,
              borderRadius: 6,
              border: "1px solid #E2E8F0",
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {stackOrder.map((s) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stackId="b"
              fill={s.fill}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function StoreLeaderboard({ rows }: { rows: LeaderboardRow[] }) {
  if (rows.length === 0) {
    return <EmptyState label="No stores in range." />
  }
  const withVolume = rows.filter((r) => r.total > 0)
  const maxTotal = withVolume.reduce((m, r) => (r.total > m ? r.total : m), 0)
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-slate-500">
            <th className="text-left px-2 py-2 font-medium">Store</th>
            <th className="text-left px-2 py-2 font-medium">Brand</th>
            <th className="text-left px-2 py-2 font-medium">City</th>
            <th className="text-right px-2 py-2 font-medium">Volume</th>
            <th className="text-right px-2 py-2 font-medium">
              First-attempt rate
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const volPct =
              maxTotal === 0 ? 0 : Math.round((r.total / maxTotal) * 100)
            const firstPct = Math.round(r.first_attempt_rate * 100)
            return (
              <tr key={r.sap_code} className="border-t border-slate-100">
                <td className="px-2 py-2">
                  <div className="text-slate-900 font-medium">{r.name}</div>
                  <div className="text-[11px] text-slate-400 font-mono">
                    {r.sap_code}
                  </div>
                </td>
                <td className="px-2 py-2 text-slate-700">{r.brand}</td>
                <td className="px-2 py-2 text-slate-700">{r.city}</td>
                <td className="px-2 py-2 text-right tabular-nums">
                  <div className="flex items-center justify-end gap-2">
                    <span className="text-slate-900">{r.total}</span>
                    <span className="w-24 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <span
                        className="block h-full bg-indigo-500"
                        style={{ width: `${volPct}%` }}
                      />
                    </span>
                  </div>
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {r.total === 0 ? (
                    <span className="text-slate-400">—</span>
                  ) : (
                    <div className="flex items-center justify-end gap-2">
                      <span className="text-slate-900">{firstPct}%</span>
                      <span className="w-24 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                        <span
                          className="block h-full bg-teal-500"
                          style={{ width: `${firstPct}%` }}
                        />
                      </span>
                    </div>
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

// Recharts' Cell import is required for tree-shake. Reference it once.
void Cell

/* ----------------------------- Formatters -------------------------------- */

function tickDateFmt(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
    })
  } catch {
    return iso
  }
}

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
