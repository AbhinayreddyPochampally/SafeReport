"use client"

import {
  CheckCircle2,
  ChevronRight,
  Image as ImageIcon,
  Inbox,
  Loader2,
  LogOut,
  Mic,
  RefreshCw,
  X,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { CATEGORIES, type CategoryDef } from "@/lib/categories"
import { ManagerPwaPrompt } from "@/components/manager-pwa-prompt"
import {
  ensurePushSubscription,
  clearPushSubscription,
} from "@/lib/push-client"
import { EmbeddedReportPanel } from "./embedded-report-panel"

/**
 * Manager inbox — responsive shell.
 *
 * Mobile / narrow screens: single-column phone shape. Rows are anchor
 * links to /m/[sap]/r/[id]; tapping navigates to the standalone detail
 * page. PWA prompt sits above the filter chips so a brand-new manager
 * can install + grant notifications before triaging anything.
 *
 * Desktop (≥lg): two-pane layout. Left rail keeps the list (~420px),
 * right pane embeds the same `<ReportDetail>` component the standalone
 * page uses, fetched client-side by id. Clicking a row sets the URL
 * search-param `selected=SR-...` so refreshes and shared links keep
 * the selection. The row's `<a href>` falls back to the standalone
 * page if the user middle-clicks or drops below the lg breakpoint.
 *
 * Polling: still 30s while visible, but now we fetch ALL statuses in
 * one call and bucket client-side. Two reasons: (a) we want live counts
 * on every filter pill, (b) it's one round-trip per poll instead of one
 * per filter, which scales better than asking the manager to choose.
 *
 * State transitions in the right pane (acknowledge, eventually resolve)
 * fire `onStatusChange`, which prompts an immediate inbox refresh so the
 * row hops into its new bucket without waiting for the next 30s tick.
 *
 * Filter pills no longer scroll horizontally — they're a 2-column grid
 * on phones (which fits "Awaiting HO" without truncation) and a single
 * row on sm+ screens. Each pill carries a count badge.
 */

const POLL_MS = 30_000
const LG_QUERY = "(min-width: 1024px)"
const SELECTED_PARAM = "selected"

const SR_ID = /^SR-\d{6,}$/

type Store = {
  sap_code: string
  name: string
  brand: string
  city: string
  state: string
}

type InboxReport = {
  id: string
  category: string
  type: string
  status: string
  filed_at: string
  acknowledged_at: string | null
  incident_datetime: string
  preview: string
  has_photo: boolean
  has_audio: boolean
}

type FilterKey = "needs_action" | "in_progress" | "awaiting_ho" | "closed"

type Filter = {
  key: FilterKey
  label: string
  /** Shorter label used when horizontal space is tight (lg < width < sm). */
  shortLabel: string
  statuses: string[]
}

const FILTERS: readonly Filter[] = [
  {
    key: "needs_action",
    label: "Needs action",
    shortLabel: "Needs action",
    statuses: ["new", "returned"],
  },
  {
    key: "in_progress",
    label: "In progress",
    shortLabel: "In progress",
    statuses: ["in_progress"],
  },
  {
    key: "awaiting_ho",
    label: "Awaiting HO",
    shortLabel: "Awaiting",
    statuses: ["awaiting_ho"],
  },
  {
    key: "closed",
    label: "Closed",
    shortLabel: "Closed",
    statuses: ["closed"],
  },
] as const

const ALL_STATUSES = FILTERS.flatMap((f) => f.statuses)

type Toast = {
  kind: "resolution_sent"
  report_id: string
  attempt: number
  warning: string | null
}

export function ManagerInbox({ store }: { store: Store }) {
  const router = useRouter()
  const [filterKey, setFilterKey] = useState<FilterKey>("needs_action")
  const [allReports, setAllReports] = useState<InboxReport[] | null>(null)
  const [fetching, setFetching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [signingOut, setSigningOut] = useState(false)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)
  const [isDesktop, setIsDesktop] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const filter = useMemo(
    () => FILTERS.find((f) => f.key === filterKey) ?? FILTERS[0],
    [filterKey],
  )

  // --- Viewport: are we on a desktop-sized screen? -------------------------
  // We use this to decide whether row clicks open inline (right pane) or
  // navigate to the standalone detail page. Reactive via matchMedia so
  // resizing or rotating immediately updates behavior.
  useEffect(() => {
    if (typeof window === "undefined") return
    const mq = window.matchMedia(LG_QUERY)
    const apply = () => setIsDesktop(mq.matches)
    apply()
    mq.addEventListener("change", apply)
    return () => mq.removeEventListener("change", apply)
  }, [])

  // --- Read `selected` from URL on mount so deep links work ----------------
  useEffect(() => {
    if (typeof window === "undefined") return
    const sp = new URLSearchParams(window.location.search)
    const sel = sp.get(SELECTED_PARAM)
    if (sel && SR_ID.test(sel)) {
      setSelectedId(sel)
    }
  }, [])

  // --- Push selection back into URL so it survives reload/share ------------
  useEffect(() => {
    if (typeof window === "undefined") return
    const url = new URL(window.location.href)
    if (selectedId) {
      url.searchParams.set(SELECTED_PARAM, selectedId)
    } else {
      url.searchParams.delete(SELECTED_PARAM)
    }
    // replaceState (not pushState) so back-button still goes to the
    // previous page rather than between row selections.
    window.history.replaceState(null, "", url.toString())
  }, [selectedId])

  // --- One-shot success toast from the resolve flow ------------------------
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("sr_mgr_toast")
      if (!raw) return
      sessionStorage.removeItem("sr_mgr_toast")
      const parsed = JSON.parse(raw) as Partial<Toast>
      if (
        parsed?.kind === "resolution_sent" &&
        typeof parsed.report_id === "string" &&
        typeof parsed.attempt === "number"
      ) {
        setToast({
          kind: "resolution_sent",
          report_id: parsed.report_id,
          attempt: parsed.attempt,
          warning:
            typeof parsed.warning === "string" ? parsed.warning : null,
        })
      }
    } catch {
      /* ignore — toast is best-effort */
    }
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 6000)
    return () => window.clearTimeout(t)
  }, [toast])

  // --- Inbox data fetch ----------------------------------------------------
  const inFlight = useRef(false)

  const fetchReports = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    setFetching(true)
    setError(null)
    try {
      // Pull every status in one call so we have live counts per filter
      // without four parallel round-trips. Bucketing is cheap client-side.
      const statuses = ALL_STATUSES.join(",")
      const res = await fetch(
        `/api/reports?sap_code=${encodeURIComponent(
          store.sap_code,
        )}&status=${encodeURIComponent(statuses)}`,
        { cache: "no-store" },
      )
      if (res.status === 401) {
        router.refresh()
        return
      }
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }
      const body = (await res.json()) as { reports?: InboxReport[] }
      setAllReports(body.reports ?? [])
      setLastUpdatedAt(Date.now())
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load."
      setError(`Couldn't refresh the inbox (${msg}).`)
    } finally {
      setFetching(false)
      inFlight.current = false
    }
  }, [store.sap_code, router])

  // Initial fetch
  useEffect(() => {
    void fetchReports()
  }, [fetchReports])

  // Register web-push subscription on mount.
  useEffect(() => {
    void ensurePushSubscription({
      role: "manager",
      sap_code: store.sap_code,
    })
  }, [store.sap_code])

  // Visibility-gated polling.
  useEffect(() => {
    let timer: number | null = null
    const start = () => {
      if (timer !== null) return
      timer = window.setInterval(() => {
        if (document.visibilityState === "visible") {
          void fetchReports()
        }
      }, POLL_MS)
    }
    const stop = () => {
      if (timer !== null) {
        clearInterval(timer)
        timer = null
      }
    }
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void fetchReports()
        start()
      } else {
        stop()
      }
    }
    if (document.visibilityState === "visible") start()
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      stop()
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [fetchReports])

  async function signOut() {
    setSigningOut(true)
    try {
      await clearPushSubscription()
      await fetch("/api/auth/manager", { method: "DELETE" })
      router.refresh()
    } finally {
      setSigningOut(false)
    }
  }

  // After resolution, jump to "Awaiting HO" — same behavior as before so
  // the manager sees the report they just sent land in that bucket.
  useEffect(() => {
    if (toast?.kind === "resolution_sent") {
      setFilterKey("awaiting_ho")
      // Clear any inline selection because the resolved report just
      // hopped into a different bucket and may have moved off-screen.
      setSelectedId(null)
    }
  }, [toast])

  // --- Derived: filtered list + counts -------------------------------------
  const counts = useMemo(() => {
    const out: Record<FilterKey, number> = {
      needs_action: 0,
      in_progress: 0,
      awaiting_ho: 0,
      closed: 0,
    }
    if (!allReports) return out
    for (const r of allReports) {
      for (const f of FILTERS) {
        if (f.statuses.includes(r.status)) out[f.key]++
      }
    }
    return out
  }, [allReports])

  const reports = useMemo(() => {
    if (!allReports) return null
    return allReports.filter((r) => filter.statuses.includes(r.status))
  }, [allReports, filter])

  const hasReports = reports !== null && reports.length > 0

  // If the currently selected report is no longer in the inbox (filtered
  // out, deleted server-side, etc.), don't keep a dangling selection.
  useEffect(() => {
    if (!selectedId || !allReports) return
    const stillThere = allReports.some((r) => r.id === selectedId)
    if (!stillThere) setSelectedId(null)
  }, [selectedId, allReports])

  function handleRowClick(reportId: string, ev: React.MouseEvent) {
    // Honour middle-click, modifier-click, etc. — the anchor's default
    // navigation handles those cases naturally.
    if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button !== 0) return
    if (!isDesktop) return // mobile: let the link navigate
    ev.preventDefault()
    setSelectedId(reportId)
  }

  return (
    <main className="min-h-screen bg-slate-50">
      {/* Top bar — full-width on desktop, phone-shaped on mobile. */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-7xl items-start justify-between gap-3 px-4 py-3 md:px-6 lg:px-8">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
              {store.brand} · {store.city}
            </p>
            <h1 className="mt-0.5 truncate font-display text-[20px] font-bold leading-7 text-slate-900 md:text-[22px]">
              {store.name}
            </h1>
            <p className="mt-0.5 text-[11px] text-slate-400">
              {store.sap_code}
            </p>
          </div>
          <button
            type="button"
            onClick={signOut}
            disabled={signingOut}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-medium text-slate-700 hover:border-indigo-500 hover:text-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-500/40 disabled:opacity-50"
          >
            <LogOut className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden />
            Sign out
          </button>
        </div>
      </header>

      {/* Toast (resolution-sent) sits below the header so it's not hidden
        * by the desktop two-pane layout's scrolling content. */}
      {toast && (
        <div className="mx-auto w-full max-w-7xl px-4 pt-3 md:px-6 lg:px-8">
          <div
            role="status"
            aria-live="polite"
            className="flex items-start gap-3 rounded-2xl border border-teal-200 bg-teal-50 px-3 py-3 text-teal-900"
          >
            <CheckCircle2
              className="mt-0.5 h-4 w-4 flex-shrink-0 text-teal-700"
              strokeWidth={2}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold">
                Sent {toast.report_id} to Head Office.
              </p>
              <p className="mt-0.5 text-[12px] leading-4 text-teal-800">
                Attempt {toast.attempt} is now awaiting approval.
                {toast.warning ? ` · ${toast.warning}` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setToast(null)}
              aria-label="Dismiss"
              className="flex-shrink-0 rounded-full p-1 text-teal-700 hover:bg-teal-100 focus:outline-none focus:ring-2 focus:ring-teal-500/40"
            >
              <X className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
          </div>
        </div>
      )}

      {/* Two-pane on desktop. On mobile, only the list pane renders;
        * the embedded panel never shows below lg. */}
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-0 px-4 py-4 md:px-6 lg:flex-row lg:items-start lg:gap-6 lg:px-8 lg:py-6">
        {/* ---------------- LIST PANE ---------------- */}
        <aside className="w-full lg:w-[420px] lg:shrink-0">
          {/* PWA install prompt. Hidden when both gates have already been
            * cleared, otherwise persistent across sessions. */}
          <ManagerPwaPrompt variant="inbox" />

          {/* Filter pills — 2-col grid on phone, single row on sm+. No
            * horizontal scroll, so "Closed" never gets clipped. */}
          <nav
            className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4"
            aria-label="Filter reports by status"
          >
            {FILTERS.map((f) => {
              const selected = f.key === filter.key
              const count = counts[f.key]
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilterKey(f.key)}
                  className={`flex w-full items-center justify-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[12px] font-medium transition ${
                    selected
                      ? "border-indigo-700 bg-indigo-700 text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:border-indigo-500"
                  } focus:outline-none focus:ring-4 focus:ring-indigo-500/40`}
                  aria-pressed={selected}
                >
                  <span className="truncate">{f.label}</span>
                  <span
                    className={`inline-flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full px-1.5 text-[10.5px] font-bold tabular-nums ${
                      selected
                        ? "bg-white/20 text-white"
                        : "bg-slate-100 text-slate-600"
                    }`}
                    aria-hidden
                  >
                    {count}
                  </span>
                </button>
              )
            })}
          </nav>

          {/* Report list */}
          <section className="mt-4">
            {reports === null ? (
              <LoadingState />
            ) : hasReports ? (
              <ul className="space-y-2">
                {reports.map((r) => (
                  <li key={r.id}>
                    <ReportCard
                      r={r}
                      sap_code={store.sap_code}
                      selected={selectedId === r.id && isDesktop}
                      onClick={(ev) => handleRowClick(r.id, ev)}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState filterLabel={filter.label} />
            )}
          </section>

          {error && (
            <p
              role="alert"
              className="mt-3 rounded-md bg-orange-100 px-3 py-2 text-[12px] text-orange-700"
            >
              {error}
            </p>
          )}

          <footer className="mt-6 flex items-center justify-between text-[11px] text-slate-400">
            <span>
              {lastUpdatedAt
                ? `Updated ${relativeTime(lastUpdatedAt)}`
                : "Loading…"}{" "}
              · Auto-refresh 30 s
            </span>
            <button
              type="button"
              onClick={() => void fetchReports()}
              disabled={fetching}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-medium text-slate-500 hover:text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 disabled:opacity-50"
            >
              {fetching ? (
                <Loader2
                  className="h-3.5 w-3.5 animate-spin"
                  strokeWidth={1.8}
                />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.8} />
              )}
              Refresh
            </button>
          </footer>
        </aside>

        {/* ---------------- DETAIL PANE (desktop only) ---------------- */}
        <section
          className="hidden min-h-[600px] flex-1 rounded-3xl border border-slate-200 bg-white lg:block"
          aria-label="Selected report"
        >
          <EmbeddedReportPanel
            store={store}
            selectedId={selectedId}
            onStatusChange={() => void fetchReports()}
          />
        </section>
      </div>
    </main>
  )
}

// ---- Row card --------------------------------------------------------------

function ReportCard({
  r,
  sap_code,
  selected,
  onClick,
}: {
  r: InboxReport
  sap_code: string
  selected: boolean
  onClick: (ev: React.MouseEvent) => void
}) {
  const cat = CATEGORIES.find((c) => c.key === r.category)
  const tone: "slate" | "amber" = r.type === "incident" ? "amber" : "slate"

  return (
    <a
      // Real href so middle-click / open-in-new-tab works. The handler
      // intercepts plain left-clicks on desktop and uses inline state.
      href={`/m/${sap_code}/r/${r.id}`}
      onClick={onClick}
      aria-current={selected ? "true" : undefined}
      className={`flex items-stretch gap-3 rounded-2xl border bg-white p-3 transition focus:outline-none focus:ring-4 focus:ring-indigo-500/40 ${
        selected
          ? "border-indigo-500 ring-2 ring-indigo-500/30"
          : "border-slate-200 hover:border-indigo-500"
      }`}
    >
      <CategoryTile cat={cat} tone={tone} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <StatusBadge status={r.status} />
          <span className="text-[11px] text-slate-400">{r.id}</span>
          <span className="ml-auto text-[11px] text-slate-400">
            {relativeTime(new Date(r.filed_at).getTime())}
          </span>
        </div>
        <p
          className={`mt-1 text-[14px] font-medium ${
            tone === "slate" ? "text-slate-800" : "text-amber-800"
          }`}
        >
          {cat?.label ?? r.category}
          {cat?.acronym ? (
            <span className="text-slate-400"> · {cat.acronym}</span>
          ) : null}
        </p>
        <p className="mt-0.5 line-clamp-2 text-[12px] leading-4 text-slate-600">
          {r.preview || "— no text yet, voice transcript pending."}
        </p>
        <div className="mt-1.5 flex items-center gap-3 text-[11px] text-slate-400">
          {r.has_photo && (
            <span className="inline-flex items-center gap-1">
              <ImageIcon className="h-3 w-3" strokeWidth={1.8} /> Photo
            </span>
          )}
          {r.has_audio && (
            <span className="inline-flex items-center gap-1">
              <Mic className="h-3 w-3" strokeWidth={1.8} /> Voice
            </span>
          )}
        </div>
      </div>
      <ChevronRight
        className="h-4 w-4 self-center text-slate-300"
        strokeWidth={1.8}
        aria-hidden
      />
    </a>
  )
}

function CategoryTile({
  cat,
  tone,
}: {
  cat: CategoryDef | undefined
  tone: "slate" | "amber"
}) {
  const Icon = cat?.icon
  const classes =
    tone === "slate"
      ? "bg-slate-100 text-slate-700"
      : "bg-amber-100 text-amber-800"
  return (
    <div
      className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl ${classes}`}
      aria-hidden
    >
      {Icon ? <Icon className="h-5 w-5" strokeWidth={1.8} /> : null}
    </div>
  )
}

// ---- Status badge ---------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  // Palette rule: no green, no red. Colours mirror CLAUDE.md hard rules:
  //   new          → slate-600
  //   in_progress  → indigo-700
  //   awaiting_ho  → sky-700
  //   returned     → orange-700
  //   closed       → teal-700
  const map: Record<string, { label: string; classes: string }> = {
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
    closed: {
      label: "Closed",
      classes: "border-teal-200 bg-teal-50 text-teal-700",
    },
  }
  const m = map[status] ?? {
    label: status,
    classes: "border-slate-200 bg-slate-50 text-slate-700",
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${m.classes}`}
    >
      {m.label}
    </span>
  )
}

// ---- Helpers --------------------------------------------------------------

function LoadingState() {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3"
        >
          <div className="h-12 w-12 animate-pulse rounded-xl bg-slate-100" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-24 animate-pulse rounded bg-slate-100" />
            <div className="h-3 w-full animate-pulse rounded bg-slate-100" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-slate-100" />
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyState({ filterLabel }: { filterLabel: string }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center">
      <div
        className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500"
        aria-hidden
      >
        <Inbox className="h-6 w-6" strokeWidth={1.8} />
      </div>
      <p className="mt-4 text-[14px] font-medium text-slate-700">
        Nothing in {filterLabel.toLowerCase()}.
      </p>
      <p className="mt-1 max-w-xs text-[12px] leading-5 text-slate-500">
        When reporters file a new report, it lands here within 30 seconds.
      </p>
    </div>
  )
}

function relativeTime(ms: number): string {
  const diff = Math.max(0, Date.now() - ms)
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}
