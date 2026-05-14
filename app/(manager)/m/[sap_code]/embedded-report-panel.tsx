"use client"

import { AlertTriangle, Inbox, Loader2 } from "lucide-react"
import { useEffect, useState } from "react"
import { ReportDetail } from "./r/[report_id]/report-detail"

/**
 * Client-side wrapper that fetches a single report by id and renders it
 * inline inside the inbox right-pane on desktop. The standalone page at
 * /m/[sap]/r/[id] does the same job server-side for direct deep-links
 * (notifications, bookmarks); this exists so desktop users can browse
 * the inbox without a full page navigation between rows.
 *
 * The shape of `report` + `resolutions` mirrors what the server hands
 * to the page version of `<ReportDetail>` — we route both through the
 * same component to avoid drift in the report layout.
 *
 * `selectedId` is `null` when nothing is picked yet (initial state on
 * desktop). We show an empty-state hint rather than auto-selecting the
 * first row, because auto-selecting can hide a fresh "new" report at
 * the top by pre-marking it acknowledged the moment the user lands.
 */

type Store = {
  sap_code: string
  name: string
  brand: string
  city: string
  state: string
}

type Report = {
  id: string
  store_code: string
  type: "observation" | "incident"
  category: string
  status: "new" | "in_progress" | "awaiting_ho" | "returned" | "closed"
  description: string | null
  transcript: string | null
  transcript_error: string | null
  photo_url: string
  audio_url: string | null
  incident_datetime: string
  reported_at: string
  acknowledged_at: string | null
}

type Resolution = {
  id: string
  attempt_number: number
  note: string
  photo_url: string
  resolved_at: string
}

type FetchState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "ready"; report: Report; resolutions: Resolution[] }
  | { phase: "error"; message: string }
  | { phase: "missing" }

export function EmbeddedReportPanel({
  store,
  selectedId,
  onStatusChange,
}: {
  store: Store
  selectedId: string | null
  /** Fires when the embedded detail flips status (e.g. acknowledge) so
   * the inbox list can re-fetch and reflect the move between buckets. */
  onStatusChange?: () => void
}) {
  const [state, setState] = useState<FetchState>({ phase: "idle" })

  useEffect(() => {
    if (!selectedId) {
      setState({ phase: "idle" })
      return
    }

    let cancelled = false
    setState({ phase: "loading" })

    void (async () => {
      try {
        const res = await fetch(`/api/reports/${selectedId}`, {
          cache: "no-store",
        })
        if (cancelled) return
        if (res.status === 404) {
          setState({ phase: "missing" })
          return
        }
        if (res.status === 401) {
          // Cookie gone — surface an error rather than redirect; the
          // inbox above us already polls and will redirect on its own
          // next cycle. Avoids two competing navigations.
          setState({
            phase: "error",
            message: "Your session expired. Refresh to sign in again.",
          })
          return
        }
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`)
        }
        const body = (await res.json()) as {
          report?: Report
          resolutions?: Resolution[]
        }
        if (!body.report) {
          setState({ phase: "missing" })
          return
        }
        setState({
          phase: "ready",
          report: body.report,
          resolutions: body.resolutions ?? [],
        })
      } catch (e) {
        if (cancelled) return
        const msg = e instanceof Error ? e.message : "Couldn't load report."
        setState({ phase: "error", message: msg })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [selectedId])

  if (state.phase === "idle") {
    return <EmptyHint />
  }
  if (state.phase === "loading") {
    return <LoadingHint />
  }
  if (state.phase === "missing") {
    return (
      <Notice
        tone="slate"
        icon={<Inbox className="h-6 w-6" strokeWidth={1.6} aria-hidden />}
        title="Report not found"
        body="It may have been voided by Head Office. Pick another report from the list."
      />
    )
  }
  if (state.phase === "error") {
    return (
      <Notice
        tone="orange"
        icon={
          <AlertTriangle className="h-6 w-6" strokeWidth={1.6} aria-hidden />
        }
        title="Couldn't load that report"
        body={state.message}
      />
    )
  }

  // Ready — hand off to the shared <ReportDetail> in embedded mode.
  return (
    <ReportDetail
      store={store}
      report={state.report}
      resolutions={state.resolutions}
      mode="embedded"
      onStatusChange={() => onStatusChange?.()}
    />
  )
}

/* ------------------------------- Helpers ------------------------------- */

function EmptyHint() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-8 py-16 text-center">
      <div
        className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-500"
        aria-hidden
      >
        <Inbox className="h-7 w-7" strokeWidth={1.6} />
      </div>
      <p className="mt-4 font-display text-[16px] font-semibold text-slate-800">
        Pick a report to view it here
      </p>
      <p className="mt-2 max-w-sm text-[13px] leading-5 text-slate-500">
        On desktop, the report opens beside the list. On phone, tap to
        open the full screen.
      </p>
    </div>
  )
}

function LoadingHint() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-8 py-16">
      <Loader2
        className="h-6 w-6 animate-spin text-indigo-700"
        strokeWidth={1.8}
        aria-hidden
      />
      <p className="mt-3 text-[13px] text-slate-500">Loading report…</p>
    </div>
  )
}

function Notice({
  tone,
  icon,
  title,
  body,
}: {
  tone: "slate" | "orange"
  icon: React.ReactNode
  title: string
  body: string
}) {
  const ring =
    tone === "slate" ? "bg-slate-100 text-slate-500" : "bg-orange-100 text-orange-700"
  return (
    <div className="flex h-full flex-col items-center justify-center px-8 py-16 text-center">
      <div
        className={`flex h-14 w-14 items-center justify-center rounded-full ${ring}`}
        aria-hidden
      >
        {icon}
      </div>
      <p className="mt-4 font-display text-[16px] font-semibold text-slate-800">
        {title}
      </p>
      <p className="mt-2 max-w-sm text-[13px] leading-5 text-slate-500">
        {body}
      </p>
    </div>
  )
}
