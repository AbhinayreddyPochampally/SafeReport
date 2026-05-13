"use client"

import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
} from "lucide-react"
import Link from "next/link"
import { CATEGORIES } from "@/lib/categories"
import type { ReportCategory } from "@/lib/reporter-state"

/**
 * Queue list rendered on the HO Overview page.
 *
 * Two variants:
 *   - "approval" — reports the HO must act on (status = awaiting_ho).
 *     Sky-accented. Each row shows a "waiting" duration; rows past the 48h
 *     SLA tighten the visual treatment to surface urgency.
 *   - "pipeline" — reports flowing through the system (new, in_progress,
 *     returned). Slate-accented. Read-only awareness — HO doesn't act here,
 *     they just see what's flowing.
 *
 * Both variants share the same row anatomy so scanning between sections
 * stays effortless. The header copy and accent colour do the differentiation.
 */

export type QueueStatus = "new" | "in_progress" | "awaiting_ho" | "returned"

export type QueueRow = {
  id: string
  store_code: string
  store_name: string
  brand: string
  category: ReportCategory
  status: QueueStatus
  reported_at: string
  manager_name: string | null
  /** First-line excerpt of the transcript or description. Optional. */
  headline: string | null
}

type Variant = "approval" | "pipeline"

const SLA_HOURS = 48

export function QueueList({
  variant,
  rows,
  viewAllHref,
}: {
  variant: Variant
  rows: QueueRow[]
  /** Where the "View all" / "All reports" link points. */
  viewAllHref: string
}) {
  const breachedCount =
    variant === "approval"
      ? rows.filter((r) => hoursSince(r.reported_at) >= SLA_HOURS).length
      : 0

  const config =
    variant === "approval"
      ? {
          eyebrow: "Awaiting your decision",
          title: "Approval queue",
          subtitle:
            "Resolutions submitted by store managers — review and close, or send back for rework.",
          accent: "border-l-sky-600",
          dotClass: "bg-sky-600",
          ctaLabel: "View all",
          emptyTitle: "All caught up.",
          emptyBody: "Nothing is waiting on Head Office right now.",
        }
      : {
          eyebrow: "In the pipeline",
          title: "Reported queue",
          subtitle:
            "New and in-progress reports — store managers are working these. No HO action required yet.",
          accent: "border-l-slate-400",
          dotClass: "bg-slate-400",
          ctaLabel: "All reports",
          emptyTitle: "Pipeline is empty.",
          emptyBody: "No new reports flowing through right now.",
        }

  return (
    <section
      aria-label={config.title}
      className="bg-white rounded-xl border border-slate-200 overflow-hidden h-full flex flex-col"
    >
      {/* Header */}
      <header className="px-6 pt-5 pb-4 border-b border-slate-100">
        <div className="flex items-end justify-between gap-3">
          <div className={`pl-3 border-l-2 ${config.accent}`}>
            <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-slate-500">
              {config.eyebrow}
            </p>
            <h2 className="mt-0.5 font-display text-[18px] font-semibold text-slate-900 leading-tight">
              {config.title}
            </h2>
            <p className="mt-1 text-[12.5px] leading-5 text-slate-600 max-w-xl">
              {config.subtitle}
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {variant === "approval" && breachedCount > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] text-orange-700/90">
                <AlertCircle className="h-3 w-3" strokeWidth={2} aria-hidden />
                {breachedCount} past {SLA_HOURS}h
              </span>
            )}
            <Link
              href={viewAllHref}
              className="inline-flex items-center gap-1 text-[12.5px] font-medium text-indigo-700 hover:text-indigo-900"
            >
              {config.ctaLabel}
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
        </div>
      </header>

      {/* Rows */}
      {rows.length === 0 ? (
        <div className="px-6 py-12 text-center">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-teal-50 text-teal-700 mb-3">
            <CheckCircle2 className="h-5 w-5" aria-hidden />
          </div>
          <p className="text-[14px] text-slate-700">{config.emptyTitle}</p>
          <p className="mt-1 text-[12px] text-slate-500">{config.emptyBody}</p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.map((row) => (
            <QueueRowItem
              key={row.id}
              row={row}
              variant={variant}
              dotClass={config.dotClass}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

/* -------------------------------- Row ------------------------------------ */

function QueueRowItem({
  row,
  variant,
  dotClass,
}: {
  row: QueueRow
  variant: Variant
  dotClass: string
}) {
  const cat = CATEGORIES.find((c) => c.key === row.category)
  const isIncident = cat?.kind === "incident"
  const catBadgeClass = isIncident
    ? "bg-amber-50 text-amber-800 border-amber-200"
    : "bg-slate-100 text-slate-700 border-slate-200"
  const abbrev = cat?.acronym ?? row.category.slice(0, 3).toUpperCase()
  const hours = hoursSince(row.reported_at)
  const isBreached = variant === "approval" && hours >= SLA_HOURS

  return (
    <li>
      <Link
        href={`/ho/reports/${row.id}?from=overview`}
        className="group grid grid-cols-[6px_44px_minmax(0,1fr)_auto] items-center gap-4 px-6 py-4 hover:bg-slate-50/80 transition-colors"
      >
        {/* Tone marker (vertical bar) */}
        <span
          className={`h-10 w-1 rounded-full ${dotClass} ${
            isBreached ? "bg-orange-600" : ""
          }`}
          aria-hidden
        />

        {/* Category abbreviation badge */}
        <span
          className={`inline-flex h-9 w-11 items-center justify-center rounded-md border text-[11px] font-bold tracking-wide ${catBadgeClass}`}
          title={cat?.label ?? row.category}
        >
          {abbrev}
        </span>

        {/* Title block */}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[12px] text-slate-500 shrink-0">
              {row.id}
            </span>
            <span className="text-[13.5px] text-slate-900 font-medium truncate">
              {row.headline?.trim() || cat?.label || row.category}
            </span>
            {variant === "pipeline" && <StatusPill status={row.status} />}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[11.5px] text-slate-500 truncate">
            <span className="font-mono text-slate-600 shrink-0">
              {row.store_code}
            </span>
            <span aria-hidden>·</span>
            <span className="truncate">{row.store_name}</span>
            {row.manager_name && (
              <>
                <span aria-hidden>·</span>
                <span className="truncate">Mgr {row.manager_name}</span>
              </>
            )}
          </div>
        </div>

        {/* Right rail */}
        <div className="text-right shrink-0">
          <div
            className={`text-[13px] font-medium tabular-nums ${
              isBreached ? "text-orange-700" : "text-slate-700"
            }`}
          >
            {variant === "approval"
              ? formatWaiting(hours)
              : formatRelative(row.reported_at)}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {variant === "approval"
              ? "waiting"
              : pipelineSubLabel(row)}
          </div>
        </div>
      </Link>
    </li>
  )
}

/* ----------------------------- Sub-elements ------------------------------ */

function StatusPill({ status }: { status: QueueStatus }) {
  const map: Record<QueueStatus, { label: string; classes: string }> = {
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

function pipelineSubLabel(row: QueueRow): string {
  switch (row.status) {
    case "new":
      return "New · unassigned"
    case "in_progress":
      return "Manager working"
    case "returned":
      return "Returned · awaiting rework"
    default:
      return ""
  }
}

/* -------------------------------- Time ----------------------------------- */

function hoursSince(iso: string): number {
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return 0
  return Math.max(0, (Date.now() - t) / 3_600_000)
}

function formatWaiting(hours: number): string {
  if (hours < 1) {
    const mins = Math.max(1, Math.round(hours * 60))
    return `${mins}m`
  }
  if (hours < 24) return `${Math.round(hours)}h`
  const days = Math.floor(hours / 24)
  const rem = Math.round(hours - days * 24)
  return rem > 0 ? `${days}d ${rem}h` : `${days}d`
}

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return iso
  const diffMin = Math.max(0, Math.round((Date.now() - t) / 60_000))
  if (diffMin < 1) return "just now"
  if (diffMin < 60) return `${diffMin}m ago`
  const h = Math.round(diffMin / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  if (d < 7) return `${d}d ago`
  const w = Math.round(d / 7)
  if (w < 5) return `${w}w ago`
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  })
}