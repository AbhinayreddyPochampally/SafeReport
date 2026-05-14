"use client"

import {
  AlertTriangle,
  ArrowUpRight,
  Ban,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  ImageOff,
  Loader2,
  Mic,
  Phone,
  RotateCcw,
  Search,
  User,
  X,
} from "lucide-react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { memo, useCallback, useEffect, useMemo, useState, useTransition } from "react"
import { CATEGORIES, CATEGORY_BY_KEY } from "@/lib/categories"
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

export type ReportDetail = {
  id: string
  store: {
    sap_code: string
    name: string
    brand: string
    city: string
    state: string
  }
  type: "observation" | "incident"
  category: string
  status: ReportStatus
  description: string | null
  transcript: string | null
  transcript_error: string | null
  photo_url: string
  audio_url: string | null
  incident_datetime: string
  reported_at: string
  acknowledged_at: string | null
  reporter_name: string | null
  reporter_phone: string | null
  resolutions: {
    id: string
    attempt_number: number
    note: string
    photo_url: string | null
    resolved_at: string
  }[]
  history: {
    id: string
    action: "approve" | "return" | "void"
    rejection_reason: string | null
    acted_at: string
    actor_display_name: string | null
  }[]
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
  detailsById,
  initialSelectedId,
}: {
  rows: AllReportsRow[]
  total: number
  page: number
  pageSize: number
  filters: Filters
  statusCounts: Record<ReportStatus, number>
  availableBrands: string[]
  detailsById: Record<string, ReportDetail>
  initialSelectedId: string | null
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [searchDraft, setSearchDraft] = useState(filters.q)
  // Selection lives in React state. URL is kept in sync via shallow
  // replaceState so refresh/permalink works, but we don't trigger a Next
  // server re-fetch on every keypress.
  const [selectedId, setSelectedId] = useState<string | null>(
    initialSelectedId,
  )
  // Action bar state for the inline detail pane.
  const [actionBusy, setActionBusy] = useState<
    null | "approve" | "return" | "void"
  >(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionToast, setActionToast] = useState<string | null>(null)
  const [returnOpen, setReturnOpen] = useState(false)
  const [voidOpen, setVoidOpen] = useState(false)

  // Reconcile selection with the latest server data — if the selected row
  // disappeared (filter changed, mutation closed it, paginated away), drop
  // the selection.
  useEffect(() => {
    if (selectedId && !detailsById[selectedId]) {
      setSelectedId(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailsById])

  // Resolve detail from the pre-loaded map.
  const detail: ReportDetail | null = selectedId
    ? (detailsById[selectedId] ?? null)
    : null

  // Stable selectRow — wrapped in useCallback so the row components below
  // can be memoized without their `onSelect` prop invalidating cache on
  // every parent render. setSelectedId is already stable from React, and
  // we only touch window.history which doesn't depend on any closed-over
  // state.
  const selectRow = useCallback((id: string | null) => {
    setSelectedId(id)
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search)
      if (id) params.set("id", id)
      else params.delete("id")
      const qs = params.toString()
      window.history.replaceState(
        null,
        "",
        `/ho/all-reports${qs ? `?${qs}` : ""}`,
      )
    }
  }, [])

  function openFullView(id: string) {
    if (typeof window === "undefined") return
    // Pass the current filtered/sorted row ids as ?sibs= so the standalone
    // Full View can offer J/K navigation across the same set without a
    // server round-trip. Capped at 100 ids to keep the URL well under the
    // browser's practical 2KB limit (avg SR-ID = ~10 chars, so 100 ids ~1KB).
    const sibs = rows
      .slice(0, 100)
      .map((r) => r.id)
      .join(",")
    const params = new URLSearchParams({ from: "reports" })
    if (sibs) params.set("sibs", sibs)
    window.open(
      `/ho/reports/${id}?${params.toString()}`,
      "_blank",
      "noopener",
    )
  }

  // Auto-dismiss the success toast.
  useEffect(() => {
    if (!actionToast) return
    const t = setTimeout(() => setActionToast(null), 2000)
    return () => clearTimeout(t)
  }, [actionToast])

  // Keyboard navigation. Same conventions as the Action tab:
  // J = up, K = down, A/R/V where applicable, F = full view, Esc = close.
  // Only active when a detail pane is currently visible.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return
      }
      if (returnOpen || voidOpen) return
      if (!detail) return

      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
      const currentIndex = rows.findIndex((r) => r.id === selectedId)

      if (key === "k" || key === "ArrowDown") {
        e.preventDefault()
        const next = rows[Math.min(rows.length - 1, currentIndex + 1)]
        if (next) selectRow(next.id)
      } else if (key === "j" || key === "ArrowUp") {
        e.preventDefault()
        const prev = rows[Math.max(0, currentIndex - 1)]
        if (prev) selectRow(prev.id)
      } else if (key === "a" && detail.status === "awaiting_ho") {
        e.preventDefault()
        void submitAction("approve")
      } else if (key === "r" && detail.status === "awaiting_ho") {
        e.preventDefault()
        setReturnOpen(true)
      } else if (
        key === "v" &&
        detail.status !== "closed" &&
        detail.status !== "voided"
      ) {
        e.preventDefault()
        setVoidOpen(true)
      } else if (key === "f") {
        e.preventDefault()
        openFullView(detail.id)
      } else if (key === "Escape") {
        e.preventDefault()
        selectRow(null)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, selectedId, detail, returnOpen, voidOpen])

  async function submitAction(
    action: "approve" | "return" | "void",
    comment?: string,
  ) {
    if (!detail) return
    setActionBusy(action)
    setActionError(null)
    try {
      const res = await fetch("/api/ho-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          report_id: detail.id,
          action,
          comment: comment ?? undefined,
        }),
      })
      const body = (await res.json().catch(() => null)) as {
        ok?: boolean
        status?: ReportStatus
        error?: string
      } | null
      if (res.status === 401) {
        router.replace(`/ho/login?next=/ho/all-reports`)
        return
      }
      if (!res.ok || !body?.ok) {
        throw new Error(body?.error || `HTTP ${res.status}`)
      }
      setReturnOpen(false)
      setVoidOpen(false)
      setActionToast(
        action === "approve"
          ? `${detail.id} approved`
          : action === "return"
            ? `${detail.id} returned`
            : `${detail.id} voided`,
      )
      router.refresh()
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Couldn't complete that.",
      )
    } finally {
      setActionBusy(null)
    }
  }

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
      {/* Header — same slate band as the other HO pages. */}
      <header className="mb-6 rounded-xl bg-gradient-to-r from-slate-100 to-white border border-slate-200 px-5 py-4 shadow-sm flex items-end justify-between gap-4 flex-wrap">
        <h1 className="font-display text-[24px] font-semibold tracking-tight text-slate-900">
          Reports
        </h1>
        <button
          type="button"
          onClick={downloadXlsx}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-[13px] font-medium text-slate-700 hover:bg-slate-50 shadow-sm"
        >
          <Download className="h-4 w-4" strokeWidth={1.8} aria-hidden />
          Download .xlsx
        </button>
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
          {total === 0 ? (
            "No reports match these filters."
          ) : rows.length === 0 ? (
            <>This page is empty. Try jumping back to page 1.</>
          ) : (
            <>
              Showing{" "}
              <span className="font-medium text-slate-900 tabular-nums">
                {from.toLocaleString()}–{to.toLocaleString()}
              </span>{" "}
              of{" "}
              <span className="font-medium text-slate-900 tabular-nums">
                {total.toLocaleString()}
              </span>{" "}
              {total === 1 ? "report" : "reports"}
            </>
          )}
        </p>
        <p className="text-slate-500">Sorted by Reported · newest</p>
      </div>

      {/* Table OR split-pane -------------------------------------------- */}
      {detail ? (
        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4 items-start">
          {/* Compact list ---------------------------------------------- */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden lg:sticky lg:top-4 lg:max-h-[calc(100vh-100px)] lg:overflow-y-auto">
            {rows.length === 0 ? (
              <div className="p-6 text-center text-[12.5px] text-slate-500">
                No reports match these filters.
              </div>
            ) : (
              <ul role="listbox" aria-label="Reports">
                {rows.map((r) => (
                  <li key={r.id}>
                    <CompactRow
                      row={r}
                      active={r.id === selectedId}
                      onSelect={selectRow}
                    />
                  </li>
                ))}
              </ul>
            )}
            {/* Pagination */}
            <div className="flex items-center justify-between px-3 py-2.5 border-t border-slate-200 bg-slate-50/60 text-[11.5px]">
              <p className="text-slate-600 tabular-nums">
                {page} / {totalPages}
              </p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => apply({ page: Math.max(1, page - 1) })}
                  disabled={page <= 1 || isPending}
                  className="inline-flex items-center gap-1 px-2 py-1 border border-slate-200 rounded-md text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-40"
                >
                  <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                  Prev
                </button>
                <button
                  type="button"
                  onClick={() => apply({ page: Math.min(totalPages, page + 1) })}
                  disabled={page >= totalPages || isPending}
                  className="inline-flex items-center gap-1 px-2 py-1 border border-slate-200 rounded-md text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-40"
                >
                  Next
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
            </div>
          </div>

          {/* Detail pane ----------------------------------------------- */}
          <DetailPane
            detail={detail}
            busy={actionBusy}
            error={actionError}
            onApprove={() => submitAction("approve")}
            onReturnRequested={() => setReturnOpen(true)}
            onVoidRequested={() => setVoidOpen(true)}
            onClose={() => selectRow(null)}
            siblingsParam={rows.slice(0, 100).map((r) => r.id).join(",")}
          />
        </div>
      ) : (
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
                  rows.map((r) => (
                    <ReportRow key={r.id} row={r} onSelect={selectRow} />
                  ))
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
                disabled={page <= 1 || isPending}
                className="inline-flex items-center gap-1 px-2.5 py-1 border border-slate-200 rounded-md text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                Prev
              </button>
              <button
                type="button"
                onClick={() => apply({ page: Math.min(totalPages, page + 1) })}
                disabled={page >= totalPages || isPending}
                className="inline-flex items-center gap-1 px-2.5 py-1 border border-slate-200 rounded-md text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
                <ChevronRight className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modals ------------------------------------------------------- */}
      {returnOpen && detail && (
        <ReasonModal
          title="Return for rework"
          description="The manager will be notified and asked to update their resolution. Please explain what needs to change."
          minLen={10}
          maxLen={300}
          submitLabel="Return report"
          submitTone="orange"
          busy={actionBusy === "return"}
          onCancel={() => setReturnOpen(false)}
          onSubmit={(c) => submitAction("return", c)}
        />
      )}
      {voidOpen && detail && (
        <ReasonModal
          title={
            detail.status === "new" || detail.status === "in_progress"
              ? "Void — not a safety concern"
              : "Void this report"
          }
          description={
            detail.status === "new" || detail.status === "in_progress"
              ? "Use this when the manager has confirmed (by phone, in person, etc.) that the report doesn't represent a real safety concern. Voiding is irreversible — the report stays on record for audit, but no further action is possible. Please give a 20+ character reason."
              : "Voiding is irreversible. The report stays on record for audit, but no further action is possible. Please give a 20+ character reason."
          }
          minLen={20}
          submitLabel="Void report"
          submitTone="slate"
          busy={actionBusy === "void"}
          onCancel={() => setVoidOpen(false)}
          onSubmit={(c) => submitAction("void", c)}
          warning
        />
      )}

      {actionToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 rounded-md bg-teal-50 border border-teal-200 text-teal-900 shadow-md px-4 py-2.5 text-[13px]"
        >
          <Check className="h-4 w-4 text-teal-700" />
          {actionToast}
        </div>
      )}
    </div>
  )
}

/* ------------------------------- Rows ------------------------------- */

const ReportRow = memo(ReportRowImpl)
function ReportRowImpl({
  row,
  onSelect,
}: {
  row: AllReportsRow
  // Stable callback from the parent. Taking the id parameter (instead of
  // a per-row closure) is what makes React.memo actually save renders here.
  onSelect: (id: string) => void
}) {
  const cat = CATEGORY_BY_KEY.get(row.category)
  const isIncident = cat?.kind === "incident"
  const catTone = isIncident
    ? "bg-amber-50 text-amber-800 border-amber-200"
    : "bg-slate-100 text-slate-700 border-slate-200"

  return (
    <tr
      onClick={() => onSelect(row.id)}
      className="border-b border-slate-100 last:border-0 hover:bg-slate-50/80 transition-colors cursor-pointer"
    >
      <td className="py-3 pl-5">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onSelect(row.id)
          }}
          className="font-mono text-[12px] font-medium text-indigo-700 hover:text-indigo-900 hover:underline"
        >
          {row.id}
        </button>
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
        <div className="font-mono text-[12px] text-slate-600">
          {row.store_code}
        </div>
        <div className="text-[12px] text-slate-500 truncate max-w-[210px]">
          {row.store_name}
        </div>
      </td>
      <td className="py-3 pr-3">
        <div className="block text-[13px] text-slate-800 truncate max-w-[420px]">
          {row.headline?.trim() || (
            <span className="text-slate-400 italic">No description</span>
          )}
        </div>
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

/** Compact list row for the split-pane view. Memoized — see ReportRow above. */
const CompactRow = memo(CompactRowImpl)
function CompactRowImpl({
  row,
  active,
  onSelect,
}: {
  row: AllReportsRow
  active: boolean
  // Stable callback that receives the row id.
  onSelect: (id: string) => void
}) {
  const cat = CATEGORY_BY_KEY.get(row.category)
  const isIncident = cat?.kind === "incident"
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onClick={() => onSelect(row.id)}
      className={`w-full text-left px-3 py-2.5 border-b border-slate-100 transition-colors block ${
        active ? "bg-indigo-50/70" : "hover:bg-slate-50"
      }`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[11px] text-slate-700 font-medium">
          {row.id}
        </span>
        <span className="text-[10.5px] text-slate-500 tabular-nums">
          {formatRelative(row.reported_at)}
        </span>
      </div>
      <div className="mt-1 flex items-center gap-1.5 flex-wrap">
        <span
          className={`inline-flex items-center justify-center px-1.5 h-4 rounded text-[9.5px] font-bold border ${
            isIncident
              ? "bg-amber-50 text-amber-800 border-amber-200"
              : "bg-slate-100 text-slate-700 border-slate-200"
          }`}
        >
          {cat?.acronym ?? row.category.slice(0, 3).toUpperCase()}
        </span>
        <span
          className={`inline-flex items-center rounded-full border px-1.5 h-4 text-[9.5px] font-bold uppercase tracking-wide ${STATUS_PILL_CLASSES[row.status]}`}
        >
          {STATUS_LABEL[row.status]}
        </span>
      </div>
      <div className="text-[12px] text-slate-700 mt-1 truncate">
        {row.store_code} · {row.store_name}
      </div>
      {row.headline && (
        <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">
          {row.headline}
        </div>
      )}
    </button>
  )
}

/* ----------------------------- Detail pane ------------------------------- */

function DetailPane({
  detail,
  busy,
  error,
  onApprove,
  onReturnRequested,
  onVoidRequested,
  onClose,
  siblingsParam,
}: {
  detail: ReportDetail
  busy: null | "approve" | "return" | "void"
  error: string | null
  onApprove: () => void
  onReturnRequested: () => void
  onVoidRequested: () => void
  onClose: () => void
  /** Comma-joined SR-id list to thread into the Full View URL as `sibs=`
   * so J/K navigation in the standalone tab walks the same set the user
   * was browsing here. Empty string disables sibling nav (Full View
   * gracefully falls back to A/R/V/Esc only). */
  siblingsParam: string
}) {
  const cat = CATEGORIES.find((c) => c.key === detail.category)
  const latestRes = detail.resolutions[detail.resolutions.length - 1] ?? null
  const reporterText =
    detail.transcript?.trim() ||
    detail.description?.trim() ||
    (detail.audio_url ? "Voice note attached — transcript pending." : null)

  // Action availability by status. Approve/Return only on awaiting_ho;
  // Void allowed on every non-terminal status (new, in_progress, awaiting_ho,
  // returned). Closed and voided are read-only.
  const canApprove = detail.status === "awaiting_ho"
  const canReturn = detail.status === "awaiting_ho"
  const canVoid =
    detail.status !== "closed" && detail.status !== "voided"
  const preResolution =
    detail.status === "new" || detail.status === "in_progress"

  // Header background tint hints at what's possible. Awaiting → amber/warm,
  // closed → faint teal, voided → slate. New/in_progress → slate.
  const headerBg =
    detail.status === "awaiting_ho"
      ? "bg-amber-50 border-amber-200"
      : detail.status === "closed"
        ? "bg-teal-50/60 border-teal-200"
        : detail.status === "voided"
          ? "bg-slate-50 border-slate-200"
          : "bg-slate-50 border-slate-200"

  return (
    <article className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      {/* Action bar -------------------------------------------------- */}
      <header className={`px-4 py-3 border-b ${headerBg}`}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex items-center gap-2 flex-wrap">
            <span className="font-mono text-[12.5px] font-medium text-slate-900">
              {detail.id}
            </span>
            <StatusBadge status={detail.status} />
            {preResolution && (
              <span className="text-[11px] text-slate-500">
                {detail.status === "new"
                  ? "Manager hasn't acknowledged yet"
                  : "Acknowledged · waiting for resolution"}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {canApprove && (
              <button
                type="button"
                onClick={onApprove}
                disabled={busy !== null}
                className="inline-flex items-center gap-1.5 rounded-md bg-teal-700 hover:bg-teal-800 text-white text-[12.5px] font-semibold px-3 py-1.5 disabled:opacity-60"
              >
                {busy === "approve" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                Approve &amp; close
              </button>
            )}
            {canReturn && (
              <button
                type="button"
                onClick={onReturnRequested}
                disabled={busy !== null}
                className="inline-flex items-center gap-1.5 rounded-md border border-orange-200 bg-white hover:bg-orange-50 text-orange-700 text-[12.5px] font-medium px-3 py-1.5 disabled:opacity-60"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Return
              </button>
            )}
            {canVoid && (
              <button
                type="button"
                onClick={onVoidRequested}
                disabled={busy !== null}
                title={
                  preResolution
                    ? "Void — not a safety concern"
                    : "Void this report"
                }
                className={`inline-flex items-center gap-1.5 rounded-md border text-[12.5px] font-medium px-3 py-1.5 disabled:opacity-60 ${
                  preResolution
                    ? "border-slate-300 bg-white hover:bg-slate-50 text-slate-700"
                    : "border-slate-200 bg-white hover:bg-slate-50 text-slate-600"
                }`}
              >
                <Ban className="h-3.5 w-3.5" />
                {preResolution ? "Void · not a safety concern" : "Void"}
              </button>
            )}
            {!canApprove && !canReturn && !canVoid && (
              <span className="text-[11.5px] text-slate-500 italic">
                {detail.status === "closed"
                  ? "Approved and closed"
                  : "Voided — read-only"}
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              title="Close detail (Esc)"
              className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-500"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        {error && (
          <p className="mt-2 text-[12px] text-orange-700 bg-orange-50 border border-orange-200 rounded-md px-2 py-1.5">
            {error}
          </p>
        )}
      </header>

      {/* Body -------------------------------------------------------- */}
      <div className="p-4 space-y-4">
        {/* Category + store + open-full-view */}
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`inline-flex items-center px-2 h-6 rounded-md text-[11.5px] font-medium border ${
              detail.type === "incident"
                ? "bg-amber-50 text-amber-800 border-amber-200"
                : "bg-slate-100 text-slate-700 border-slate-200"
            }`}
          >
            {cat?.label ?? detail.category}
          </span>
          <span className="text-[12.5px] text-slate-600">
            {detail.store.sap_code} · {detail.store.name} · {detail.store.city}
          </span>
          <Link
            href={`/ho/reports/${detail.id}?from=reports${siblingsParam ? `&sibs=${siblingsParam}` : ""}`}
            className="ml-auto inline-flex items-center gap-1 text-[11.5px] text-indigo-700 hover:text-indigo-900"
            target="_blank"
            rel="noopener noreferrer"
          >
            Open full view
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>

        {/* Side-by-side photos */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <PhotoCard
            label="Reported"
            sub={formatAbs(detail.incident_datetime)}
            photo_url={detail.photo_url}
            body={reporterText}
          />
          {latestRes ? (
            <PhotoCard
              label={`Latest fix · attempt ${latestRes.attempt_number}`}
              sub={formatRelative(latestRes.resolved_at)}
              photo_url={latestRes.photo_url}
              body={latestRes.note}
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-center rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-slate-500">
              <ImageOff className="h-5 w-5 mb-2 text-slate-300" />
              <p className="text-[12.5px]">No resolution filed yet</p>
              {preResolution && (
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {detail.status === "new"
                    ? "Manager hasn't opened the report"
                    : "Manager is working on it"}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Reporter / timing strip */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[12.5px]">
          <div className="rounded-md border border-sky-200 bg-sky-50/60 px-3 py-2">
            <div className="text-[10.5px] font-bold uppercase tracking-wide text-sky-800 flex items-center gap-1">
              <User className="h-3 w-3" />
              Reporter (HO only)
            </div>
            <div className="mt-0.5 text-slate-900 truncate">
              {detail.reporter_name ?? "—"}
            </div>
            {detail.reporter_phone && (
              <a
                href={`tel:${detail.reporter_phone}`}
                className="inline-flex items-center gap-1 text-sky-800 hover:text-sky-900"
              >
                <Phone className="h-3 w-3" />
                {detail.reporter_phone}
              </a>
            )}
          </div>
          <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
            <div className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500">
              Filed
            </div>
            <div className="text-slate-900">{formatAbs(detail.reported_at)}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              {formatRelative(detail.reported_at)}
            </div>
          </div>
          <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
            <div className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500">
              Acknowledged
            </div>
            <div className="text-slate-900">
              {detail.acknowledged_at
                ? formatAbs(detail.acknowledged_at)
                : "—"}
            </div>
            {detail.acknowledged_at && (
              <div className="text-[11px] text-slate-500 mt-0.5">
                {formatRelative(detail.acknowledged_at)}
              </div>
            )}
          </div>
        </div>

        {/* Return-history notes */}
        {detail.history.filter((h) => h.action === "return").length > 0 && (
          <div className="rounded-md border border-orange-200 bg-orange-50/60 px-3 py-2">
            <div className="text-[10.5px] font-bold uppercase tracking-wide text-orange-800 flex items-center gap-1 mb-1">
              <RotateCcw className="h-3 w-3" />
              Previous return notes
            </div>
            <ul className="space-y-1">
              {detail.history
                .filter((h) => h.action === "return")
                .map((h) => (
                  <li key={h.id} className="text-[12px] text-orange-900">
                    <span className="text-[10.5px] text-orange-700">
                      {formatRelative(h.acted_at)} ·{" "}
                      {h.actor_display_name ?? "HO"}
                    </span>
                    <p className="whitespace-pre-wrap">
                      {h.rejection_reason ?? "(no note)"}
                    </p>
                  </li>
                ))}
            </ul>
          </div>
        )}

        {/* Void reason banner (if voided) */}
        {detail.status === "voided" &&
          (() => {
            const lastVoid = [...detail.history]
              .reverse()
              .find((h) => h.action === "void")
            return lastVoid ? (
              <div className="rounded-md border border-slate-300 bg-slate-100 px-3 py-2">
                <div className="text-[10.5px] font-bold uppercase tracking-wide text-slate-600 flex items-center gap-1 mb-1">
                  <Ban className="h-3 w-3" />
                  Void reason
                </div>
                <div className="text-[10.5px] text-slate-500 mb-1">
                  {formatRelative(lastVoid.acted_at)} ·{" "}
                  {lastVoid.actor_display_name ?? "HO"}
                </div>
                <p className="text-[12px] text-slate-800 whitespace-pre-wrap">
                  {lastVoid.rejection_reason ?? "(no reason recorded)"}
                </p>
              </div>
            ) : null
          })()}

        {/* Transcript */}
        {(reporterText || detail.transcript_error) && (
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500 flex items-center gap-1 mb-1">
              <Mic className="h-3 w-3" />
              {detail.transcript ? "Transcript (English)" : "Reporter note"}
            </div>
            {reporterText && (
              <p className="text-[12.5px] text-slate-800 whitespace-pre-wrap leading-5">
                {reporterText}
              </p>
            )}
            {detail.transcript_error && (
              <p className="text-[11px] text-orange-700 mt-1">
                Transcript couldn&apos;t be generated automatically. Voice note
                is still available on the full view.
              </p>
            )}
          </div>
        )}
      </div>
    </article>
  )
}

/* --------------------------- Small components ---------------------------- */

function PhotoCard({
  label,
  sub,
  photo_url,
  body,
}: {
  label: string
  sub: string
  photo_url: string | null
  body: string | null
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-white overflow-hidden">
      <div className="px-3 py-1.5 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
        <span className="text-[10.5px] font-bold uppercase tracking-wide text-slate-600">
          {label}
        </span>
        <span className="text-[10.5px] text-slate-500">{sub}</span>
      </div>
      <div className="relative aspect-[4/3] w-full bg-slate-100">
        {photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo_url}
            alt={label}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-slate-400">
            <ImageOff className="h-6 w-6" />
          </div>
        )}
      </div>
      {body && (
        <p className="px-3 py-2 text-[12px] text-slate-800 whitespace-pre-wrap line-clamp-4">
          {body}
        </p>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: ReportStatus }) {
  return (
    <span
      className={`inline-flex items-center px-1.5 h-5 rounded text-[10px] font-bold uppercase tracking-wide border ${STATUS_PILL_CLASSES[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  )
}

function ReasonModal({
  title,
  description,
  minLen,
  maxLen,
  submitLabel,
  submitTone,
  onCancel,
  onSubmit,
  busy,
  warning,
}: {
  title: string
  description: string
  minLen: number
  maxLen?: number
  submitLabel: string
  submitTone: "orange" | "slate"
  onCancel: () => void
  onSubmit: (comment: string) => void
  busy: boolean
  warning?: boolean
}) {
  const [value, setValue] = useState("")
  const trimmed = value.trim()
  const tooShort = trimmed.length < minLen
  const tooLong = maxLen !== undefined && trimmed.length > maxLen

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onCancel])

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (tooShort || tooLong || busy) return
    onSubmit(trimmed)
  }

  const btn =
    submitTone === "orange"
      ? "bg-orange-700 hover:bg-orange-800"
      : "bg-slate-900 hover:bg-slate-950"

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
      <form
        onSubmit={submit}
        className="bg-white rounded-xl shadow-lg w-full max-w-lg p-6"
      >
        <div className="flex items-start gap-3">
          {warning && (
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-700 ring-1 ring-orange-100">
              <AlertTriangle className="h-5 w-5" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-slate-900">{title}</h3>
            <p className="mt-1 text-sm text-slate-600">{description}</p>
          </div>
        </div>
        <label className="block mt-4 text-sm font-medium text-slate-800">
          Reason
        </label>
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={4}
          autoFocus
          disabled={busy}
          placeholder={
            maxLen !== undefined
              ? `Between ${minLen} and ${maxLen} characters.`
              : `At least ${minLen} characters.`
          }
          className="mt-1.5 w-full rounded-md border border-slate-300 text-sm p-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        />
        <div className="mt-1 text-xs text-slate-500">
          {trimmed.length}
          {maxLen !== undefined ? ` / ${maxLen}` : ""}
          {tooShort && ` — need ${minLen - trimmed.length} more`}
          {tooLong && ` — ${trimmed.length - maxLen!} too many`}
        </div>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-md"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={tooShort || tooLong || busy}
            className={`inline-flex items-center gap-2 rounded-md text-white font-medium px-4 py-2 text-sm disabled:opacity-60 ${btn}`}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitLabel}
          </button>
        </div>
      </form>
    </div>
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
