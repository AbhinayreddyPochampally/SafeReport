"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  ArrowUpRight,
  Ban,
  Bell,
  Check,
  ImageOff,
  Inbox,
  Loader2,
  Mic,
  Phone,
  RotateCcw,
  User,
} from "lucide-react"
import { CATEGORIES } from "@/lib/categories"

/**
 * Action Required — master-detail UI for HO's open queue.
 *
 * Selection lives in the URL (?id=SR-...) so the server can server-render the
 * detail half. Approve / return / void hit the existing /api/ho-actions
 * endpoint; on success we router.refresh() so the list re-shapes (the row
 * leaves the queue, the next-most-urgent surfaces).
 *
 * Keyboard shortcuts:
 *   J / ↓     → select next row
 *   K / ↑     → select previous row
 *   A         → approve (awaiting_ho only)
 *   R         → open return-reason modal
 *   V         → open void-reason modal
 *   Esc       → close any open modal
 */

export type ActionBucket = "sla_breached" | "awaiting" | "stale_new"

export type ActionListItem = {
  id: string
  store_code: string
  store_name: string
  brand: string
  type: "observation" | "incident"
  category: string
  status: "new" | "in_progress" | "awaiting_ho" | "returned" | "closed" | "voided"
  reported_at: string
  acknowledged_at: string | null
  age_hours: number
  attempt_count: number
  resubmitted: boolean
  latest_note: string | null
}

export type Resolution = {
  id: string
  report_id: string
  attempt_number: number
  note: string
  photo_url: string | null
  resolved_at: string
}

export type HoHistoryEntry = {
  id: string
  action: "approve" | "return" | "void"
  rejection_reason: string | null
  acted_at: string
  actor_display_name: string | null
}

export type ActionDetail = {
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
  status: ActionListItem["status"]
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
  resolutions: Resolution[]
  history: HoHistoryEntry[]
}

type ListItemWithBucket = ActionListItem & { bucket: ActionBucket }

type Filter = "all" | "sla_breached" | "awaiting" | "stale_new" | "resubmitted"

export function ActionClient({
  list,
  detail,
  selectedId,
  counts,
  viewer,
}: {
  list: ListItemWithBucket[]
  detail: ActionDetail | null
  selectedId: string | null
  counts: {
    sla_breached: number
    awaiting: number
    stale_new: number
    resubmitted: number
  }
  viewer: { display_name: string }
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [filter, setFilter] = useState<Filter>("all")
  const [busy, setBusy] = useState<null | "approve" | "return" | "void">(null)
  const [error, setError] = useState<string | null>(null)
  const [returnOpen, setReturnOpen] = useState(false)
  const [voidOpen, setVoidOpen] = useState(false)

  const visible = useMemo(() => {
    if (filter === "all") return list
    if (filter === "resubmitted") return list.filter((l) => l.resubmitted)
    return list.filter((l) => l.bucket === filter)
  }, [list, filter])

  function navigateTo(id: string | null) {
    const params = new URLSearchParams(searchParams?.toString() ?? "")
    if (id) params.set("id", id)
    else params.delete("id")
    router.replace(`/ho/action${params.size ? `?${params.toString()}` : ""}`, {
      scroll: false,
    })
  }

  // Keyboard navigation. Bound at the window so it fires regardless of which
  // element has focus, then gates on focused-input + key.toLowerCase() so
  // shift / caps-lock can't break the shortcut.
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
      if (visible.length === 0) return

      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
      const currentIndex = visible.findIndex((l) => l.id === selectedId)
      if (key === "j" || key === "ArrowDown") {
        e.preventDefault()
        const next = visible[Math.min(visible.length - 1, currentIndex + 1)]
        if (next) navigateTo(next.id)
      } else if (key === "k" || key === "ArrowUp") {
        e.preventDefault()
        const prev = visible[Math.max(0, currentIndex - 1)]
        if (prev) navigateTo(prev.id)
      } else if (key === "a" && detail?.status === "awaiting_ho") {
        e.preventDefault()
        void submitAction("approve")
      } else if (key === "r" && detail?.status === "awaiting_ho") {
        e.preventDefault()
        setReturnOpen(true)
      } else if (key === "v" && detail && detail.status !== "voided") {
        e.preventDefault()
        setVoidOpen(true)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
    // navigateTo / submitAction are stable enough — the deps below cover
    // every value those closures read for branching.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, selectedId, detail, returnOpen, voidOpen])

  async function submitAction(
    action: "approve" | "return" | "void",
    comment?: string,
  ) {
    if (!detail) return
    setBusy(action)
    setError(null)
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
        status?: ActionListItem["status"]
        error?: string
      } | null
      if (res.status === 401) {
        router.replace(`/ho/login?next=/ho/action`)
        return
      }
      if (!res.ok || !body?.ok) {
        throw new Error(body?.error || `HTTP ${res.status}`)
      }
      setReturnOpen(false)
      setVoidOpen(false)
      // Pre-emptively pick the next row so the right pane doesn't flash empty
      // during refresh. The next visible row that isn't this one.
      const nextRow =
        visible.find((l) => l.id !== detail.id) ?? null
      navigateTo(nextRow?.id ?? null)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't complete that.")
    } finally {
      setBusy(null)
    }
  }

  const totalWaiting = counts.sla_breached + counts.awaiting + counts.stale_new

  return (
    <div className="px-6 py-6 max-w-[1500px] mx-auto">
      <header className="mb-4">
        <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-slate-500">
          Pilot · ABFRL
        </p>
        <div className="mt-0.5 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-display text-[26px] font-semibold tracking-tight text-slate-900">
              Action required
            </h1>
            <p className="mt-0.5 text-[13px] text-slate-600">
              {totalWaiting === 0
                ? "Nothing waiting on you right now."
                : `${totalWaiting} item${totalWaiting === 1 ? "" : "s"} waiting on you`}
              {counts.sla_breached > 0 && (
                <>
                  {" · "}
                  <span className="text-orange-700">
                    {counts.sla_breached} past 48h
                  </span>
                </>
              )}
            </p>
          </div>
          <p className="text-[11px] text-slate-500">
            J / K to move · A to approve · R to return · V to void
          </p>
        </div>

        {/* Filter chips */}
        <div className="mt-3 flex items-center gap-1.5 flex-wrap">
          <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
            All · {totalWaiting}
          </FilterChip>
          <FilterChip
            active={filter === "sla_breached"}
            onClick={() => setFilter("sla_breached")}
            tone="orange"
          >
            Past 48h · {counts.sla_breached}
          </FilterChip>
          <FilterChip
            active={filter === "awaiting"}
            onClick={() => setFilter("awaiting")}
          >
            Awaiting HO · {counts.awaiting}
          </FilterChip>
          <FilterChip
            active={filter === "stale_new"}
            onClick={() => setFilter("stale_new")}
          >
            Stale new · {counts.stale_new}
          </FilterChip>
          <FilterChip
            active={filter === "resubmitted"}
            onClick={() => setFilter("resubmitted")}
          >
            <RotateCcw className="h-3 w-3 inline -mt-0.5 mr-1" />
            Resubmitted · {counts.resubmitted}
          </FilterChip>
        </div>
      </header>

      {totalWaiting === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 items-start">
          {/* List ------------------------------------------------------- */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden sticky top-4 max-h-[calc(100vh-100px)] overflow-y-auto">
            <ActionList
              items={visible}
              selectedId={selectedId}
              onSelect={(id) => navigateTo(id)}
            />
          </div>

          {/* Detail ----------------------------------------------------- */}
          <div>
            {detail ? (
              <DetailPane
                detail={detail}
                viewer={viewer}
                busy={busy}
                error={error}
                onApprove={() => submitAction("approve")}
                onReturnRequested={() => setReturnOpen(true)}
                onVoidRequested={() => setVoidOpen(true)}
                listItem={list.find((l) => l.id === detail.id) ?? null}
              />
            ) : (
              <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-slate-500">
                No item selected.
              </div>
            )}
          </div>
        </div>
      )}

      {returnOpen && detail && (
        <ReasonModal
          title="Return for rework"
          description="The manager will be notified and asked to update their resolution. Please explain what needs to change."
          minLen={10}
          maxLen={300}
          submitLabel="Return report"
          submitTone="orange"
          busy={busy === "return"}
          onCancel={() => setReturnOpen(false)}
          onSubmit={(c) => submitAction("return", c)}
        />
      )}
      {voidOpen && detail && (
        <ReasonModal
          title="Void this report"
          description="Voiding is irreversible. The report stays on record for audit, but no further action is possible. Please give a 20+ character reason."
          minLen={20}
          submitLabel="Void report"
          submitTone="slate"
          busy={busy === "void"}
          onCancel={() => setVoidOpen(false)}
          onSubmit={(c) => submitAction("void", c)}
          warning
        />
      )}
    </div>
  )
}

/* ----------------------------- List pane ---------------------------------- */

function ActionList({
  items,
  selectedId,
  onSelect,
}: {
  items: ListItemWithBucket[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  // Group items by bucket to render section headers.
  const groups: { bucket: ActionBucket; rows: ListItemWithBucket[] }[] = []
  for (const item of items) {
    const last = groups[groups.length - 1]
    if (last && last.bucket === item.bucket) {
      last.rows.push(item)
    } else {
      groups.push({ bucket: item.bucket, rows: [item] })
    }
  }

  if (items.length === 0) {
    return (
      <div className="p-6 text-center text-[12.5px] text-slate-500">
        No items match this filter.
      </div>
    )
  }

  return (
    <ul role="listbox" aria-label="Action queue">
      {groups.map((g) => (
        <li key={g.bucket}>
          <div
            className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.06em] border-b border-slate-100 ${
              g.bucket === "sla_breached"
                ? "bg-amber-50 text-orange-800"
                : g.bucket === "awaiting"
                  ? "bg-slate-50 text-slate-600"
                  : "bg-slate-50 text-slate-600"
            }`}
          >
            {g.bucket === "sla_breached"
              ? `Past 48 hours · ${g.rows.length}`
              : g.bucket === "awaiting"
                ? `Awaiting HO · ${g.rows.length}`
                : `Stale new · ${g.rows.length} `}
            {g.bucket === "stale_new" && (
              <span className="font-normal normal-case tracking-normal text-slate-500">
                · read-only
              </span>
            )}
          </div>
          <ul>
            {g.rows.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={row.id === selectedId}
                  onClick={() => onSelect(row.id)}
                  className={`w-full text-left px-3 py-2.5 border-b border-slate-100 transition-colors block ${
                    row.id === selectedId
                      ? "bg-indigo-50/70"
                      : "hover:bg-slate-50"
                  } ${
                    row.bucket === "sla_breached"
                      ? "border-l-[3px] border-l-orange-700"
                      : row.bucket === "awaiting"
                        ? "border-l-[3px] border-l-sky-700"
                        : "border-l-[3px] border-l-slate-300 opacity-90"
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span
                      className={`font-mono text-[11px] ${
                        row.bucket === "sla_breached"
                          ? "text-orange-800"
                          : row.bucket === "awaiting"
                            ? "text-sky-800"
                            : "text-slate-600"
                      } font-medium`}
                    >
                      {row.id}
                    </span>
                    <span
                      className={`text-[10.5px] tabular-nums ${
                        row.bucket === "sla_breached"
                          ? "text-orange-700 font-medium"
                          : row.bucket === "stale_new" && row.age_hours > 24
                            ? "text-orange-700"
                            : "text-slate-500"
                      }`}
                    >
                      {formatAge(row.age_hours)}{" "}
                      {row.bucket === "stale_new" ? "unacked" : "waiting"}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-1 flex-wrap">
                    <span className="text-[12.5px] font-medium text-slate-900 truncate">
                      {categoryLabel(row.category)}
                    </span>
                    {row.resubmitted && (
                      <span className="inline-flex items-center gap-0.5 rounded px-1 py-0 text-[9.5px] font-semibold uppercase bg-orange-100 text-orange-800 border border-orange-200">
                        <RotateCcw className="h-2.5 w-2.5" />
                        Resub
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-600 mt-0.5 truncate">
                    {row.store_code} · {row.store_name}
                  </div>
                  {row.latest_note && (
                    <div className="text-[11px] text-slate-500 mt-1 line-clamp-2">
                      {row.latest_note}
                    </div>
                  )}
                  {row.bucket === "stale_new" && (
                    <div className="text-[10.5px] text-slate-500 mt-1 italic">
                      Manager hasn&apos;t opened yet
                    </div>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  )
}

/* ----------------------------- Detail pane -------------------------------- */

function DetailPane({
  detail,
  viewer,
  busy,
  error,
  onApprove,
  onReturnRequested,
  onVoidRequested,
  listItem,
}: {
  detail: ActionDetail
  viewer: { display_name: string }
  busy: null | "approve" | "return" | "void"
  error: string | null
  onApprove: () => void
  onReturnRequested: () => void
  onVoidRequested: () => void
  listItem: ListItemWithBucket | null
}) {
  const cat = CATEGORIES.find((c) => c.key === detail.category)
  const latestRes = detail.resolutions[detail.resolutions.length - 1] ?? null
  const reporterText =
    detail.transcript?.trim() ||
    detail.description?.trim() ||
    (detail.audio_url ? "Voice note attached — transcript pending." : null)

  const isStaleNew = listItem?.bucket === "stale_new"
  const isSlaBreached = listItem?.bucket === "sla_breached"

  return (
    <article className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      {/* Action bar ---------------------------------------------------- */}
      <header
        className={`px-4 py-3 border-b ${
          isSlaBreached
            ? "bg-amber-50 border-amber-200"
            : isStaleNew
              ? "bg-slate-50 border-slate-200"
              : "bg-slate-50 border-slate-200"
        }`}
      >
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[12.5px] font-medium text-slate-900">
                {detail.id}
              </span>
              <StatusBadge status={detail.status} />
              {isSlaBreached && (
                <span className="inline-flex items-center text-[10.5px] text-orange-700/90">
                  · {formatAge(listItem.age_hours)} past 48h
                </span>
              )}
              {listItem?.resubmitted && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-orange-50 text-orange-800 text-[10px] font-semibold uppercase tracking-wide border border-orange-200">
                  <RotateCcw className="h-3 w-3" />
                  Resubmitted
                </span>
              )}
            </div>
            <p className="mt-1 text-[12px] text-slate-600">
              {detail.status === "awaiting_ho"
                ? `Awaiting HO since ${formatRelative(latestRes?.resolved_at ?? detail.reported_at)} · Attempt ${Math.max(detail.resolutions.length, 1)}`
                : isStaleNew
                  ? `Manager hasn't acknowledged · ${formatAge(listItem?.age_hours ?? 0)} since reported`
                  : `Reported ${formatRelative(detail.reported_at)}`}
            </p>
          </div>

          {detail.status === "awaiting_ho" ? (
            <div className="flex items-center gap-2 flex-wrap">
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
              <button
                type="button"
                onClick={onReturnRequested}
                disabled={busy !== null}
                className="inline-flex items-center gap-1.5 rounded-md border border-orange-200 bg-white hover:bg-orange-50 text-orange-700 text-[12.5px] font-medium px-3 py-1.5 disabled:opacity-60"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Return
              </button>
              <button
                type="button"
                onClick={onVoidRequested}
                disabled={busy !== null}
                title="Void"
                className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 disabled:opacity-60"
              >
                <Ban className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : isStaleNew ? (
            <div className="flex items-center gap-2 text-[12px] text-slate-600">
              <Bell className="h-3.5 w-3.5" />
              <span>Waiting on manager to acknowledge</span>
            </div>
          ) : null}
        </div>
        {error && (
          <p className="mt-2 text-[12px] text-orange-700 bg-orange-50 border border-orange-200 rounded-md px-2 py-1.5">
            {error}
          </p>
        )}
      </header>

      {/* Body ---------------------------------------------------------- */}
      <div className="p-4 space-y-4">
        {/* Category + store + jump-to-full-detail */}
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
            href={`/ho/reports/${detail.id}?from=action`}
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
            sub={formatDateTime(detail.incident_datetime)}
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
              {isStaleNew && (
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Manager hasn&apos;t opened the report
                </p>
              )}
            </div>
          )}
        </div>

        {/* Reporter strip */}
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
            <div className="text-slate-900">{formatDateTime(detail.reported_at)}</div>
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
                ? formatDateTime(detail.acknowledged_at)
                : "—"}
            </div>
            {detail.acknowledged_at && (
              <div className="text-[11px] text-slate-500 mt-0.5">
                {formatRelative(detail.acknowledged_at)}
              </div>
            )}
          </div>
        </div>

        {/* Returns thread — only the rejection_reason notes */}
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

        <p className="text-[11px] text-slate-500">
          Signed in as{" "}
          <span className="font-medium text-slate-700">{viewer.display_name}</span>
          . Decisions are recorded in the audit trail.
        </p>
      </div>
    </article>
  )
}

/* ----------------------------- Bits & pieces ------------------------------ */

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

function FilterChip({
  active,
  onClick,
  children,
  tone = "indigo",
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  tone?: "indigo" | "orange"
}) {
  const activeCls =
    tone === "orange"
      ? "bg-orange-700 border-orange-700 text-white"
      : "bg-indigo-700 border-indigo-700 text-white"
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 h-7 text-[11.5px] rounded-full border transition-colors ${
        active
          ? activeCls
          : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  )
}

function StatusBadge({ status }: { status: ActionListItem["status"] }) {
  const cfg: Record<ActionListItem["status"], { label: string; cls: string }> = {
    new: {
      label: "New",
      cls: "bg-slate-50 text-slate-700 border-slate-200",
    },
    in_progress: {
      label: "Ack'd",
      cls: "bg-indigo-50 text-indigo-700 border-indigo-200",
    },
    awaiting_ho: {
      label: "Awaiting HO",
      cls: "bg-sky-50 text-sky-700 border-sky-200",
    },
    returned: {
      label: "Returned",
      cls: "bg-orange-50 text-orange-700 border-orange-200",
    },
    closed: {
      label: "Closed",
      cls: "bg-teal-50 text-teal-700 border-teal-200",
    },
    voided: {
      label: "Voided",
      cls: "bg-slate-100 text-slate-700 border-slate-300",
    },
  }
  const c = cfg[status]
  return (
    <span
      className={`inline-flex items-center px-1.5 h-5 rounded text-[10px] font-bold uppercase tracking-wide border ${c.cls}`}
    >
      {c.label}
    </span>
  )
}

function EmptyState() {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-16 text-center">
      <Inbox className="h-10 w-10 text-slate-300 mx-auto" />
      <h2 className="mt-4 font-display text-lg font-semibold text-slate-800">
        Inbox zero
      </h2>
      <p className="mt-1 text-[13px] text-slate-500">
        No items currently require Head Office attention.
      </p>
    </div>
  )
}

/* ----------------------------- Reason modal ------------------------------- */

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

/* ----------------------------- Helpers ------------------------------------ */

function categoryLabel(key: string): string {
  return CATEGORIES.find((c) => c.key === key)?.label ?? key
}

function formatAge(hours: number): string {
  if (hours < 1) return `${Math.max(0, Math.round(hours * 60))}m`
  if (hours < 48) return `${Math.round(hours)}h`
  return `${Math.round(hours / 24)}d`
}

function formatRelative(iso: string | null): string {
  if (!iso) return "—"
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return "—"
  const diff = Math.max(0, Date.now() - t)
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 48) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
  })
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-IN", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    })
  } catch {
    return iso
  }
}
