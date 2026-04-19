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
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import { CATEGORIES, type CategoryDef } from "@/lib/categories"
import { ensurePushSubscription, clearPushSubscription } from "@/lib/push-client"

/**
 * Manager inbox.
 *
 * Polls GET /api/reports every 30 s while the tab is visible, honours
 * `document.visibilityState` so a backgrounded tab doesn't drain Supabase,
 * and refreshes immediately when the tab comes back to the foreground. All
 * state transitions that matter (acknowledge, resolve) happen from the
 * detail page; the inbox is read-only.
 *
 * Filter pills:
 *   - Needs action (default): new + returned
 *   - In progress: in_progress
 *   - Awaiting HO: awaiting_ho
 *   - Closed: closed
 */

const POLL_MS = 30_000

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

type Filter = {
  key: string
  label: string
  statuses: string[]
}

const FILTERS: readonly Filter[] = [
  { key: "needs_action", label: "Needs action", statuses: ["new", "returned"] },
  { key: "in_progress", label: "In progress", statuses: ["in_progress"] },
  { key: "awaiting_ho", label: "Awaiting HO", statuses: ["awaiting_ho"] },
  { key: "closed", label: "Closed", statuses: ["closed"] },
] as const

type Toast = {
  kind: "resolution_sent"
  report_id: string
  attempt: number
  warning: string | null
}

export function ManagerInbox({ store }: { store: Store }) {
  const router = useRouter()
  const [filter, setFilter] = useState<Filter>(FILTERS[0])
  const [reports, setReports] = useState<InboxReport[] | null>(null)
  const [fetching, setFetching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [signingOut, setSigningOut] = useState(false)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)

  // One-shot success toast passed from the resolve flow via sessionStorage.
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
          warning: typeof parsed.warning === "string" ? parsed.warning : null,
        })
      }
    } catch {
      /* ignore — toast is best-effort */
    }
  }, [])

  // Auto-dismiss the toast after ~6s so it doesn't linger forever.
  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 6000)
    return () => window.clearTimeout(t)
  }, [toast])

  // Track the current filter in a ref so the polling interval always reads
  // the latest filter without needing to re-create the interval.
  const filterRef = useRef(filter)
  useEffect(() => {
    filterRef.current = filter
  }, [filter])

  // Track in-flight request so a visibility change doesn't double-fetch.
  const inFlight = useRef(false)

  const fetchReports = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    setFetching(true)
    setError(null)
    try {
      const statuses = filterRef.current.statuses.join(",")
      const res = await fetch(
        `/api/reports?sap_code=${encodeURIComponent(store.sap_code)}&status=${encodeURIComponent(statuses)}`,
        { cache: "no-store" },
      )
      if (res.status === 401) {
        // Cookie expired — bounce to login.
        router.refresh()
        return
      }
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }
      const body = (await res.json()) as { reports?: InboxReport[] }
      setReports(body.reports ?? [])
      setLastUpdatedAt(Date.now())
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load."
      setError(`Couldn't refresh the inbox (${msg}).`)
    } finally {
      setFetching(false)
      inFlight.current = false
    }
  }, [store.sap_code, router])

  // Initial fetch + refetch when the filter changes.
  useEffect(() => {
    void fetchReports()
  }, [filter, fetchReports])

  // Register the web-push subscription right after the inbox mounts,
  // which in practice is right after successful PIN unlock (the server
  // component only hands us this inbox when the cookie is valid).
  //
  // `ensurePushSubscription` is defensive — it no-ops if the browser
  // doesn't support push, permission was previously denied, or the
  // server has no VAPID keys configured. We fire it once per mount.
  useEffect(() => {
    void ensurePushSubscription({
      role: "manager",
      sap_code: store.sap_code,
    })
  }, [store.sap_code])

  // Poll every 30 s while visible; pause while hidden; refetch on return.
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
      // Unsubscribe push before we drop the cookie, so the dispatcher
      // stops buzzing a device that no longer has a session. Best-effort —
      // never blocks the actual sign-out on it.
      await clearPushSubscription()
      await fetch("/api/auth/manager", { method: "DELETE" })
      router.refresh()
    } finally {
      setSigningOut(false)
    }
  }

  const hasReports = reports !== null && reports.length > 0

  // When a toast appears, jump to "Awaiting HO" so the manager sees the
  // report they just sent land in that bucket.
  useEffect(() => {
    if (toast?.kind === "resolution_sent") {
      const awaiting = FILTERS.find((f) => f.key === "awaiting_ho")
      if (awaiting) setFilter(awaiting)
    }
  }, [toast])

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col px-6 py-6">
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="mb-4 flex items-start gap-3 rounded-2xl border border-teal-200 bg-teal-50 px-3 py-3 text-teal-900"
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
      )}
      <header className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
            {store.brand} · {store.city}
          </p>
          <h1 className="mt-0.5 truncate font-display text-[22px] font-bold leading-7 text-slate-900">
            {store.name}
          </h1>
          <p className="mt-0.5 text-[11px] text-slate-400">{store.sap_code}</p>
        </div>
        <button
          type="button"
          onClick={signOut}
          disabled={signingOut}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-medium text-slate-700 hover:border-indigo-500 hover:text-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-500/40 disabled:opacity-50"
        >
          <LogOut className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden />
          Sign out
        </button>
      </header>

      <nav
        className="mt-5 -mx-6 flex gap-2 overflow-x-auto px-6 pb-1"
        aria-label="Filter reports by status"
      >
        {FILTERS.map((f) => {
          const selected = f.key === filter.key
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f)}
              className={`flex-shrink-0 rounded-full border px-3.5 py-1.5 text-[12px] font-medium transition ${
                selected
                  ? "border-indigo-700 bg-indigo-700 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:border-indigo-500"
              } focus:outline-none focus:ring-4 focus:ring-indigo-500/40`}
              aria-pressed={selected}
            >
              {f.label}
            </button>
          )
        })}
      </nav>

      <section className="mt-4 flex-1">
        {reports === null ? (
          <LoadingState />
        ) : hasReports ? (
          <ul className="space-y-2">
            {reports.map((r) => (
              <li key={r.id}>
                <ReportCard r={r} sap_code={store.sap_code} />
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
          · Auto-refreshes every 30 s
        </span>
        <button
          type="button"
          onClick={() => void fetchReports()}
          disabled={fetching}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-medium text-slate-500 hover:text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 disabled:opacity-50"
        >
          {fetching ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.8} />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.8} />
          )}
          Refresh
        </button>
      </footer>
    </main>
  )
}

// ---- Row card --------------------------------------------------------------

function ReportCard({
  r,
  sap_code,
}: {
  r: InboxReport
  sap_code: string
}) {
  const cat = CATEGORIES.find((c) => c.key === r.category)
  const tone: "slate" | "amber" = r.type === "incident" ? "amber" : "slate"

  return (
    <Link
      href={`/m/${sap_code}/r/${r.id}`}
      className="flex items-stretch gap-3 rounded-2xl border border-slate-200 bg-white p-3 transition hover:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/40"
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
    </Link>
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
  // Palette rule: no green, no red. Colours:
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
