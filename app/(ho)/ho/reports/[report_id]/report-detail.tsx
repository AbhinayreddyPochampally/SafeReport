"use client"

import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  Check,
  Gauge,
  Image as ImageIcon,
  Loader2,
  Mic,
  Pause,
  Play,
  Phone,
  RotateCcw,
  User,
  X,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react"
import { CATEGORIES } from "@/lib/categories"

/**
 * HO-side report detail. Structurally mirrors the manager view so the codebase
 * stays coherent (same audio player, same lightbox pattern, same status badge
 * styling), but with three differences:
 *
 *  1. Reporter identity (name + phone) is rendered in the Context block. HO
 *     is the only audience that ever sees these fields.
 *  2. The resolution history includes any HO-return comments threaded between
 *     attempts — so HO sees exactly what they asked the manager to rework.
 *  3. The bottom action bar swaps the manager's Acknowledge / Resolve CTA for
 *     Approve / Return / Void, with modals gating the two destructive flows.
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
  status:
    | "new"
    | "in_progress"
    | "awaiting_ho"
    | "returned"
    | "closed"
    | "voided"
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
}

type Resolution = {
  id: string
  attempt_number: number
  note: string
  photo_url: string | null
  resolved_at: string
}

type HoActionEntry = {
  id: string
  action: "approve" | "return" | "void"
  rejection_reason: string | null
  acted_at: string
  actor_display_name: string | null
}

type Viewer = { display_name: string }

export function HoReportDetail({
  store,
  report: initialReport,
  resolutions,
  history,
  viewer,
}: {
  store: Store
  report: Report
  resolutions: Resolution[]
  history: HoActionEntry[]
  viewer: Viewer
}) {
  const router = useRouter()
  const [report, setReport] = useState<Report>(initialReport)
  const [busy, setBusy] = useState<null | "approve" | "return" | "void">(null)
  const [error, setError] = useState<string | null>(null)
  const [photoOpen, setPhotoOpen] = useState<string | null>(null)
  const [returnOpen, setReturnOpen] = useState(false)
  const [voidOpen, setVoidOpen] = useState(false)

  const cat = CATEGORIES.find((c) => c.key === report.category)
  const tone: "slate" | "amber" = report.type === "incident" ? "amber" : "slate"

  async function submitAction(
    action: "approve" | "return" | "void",
    comment?: string,
  ) {
    setBusy(action)
    setError(null)
    try {
      const res = await fetch("/api/ho-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          report_id: report.id,
          action,
          comment: comment ?? undefined,
        }),
      })
      const body = (await res.json().catch(() => null)) as {
        ok?: boolean
        status?: Report["status"]
        error?: string
      } | null

      if (res.status === 401) {
        router.replace(
          `/ho/login?next=${encodeURIComponent(`/ho/reports/${report.id}`)}`,
        )
        return
      }
      if (!res.ok || !body?.ok) {
        throw new Error(body?.error || `HTTP ${res.status}`)
      }

      setReport((prev) => ({ ...prev, status: body.status ?? prev.status }))
      setReturnOpen(false)
      setVoidOpen(false)
      // Pull fresh history + latest-attempt metadata.
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't complete that.")
    } finally {
      setBusy(null)
    }
  }

  // Build a threaded timeline: resolutions interleaved with HO return actions,
  // in chronological order. Approve / void history rows are *not* interleaved
  // above the bar — they're only relevant in the outcome, and the status badge
  // already reflects that outcome.
  const thread = buildThread(resolutions, history)

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <Link
        href="/ho"
        className="inline-flex items-center gap-1 text-sm font-medium text-slate-700 hover:text-indigo-700"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to overview
      </Link>

      {/* Header */}
      <div className="mt-5">
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
          {store.brand} · {store.name} · {store.city} ·{" "}
          <span className="font-mono">{store.sap_code}</span>
        </p>
        <div className="mt-1 flex items-center gap-2">
          <StatusBadge status={report.status} />
          <span className="text-xs text-slate-400">{report.id}</span>
        </div>
        <h1
          className={`mt-2 font-display text-2xl font-bold leading-8 ${
            tone === "slate" ? "text-slate-900" : "text-amber-900"
          }`}
        >
          {cat?.label ?? report.category}
          {cat?.acronym ? (
            <span className="ml-1 text-base font-semibold text-slate-400">
              ({cat.acronym})
            </span>
          ) : null}
        </h1>
        {cat?.blurb ? (
          <p className="mt-1 text-sm leading-5 text-slate-600">{cat.blurb}</p>
        ) : null}
      </div>

      {/* Two-column on desktop: evidence on the left, context on the right. */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Evidence column */}
        <div className="lg:col-span-3 space-y-4">
          <section aria-label="Evidence photo">
            <button
              type="button"
              onClick={() => setPhotoOpen(report.photo_url)}
              className="group relative block w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100 focus:outline-none focus:ring-4 focus:ring-indigo-500/40"
              aria-label="Expand photo"
            >
              <div className="relative aspect-[4/3] w-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={report.photo_url}
                  alt="Reported scene"
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
                <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-slate-900/70 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
                  <ImageIcon className="h-3 w-3" aria-hidden />
                  Tap to expand
                </span>
              </div>
            </button>
          </section>

          {report.audio_url ? (
            <section aria-label="Voice note">
              <AudioPlayer url={report.audio_url} />
            </section>
          ) : null}

          {/* Transcript / description */}
          <section aria-label="What the reporter said">
            <h2 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
              <Mic className="h-3 w-3" aria-hidden />
              {report.transcript ? "Transcript (English)" : "Reporter note"}
            </h2>
            <div className="mt-2 rounded-xl border border-stone-200 bg-stone-100 p-4">
              {report.transcript ? (
                <p className="whitespace-pre-wrap text-sm leading-6 text-slate-800">
                  {report.transcript}
                </p>
              ) : report.description ? (
                <p className="whitespace-pre-wrap text-sm leading-6 text-slate-800">
                  {report.description}
                </p>
              ) : report.audio_url ? (
                <p className="text-sm italic leading-5 text-slate-500">
                  Transcript is still being prepared.
                </p>
              ) : (
                <p className="text-sm italic leading-5 text-slate-500">
                  No description was added.
                </p>
              )}
              {report.transcript_error ? (
                <p className="mt-2 text-xs text-orange-700">
                  Transcript couldn&apos;t be generated automatically. Voice
                  note is still available above.
                </p>
              ) : null}
            </div>
          </section>
        </div>

        {/* Context column */}
        <div className="lg:col-span-2 space-y-4">
          <section aria-label="Context" className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <h2 className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-500 border-b border-slate-100 bg-slate-50">
              Context
            </h2>
            <dl className="divide-y divide-slate-100">
              <Row label="When it happened" value={formatDateTime(report.incident_datetime)} />
              <Row label="Filed" value={formatRelative(report.reported_at)} />
              {report.acknowledged_at ? (
                <Row
                  label="Manager acknowledged"
                  value={formatRelative(report.acknowledged_at)}
                />
              ) : null}
            </dl>
          </section>

          {/* Reporter identity — HO only */}
          <section
            aria-label="Reporter identity"
            className="rounded-xl border border-sky-200 bg-sky-50/60 overflow-hidden"
          >
            <h2 className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-sky-800 border-b border-sky-100 bg-sky-50 flex items-center gap-1.5">
              <User className="h-3 w-3" aria-hidden />
              Reporter
            </h2>
            <div className="px-4 py-3 space-y-1">
              <p className="text-sm font-medium text-slate-900">
                {report.reporter_name ?? "—"}
              </p>
              {report.reporter_phone ? (
                <a
                  href={`tel:${report.reporter_phone}`}
                  className="inline-flex items-center gap-1.5 text-sm text-sky-800 hover:text-sky-900"
                >
                  <Phone className="h-3.5 w-3.5" aria-hidden />
                  {report.reporter_phone}
                </a>
              ) : null}
              <p className="text-[11px] text-sky-700 pt-1">
                Visible only to Head Office. Do not share with store staff.
              </p>
            </div>
          </section>
        </div>
      </div>

      {/* Resolution thread */}
      <section className="mt-8" aria-label="Resolution thread">
        <h2 className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2">
          Resolution thread
        </h2>
        {thread.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-500 text-center">
            No resolution has been filed yet.
          </p>
        ) : (
          <ol className="space-y-3">
            {thread.map((entry) => {
              if (entry.kind === "resolution") {
                return (
                  <li
                    key={`res-${entry.id}`}
                    className="rounded-xl border border-slate-200 bg-white p-4"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                        Manager · Attempt {entry.attempt_number}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {formatRelative(entry.at)}
                      </p>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-slate-800">
                      {entry.note}
                    </p>
                    {entry.photo_url ? (
                      <button
                        type="button"
                        onClick={() => setPhotoOpen(entry.photo_url!)}
                        className="mt-2 inline-flex items-center gap-1.5 text-xs text-indigo-700 hover:text-indigo-900"
                      >
                        <ImageIcon className="h-3.5 w-3.5" aria-hidden />
                        View proof photo
                      </button>
                    ) : null}
                  </li>
                )
              }
              // HO return entry
              return (
                <li
                  key={`ret-${entry.id}`}
                  className="rounded-xl border border-orange-200 bg-orange-50 p-4"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-orange-700 inline-flex items-center gap-1.5">
                      <RotateCcw className="h-3 w-3" aria-hidden />
                      HO returned for rework
                    </p>
                    <p className="text-[11px] text-orange-600">
                      {formatRelative(entry.at)}
                    </p>
                  </div>
                  <p className="mt-1 text-sm leading-5 text-orange-900 whitespace-pre-wrap">
                    {entry.comment ?? "(No comment.)"}
                  </p>
                  {entry.actor_display_name ? (
                    <p className="mt-1 text-[11px] text-orange-700">
                      — {entry.actor_display_name}
                    </p>
                  ) : null}
                </li>
              )
            })}
          </ol>
        )}
      </section>

      {/* Action bar (sticky bottom on mobile, inline on desktop) */}
      <section className="mt-8 rounded-xl border border-slate-200 bg-white p-4">
        {report.status === "awaiting_ho" ? (
          <>
            <p className="text-sm text-slate-700 mb-3">
              Signed in as{" "}
              <span className="font-medium text-slate-900">
                {viewer.display_name}
              </span>
              . Your decision is recorded in the audit trail.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => submitAction("approve")}
                disabled={busy !== null}
                className="inline-flex items-center gap-2 rounded-md bg-teal-700 hover:bg-teal-800 active:bg-teal-900 text-white font-medium px-4 py-2 text-sm disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                {busy === "approve" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Approve &amp; close
              </button>
              <button
                type="button"
                onClick={() => setReturnOpen(true)}
                disabled={busy !== null}
                className="inline-flex items-center gap-2 rounded-md bg-orange-700 hover:bg-orange-800 active:bg-orange-900 text-white font-medium px-4 py-2 text-sm disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                <RotateCcw className="h-4 w-4" />
                Return for rework
              </button>
              <button
                type="button"
                onClick={() => setVoidOpen(true)}
                disabled={busy !== null}
                className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-medium px-4 py-2 text-sm disabled:opacity-60 transition-colors ml-auto"
              >
                <Ban className="h-4 w-4" />
                Void
              </button>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-700">
                This report is currently{" "}
                <span className="font-medium text-slate-900">
                  {humanStatus(report.status)}
                </span>
                .
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {report.status === "new" || report.status === "in_progress"
                  ? "Waiting on the store manager to file a resolution."
                  : report.status === "closed"
                    ? "Nothing more to do — the report has been approved and closed."
                    : report.status === "returned"
                      ? "Waiting on the store manager to rework and resubmit."
                      : report.status === "voided"
                        ? "This report was voided. It remains on record for audit only."
                        : ""}
              </p>
            </div>
            {report.status !== "voided" && report.status !== "closed" ? (
              <button
                type="button"
                onClick={() => setVoidOpen(true)}
                disabled={busy !== null}
                className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-medium px-3 py-1.5 text-sm disabled:opacity-60 transition-colors"
              >
                <Ban className="h-4 w-4" />
                Void
              </button>
            ) : null}
          </div>
        )}
        {error ? (
          <p
            role="alert"
            className="mt-3 rounded-md bg-orange-50 border border-orange-200 px-3 py-2 text-sm text-orange-700"
          >
            {error}
          </p>
        ) : null}
      </section>

      {returnOpen ? (
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
      ) : null}

      {voidOpen ? (
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
      ) : null}

      {photoOpen ? (
        <PhotoLightbox url={photoOpen} onClose={() => setPhotoOpen(null)} />
      ) : null}
    </div>
  )
}

/* ----------------------------- Thread builder ---------------------------- */

type ThreadEntry =
  | {
      kind: "resolution"
      id: string
      attempt_number: number
      note: string
      photo_url: string | null
      at: string
    }
  | {
      kind: "return"
      id: string
      comment: string | null
      actor_display_name: string | null
      at: string
    }

function buildThread(
  resolutions: Resolution[],
  history: HoActionEntry[],
): ThreadEntry[] {
  const items: ThreadEntry[] = []
  for (const r of resolutions) {
    items.push({
      kind: "resolution",
      id: r.id,
      attempt_number: r.attempt_number,
      note: r.note,
      photo_url: r.photo_url,
      at: r.resolved_at,
    })
  }
  for (const h of history) {
    if (h.action !== "return") continue
    items.push({
      kind: "return",
      id: h.id,
      comment: h.rejection_reason,
      actor_display_name: h.actor_display_name,
      at: h.acted_at,
    })
  }
  items.sort((a, b) => a.at.localeCompare(b.at))
  return items
}

/* ------------------------------ Reason modal ----------------------------- */

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

  function handle(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (tooShort || tooLong || busy) return
    onSubmit(trimmed)
  }

  const btn =
    submitTone === "orange"
      ? "bg-orange-700 hover:bg-orange-800 active:bg-orange-900"
      : "bg-slate-900 hover:bg-slate-950"

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reason-modal-title"
    >
      <form
        onSubmit={handle}
        className="bg-white rounded-xl shadow-lg border border-slate-200 w-full max-w-lg p-6"
      >
        <div className="flex items-start gap-3">
          {warning ? (
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-700 ring-1 ring-orange-100">
              <AlertTriangle className="h-5 w-5" aria-hidden />
            </span>
          ) : null}
          <div className="min-w-0 flex-1">
            <h3
              id="reason-modal-title"
              className="text-base font-semibold text-slate-900"
            >
              {title}
            </h3>
            <p className="mt-1 text-sm text-slate-600">{description}</p>
          </div>
        </div>

        <label
          htmlFor="reason-input"
          className="block mt-4 text-sm font-medium text-slate-800"
        >
          Reason
        </label>
        <textarea
          id="reason-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={4}
          className="mt-1.5 w-full rounded-md border border-slate-300 text-sm text-slate-900 placeholder-slate-400 p-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          placeholder={
            maxLen !== undefined
              ? `Between ${minLen} and ${maxLen} characters.`
              : `At least ${minLen} characters.`
          }
          disabled={busy}
          autoFocus
        />
        <div className="mt-1 flex justify-between text-xs">
          <span
            className={
              tooShort || tooLong ? "text-orange-700" : "text-slate-500"
            }
          >
            {trimmed.length}
            {maxLen !== undefined ? ` / ${maxLen}` : ""}
            {tooShort
              ? ` — need ${minLen - trimmed.length} more`
              : tooLong
                ? ` — ${trimmed.length - maxLen!} too many`
                : ""}
          </span>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-md disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={tooShort || tooLong || busy}
            className={`inline-flex items-center gap-2 rounded-md text-white font-medium px-4 py-2 text-sm disabled:opacity-60 disabled:cursor-not-allowed transition-colors ${btn}`}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {submitLabel}
          </button>
        </div>
      </form>
    </div>
  )
}

/* -------------------------- Audio player + helpers ----------------------- */
// Unchanged from the manager-side version.

function AudioPlayer({ url }: { url: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [rate, setRate] = useState<1 | 1.5>(1)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    a.playbackRate = rate
  }, [rate])

  const onLoaded = useCallback(() => {
    const a = audioRef.current
    if (a && Number.isFinite(a.duration)) setDuration(a.duration)
  }, [])
  const onTime = useCallback(() => {
    const a = audioRef.current
    if (a) setCurrent(a.currentTime)
  }, [])
  const onEnded = useCallback(() => setPlaying(false), [])
  const onPlay = useCallback(() => setPlaying(true), [])
  const onPause = useCallback(() => setPlaying(false), [])
  const onErr = useCallback(() => setError("Couldn't load the voice note."), [])

  async function toggle() {
    const a = audioRef.current
    if (!a) return
    if (a.paused) {
      try {
        await a.play()
      } catch {
        setError("Couldn't start playback.")
      }
    } else {
      a.pause()
    }
  }

  const pct = duration > 0 ? Math.min(100, (current / duration) * 100) : 0

  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Pause voice note" : "Play voice note"}
        className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-indigo-700 text-white transition hover:bg-indigo-900 focus:outline-none focus:ring-4 focus:ring-indigo-500/40"
      >
        {playing ? (
          <Pause className="h-5 w-5" />
        ) : (
          <Play className="h-5 w-5" />
        )}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1">
            <Mic className="h-3 w-3" aria-hidden /> Voice note
          </span>
          <span className="tabular-nums">
            {formatDuration(current)} / {formatDuration(duration)}
          </span>
        </div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full bg-indigo-700 transition-[width] duration-150"
            style={{ width: `${pct}%` }}
          />
        </div>
        {error ? (
          <p className="mt-1 text-[11px] text-orange-700" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <button
        type="button"
        onClick={() => setRate(rate === 1 ? 1.5 : 1)}
        aria-label={`Playback speed ${rate}×. Tap to toggle.`}
        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:border-indigo-500 hover:text-indigo-700"
      >
        <Gauge className="h-3.5 w-3.5" aria-hidden />
        {rate}×
      </button>

      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        onLoadedMetadata={onLoaded}
        onDurationChange={onLoaded}
        onTimeUpdate={onTime}
        onEnded={onEnded}
        onPlay={onPlay}
        onPause={onPause}
        onError={onErr}
        className="hidden"
      />
    </div>
  )
}

function PhotoLightbox({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/95 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Reported photo"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close photo"
        className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-slate-900 shadow-md hover:bg-white"
      >
        <X className="h-5 w-5" />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt="Reported scene — expanded"
        className="max-h-full max-w-full rounded-xl object-contain"
      />
    </div>
  )
}

function StatusBadge({ status }: { status: Report["status"] }) {
  const map: Record<Report["status"], { label: string; classes: string }> = {
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
    voided: {
      label: "Voided",
      classes: "border-slate-300 bg-slate-100 text-slate-700",
    },
  }
  const m = map[status]
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${m.classes}`}
    >
      {m.label}
    </span>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-800">{value}</dd>
    </div>
  )
}

function humanStatus(s: Report["status"]): string {
  switch (s) {
    case "new":
      return "new"
    case "in_progress":
      return "acknowledged by the store manager"
    case "awaiting_ho":
      return "awaiting your decision"
    case "returned":
      return "returned to the store manager"
    case "closed":
      return "closed"
    case "voided":
      return "voided"
  }
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleString("en-IN", {
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

function formatRelative(iso: string): string {
  try {
    const t = new Date(iso).getTime()
    const diff = Math.max(0, Date.now() - t)
    const s = Math.floor(diff / 1000)
    if (s < 60) return `${s}s ago`
    const m = Math.floor(s / 60)
    if (m < 60) return `${m}m ago`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h ago`
    const d = Math.floor(h / 24)
    if (d < 7) return `${d}d ago`
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
    })
  } catch {
    return iso
  }
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00"
  const s = Math.floor(seconds)
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${r.toString().padStart(2, "0")}`
}
