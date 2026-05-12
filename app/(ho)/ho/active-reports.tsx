"use client"

import {
  ChevronRight,
  CheckCircle2,
  FileText,
  Inbox,
} from "lucide-react"
import Link from "next/link"
import { useMemo, useState } from "react"
import { CATEGORIES } from "@/lib/categories"
import type { ReportCategory } from "@/lib/reporter-state"

/**
 * Active reports panel for the HO landing page.
 *
 * Replaces the old "approval queue" which only surfaced reports in
 * `awaiting_ho`. HO now sees the full pipeline of open reports — new,
 * acknowledged, awaiting HO, returned — and can filter via the pill row
 * at the top. The default view is "All open" so HO has visibility into
 * brand-new tickets without having to wait for the manager to resolve.
 *
 * Closed and voided reports are deliberately excluded — they live in the
 * monthly summary card and the analytics page, not in the live pipeline.
 */

export type ActiveStatus = "new" | "in_progress" | "awaiting_ho" | "returned"

export type ActiveRow = {
  id: string
  store_code: string
  store_name: string
  brand: string
  category: ReportCategory
  status: ActiveStatus
  reported_at: string
}

type Filter = "all" | ActiveStatus

const FILTER_LABELS: Record<Filter, string> = {
  all: "All open",
  new: "New",
  in_progress: "Acknowledged",
  awaiting_ho: "Awaiting HO",
  returned: "Returned",
}

const FILTER_ORDER: Filter[] = [
  "all",
  "new",
  "in_progress",
  "awaiting_ho",
  "returned",
]

export function ActiveReports({ rows }: { rows: ActiveRow[] }) {
  const [filter, setFilter] = useState<Filter>("all")

  // Counts per filter for the pill badges. Computed once per `rows` change.
  const counts = useMemo(() => {
    const c: Record<Filter, number> = {
      all: rows.length,
      new: 0,
      in_progress: 0,
      awaiting_ho: 0,
      returned: 0,
    }
    for (const r of rows) c[r.status] += 1
    return c
  }, [rows])

  const visible = useMemo(() => {
    if (filter === "all") return rows
    return rows.filter((r) => r.status === filter)
  }, [rows, filter])

  return (
    <section
      id="active-reports"
      className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-8"
    >
      <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <Inbox className="h-5 w-5 text-sky-700" aria-hidden />
          <h2 className="text-base font-semibold text-slate-900">
            Active reports
          </h2>
          <span className="ml-1 inline-flex items-center rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700 border border-sky-200">
            {counts.all} open
          </span>
        </div>
        <p className="text-xs text-slate-500 hidden sm:block">Oldest first</p>
      </div>

      {/* Filter pills */}
      <div className="flex flex-wrap items-center gap-2 px-6 py-3 border-b border-slate-100 bg-slate-50/50">
        {FILTER_ORDER.map((f) => {
          const active = filter === f
          const styles = active
            ? "bg-indigo-700 text-white border-indigo-700"
            : "bg-white text-slate-700 border-slate-200 hover:border-indigo-300 hover:text-indigo-700"
          return (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/40 ${styles}`}
              aria-pressed={active}
            >
              {FILTER_LABELS[f]}
              <span
                className={`tabular-nums text-[10px] font-semibold ${
                  active ? "text-indigo-100" : "text-slate-400"
                }`}
              >
                {counts[f]}
              </span>
            </button>
          )
        })}
      </div>

      {visible.length === 0 ? (
        <div className="px-6 py-10 text-center">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-teal-50 text-teal-700 mb-3">
            <CheckCircle2 className="h-5 w-5" aria-hidden />
          </div>
          <p className="text-sm text-slate-700">
            {filter === "all"
              ? "All caught up. Nothing open right now."
              : `No reports in "${FILTER_LABELS[filter]}".`}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-200">
          {visible.map((row) => (
            <ActiveRowItem key={row.id} row={row} />
          ))}
        </ul>
      )}
    </section>
  )
}

/* --------------------------- Row + helpers ------------------------------- */

function ActiveRowItem({ row }: { row: ActiveRow }) {
  const cat = CATEGORIES.find((c) => c.key === row.category)
  const Icon = cat?.icon ?? FileText
  const kindAccent =
    cat?.kind === "incident"
      ? "text-amber-700 bg-amber-50 ring-amber-100"
      : "text-slate-700 bg-slate-100 ring-slate-200"

  return (
    <li>
      <Link
        href={`/ho/reports/${row.id}`}
        className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50 transition-colors"
      >
        <span
          className={`inline-flex h-10 w-10 items-center justify-center rounded-lg ring-1 ${kindAccent} shrink-0`}
        >
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-mono text-slate-500 shrink-0">{row.id}</span>
            <span className="text-slate-400">·</span>
            <span className="text-slate-900 font-medium truncate">
              {cat?.label ?? row.category}
            </span>
            {cat?.acronym ? (
              <span className="text-xs text-slate-500">({cat.acronym})</span>
            ) : null}
            <StatusPill status={row.status} />
          </div>
          <div className="text-xs text-slate-500 mt-0.5 truncate">
            {row.brand} · {row.store_name} ·{" "}
            <span className="font-mono text-slate-600">{row.store_code}</span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-xs text-slate-500">
            {formatRelative(row.reported_at)}
          </div>
          <div className="inline-flex items-center gap-1 mt-1 text-xs text-sky-700 font-medium">
            Open
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </div>
        </div>
      </Link>
    </li>
  )
}

function StatusPill({ status }: { status: ActiveStatus }) {
  const map: Record<ActiveStatus, { label: string; classes: string }> = {
    new: {
      label: "New",
      classes: "border-slate-200 bg-slate-50 text-slate-700",
    },
    in_progress: {
      label: "Acknowledged",
      classes: "border-indigo-200 bg-indigo-50 text-indigo-700",
    },
    awaiting_ho: {
      label: "Awaiting HO",
      classes: "border-sky-200 bg-sky-50 text-sky-700",
    },
    returned: {
      label: "Returned",
      classes: "border-orange-200 bg-orange-50 text-orange-700",
    },
  }
  const m = map[status]
  return (
    <span
      className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${m.classes}`}
    >
      {m.label}
    </span>
  )
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime()
  const now = Date.now()
  const diffMin = Math.max(0, Math.round((now - then) / 60_000))
  if (diffMin < 1) return "just now"
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.round(diffHr / 24)
  if (diffDay < 7) return `${diffDay}d ago`
  const diffWk = Math.round(diffDay / 7)
  if (diffWk < 5) return `${diffWk}w ago`
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  })
}
