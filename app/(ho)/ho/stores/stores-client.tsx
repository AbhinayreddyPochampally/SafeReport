"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Info,
  KeyRound,
  Loader2,
  MessageSquare,
  Pencil,
  Phone,
  Plus,
  QrCode,
  RotateCcw,
  Search,
  Sparkles,
  Store as StoreIcon,
  TrendingDown,
  TrendingUp,
  Upload,
  Users,
  X,
} from "lucide-react"

/**
 * HO store registry — client surface.
 *
 * Renders a searchable/filterable table of the full store roster plus:
 *   - "Add store" button (POST /api/ho-stores)
 *   - Inline edit modal (PATCH /api/ho-stores)
 *   - Password reset (replaces the old PIN — see migration 002)
 *   - Per-store QR download (GET /api/qr/[sap_code]?download=1)
 *   - "Download all QRs" bulk action (sequential per-store fetch)
 *   - "New" marker + filter for stores whose QR hasn't been distributed yet
 *   - CSV import (POST multipart /api/excel/stores)
 *
 * Two warning flags surface common pilot footguns:
 *   - `has_credentials === false` → email or phone missing, manager cannot log in
 *   - `status !== 'active'`     → store hidden from most dashboards
 */

export type StoreStatus = "active" | "temporarily_closed" | "permanently_closed"

export type StoreRow = {
  sap_code: string
  name: string
  brand: string
  city: string
  state: string
  location: string | null
  manager_name: string | null
  manager_phone: string | null
  manager_email: string | null
  /** True iff BOTH manager_email and manager_phone are on file. Drives
   * the "No credentials set" warning chip — the manager can't sign in
   * without both (mig 004 swapped auth from password to email+phone). */
  has_credentials: boolean
  status: StoreStatus
  opening_date: string | null
  report_count: number
  qr_downloaded_at: string | null
  created_at: string | null
  /** mig 005 — non-null means HO has phoned the manager and dismissed
   * the attention panel for this store. */
  attention_handled_at: string | null
  // Adoption aggregates — see app/(ho)/ho/stores/page.tsx for derivation.
  last_report_at: string | null
  reports_this_month: number
  reports_last_month: number
  reports_last_30d: number
  distinct_reporters: number
  median_ack_hours: number | null
  pct_acked_within_24h: number | null
}

/**
 * One row in the "Stores needing attention" panel at the top of the page.
 * Server-computed (see app/(ho)/ho/stores/page.tsx) so the client only
 * decides how to render and dismiss.
 */
export type AttentionItem = {
  sap_code: string
  name: string
  brand: string
  city: string
  manager_name: string | null
  manager_phone: string | null
  manager_email: string | null
  reason: "never_reported" | "dormant" | "low_traffic"
  /** Short human-readable reason line, e.g. "Last report 47 days ago". */
  detail: string
  last_report_at: string | null
}

/**
 * Global aggregates the stats-card row consumes. All counts are pilot-wide
 * (sum across every store the HO can see, regardless of the current filter
 * state) — the cards are deliberately a fixed top-of-page reference, not a
 * filter-aware live readout.
 */
export type StoresSummary = {
  total_stores: number
  active_status: number
  reports_this_month: number
  reports_last_month: number
  mom_growth_pct: number | null
  total_reporters: number
  pct_acked_within_2h: number | null
}

/**
 * Activity tier — Active ≤7d, Quiet 8–30d, Dormant >30d, Never = no report ever.
 * Drives the left-bar colour on the Activity cell and the filter pills.
 */
export type ActivityTier = "active" | "quiet" | "dormant" | "never"

function tierOf(lastReportAt: string | null): ActivityTier {
  if (!lastReportAt) return "never"
  const diffMs = Date.now() - Date.parse(lastReportAt)
  if (Number.isNaN(diffMs)) return "never"
  const days = diffMs / 86_400_000
  if (days <= 7) return "active"
  if (days <= 30) return "quiet"
  return "dormant"
}

const STATUS_OPTIONS: ReadonlyArray<"all" | StoreStatus> = [
  "all",
  "active",
  "temporarily_closed",
  "permanently_closed",
]

const ACTIVITY_OPTIONS: ReadonlyArray<"all" | ActivityTier> = [
  "all",
  "active",
  "quiet",
  "dormant",
  "never",
]

export function StoresClient({
  rows,
  summary,
  attention,
}: {
  rows: StoreRow[]
  summary: StoresSummary
  attention: AttentionItem[]
}) {
  // Local optimistic-dismiss state — when HO clicks Mark resolved, drop
  // the row immediately and POST in the background. If the network call
  // fails, fall back to re-adding the row via router.refresh() so the
  // server-derived list is authoritative again.
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const visibleAttention = useMemo(
    () => attention.filter((a) => !dismissed.has(a.sap_code)),
    [attention, dismissed],
  )
  const router = useRouter()
  const searchParams = useSearchParams()
  // Allow deep-linking via ?q=... (e.g. from the Overview quiet-stores card).
  const [query, setQuery] = useState(() => searchParams?.get("q") ?? "")
  const [brandFilter, setBrandFilter] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<"all" | StoreStatus>("all")
  const [activityFilter, setActivityFilter] = useState<"all" | ActivityTier>(
    "all",
  )
  const [showNewOnly, setShowNewOnly] = useState(false)
  const [editing, setEditing] = useState<StoreRow | null>(null)
  const [adding, setAdding] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [bulkBusy, setBulkBusy] = useState<{ done: number; total: number } | null>(null)
  const [toast, setToast] = useState<{ kind: "ok" | "err"; msg: string } | null>(null)
  // Pagination — mockup defaults to 20/page. With ~11 pilot stores this
  // resolves to a single page, but the footer still reads correctly and the
  // controls activate once HO grows the roster past the page size.
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<10 | 20 | 50 | 100>(20)
  // Prior version of this page kept a localStorage `sr_stores_new_seen`
  // set so a NEW badge would disappear after the first view. The user
  // explicitly didn't want that — the badge should track "QR not yet
  // distributed", not "HO hasn't looked at this row". So now the badge
  // is purely a function of qr_downloaded_at: null = new, non-null =
  // distributed. No client-side seen-tracking; the server's
  // qr_downloaded_at column is the only source of truth.

  /**
   * True iff any filter / search is non-default. Drives whether the Reset
   * button renders as active, and whether the "New only" pill shows its
   * "× clear" affordance.
   */
  const filtersActive =
    Boolean(query.trim()) ||
    brandFilter !== null ||
    statusFilter !== "all" ||
    activityFilter !== "all" ||
    showNewOnly

  function resetFilters() {
    setQuery("")
    setBrandFilter(null)
    setStatusFilter("all")
    setActivityFilter("all")
    setShowNewOnly(false)
    setPage(1)
  }

  // Optimistic-dismiss handler for the AttentionPanel. Drops the row
  // locally on click, fires POST /api/ho-store-attention. On failure we
  // restore the row and surface a toast so the user knows the click
  // didn't stick.
  async function resolveAttention(sap_code: string) {
    setDismissed((prev) => {
      const next = new Set(prev)
      next.add(sap_code)
      return next
    })
    try {
      const res = await fetch("/api/ho-store-attention", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sap_code }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string
        } | null
        throw new Error(body?.error || `HTTP ${res.status}`)
      }
      // Server is authoritative — refresh so a later page load shows the
      // dismiss state coming from the DB, not just local memory.
      router.refresh()
      setToast({ kind: "ok", msg: `Marked ${sap_code} as resolved.` })
    } catch (e) {
      // Restore the row so the user sees their click didn't take.
      setDismissed((prev) => {
        const next = new Set(prev)
        next.delete(sap_code)
        return next
      })
      const msg = e instanceof Error ? e.message : "Couldn't mark resolved."
      setToast({ kind: "err", msg })
    }
  }

  const brands = useMemo(
    () => Array.from(new Set(rows.map((r) => r.brand))).sort(),
    [rows],
  )

  const newCount = useMemo(
    () => rows.filter((r) => !r.qr_downloaded_at).length,
    [rows],
  )

  // Activity tier per row, memoised once so the table cells, filter chips,
  // and counts strip all agree without re-deriving from raw timestamps.
  const tiersByCode = useMemo(() => {
    const m = new Map<string, ActivityTier>()
    for (const r of rows) m.set(r.sap_code, tierOf(r.last_report_at))
    return m
  }, [rows])

  const activityCounts = useMemo(() => {
    const out = { active: 0, quiet: 0, dormant: 0, never: 0 }
    for (const r of rows) {
      out[tiersByCode.get(r.sap_code) ?? "never"] += 1
    }
    return out
  }, [rows, tiersByCode])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((r) => {
      if (brandFilter && r.brand !== brandFilter) return false
      if (statusFilter !== "all" && r.status !== statusFilter) return false
      if (showNewOnly && r.qr_downloaded_at) return false
      if (
        activityFilter !== "all" &&
        (tiersByCode.get(r.sap_code) ?? "never") !== activityFilter
      )
        return false
      if (!q) return true
      return (
        r.sap_code.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q) ||
        r.city.toLowerCase().includes(q) ||
        r.state.toLowerCase().includes(q) ||
        (r.manager_name ?? "").toLowerCase().includes(q) ||
        (r.manager_phone ?? "").toLowerCase().includes(q)
      )
    })
  }, [rows, query, brandFilter, statusFilter, showNewOnly, activityFilter, tiersByCode])

  // Toast auto-dismiss
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  // Reset to page 1 whenever the filter set changes — otherwise the user
  // ends up on an empty page after narrowing.
  useEffect(() => {
    setPage(1)
  }, [query, brandFilter, statusFilter, activityFilter, showNewOnly, pageSize])

  // No localStorage seen-tracking — the NEW badge is a pure function of
  // qr_downloaded_at. Once a store's QR is downloaded the server updates
  // that column, the page revalidates, and the badge disappears for the
  // right reason. The earlier "first-visit-only" behaviour was removed
  // because it could hide a still-undistributed store after one glance.

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const clampedPage = Math.min(page, totalPages)
  const pageStart = (clampedPage - 1) * pageSize
  const paged = filtered.slice(pageStart, pageStart + pageSize)
  const pageStartLabel = filtered.length === 0 ? 0 : pageStart + 1
  const pageEndLabel = Math.min(filtered.length, pageStart + pageSize)

  function onSaved(ok: boolean, msg: string) {
    setEditing(null)
    setAdding(false)
    setToast({ kind: ok ? "ok" : "err", msg })
    if (ok) router.refresh()
  }

  function onImported(ok: boolean, msg: string) {
    setImportOpen(false)
    setToast({ kind: ok ? "ok" : "err", msg })
    if (ok) router.refresh()
  }

  /** Single-store poster download — server returns a printable A4 PDF with
   * the QR embedded into the user's poster template. */
  function downloadQr(sap: string) {
    const url = `/api/qr/${encodeURIComponent(sap)}?download=1`
    const a = document.createElement("a")
    a.href = url
    a.rel = "noopener"
    document.body.appendChild(a)
    a.click()
    a.remove()
    // Give the server a beat to mark qr_downloaded_at, then refresh so the
    // "New" badge clears for this row.
    setTimeout(() => router.refresh(), 800)
  }

  /** Bulk poster download — single multi-page PDF, one A4 page per store.
   * Server picks scope=new (only stores without a QR yet) by default; if
   * none are new we send scope=all. */
  async function downloadAllQrs(targets: StoreRow[]) {
    if (targets.length === 0) return
    setBulkBusy({ done: 0, total: targets.length })
    try {
      // Send explicit codes so the bulk matches exactly what the user sees
      // (respects their current filter). Avoids server/client drift on what
      // counts as "new".
      const codes = targets.map((t) => t.sap_code).join(",")
      const url = `/api/qr/bulk?codes=${encodeURIComponent(codes)}&download=1`
      const res = await fetch(url)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = blobUrl
      a.download = `safereport-posters-${targets.length}-stores.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(blobUrl)
      setToast({
        kind: "ok",
        msg: `Downloaded ${targets.length} poster${targets.length === 1 ? "" : "s"} as a single PDF.`,
      })
    } catch (err) {
      setToast({
        kind: "err",
        msg: err instanceof Error ? err.message : "Bulk download failed.",
      })
    } finally {
      setBulkBusy(null)
      router.refresh()
    }
  }

  const newStores = useMemo(
    () => rows.filter((r) => !r.qr_downloaded_at),
    [rows],
  )

  return (
    <div className="max-w-[1400px] mx-auto px-8 py-8">
      {/* Page header — same slate band as the other HO pages. */}
      <header className="mb-5 rounded-xl bg-gradient-to-r from-slate-100 to-white border border-slate-200 px-5 py-4 shadow-sm flex items-end justify-between gap-4 flex-wrap">
        <h1 className="font-display text-[24px] font-semibold tracking-tight text-slate-900">
          Stores
        </h1>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => downloadAllQrs(newStores)}
            disabled={bulkBusy !== null || newStores.length === 0}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-[13px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            title={
              newStores.length > 0
                ? `Download ${newStores.length} QR poster(s) for stores without a distributed QR`
                : "All stores already have a distributed QR poster"
            }
          >
            {bulkBusy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {bulkBusy.done}/{bulkBusy.total}
              </>
            ) : (
              <>
                <QrCode className="h-4 w-4" />
                Download new QRs
                {newStores.length > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center rounded bg-indigo-50 text-indigo-700 px-1.5 text-[10.5px] font-bold tabular-nums">
                    {newStores.length}
                  </span>
                )}
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => downloadAllQrs(rows)}
            disabled={bulkBusy !== null}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-[13px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            title="Download QR posters for every store in the pilot"
          >
            <QrCode className="h-4 w-4" />
            Download all QRs
          </button>
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-[13px] font-medium text-slate-700 hover:bg-slate-50"
          >
            <Upload className="h-4 w-4" />
            Import CSV
          </button>
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-indigo-700 hover:bg-indigo-800 px-3 py-2 text-[13px] font-semibold text-white"
          >
            <Plus className="h-4 w-4" />
            Add store
          </button>
        </div>
      </header>

      {/* Attention panel — only renders when there's at least one store
        * surfacing as never-reported / dormant / low-traffic AND HO hasn't
        * already dismissed it. Sits above the stats cards so it's the
        * first thing HO sees on the page when there's work to do. */}
      {visibleAttention.length > 0 && (
        <AttentionPanel
          items={visibleAttention}
          onResolve={resolveAttention}
        />
      )}

      {/* Stats cards --------------------------------------------------- */}
      <StatsCards
        summary={summary}
        activityCounts={activityCounts}
        newCount={newCount}
      />

      {/* Filter bar --------------------------------------------------- */}
      {/* Two lines flat: line 1 is search + New-only + Reset, line 2 is
          all three chip groups on a single dense row. Chips are h-6 with
          tight padding so the full set (Activity + Status + Brand) fits
          well within the 1400px content frame; flex-wrap is on as a
          fallback for unusually narrow viewports. */}
      <div className="bg-gradient-to-br from-white via-slate-50 to-slate-100 border border-slate-200 rounded-xl px-3 py-2.5 mb-4 shadow-sm">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search stores, address, manager…"
              className="w-full h-8 pl-9 pr-3 text-[13px] border border-slate-300 rounded-md focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              aria-label="Search stores"
            />
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={() => setShowNewOnly(!showNewOnly)}
              className={`inline-flex items-center gap-1.5 px-2.5 h-8 text-[12px] font-medium rounded-md border transition-colors ${
                showNewOnly
                  ? "bg-indigo-700 text-white border-indigo-700"
                  : "bg-white text-slate-700 border-slate-300 hover:border-indigo-400"
              }`}
              title="Filter to stores whose QR poster has not been downloaded yet"
            >
              <Sparkles className="h-3.5 w-3.5" />
              New only
              {newCount > 0 && (
                <span
                  className={`ml-0.5 inline-flex items-center justify-center rounded px-1.5 text-[10.5px] font-bold tabular-nums ${
                    showNewOnly
                      ? "bg-white text-indigo-700"
                      : "bg-indigo-100 text-indigo-700"
                  }`}
                >
                  {newCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={resetFilters}
              disabled={!filtersActive}
              className={`inline-flex items-center gap-1.5 px-2.5 h-8 text-[12px] font-medium rounded-md border transition-colors ${
                filtersActive
                  ? "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                  : "bg-white text-slate-400 border-slate-200 cursor-not-allowed"
              }`}
              title="Clear all filters and search"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </button>
          </div>
        </div>

        <div className="mt-2 flex items-center gap-x-2.5 gap-y-1 flex-wrap text-[10.5px]">
          <FilterGroup label="Activity">
            {ACTIVITY_OPTIONS.map((a) => (
              <FilterChip
                key={a}
                active={activityFilter === a}
                onClick={() => setActivityFilter(a)}
              >
                <span className="inline-flex items-center gap-1">
                  {a !== "all" && (
                    <span
                      aria-hidden
                      className={`inline-block h-1.5 w-1.5 rounded-full ${
                        a === "active"
                          ? "bg-teal-700"
                          : a === "quiet"
                            ? "bg-sky-700"
                            : a === "dormant"
                              ? "bg-slate-500"
                              : "bg-slate-300 ring-1 ring-slate-400"
                      }`}
                    />
                  )}
                  {a === "all"
                    ? "All"
                    : a === "active"
                      ? `Active · ${activityCounts.active}`
                      : a === "quiet"
                        ? `Quiet · ${activityCounts.quiet}`
                        : a === "dormant"
                          ? `Dormant · ${activityCounts.dormant}`
                          : `Never · ${activityCounts.never}`}
                </span>
              </FilterChip>
            ))}
          </FilterGroup>
          <FilterDivider />
          <FilterGroup label="Status">
            {STATUS_OPTIONS.map((s) => (
              <FilterChip
                key={s}
                active={statusFilter === s}
                onClick={() => setStatusFilter(s)}
              >
                {s === "all" ? "All" : humanStatus(s)}
              </FilterChip>
            ))}
          </FilterGroup>
          <FilterDivider />
          <FilterGroup label="Brand">
            <FilterChip
              active={brandFilter === null}
              onClick={() => setBrandFilter(null)}
            >
              All
            </FilterChip>
            {brands.map((b) => (
              <FilterChip
                key={b}
                active={brandFilter === b}
                onClick={() => setBrandFilter(b)}
              >
                {b}
              </FilterChip>
            ))}
          </FilterGroup>
        </div>
      </div>

      {/* Table — Activity and Engagement columns moved to /ho/analytics;
        * the Stores tab is now purely the roster + admin actions. QR and
        * Edit are each in their own column with breathing room so the
        * Actions area no longer reads as a single cramped button group. */}
      <div className="bg-gradient-to-br from-white via-slate-50 to-slate-100 border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-[13px]">
          <thead className="bg-slate-50 text-slate-500 text-[10.5px] uppercase tracking-wide font-bold">
            <tr>
              <th className="text-left px-4 py-2.5 w-[110px]">SAP code</th>
              <th className="text-left px-4 py-2.5">Store</th>
              <th className="text-left px-4 py-2.5 w-[110px]">Brand</th>
              <th className="text-left px-4 py-2.5 w-[140px]">City · State</th>
              <th className="text-left px-4 py-2.5 w-[240px]">Manager</th>
              <th className="text-left px-4 py-2.5 w-[140px]">Status</th>
              <th className="text-center px-3 py-2.5 w-[88px]">QR</th>
              <th className="text-center px-3 py-2.5 w-[72px]">Edit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-12 text-center text-[13px] text-slate-500"
                >
                  No stores match the current filters.
                </td>
              </tr>
            ) : (
              paged.map((r) => (
                <tr key={r.sap_code} className="hover:bg-slate-50/80 transition-colors">
                  <td className="px-4 py-3 align-top">
                    <span className="font-mono text-[12px] text-slate-800">
                      {r.sap_code}
                    </span>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="flex items-start gap-2">
                      <StoreIcon className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-slate-900 font-medium truncate">
                          {r.name}
                        </div>
                        {!r.qr_downloaded_at && (
                          <div className="mt-0.5">
                            <span
                              title="QR not yet downloaded for this store — badge disappears the moment you download the QR"
                              className="inline-flex items-center gap-0.5 rounded-full bg-indigo-50 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-indigo-700 border border-indigo-200"
                            >
                              <Sparkles className="h-2.5 w-2.5" />
                              New
                            </span>
                          </div>
                        )}
                        {r.location && (
                          <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                            {r.location}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top text-slate-700">{r.brand}</td>
                  <td className="px-4 py-3 align-top text-slate-700 text-[12.5px] leading-tight">
                    <div>{r.city}</div>
                    <div className="text-slate-500">{r.state}</div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    {/* Manager identity card — name (bold), phone, email
                        stacked vertically (MS-Entra style). Truncates on
                        each line so long names/emails don't blow the
                        column out. */}
                    {r.manager_name || r.manager_phone || r.manager_email ? (
                      <div className="min-w-0">
                        <div className="text-[13px] font-medium text-slate-900 truncate">
                          {r.manager_name ?? "—"}
                        </div>
                        {r.manager_phone && (
                          <div className="text-[11px] text-slate-500 mt-0.5 truncate font-mono leading-tight">
                            {r.manager_phone}
                          </div>
                        )}
                        {r.manager_email && (
                          <div
                            className="text-[11px] text-slate-500 mt-0.5 truncate leading-tight"
                            title={r.manager_email}
                          >
                            {r.manager_email}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-[11.5px] text-slate-400">—</span>
                    )}
                    {!r.has_credentials && (
                      <div
                        className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-orange-700"
                        title="Email and phone are both required for the manager to sign in."
                      >
                        <AlertTriangle className="h-3 w-3" />
                        {!r.manager_email && !r.manager_phone
                          ? "No credentials set"
                          : !r.manager_email
                            ? "No email set"
                            : "No phone set"}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <StatusPill
                      tier={tiersByCode.get(r.sap_code) ?? "never"}
                      storeStatus={r.status}
                    />
                  </td>
                  <td className="px-3 py-3 align-top text-center">
                    <button
                      type="button"
                      onClick={() => downloadQr(r.sap_code)}
                      title="Download QR poster"
                      aria-label={`Download QR poster for ${r.sap_code}`}
                      className="inline-flex items-center gap-1.5 px-2.5 h-8 text-[11.5px] font-medium text-slate-700 border border-slate-300 rounded-md hover:border-indigo-400 hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                    >
                      <QrCode className="h-3.5 w-3.5" strokeWidth={1.8} />
                      QR
                    </button>
                  </td>
                  <td className="px-3 py-3 align-top text-center">
                    <button
                      type="button"
                      onClick={() => setEditing(r)}
                      title="Edit store"
                      aria-label={`Edit ${r.sap_code}`}
                      className="inline-flex items-center justify-center w-8 h-8 text-slate-700 border border-slate-300 rounded-md hover:border-indigo-400 hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                    >
                      <Pencil className="h-3.5 w-3.5" strokeWidth={1.8} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination footer ------------------------------------------- */}
        <PaginationFooter
          filteredCount={filtered.length}
          totalCount={rows.length}
          pageStart={pageStartLabel}
          pageEnd={pageEndLabel}
          page={clampedPage}
          totalPages={totalPages}
          pageSize={pageSize}
          onPageChange={(p) => setPage(p)}
          onPageSizeChange={(s) => setPageSize(s)}
        />
      </div>

      {editing && (
        <StoreFormModal
          mode="edit"
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={onSaved}
        />
      )}

      {adding && (
        <StoreFormModal
          mode="create"
          onClose={() => setAdding(false)}
          onSaved={onSaved}
        />
      )}

      {importOpen && (
        <CsvImportModal
          onClose={() => setImportOpen(false)}
          onDone={onImported}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50">
          <div
            className={`inline-flex items-start gap-2 px-4 py-3 rounded-md shadow-lg border text-[13px] ${
              toast.kind === "ok"
                ? "bg-teal-50 border-teal-200 text-teal-900"
                : "bg-orange-50 border-orange-200 text-orange-900"
            }`}
          >
            {toast.kind === "ok" ? (
              <CheckCircle2 className="h-4 w-4 text-teal-700 mt-0.5" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-orange-700 mt-0.5" />
            )}
            <span>{toast.msg}</span>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="ml-2 text-slate-500 hover:text-slate-700"
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ------------------------- Store form modal ------------------------- */

function StoreFormModal({
  mode,
  row,
  onClose,
  onSaved,
}: {
  mode: "edit" | "create"
  row?: StoreRow
  onClose: () => void
  onSaved: (ok: boolean, msg: string) => void
}) {
  const [form, setForm] = useState({
    sap_code: row?.sap_code ?? "",
    name: row?.name ?? "",
    brand: row?.brand ?? "",
    city: row?.city ?? "",
    state: row?.state ?? "",
    location: row?.location ?? "",
    manager_name: row?.manager_name ?? "",
    manager_phone: row?.manager_phone ?? "",
    manager_email: row?.manager_email ?? "",
    status: (row?.status ?? "active") as StoreStatus,
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setError(null)
    if (mode === "create" && !/^[A-Z0-9][A-Z0-9-]{1,20}$/.test(form.sap_code.trim().toUpperCase())) {
      setError("SAP code must be uppercase letters/digits/dashes (e.g. PNT-MUM-047).")
      return
    }
    if (
      !form.name.trim() ||
      !form.brand.trim() ||
      !form.city.trim() ||
      !form.state.trim()
    ) {
      setError("Name, brand, city, and state are required.")
      return
    }
    // Email + phone are required at create time — they're the two-factor
    // identity the manager will sign in with (mig 004 swapped password
    // auth for email+phone). On edit, we only validate format if a value
    // is provided.
    const emailTrim = form.manager_email.trim()
    const phoneTrim = form.manager_phone.trim()
    if (mode === "create") {
      if (!phoneTrim) {
        setError(
          "Manager phone is required — it's half of the login credential.",
        )
        return
      }
      if (!emailTrim) {
        setError(
          "Manager email is required — it's half of the login credential.",
        )
        return
      }
    }
    if (emailTrim && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailTrim)) {
      setError("Enter a valid manager email (e.g. name@brand.com).")
      return
    }

    setBusy(true)
    try {
      const payload = {
        sap_code: mode === "create" ? form.sap_code.trim().toUpperCase() : row!.sap_code,
        name: form.name.trim(),
        brand: form.brand.trim(),
        city: form.city.trim(),
        state: form.state.trim(),
        location: form.location.trim() || null,
        manager_name: form.manager_name.trim() || null,
        manager_phone: phoneTrim || null,
        manager_email: emailTrim || null,
        status: form.status,
      }
      const resp = await fetch("/api/ho-stores", {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}))
        onSaved(false, body.error ?? `Save failed (${resp.status}).`)
        return
      }
      onSaved(
        true,
        mode === "create"
          ? `${payload.sap_code} added.`
          : `${payload.sap_code} updated.`,
      )
    } catch (e) {
      onSaved(false, e instanceof Error ? e.message : "Network error.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      onClose={onClose}
      title={mode === "create" ? "Add new store" : `Edit ${row!.sap_code}`}
    >
      <div className="space-y-4">
        {mode === "create" && (
          <Field label="SAP code">
            <input
              type="text"
              value={form.sap_code}
              onChange={(e) =>
                setForm({ ...form, sap_code: e.target.value.toUpperCase() })
              }
              placeholder="e.g. PNT-MUM-047"
              className={inputCls + " font-mono"}
              autoFocus
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Uppercase letters, digits, and dashes. Used in the QR poster URL.
            </p>
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Store name">
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={inputCls}
            />
          </Field>
          <Field label="Brand">
            <input
              type="text"
              value={form.brand}
              onChange={(e) => setForm({ ...form, brand: e.target.value })}
              className={inputCls}
            />
          </Field>
          <Field label="City">
            <input
              type="text"
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
              className={inputCls}
            />
          </Field>
          <Field label="State">
            <input
              type="text"
              value={form.state}
              onChange={(e) => setForm({ ...form, state: e.target.value })}
              className={inputCls}
            />
          </Field>
        </div>
        <Field label="Location / mall">
          <input
            type="text"
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
            className={inputCls}
          />
        </Field>
        <Field label="Manager name">
          <input
            type="text"
            value={form.manager_name}
            onChange={(e) => setForm({ ...form, manager_name: e.target.value })}
            className={inputCls}
            placeholder="e.g. Rakesh Mehra"
          />
        </Field>

        {/* Credentials block — the two-factor identity the manager will
            sign in with. Stacked vertically + tinted so it reads as a
            single "this is how they log in" group. */}
        <div className="bg-indigo-50/40 border border-indigo-100 rounded-md p-3 space-y-3">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-indigo-700" />
            <span className="text-[13px] font-medium text-slate-800">
              Login credentials
            </span>
          </div>
          <p className="text-[11.5px] text-slate-600 -mt-1">
            The manager signs in with these two fields. Both must match what
            you enter here — no password.
          </p>
          <Field label="Manager phone">
            <input
              type="tel"
              value={form.manager_phone}
              onChange={(e) => setForm({ ...form, manager_phone: e.target.value })}
              className={inputCls}
              placeholder="e.g. +91 98200 11234"
              required={mode === "create"}
            />
          </Field>
          <Field label="Manager email">
            <input
              type="email"
              value={form.manager_email}
              onChange={(e) => setForm({ ...form, manager_email: e.target.value })}
              className={inputCls}
              placeholder="e.g. rakesh.mehra@abfrl.com"
              maxLength={254}
              autoComplete="off"
              required={mode === "create"}
            />
          </Field>
        </div>

        <Field label="Status">
          <select
            value={form.status}
            onChange={(e) =>
              setForm({ ...form, status: e.target.value as StoreStatus })
            }
            className={inputCls}
          >
            <option value="active">Active</option>
            <option value="temporarily_closed">Temporarily closed</option>
            <option value="permanently_closed">Permanently closed</option>
          </select>
        </Field>

        {error && (
          <div className="text-[12.5px] text-orange-700 bg-orange-50 border border-orange-200 rounded-md px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-3 h-9 text-[13px] text-slate-700 hover:bg-slate-50 rounded-md"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="inline-flex items-center gap-2 px-4 h-9 bg-indigo-700 hover:bg-indigo-800 text-white text-[13px] font-semibold rounded-md disabled:opacity-50"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {mode === "create" ? "Create store" : "Save changes"}
          </button>
        </div>
      </div>
    </Modal>
  )
}

/* ------------------------------- CSV import ------------------------------ */

function CsvImportModal({
  onClose,
  onDone,
}: {
  onClose: () => void
  onDone: (ok: boolean, msg: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [prune, setPrune] = useState(false)
  const [result, setResult] = useState<{
    inserted: number
    updated: number
    skipped: number
    pruned: number
    errors: string[]
  } | null>(null)

  async function upload(file: File) {
    setBusy(true)
    setResult(null)
    try {
      const fd = new FormData()
      fd.append("file", file)
      if (prune) fd.append("prune", "1")
      const resp = await fetch("/api/excel/stores", {
        method: "POST",
        body: fd,
      })
      const body = await resp.json().catch(() => ({}))
      if (!resp.ok) {
        onDone(false, body.error ?? `Import failed (${resp.status}).`)
        return
      }
      setResult({
        inserted: body.inserted ?? 0,
        updated: body.updated ?? 0,
        skipped: body.skipped ?? 0,
        pruned: body.pruned ?? 0,
        errors: body.errors ?? [],
      })
    } catch (e) {
      onDone(false, e instanceof Error ? e.message : "Network error.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal onClose={onClose} title="Import stores from CSV">
      <div className="space-y-4">
        <div className="bg-slate-50 border border-slate-200 rounded-md p-3 text-[12px] text-slate-600 leading-relaxed">
          <div className="font-medium text-slate-800 mb-1">Expected columns</div>
          <code className="block font-mono text-[11px] text-slate-700">
            sap_code,name,brand,city,state,location,manager_name,manager_phone,manager_email,status
          </code>
          <p className="mt-2">
            <strong>sap_code</strong> is the key — rows upsert by it. For
            new stores, <strong>manager_phone</strong> and{" "}
            <strong>manager_email</strong> are required — together they&apos;re
            the credential the manager uses to sign in (no password).{" "}
            <strong>status</strong> must be <code>active</code>,{" "}
            <code>temporarily_closed</code>, or <code>permanently_closed</code>.
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) upload(f)
          }}
          className="hidden"
        />
        {!result && (
          <>
            <label className="flex items-start gap-2.5 cursor-pointer p-3 rounded-md border border-slate-200 bg-white hover:bg-slate-50">
              <input
                type="checkbox"
                checked={prune}
                onChange={(e) => setPrune(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-indigo-700"
                disabled={busy}
              />
              <div className="flex-1">
                <div className="text-[13px] font-medium text-slate-800">
                  Treat this CSV as the master list
                </div>
                <div className="text-[11.5px] text-slate-500 mt-0.5">
                  Active stores not in this CSV will be marked{" "}
                  <span className="font-medium">permanently closed</span>.
                  Reports stay intact for audit. Use this when the CSV is your
                  full pilot roster, not a partial update.
                </div>
              </div>
            </label>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="w-full h-28 border-2 border-dashed border-slate-300 rounded-md text-slate-600 hover:bg-slate-50 flex flex-col items-center justify-center gap-2 disabled:opacity-50"
            >
              {busy ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin text-indigo-700" />
                  <span className="text-[13px]">Processing…</span>
                </>
              ) : (
                <>
                  <Upload className="h-5 w-5" />
                  <span className="text-[13px]">Click to choose CSV</span>
                </>
              )}
            </button>
          </>
        )}
        {result && (
          <div className="space-y-2">
            <div className="grid grid-cols-4 gap-2">
              <ResultPill label="Inserted" value={result.inserted} tone="teal" />
              <ResultPill label="Updated" value={result.updated} tone="indigo" />
              <ResultPill label="Skipped" value={result.skipped} tone="slate" />
              <ResultPill label="Pruned" value={result.pruned} tone="orange" />
            </div>
            {result.errors.length > 0 && (
              <div className="bg-orange-50 border border-orange-200 rounded-md p-3">
                <div className="text-[13px] font-medium text-orange-900 mb-1">
                  {result.errors.length} row{result.errors.length === 1 ? "" : "s"} skipped
                </div>
                <ul className="text-[11.5px] text-orange-800 space-y-0.5 list-disc pl-4 max-h-32 overflow-auto">
                  {result.errors.slice(0, 20).map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
          {result ? (
            <button
              type="button"
              onClick={() =>
                onDone(true, `${result.inserted + result.updated} stores imported.`)
              }
              className="px-4 h-9 bg-indigo-700 hover:bg-indigo-800 text-white text-[13px] font-semibold rounded-md"
            >
              Done
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="px-3 h-9 text-[13px] text-slate-700 hover:bg-slate-50 rounded-md"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}

/* --------------------------- Small shared bits --------------------------- */

const inputCls =
  "w-full h-9 px-3 text-[13.5px] border border-slate-300 rounded-md focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"

function Modal({
  title,
  children,
  onClose,
}: {
  title: string
  children: React.ReactNode
  onClose: () => void
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-xl max-h-[calc(100vh-2rem)] overflow-auto"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 sticky top-0 bg-white">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-500 hover:text-slate-700"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="block text-[11.5px] font-medium text-slate-600 mb-1">{label}</span>
      {children}
    </label>
  )
}

function FilterChip({
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
      className={
        "px-2 h-6 text-[10.5px] rounded-full border transition-colors whitespace-nowrap " +
        (active
          ? "bg-indigo-700 border-indigo-700 text-white"
          : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50")
      }
    >
      {children}
    </button>
  )
}

/**
 * Activity cell — left bar colour-coded by tier, this-month count with
 * month-over-month delta arrow, and an "N last 30d" rolling subline (more
 * useful mid-month than the original "last calendar month" figure).
 *
 * Tier colours follow the project palette (no green / no red):
 *   Active → teal-700, Quiet → sky-700, Dormant → slate-600, Never → slate-400.
 */
/** Tailwind class config for each activity tier. */
const ACTIVITY_PILL: Record<
  ActivityTier,
  { label: string; pill: string; num: string; bar: string }
> = {
  active: {
    label: "Active",
    pill: "bg-teal-50 text-teal-800 border border-teal-200",
    num: "text-teal-700",
    bar: "border-l-teal-700",
  },
  quiet: {
    label: "Quiet",
    pill: "bg-sky-50 text-sky-800 border border-sky-200",
    num: "text-sky-700",
    bar: "border-l-sky-700",
  },
  dormant: {
    label: "Dormant",
    pill: "bg-slate-100 text-slate-700 border border-slate-200",
    num: "text-slate-600",
    bar: "border-l-slate-500",
  },
  never: {
    label: "Never",
    pill: "bg-slate-50 text-slate-600 border-slate-300",
    num: "text-slate-500",
    bar: "border-l-slate-300",
  },
}

/**
 * Status column pill.
 *
 * The mockup shows two states — "Active" (teal) and "Quiet" (slate) — which
 * are activity tiers, not the underlying `stores.status` enum. So the pill
 * normally reflects the activity tier (which is the more interesting signal
 * during the pilot ramp-up). Store-level closure still has to surface
 * somewhere, so when the row is `temporarily_closed` or `permanently_closed`
 * we override and render the closure state instead — those are uncommon
 * and worth flagging explicitly.
 */
function StatusPill({
  tier,
  storeStatus,
}: {
  tier: ActivityTier
  storeStatus: StoreStatus
}) {
  if (storeStatus === "temporarily_closed") {
    return (
      <span className="inline-flex items-center px-2 h-6 text-[11px] rounded-md border bg-orange-50 text-orange-800 border-orange-200">
        Temp. closed
      </span>
    )
  }
  if (storeStatus === "permanently_closed") {
    return (
      <span className="inline-flex items-center px-2 h-6 text-[11px] rounded-md border bg-slate-100 text-slate-600 border-slate-200">
        Closed
      </span>
    )
  }
  const cfg = ACTIVITY_PILL[tier]
  return (
    <span
      className={`inline-flex items-center px-2 h-6 text-[11px] rounded-md border ${cfg.pill}`}
    >
      {cfg.label}
    </span>
  )
}

function ResultPill({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: "teal" | "indigo" | "slate" | "orange"
}) {
  const cls = {
    teal: "bg-teal-50 border-teal-200 text-teal-900",
    indigo: "bg-indigo-50 border-indigo-200 text-indigo-900",
    slate: "bg-slate-50 border-slate-200 text-slate-700",
    orange: "bg-orange-50 border-orange-200 text-orange-900",
  }[tone]
  return (
    <div className={`border rounded-md px-3 py-2 ${cls}`}>
      <div className="text-[11.5px]">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  )
}

function humanStatus(s: StoreStatus): string {
  switch (s) {
    case "active":
      return "Active"
    case "temporarily_closed":
      return "Temp. closed"
    case "permanently_closed":
      return "Closed"
  }
}

/* ------------------------------ Stats cards ------------------------------ */

type ActivityCounts = {
  active: number
  quiet: number
  dormant: number
  never: number
}

/**
 * Six-card metric strip rendered above the filter bar.
 *
 * Cards (left → right):
 *   1. All stores          — total pilot footprint
 *   2. Active              — activity-tier "active" (reported ≤ 7d)
 *   3. Quiet               — everything else (quiet + dormant + never)
 *   4. Active this month   — stores with ≥ 1 report this calendar month +
 *                            month-over-month % delta arrow
 *   5. Total reporters     — distinct phones across every report, lifetime
 *   6. Mgr ack ≤ 2h        — global % of reports acknowledged within 2h
 *
 * The cards are pilot-wide totals on purpose — not filtered. They give HO a
 * fixed reference frame at the top of the page while they slice the table
 * below.
 */

/**
 * Stores-needing-attention panel.
 *
 * Sits above the stats cards when there's at least one un-resolved row.
 * Each card is one store: brand + name, the reason it's flagged (with a
 * tone-appropriate accent), the manager's phone for HO to call, and a
 * Mark-resolved button that POSTs to /api/ho-store-attention.
 *
 * Design choices:
 *  - Orange-700 accent header so the panel reads as "this needs your
 *    attention" without using red (palette rule). Soft orange tinted
 *    bg matches the queue-card pattern from Overview.
 *  - Manager phone is a tel: link — one tap on mobile, click to dial on
 *    desktops with a default handler. The HO actually calls offline;
 *    this is just an affordance.
 *  - Cards collapse to 1 column on phones, 2 on md+ — fits 4-6 items
 *    above the fold without taking over the page.
 */
function AttentionPanel({
  items,
  onResolve,
}: {
  items: AttentionItem[]
  onResolve: (sap_code: string) => void | Promise<void>
}) {
  return (
    <section
      aria-label="Stores needing attention"
      className="mb-5 overflow-hidden rounded-xl border border-orange-200 bg-gradient-to-br from-orange-50 via-white to-amber-50 shadow-sm"
    >
      <header className="flex items-center justify-between gap-3 border-b border-orange-100 bg-gradient-to-r from-orange-100 via-orange-50 to-transparent px-5 py-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            aria-hidden
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-orange-200 to-orange-300 text-orange-800 ring-1 ring-orange-200 shadow-sm"
          >
            <AlertTriangle className="h-4 w-4" strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-orange-700">
              Stores needing attention
            </p>
            <p className="text-[12.5px] text-slate-700">
              Call the store manager · mark resolved when handled · row drops out
            </p>
          </div>
        </div>
        <span className="inline-flex h-6 min-w-[28px] shrink-0 items-center justify-center rounded-full bg-orange-600 px-2 text-[11px] font-bold text-white tabular-nums shadow-sm">
          {items.length}
        </span>
      </header>
      <ul className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4">
        {items.map((it) => (
          <AttentionCard key={it.sap_code} item={it} onResolve={onResolve} />
        ))}
      </ul>
    </section>
  )
}

/**
 * Single attention card. State is owned by the parent — we just render
 * the props and call onResolve when the button is tapped. The local
 * `busy` state hides duplicate clicks during the in-flight POST.
 */
function AttentionCard({
  item,
  onResolve,
}: {
  item: AttentionItem
  onResolve: (sap_code: string) => void | Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const reasonLabel: Record<AttentionItem["reason"], string> = {
    never_reported: "Never reported",
    dormant: "Dormant",
    low_traffic: "Low traffic",
  }
  // Tone differentiates between "this is a brand-new store" vs. "this
  // store stopped reporting" — different conversations with the manager.
  const reasonTone: Record<AttentionItem["reason"], string> = {
    never_reported: "bg-amber-100 text-amber-800 border-amber-200",
    dormant: "bg-orange-100 text-orange-800 border-orange-200",
    low_traffic: "bg-sky-100 text-sky-800 border-sky-200",
  }
  async function onClick() {
    if (busy) return
    setBusy(true)
    try {
      await onResolve(item.sap_code)
    } finally {
      setBusy(false)
    }
  }
  return (
    <li className="rounded-lg border border-orange-200 bg-white px-3 py-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10.5px] font-mono text-slate-500">
            {item.sap_code}
          </p>
          <p className="text-[13.5px] font-semibold text-slate-900 truncate">
            {item.name}
          </p>
          <p className="text-[11.5px] text-slate-500 truncate">
            {item.brand} · {item.city}
          </p>
        </div>
        <span
          className={`shrink-0 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${reasonTone[item.reason]}`}
        >
          {reasonLabel[item.reason]}
        </span>
      </div>
      <p className="mt-2 text-[12px] text-slate-700">{item.detail}</p>
      <div className="mt-2.5 flex items-center justify-between gap-2 flex-wrap">
        {item.manager_phone ? (
          // tel: link so HO can tap to dial from a phone or click to
          // invoke their default phone handler on a desktop (Teams/
          // FaceTime/etc). The offline call is the actual workflow;
          // this is just an affordance to make it one fewer step.
          <a
            href={`tel:${item.manager_phone.replace(/\s+/g, "")}`}
            className="inline-flex items-center gap-1.5 text-[12px] text-indigo-700 hover:text-indigo-900 font-medium"
          >
            <Phone className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden />
            {item.manager_name ?? "Manager"} · {item.manager_phone}
          </a>
        ) : (
          <span className="inline-flex items-center gap-1 text-[11.5px] text-orange-700">
            <AlertTriangle className="h-3 w-3" />
            No manager phone on file
          </span>
        )}
        <button
          type="button"
          onClick={onClick}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-md border border-orange-300 bg-white px-2.5 h-7 text-[11.5px] font-medium text-orange-800 hover:bg-orange-50 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.8} />
          )}
          Mark resolved
        </button>
      </div>
    </li>
  )
}

function StatsCards({
  summary,
  activityCounts,
  newCount,
}: {
  summary: StoresSummary
  activityCounts: ActivityCounts
  newCount: number
}) {
  const activeTier = activityCounts.active
  const quietTier =
    activityCounts.quiet + activityCounts.dormant + activityCounts.never
  const totalActiveQuiet = activeTier + quietTier
  const activePct = totalActiveQuiet > 0
    ? Math.round((activeTier / totalActiveQuiet) * 10000) / 100
    : null
  const quietPct = totalActiveQuiet > 0
    ? Math.round((quietTier / totalActiveQuiet) * 10000) / 100
    : null
  const mom = summary.mom_growth_pct
  const ack = summary.pct_acked_within_2h

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
      <StatCard
        icon={<Archive className="h-4 w-4" />}
        accent="indigo"
        label="All stores"
        value={summary.total_stores}
        sub={
          newCount > 0
            ? `${newCount} new`
            : `${summary.active_status} active`
        }
        infoTitle="Total stores in the pilot roster, regardless of activity"
      />
      <StatCard
        icon={<CheckCircle2 className="h-4 w-4" />}
        accent="teal"
        label="Active"
        value={activeTier}
        sub={activePct != null ? `${formatPct(activePct)}%` : "—"}
      />
      <StatCard
        icon={<MessageSquare className="h-4 w-4" />}
        accent="slate"
        label="Quiet"
        value={quietTier}
        sub={quietPct != null ? `${formatPct(quietPct)}%` : "—"}
      />
      <StatCard
        icon={<TrendingUp className="h-4 w-4" />}
        accent="sky"
        label="Active this month"
        value={summary.reports_this_month}
        sub={
          mom == null ? (
            <span className="text-slate-500">—</span>
          ) : mom === 0 ? (
            <span className="text-slate-500">flat</span>
          ) : mom > 0 ? (
            <span className="inline-flex items-center gap-0.5 text-teal-700 font-medium">
              <TrendingUp className="h-3 w-3" />
              {mom}%
            </span>
          ) : (
            <span className="inline-flex items-center gap-0.5 text-orange-700 font-medium">
              <TrendingDown className="h-3 w-3" />
              {mom}%
            </span>
          )
        }
      />
      <StatCard
        icon={<Users className="h-4 w-4" />}
        accent="slate"
        label="Total reporters"
        value={summary.total_reporters}
        sub="All time"
      />
      <StatCard
        icon={<Clock className="h-4 w-4" />}
        accent="indigo"
        label="Mgr ack ≤ 2h"
        value={ack == null ? "—" : `${ack}%`}
        sub={ack == null ? "no data yet" : ack >= 80 ? "on target" : "needs lift"}
      />
    </div>
  )
}

function formatPct(p: number): string {
  // 54.5454… → "54.55" / 54 → "54". Trims trailing zeros for tidy display.
  const fixed = p.toFixed(2)
  return fixed.replace(/\.?0+$/, "")
}

function StatCard({
  icon,
  accent,
  label,
  value,
  sub,
  infoTitle,
}: {
  icon: React.ReactNode
  accent: "indigo" | "teal" | "slate" | "sky" | "orange"
  label: string
  value: number | string
  sub: React.ReactNode
  infoTitle?: string
}) {
  // Per-accent card gradient + icon-circle gradient + border tint.
  // Mirrors the Velocity-tile pattern on /ho — each stat now reads as
  // a coloured metric tile rather than another white square.
  const cardTone = {
    indigo: "bg-gradient-to-br from-white via-indigo-50 to-indigo-100/80 border-indigo-100",
    teal: "bg-gradient-to-br from-white via-teal-50 to-teal-100/80 border-teal-100",
    slate: "bg-gradient-to-br from-white via-slate-50 to-slate-100 border-slate-200",
    sky: "bg-gradient-to-br from-white via-sky-50 to-sky-100/80 border-sky-100",
    orange: "bg-gradient-to-br from-white via-orange-50 to-orange-100/80 border-orange-100",
  }[accent]
  const iconTone = {
    indigo: "bg-gradient-to-br from-indigo-100 to-indigo-200 text-indigo-700 ring-indigo-200",
    teal: "bg-gradient-to-br from-teal-100 to-teal-200 text-teal-700 ring-teal-200",
    slate: "bg-gradient-to-br from-slate-100 to-slate-200 text-slate-700 ring-slate-200",
    sky: "bg-gradient-to-br from-sky-100 to-sky-200 text-sky-700 ring-sky-200",
    orange: "bg-gradient-to-br from-orange-100 to-orange-200 text-orange-700 ring-orange-200",
  }[accent]
  return (
    <div className={`border rounded-xl px-4 py-3.5 flex items-start gap-3 shadow-sm ${cardTone}`}>
      <span
        className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md ring-1 shadow-sm ${iconTone}`}
        aria-hidden
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 text-[11px] text-slate-500 font-medium">
          <span className="truncate">{label}</span>
          {infoTitle && (
            <span title={infoTitle} className="text-slate-400">
              <Info className="h-3 w-3" />
            </span>
          )}
        </div>
        <div className="mt-1 flex items-baseline gap-1.5 flex-wrap">
          <span className="text-[22px] font-semibold tabular-nums text-slate-900 leading-none">
            {value}
          </span>
          {sub != null && (
            <span className="text-[11px] text-slate-500">{sub}</span>
          )}
        </div>
      </div>
    </div>
  )
}

/* ----------------------------- Filter helpers ----------------------------- */

function FilterGroup({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="inline-flex items-center gap-1 flex-wrap">
      <span className="text-slate-500 font-medium mr-0.5">{label}:</span>
      {children}
    </div>
  )
}

function FilterDivider() {
  return (
    <span
      aria-hidden
      className="hidden md:inline-block h-3.5 w-px bg-slate-200"
    />
  )
}

/* --------------------------- Pagination footer --------------------------- */

/**
 * Table pagination footer.
 *
 * Shows "Showing X to Y of Z" (filtered total — falls back to overall total
 * when no filter is active), prev/next page nav, the current page number,
 * and a page-size selector. With 11 pilot stores at the default 20/page,
 * this renders as a single page and the arrows are disabled; the controls
 * activate naturally once HO grows the roster past the page size.
 */
function PaginationFooter({
  filteredCount,
  totalCount,
  pageStart,
  pageEnd,
  page,
  totalPages,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: {
  filteredCount: number
  totalCount: number
  pageStart: number
  pageEnd: number
  page: number
  totalPages: number
  pageSize: number
  onPageChange: (p: number) => void
  onPageSizeChange: (s: 10 | 20 | 50 | 100) => void
}) {
  const showingFiltered = filteredCount !== totalCount
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap px-4 py-3 border-t border-slate-200 bg-white text-[12px] text-slate-600">
      <div>
        Showing{" "}
        <span className="tabular-nums font-medium text-slate-800">
          {pageStart}
        </span>{" "}
        to{" "}
        <span className="tabular-nums font-medium text-slate-800">
          {pageEnd}
        </span>{" "}
        of{" "}
        <span className="tabular-nums font-medium text-slate-800">
          {filteredCount}
        </span>{" "}
        {filteredCount === 1 ? "store" : "stores"}
        {showingFiltered && (
          <span className="text-slate-400"> (of {totalCount} total)</span>
        )}
      </div>
      <div className="inline-flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          aria-label="Previous page"
          className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <span
          className="inline-flex items-center justify-center min-w-[28px] h-7 px-2 rounded-md bg-indigo-50 text-indigo-700 text-[11.5px] font-semibold tabular-nums"
          aria-label={`Page ${page} of ${totalPages}`}
        >
          {page}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          aria-label="Next page"
          className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
        <label className="ml-2 inline-flex items-center gap-1.5">
          <select
            value={pageSize}
            onChange={(e) =>
              onPageSizeChange(Number(e.target.value) as 10 | 20 | 50 | 100)
            }
            className="h-7 pl-2 pr-6 text-[11.5px] border border-slate-300 rounded-md bg-white text-slate-700 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            aria-label="Stores per page"
          >
            <option value={10}>10 / page</option>
            <option value={20}>20 / page</option>
            <option value={50}>50 / page</option>
            <option value={100}>100 / page</option>
          </select>
        </label>
      </div>
    </div>
  )
}
