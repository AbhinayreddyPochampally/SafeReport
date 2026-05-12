import Link from "next/link"
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  FileText,
  Inbox,
  RotateCcw,
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
 * Renders four summary cards, an approval queue, and a 12-month × 8-category
 * heatmap strip. All data is fetched in parallel on the server; no polling,
 * no realtime — HO refreshes manually and reacts to email/SMS.
 *
 * Data shape notes:
 *  - `reports.store_code` joins to `stores.sap_code`
 *  - `reports.reported_at` is the timestamp we count against for "this month"
 *  - scope is pilot-wide (national) for every HO user; RLS/scope filtering is
 *    a Phase E concern and not layered in yet
 */

type HeatmapCell = {
  category: ReportCategory
  /** ISO month boundary, YYYY-MM-01 */
  month: string
  count: number
}

function startOfThisMonthISO(): string {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    .toISOString()
}

function startOfMonthsAgoISO(monthsBack: number): string {
  const now = new Date()
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsBack, 1),
  ).toISOString()
}

async function fetchLandingData(monthStart: string, heatmapStart: string) {
  const admin = createSupabaseAdminClient()

  const [
    reportsThisMonth,
    awaitingHo,
    closedThisMonth,
    returnedThisMonth,
    activeRowsRaw,
    heatmap,
  ] = await Promise.all([
    admin
      .from("reports")
      .select("id", { count: "exact", head: true })
      .gte("reported_at", monthStart),
    admin
      .from("reports")
      .select("id", { count: "exact", head: true })
      .eq("status", "awaiting_ho"),
    admin
      .from("reports")
      .select("id", { count: "exact", head: true })
      .eq("status", "closed")
      .gte("reported_at", monthStart),
    admin
      .from("reports")
      .select("id", { count: "exact", head: true })
      .eq("status", "returned")
      .gte("reported_at", monthStart),
    // Open reports across both queues. We grab everything in one query and
    // partition client-side because the row shape and join are identical;
    // this is faster than two round-trips and the row count is bounded by
    // the pilot size. Headline = first ~100 chars of transcript|description
    // so each row carries useful context without a second fetch.
    admin
      .from("reports")
      .select(
        "id, store_code, category, status, reported_at, transcript, description, stores!inner(name, brand, manager_name)",
      )
      .in("status", ["new", "in_progress", "awaiting_ho", "returned"])
      .order("reported_at", { ascending: true })
      .limit(100),
    admin
      .from("reports")
      .select("category, reported_at")
      .gte("reported_at", heatmapStart),
  ])

  const allOpen: QueueRow[] = (activeRowsRaw.data ?? []).map((r) => {
    const s = (r as unknown as {
      stores: { name: string; brand: string; manager_name: string | null }
    }).stores
    const transcript = (r.transcript as string | null)?.trim() ?? ""
    const description = (r.description as string | null)?.trim() ?? ""
    const headline = (transcript || description || "").slice(0, 110) || null
    return {
      id: r.id as string,
      store_code: r.store_code as string,
      store_name: s?.name ?? "—",
      brand: s?.brand ?? "—",
      category: r.category as ReportCategory,
      status: r.status as QueueStatus,
      reported_at: r.reported_at as string,
      manager_name: s?.manager_name ?? null,
      headline,
    }
  })

  // Partition into the two queues. Approval = action-required, Pipeline = awareness.
  // Approval shown oldest-first (you act on the longest-waiting). Pipeline
  // shown newest-first (you scan what just landed).
  const approvalRows = allOpen
    .filter((r) => r.status === "awaiting_ho")
    .sort((a, b) => a.reported_at.localeCompare(b.reported_at))
  const pipelineRows = allOpen
    .filter((r) => r.status !== "awaiting_ho")
    .sort((a, b) => b.reported_at.localeCompare(a.reported_at))

  // Bucket the heatmap data into (category × month). We only need the last 12
  // months by spec, so truncate if the DB returns extras.
  const buckets = new Map<string, number>()
  for (const row of heatmap.data ?? []) {
    const dt = new Date(row.reported_at as string)
    const monthKey = new Date(
      Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), 1),
    )
      .toISOString()
      .slice(0, 10)
    const k = `${row.category}::${monthKey}`
    buckets.set(k, (buckets.get(k) ?? 0) + 1)
  }

  const heatmapCells: HeatmapCell[] = []
  const now = new Date()
  for (const cat of CATEGORIES) {
    for (let m = 11; m >= 0; m--) {
      const d = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - m, 1),
      )
      const monthKey = d.toISOString().slice(0, 10)
      heatmapCells.push({
        category: cat.key,
        month: monthKey,
        count: buckets.get(`${cat.key}::${monthKey}`) ?? 0,
      })
    }
  }

  return {
    reportsThisMonth: reportsThisMonth.count ?? 0,
    awaitingHo: awaitingHo.count ?? 0,
    closedThisMonth: closedThisMonth.count ?? 0,
    returnedThisMonth: returnedThisMonth.count ?? 0,
    approvalRows,
    pipelineRows,
    heatmap: heatmapCells,
  }
}

export default async function HoLandingPage() {
  await requireHoSession("/ho")

  const monthStart = startOfThisMonthISO()
  const heatmapStart = startOfMonthsAgoISO(11) // current month + 11 back = 12 months

  const data = await fetchLandingData(monthStart, heatmapStart)

  return (
    <div className="max-w-[1400px] mx-auto px-8 py-8">
      {/* Page header --------------------------------------------------------- */}
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
              Reports landing on your desk — and the pipeline behind them.
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

      {/* Summary cards ------------------------------------------------------ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <SummaryCard
          accent="indigo"
          label="Reports this month"
          value={data.reportsThisMonth}
          icon={FileText}
        />
        <SummaryCard
          accent="sky"
          label="Awaiting my approval"
          value={data.awaitingHo}
          icon={Inbox}
        />
        <SummaryCard
          accent="teal"
          label="Closed this month"
          value={data.closedThisMonth}
          icon={CheckCircle2}
        />
        <SummaryCard
          accent="orange"
          label="Returned this month"
          value={data.returnedThisMonth}
          icon={RotateCcw}
        />
      </div>

      {/* Approval queue (action-required) ---------------------------------- */}
      <QueueList
        variant="approval"
        rows={data.approvalRows}
        viewAllHref="/ho/all-reports?status=awaiting_ho"
      />

      {/* Reported queue (pipeline awareness) ------------------------------- */}
      <QueueList
        variant="pipeline"
        rows={data.pipelineRows}
        viewAllHref="/ho/all-reports?status=open"
      />

      {/* Category heatmap --------------------------------------------------- */}
      <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-slate-600" aria-hidden />
            <h2 className="font-display text-base font-semibold text-slate-900">
              Category heatmap
            </h2>
          </div>
          <p className="text-xs text-slate-500">Last 12 months</p>
        </div>
        <Heatmap cells={data.heatmap} />
      </section>
    </div>
  )
}

/* ----------------------------- Summary card ------------------------------ */

type AccentKey = "indigo" | "sky" | "teal" | "orange"

const ACCENT_STYLES: Record<
  AccentKey,
  { text: string; bg: string; ring: string }
> = {
  indigo: {
    text: "text-indigo-700",
    bg: "bg-indigo-50",
    ring: "ring-indigo-100",
  },
  sky: { text: "text-sky-700", bg: "bg-sky-50", ring: "ring-sky-100" },
  teal: { text: "text-teal-700", bg: "bg-teal-50", ring: "ring-teal-100" },
  orange: {
    text: "text-orange-700",
    bg: "bg-orange-50",
    ring: "ring-orange-100",
  },
}

function SummaryCard({
  accent,
  label,
  value,
  icon: Icon,
  href,
}: {
  accent: AccentKey
  label: string
  value: number
  icon: LucideIcon
  href?: string
}) {
  const s = ACCENT_STYLES[accent]
  const inner = (
    <div className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-sm transition-shadow h-full flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span
          className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${s.bg} ${s.text} ring-1 ${s.ring}`}
        >
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        {href ? (
          <ArrowRight className="h-4 w-4 text-slate-400" aria-hidden />
        ) : null}
      </div>
      <div>
        <div
          className={`text-3xl font-semibold tracking-tight ${s.text} tabular-nums`}
        >
          {value}
        </div>
        <div className="text-sm text-slate-600 mt-1">{label}</div>
      </div>
    </div>
  )
  return href ? (
    <Link href={href} className="block focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded-xl">
      {inner}
    </Link>
  ) : (
    inner
  )
}

/* -------------------------------- Heatmap -------------------------------- */

function Heatmap({ cells }: { cells: HeatmapCell[] }) {
  // Compute the max count so we can map to 5 discrete opacity buckets. A flat
  // linear mapping puts too much weight on outliers, so we take a gentle root.
  const max = cells.reduce((m, c) => (c.count > m ? c.count : m), 0)

  // Pull a stable ordered list of months from the data (cells are emitted in
  // oldest→newest order per category; all categories share the same month set).
  const months = Array.from(new Set(cells.map((c) => c.month))).sort()
  const monthLabel = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleDateString("en-IN", { month: "short" })
  }

  // Group cells by category for row rendering.
  const byCategory = new Map<ReportCategory, HeatmapCell[]>()
  for (const c of cells) {
    const arr = byCategory.get(c.category) ?? []
    arr.push(c)
    byCategory.set(c.category, arr)
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-xs">
        <thead>
          <tr>
            <th className="text-left text-[11px] font-medium text-slate-500 uppercase tracking-wide px-6 py-3">
              Category
            </th>
            {months.map((m) => (
              <th
                key={m}
                scope="col"
                className="text-center text-[11px] font-medium text-slate-500 uppercase tracking-wide px-1 py-3"
              >
                {monthLabel(m)}
              </th>
            ))}
            <th className="px-6" />
          </tr>
        </thead>
        <tbody>
          {CATEGORIES.map((cat) => {
            const row = (byCategory.get(cat.key) ?? []).sort((a, b) =>
              a.month.localeCompare(b.month),
            )
            const rowTotal = row.reduce((n, c) => n + c.count, 0)
            const isIncident = cat.kind === "incident"
            return (
              <tr key={cat.key} className="border-t border-slate-100">
                <td className="px-6 py-2 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <cat.icon
                      className={`h-4 w-4 ${
                        isIncident ? "text-amber-700" : "text-slate-600"
                      }`}
                      aria-hidden
                    />
                    <span className="text-slate-800">{cat.label}</span>
                  </div>
                </td>
                {row.map((c) => (
                  <HeatmapCellBox
                    key={c.month}
                    count={c.count}
                    max={max}
                    isIncident={isIncident}
                    month={c.month}
                    categoryLabel={cat.label}
                  />
                ))}
                <td className="px-6 py-2 text-right text-slate-500 tabular-nums">
                  {rowTotal}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function HeatmapCellBox({
  count,
  max,
  isIncident,
  month,
  categoryLabel,
}: {
  count: number
  max: number
  isIncident: boolean
  month: string
  categoryLabel: string
}) {
  // 0 → empty cell; otherwise bucket into 1..5 using sqrt scaling against max.
  let bucket = 0
  if (count > 0 && max > 0) {
    const ratio = Math.sqrt(count) / Math.sqrt(max)
    bucket = Math.max(1, Math.min(5, Math.ceil(ratio * 5)))
  }
  // Palette rule: incidents = amber, observations = slate. Never green/red.
  const paletteAmber = [
    "bg-slate-50",
    "bg-amber-100",
    "bg-amber-200",
    "bg-amber-300",
    "bg-amber-500",
    "bg-amber-700",
  ]
  const paletteSlate = [
    "bg-slate-50",
    "bg-slate-200",
    "bg-slate-300",
    "bg-slate-400",
    "bg-slate-500",
    "bg-slate-700",
  ]
  const palette = isIncident ? paletteAmber : paletteSlate
  const textInverted = bucket >= 4
  return (
    <td className="px-1 py-1 align-middle">
      <div
        title={`${categoryLabel} · ${new Date(month).toLocaleDateString(
          "en-IN",
          { month: "short", year: "numeric" },
        )} · ${count}`}
        className={`mx-auto h-7 w-7 rounded flex items-center justify-center text-[11px] tabular-nums ${
          palette[bucket]
        } ${textInverted ? "text-white" : "text-slate-700"}`}
      >
        {count > 0 ? count : ""}
      </div>
    </td>
  )
}
