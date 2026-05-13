import Link from "next/link"
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  FileText,
  Inbox,
  RotateCcw,
  Store as StoreIcon,
  type LucideIcon,
} from "lucide-react"
import { requireHoSession } from "@/lib/ho-auth"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import type { ReportCategory } from "@/lib/reporter-state"
import { QueueList, type QueueRow, type QueueStatus } from "./queue-list"

export const dynamic = "force-dynamic"

/**
 * HO landing — /ho.
 *
 * Renders four summary cards, an approval queue, a pipeline queue, and a
 * "stores needing attention" panel (replaces the 12-month heatmap as of
 * May 2026 — the heatmap surfaced no actionable signal). All data is fetched
 * in parallel on the server; no polling, no realtime.
 *
 * Data shape notes:
 *  - `reports.store_code` joins to `stores.sap_code`
 *  - `reports.reported_at` is the timestamp we count against for "this month"
 *  - scope is pilot-wide (national) for every HO user; RLS/scope filtering is
 *    a Phase E concern and not layered in yet
 */

const ATTENTION_HOURS = 48

type AttentionStore = {
  sap_code: string
  store_name: string
  brand: string
  past_48h_count: number
  oldest_report_id: string
  oldest_hours: number
}

function startOfThisMonthISO(): string {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    .toISOString()
}

async function fetchLandingData(monthStart: string) {
  const admin = createSupabaseAdminClient()

  const [
    reportsThisMonth,
    awaitingHo,
    closedThisMonth,
    returnedThisMonth,
    activeRowsRaw,
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

  // Stores needing attention = the subset of approvalRows older than the
  // attention threshold (48h), grouped by store. Each entry exposes the
  // oldest report so a click lands HO directly on the most urgent item.
  const nowMs = Date.now()
  const cutoffMs = nowMs - ATTENTION_HOURS * 36e5
  type Agg = {
    sap_code: string
    store_name: string
    brand: string
    count: number
    oldest_at_ms: number
    oldest_id: string
  }
  const aggByStore = new Map<string, Agg>()
  for (const r of approvalRows) {
    const ts = Date.parse(r.reported_at)
    if (!Number.isFinite(ts) || ts > cutoffMs) continue
    const existing = aggByStore.get(r.store_code)
    if (existing) {
      existing.count += 1
      if (ts < existing.oldest_at_ms) {
        existing.oldest_at_ms = ts
        existing.oldest_id = r.id
      }
    } else {
      aggByStore.set(r.store_code, {
        sap_code: r.store_code,
        store_name: r.store_name,
        brand: r.brand,
        count: 1,
        oldest_at_ms: ts,
        oldest_id: r.id,
      })
    }
  }
  const attentionStores: AttentionStore[] = Array.from(aggByStore.values())
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count
      return a.oldest_at_ms - b.oldest_at_ms
    })
    .slice(0, 8)
    .map((a) => ({
      sap_code: a.sap_code,
      store_name: a.store_name,
      brand: a.brand,
      past_48h_count: a.count,
      oldest_report_id: a.oldest_id,
      oldest_hours: (nowMs - a.oldest_at_ms) / 36e5,
    }))

  return {
    reportsThisMonth: reportsThisMonth.count ?? 0,
    awaitingHo: awaitingHo.count ?? 0,
    closedThisMonth: closedThisMonth.count ?? 0,
    returnedThisMonth: returnedThisMonth.count ?? 0,
    approvalRows,
    pipelineRows,
    attentionStores,
  }
}

export default async function HoLandingPage() {
  await requireHoSession("/ho")

  const monthStart = startOfThisMonthISO()
  const data = await fetchLandingData(monthStart)

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

      {/* Stores needing attention ----------------------------------------- */}
      <section className="bg-white rounded-xl border border-slate-200 overflow-hidden mt-8">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4.5 w-4.5 text-orange-700" aria-hidden />
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900">
                Stores needing attention
              </h2>
              <p className="text-[12px] text-slate-500 mt-0.5">
                Stores with reports waiting more than {ATTENTION_HOURS} hours.
                Click a store to open its oldest report.
              </p>
            </div>
          </div>
          {data.attentionStores.length > 0 && (
            <Link
              href="/ho/action?filter=sla_breached"
              className="inline-flex items-center gap-1 text-[12.5px] font-medium text-indigo-700 hover:text-indigo-900"
            >
              Open Action queue
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          )}
        </div>
        {data.attentionStores.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-teal-50 text-teal-700 mb-2">
              <CheckCircle2 className="h-5 w-5" aria-hidden />
            </div>
            <p className="text-[14px] text-slate-700">All caught up</p>
            <p className="text-[12px] text-slate-500 mt-0.5">
              No store has reports older than {ATTENTION_HOURS} hours.
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 p-4">
            {data.attentionStores.map((s) => (
              <li key={s.sap_code}>
                <Link
                  href={`/ho/action?id=${s.oldest_report_id}`}
                  className="group block rounded-lg border border-slate-200 bg-white px-4 py-3 hover:border-orange-300 hover:shadow-sm transition-all"
                >
                  <div className="flex items-start gap-2.5">
                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-orange-50 text-orange-700 ring-1 ring-orange-100">
                      <StoreIcon className="h-4 w-4" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-[11px] text-slate-500 truncate">
                        {s.sap_code}
                      </p>
                      <p className="text-[13px] font-medium text-slate-900 truncate group-hover:text-orange-800">
                        {s.store_name}
                      </p>
                      <p className="text-[10.5px] text-slate-500 truncate">
                        {s.brand}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-baseline justify-between gap-2 tabular-nums">
                    <span className="text-[12px] text-slate-700">
                      <span className="text-[16px] font-semibold text-orange-700">
                        {s.past_48h_count}
                      </span>{" "}
                      <span className="text-[11px] text-slate-500">
                        past 48h
                      </span>
                    </span>
                    <span className="text-[11px] text-slate-500">
                      oldest {formatHours(s.oldest_hours)}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

/** Compact hour formatting for the attention panel. */
function formatHours(h: number): string {
  if (h < 24) return `${Math.round(h)}h`
  return `${Math.round(h / 24)}d`
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

