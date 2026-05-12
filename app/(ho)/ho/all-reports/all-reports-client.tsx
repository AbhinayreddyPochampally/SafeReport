"use client"

import { ChevronLeft, ChevronRight, Download, Search, X } from "lucide-react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useCallback, useMemo, useState, useTransition } from "react"
import { CATEGORIES } from "@/lib/categories"
import type { ReportCategory } from "@/lib/reporter-state"

/**
 * Reports tab client UI — filter card + dense table.
 *
 * Filter state lives in the URL searchParams so refreshes are stable and
 * the back button works. Every change calls router.replace with the new
 * params, which triggers a server re-fetch and re-render. We use
 * useTransition to keep the UI responsive during that re-fetch.
 */

export type ReportStatus =
  | "new"
  | "in_progress"
  | "awaiting_ho"
  | "returned"
  | "closed"
  | "voided"

export type StatusFilter =
  | { kind: "preset"; value: "all" | "open" }
  | { kind: "multi"; values: ReportStatus[] }

export type AllReportsRow = {
  id: string
  store_code: string
  store_name: string
  brand: string
  category: ReportCategory
  status: ReportStatus
  reported_at: string
  headline: string | null
}

type Filters = {
  status: StatusFilter
  categories: ReportCategory[]
  brands: string[]
  from: string
  to: string
  q: string
}

const STATUS_LABEL: Record<ReportStatus, string> = {
  new: "New",
  in_progress: "Acknowledged",
  awaiting_ho: "Awaiting HO",
  returned: "Returned",
  closed: "Closed",
  voided: "Voided",
}

const STATUS_PILL_CLASSES: Record<ReportStatus, string> = {
  new: "bg-slate-50 text-slate-700 border-slate-200",
  in_progress: "bg-indigo-50 text-indigo-700 border-indigo-200",
  awaiting_ho: "bg-sky-50 text-sky-700 border-sky-200",
  returned: "bg-orange-50 text-orange-700 border-orange-200",
  closed: "bg-teal-50 text-teal-700 border-teal-200",
  voided: "bg-slate-100 text-slate-600 border-slate-300",
}

const STATUS_ORDER: ReportStatus[] = [
  "new",
  "in_progress",
  "awaiting_ho",
  "returned",
  "closed",
  "voided",
]

export function AllReportsClient({
  rows,
  total,
  page,
  pageSize,
  filters,
  statusCounts,
  availableBrands,
}: {
  rows: AllReportsRow[]
  total: number
  page: number
  pageSize: number
  filters: Filters
  statusCounts: Record<ReportStatus, number>
  availableBrands: string[]
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()
  const [searchDraft, setSearchDraft] = useState(filters.q)

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const from = (page - 1) * pageSize + (rows.length === 0 ? 0 : 1)
  const to = (page - 1) * pageSize + rows.length

  /** Build a new URL search string from a partial filter override. */
  const buildHref = useCallback(
    (override: Partial<Filters & { page: number }>) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "")
      // Status
      if (override.status !== undefined) {
        params.delete("status")
        const s = override.status
        if (s.kind === "preset" && s.value !== "all") params.set("status", s.value)
        if (s.kind === "multi" && s.values.length > 0)
          params.set("status", s.values.join(","))
      }
      // Categories
      if (override.categories !== undefined) {
        params.delete("category")
        if (override.categories.length > 0)
          params.set("category", override.categories.join(","))
      }
      // Brands
      if (override.brands !== undefined) {
        params.delete("brand")
        if (override.brands.length > 0)
          params.set("brand", override.brands.join(","))
      }
      // Dates
      if (override.from !== undefined) {
        if (override.from) params.set("from", override.from)
        else params.delete("from")
      }
      if (override.to !== undefined) {
        if (override.to) params.set("to", override.to)
        else params.delete("to")
      }
      // Search
      if (override.q !== undefined) {
        if (override.q) params.set("q", override.q)
        else params.delete("q")
      }
      // Page — reset to 1 on any other filter change unless explicit
      if (override.page !== undefined) {
        if (override.page > 1) params.set("page", String(override.page))
        else params.delete("page")
      } else {
        params.delete("page")
      }
      const qs = params.toString()
      return qs ? `?${qs}` : ""
    },
    [searchParams],
  )

  const apply = useCallback(
    (override: Partial<Filters & { page: number }>) => {
      const href = buildHref(override)
      startTransition(() => {
        router.replace(`/ho/all-reports${href}`, { scroll: false })
      })
    },
    [buildHref, router],
  )

  /** Status-pill multi-select handler. */
  function toggleStatus(s: ReportStatus) {
    const current = filters.status
    let next: StatusFilter
    if (current.kind === "preset") {
      next = { kind: "multi", values: [s] }
    } else {
      const has = current.values.includes(s)
      const values = has
        ? current.values.filter((v) => v !== s)
        : [...current.values, s]
      next =
        values.length === 0
          ? { kind: "preset", value: "all" }
          : { kind: "multi", values }
    }
    apply({ status: next })
  }

  function toggleCategory(c: ReportCategory) {
    const has = filters.categories.includes(c)
    const next = has
      ? filters.categories.filter((x) => x !== c)
      : [...filters.categories, c]
    apply({ categories: next })
  }

  function toggleBrand(b: string) {
    const has = filters.brands.includes(b)
    const next = has
      ? filters.brands.filter((x) => x !== b)
      : [...filters.brands, b]
    apply({ brands: next })
  }

  const hasFilters =
    filters.q ||
    filters.from ||
    filters.to ||
    filters.categories.length > 0 ||
    filters.brands.length > 0 ||
    filters.status.kind === "multi" ||
    (filters.status.kind === "preset" && filters.status.value !== "all")

  const isStatusActive = useMemo(
    () =>
      (s: ReportStatus): boolean => {
        if (filters.status.kind === "preset") return false
        return filters.status.values.includes(s)
      },
    [filters.status],
  )

  function downloadXlsx() {
    const params = new URLSearchParams(searchParams?.toString() ?? "")
    window.location.href = `/api/excel/export?${params.toString()}`
  }

  return (
    <div className="max-w-[1400px] mx-auto px-8 py-8">
      {/* Header --------------------------------------------------------- */}
      <header className="mb-6">
        <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-slate-500">
          Pilot · ABFRL
        </p>
        <div className="mt-1 flex items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-[26px] font-semibold tracking-tight text-slate-900">
              Reports
            </h1>
            <p className="mt-1 text-[13px] text-slate-600">
              Every report across all 20 pilot stores. Filter, search, drill in.
            </p>
          </div>
          <button
            type="button"
            onClick={downloadXlsx}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-[13px] font-medium text-slate-700 hover:bg-slate-50"
          >
            <Download className="h-4 w-4" strokeWidth={1.8} aria-hidden />
            Download .xlsx
          </button>
        </div>
      </header>

      {/* Filter card --------------------------------------------------- */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 mb-4">
        {/* Row 1: search + dates */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-5">
            <label className="block text-[10.5px] font-bold uppercase tracking-wide text-slate-500 mb-1.5">
              Search
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" aria-hidden />
              <input
                type="text"
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                onBlur={() => {
                  if (searchDraft !== filters.q) apply({ q: searchDraft })
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    apply({ q: searchDraft })
                  }
                }}
                placeholder="SR-ID, store code, or text in the report"
                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-md text-[13.5px] focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
              />
            </div>
          </div>
          <div className="md:col-span-3">
            <label className="block text-[10.5px] font-bold uppercase tracking-wide text-slate-500 mb-1.5">
              From
            </label>
            <input
              type="date"
              value={filters.from}
              onChange={(e) => apply({ from: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-md text-[13.5px] tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
            />
          </div>
          <div className="md:col-span-3">
            <label className="block text-[10.5px] font-bold uppercase tracking-wide text-slate-500 mb-1.5">
              To
            </label>
            <input
              type="date"
              value={filters.to}
              onChange={(e) => apply({ to: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-md text-[13.5px] tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
            />
          </div>
          <div className="md:col-span-1">
            {hasFilters && (
              <button
                type="button"
                onClick={() =>
                  apply({
                    status: { kind: "preset", value: "all" },
                    categories: [],
                    brands: [],
                    from: "",
                    to: "",
                    q: "",
                  })
                }
                className="w-full inline-flex items-center justify-center gap-1 rounded-md border border-slate-200 px-2 py-2 text-[12px] text-slate-600 hover:bg-slate-50"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Row 2: brand chips */}
        {availableBrands.length > 0 && (
          <div className="mt-4">
            <p className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500 mb-2">
              Brand
            </p>
            <div className="flex flex-wrap gap-1.5">
              {availableBrands.map((b) => {
                const active = filters.brands.includes(b)
                return (
                  <button
                    key={b}
                    type="button"
                    onClick={() => toggleBrand(b)}
                    className={`px-2.5 py-1 rounded-md text-[12px] font-medium border transition-colors ${
                      active
                        ? "bg-indigo-700 text-white border-indigo-700"
                        : "bg-white text-slate-700 border-slate-200 hover:border-indigo-300"
                    }`}
                  >
                    {b}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Row 3: category chips */}
        <div className="mt-3">
          <p className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500 mb-2">
            Category
          </p>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((cat) => {
              const active = filters.categories.includes(cat.key)
              const isIncident = cat.kind === "incident"
              const baseTone = isIncident
                ? "bg-amber-50 text-amber-800 border-amber-200"
                : "bg-slate-100 text-slate-700 border-slate-200"
              const activeTone = isIncident
                ? "bg-amber-700 text-white border-amber-700"
                : "bg-slate-700 text-white border-slate-700"
              return (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => toggleCategory(cat.key)}
                  className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11.5px] font-medium border transition-colors ${
                    active ? activeTone : baseTone
                  }`}
                >
                  <span className="font-bold">{cat.acronym}</span>
                  <span className="hidden sm:inline">{cat.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Row 4: status pills with counts */}
        <div className="mt-4 pt-4 border-t border-slate-100">
          <p className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500 mb-2">
            Status
          </p>
          <div className="flex flex-wrap gap-1.5 items-center">
            <button
              type="button"
              onClick={() => apply({ status: { kind: "preset", value: "all" } })}
              className={`px-2.5 py-1 rounded-full text-[11.5px] font-medium border transition-colors ${
                filters.status.kind === "preset" && filters.status.value === "all"
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-700 border-slate-200 hover:border-slate-400"
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => apply({ status: { kind: "preset", value: "open" } })}
              className={`px-2.5 py-1 rounded-full text-[11.5px] font-medium border transition-colors ${
                filters.status.kind === "preset" && filters.status.value === "open"
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-700 border-slate-200 hover:border-slate-400"
              }`}
            >
              Open
            </button>
            <span className="text-slate-200" aria-hidden>
              |
            </span>
            {STATUS_ORDER.map((s) => {
              const active = isStatusActive(s)
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleStatus(s)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11.5px] font-medium transition-colors ${
                    active
                      ? STATUS_PILL_CLASSES[s].replace("bg-", "bg-").replace("text-", "text-").replace("border-", "border-") + " ring-1 ring-offset-1 ring-slate-300"
                      : STATUS_PILL_CLASSES[s] + " hover:opacity-90"
                  }`}
                  aria-pressed={active}
                >
                  {STATUS_LABEL[s]}
                  <span className="text-[10.5px] font-semibold tabular-nums opacity-70">
                    {statusCounts[s] ?? 0}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </section>

      {/* Result meta ---------------------------------------------------- */}
      <div className="flex items-center justify-between mb-3 px-1 text-[12.5px]">
        <p className="text-slate-600">
          Showing <span className="font-medium text-slate-900 tabular-nums">{from.toLocaleString()}–{to.toLocaleString()}</span> of{" "}
          <span className="font-medium text-slate-900 tabular-nums">{total.toLocaleString()}</span>{" "}
          {total === 1 ? "report" : "reports"}
        </p>
        <p className="text-slate-500">Sorted by Reported · newest</p>
      </div>

      {/* Table ---------------------------------------------------------- */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-auto" style={{ maxHeight: "65vh" }}>
          <table className="w-full text-[12.5px]">
            <thead className="bg-slate-50 sticky top-0 z-10">
              <tr className="border-b border-slate-200 text-[10.5px] uppercase font-bold tracking-wide text-slate-500">
                <th className="text-left py-2.5 pl-5 w-[100px]">SR-ID</th>
                <th className="text-left py-2.5 w-[60px]">Cat</th>
                <th className="text-left py-2.5 w-[230px]">Store</th>
                <th className="text-left py-2.5">Headline</th>
                <th className="text-left py-2.5 w-[120px]">Status</th>
                <th className="text-right py-2.5 pr-5 w-[110px]">Reported</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-500">
                    No reports match these filters.
                  </td>
                </tr>
              ) : (
                rows.map((r) => <ReportRow key={r.id} row={r} />)
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-200 bg-slate-50/60 text-[12px]">
          <p className="text-slate-600 tabular-nums">
            Page {page} of {totalPages}
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => apply({ page: Math.max(1, page - 1) })}
              disabled={page <= 1}
              className="inline-flex items-center gap-1 px-2.5 py-1 border border-slate-200 rounded-md text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
              Prev
            </button>
            <button
              type="button"
              onClick={() => apply({ page: Math.min(totalPages, page + 1) })}
              disabled={page >= totalPages}
              className="inline-flex items-center gap-1 px-2.5 py-1 border border-slate-200 rounded-md text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------- Row -------------------------------- */

function ReportRow({ row }: { row: AllReportsRow }) {
  const cat = CATEGORIES.find((c) => c.key === row.category)
  const isIncident = cat?.kind === "incident"
  const catTone = isIncident
    ? "bg-amber-50 text-amber-800 border-amber-200"
    : "bg-slate-100 text-slate-700 border-slate-200"

  return (
    <tr className="border-b border-slate-100 last:border-0 hover:bg-slate-50/80 transition-colors">
      <td className="py-3 pl-5">
        <Link
          href={`/ho/reports/${row.id}`}
          className="font-mono text-[12px] font-medium text-indigo-700 hover:text-indigo-900 hover:underline"
        >
          {row.id}
        </Link>
      </td>
      <td className="py-3">
        <span
          className={`inline-flex items-center justify-center w-9 h-7 rounded-md border text-[10.5px] font-bold ${catTone}`}
          title={cat?.label ?? row.category}
        >
          {cat?.acronym ?? row.category.slice(0, 3).toUpperCase()}
        </span>
      </td>
      <td className="py-3">
        <Link
          href={`/ho/reports/${row.id}`}
          className="block hover:text-slate-900"
        >
          <div className="font-mono text-[12px] text-slate-600">
            {row.store_code}
          </div>
          <div className="text-[12px] text-slate-500 truncate max-w-[210px]">
            {row.store_name}
          </div>
        </Link>
      </td>
      <td className="py-3 pr-3">
        <Link
          href={`/ho/reports/${row.id}`}
          className="block text-[13px] text-slate-800 hover:text-slate-900 truncate max-w-[420px]"
        >
          {row.headline?.trim() || (
            <span className="text-slate-400 italic">No description</span>
          )}
        </Link>
      </td>
      <td className="py-3">
        <span
          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide ${STATUS_PILL_CLASSES[row.status]}`}
        >
          {STATUS_LABEL[row.status]}
        </span>
      </td>
      <td className="py-3 pr-5 text-right">
        <div className="text-[12px] text-slate-700 tabular-nums">
          {formatRelative(row.reported_at)}
        </div>
        <div className="text-[10.5px] text-slate-400 tabular-nums">
          {formatAbs(row.reported_at)}
        </div>
      </td>
    </tr>
  )
}

/* --------------------------- Date helpers --------------------------- */

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

function formatAbs(iso: string): string {
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return ""
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}
