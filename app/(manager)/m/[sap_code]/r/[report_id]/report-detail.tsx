"use client"

import {
  ArrowLeft,
  Check,
  ChevronRight,
  Gauge,
  Image as ImageIcon,
  Loader2,
  Mic,
  Pause,
  Play,
  X,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import { CATEGORIES } from "@/lib/categories"

/**
 * Manager-side detail view for one report.
 *
 * What's on screen:
 *   - Header with store + SR id + back link
 *   - Status badge
 *   - Evidence: photo hero (tap to expand full-screen), audio player
 *     (1× / 1.5× toggle)
 *   - Transcript / description in a Stone-100 card (transcript preferred;
 *     falls back to description; shows "transcript pending" otherwise)
 *   - Context: category, incident time, filed time, acknowledged time
 *     — NO reporter name, NO phone. Those columns never come down the
 *     wire in the first place (see page.tsx + /api/reports/[id]).
 *   - Prior resolutions panel (only shown when attempts exist)
 *   - Action bar at the bottom:
 *       new           → Acknowledge (flips to in_progress)
 *       in_progress   → Resolve (→ /m/.../r/.../resolve, C4)
 *       returned      → Resolve again (with prior HO comment shown inline)
 *       awaiting_ho   → read-only, "Awaiting HO approval"
 *       closed        → read-only, "Closed"
 *
 * The resolve flow itself is Phase C4; this file renders the CTA and
 * links to the resolve sub-route (not yet implemented — C4).
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

export function ReportDetail({
  store,
  report: initialReport,
  resolutions,
}: {
  store: Store
  report: Report
  resolutions: Resolution[]
}) {
  const router = useRouter()
  const [report, setReport] = useState<Report>(initialReport)
  const [ackBusy, setAckBusy] = useState(false)
  const [ackError, setAckError] = useState<string | null>(null)
  const [photoOpen, setPhotoOpen] = useState(false)

  const cat = CATEGORIES.find((c) => c.key === report.category)
  const tone: "slate" | "amber" = report.type === "incident" ? "amber" : "slate"

  async function acknowledge() {
    setAckBusy(true)
    setAckError(null)
    try {
      const res = await fetch(`/api/reports/${report.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "acknowledge" }),
      })
      if (res.status === 401) {
        // Cookie gone — bounce to the store landing so the PIN keypad shows.
        router.replace(`/m/${store.sap_code}`)
        return
      }
      const body = (await res.json().catch(() => null)) as
        | { ok?: boolean; status?: string; acknowledged_at?: string; error?: string }
        | null
      if (!res.ok || !body?.ok) {
        throw new Error(body?.error || `HTTP ${res.status}`)
      }
      setReport((prev) => ({
        ...prev,
        status: (body.status as Report["status"]) ?? "in_progress",
        acknowledged_at: body.acknowledged_at ?? new Date().toISOString(),
      }))
    } catch (e) {
      setAckError(e instanceof Error ? e.message : "Couldn't acknowledge.")
    } finally {
      setAckBusy(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col px-6 pb-32 pt-5">
      <Link
        href={`/m/${store.sap_code}`}
        className="inline-flex w-fit items-center gap-1 text-[13px] font-medium text-slate-700 hover:text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={1.8} aria-hidden />
        Back to inbox
      </Link>

      {/* Header */}
      <div className="mt-5">
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
          {store.brand} · {store.city} · {store.sap_code}
        </p>
        <div className="mt-1 flex items-center gap-2">
          <StatusBadge status={report.status} />
          <span className="text-[12px] text-slate-400">{report.id}</span>
        </div>
        <h1
          className={`mt-2 font-display text-[22px] font-bold leading-7 ${
            tone === "slate" ? "text-slate-900" : "text-amber-900"
          }`}
        >
          {cat?.label ?? report.category}
          {cat?.acronym ? (
            <span className="ml-1 text-[14px] font-semibold text-slate-400">
              ({cat.acronym})
            </span>
          ) : null}
        </h1>
        {cat?.blurb && (
          <p className="mt-1 text-[13px] leading-5 text-slate-600">
            {cat.blurb}
          </p>
        )}
      </div>

      {/* Photo */}
      <section className="mt-5" aria-label="Evidence photo">
        <button
          type="button"
          onClick={() => setPhotoOpen(true)}
          className="group relative block w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 focus:outline-none focus:ring-4 focus:ring-indigo-500/40"
          aria-label="Expand photo"
        >
          {/* 4:3 box */}
          <div className="relative aspect-[4/3] w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={report.photo_url}
              alt="Reported scene"
              className="h-full w-full object-cover"
              loading="lazy"
            />
            <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-slate-900/70 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
              <ImageIcon className="h-3 w-3" strokeWidth={1.8} aria-hidden />
              Tap to expand
            </span>
          </div>
        </button>
      </section>

      {/* Audio */}
      {report.audio_url && (
        <section className="mt-4" aria-label="Voice note">
          <AudioPlayer url={report.audio_url} />
        </section>
      )}

      {/* Transcript / description */}
      <section className="mt-4" aria-label="What the reporter said">
        <h2 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
          <Mic className="h-3 w-3" strokeWidth={1.8} aria-hidden />
          {report.transcript ? "Transcript (English)" : "Reporter note"}
        </h2>
        <div className="mt-2 rounded-2xl border border-stone-200 bg-stone-100 p-4">
          {report.transcript ? (
            <p className="whitespace-pre-wrap text-[14px] leading-6 text-slate-800">
              {report.transcript}
            </p>
          ) : report.description ? (
            <p className="whitespace-pre-wrap text-[14px] leading-6 text-slate-800">
              {report.description}
            </p>
          ) : report.audio_url ? (
            <p className="text-[13px] italic leading-5 text-slate-500">
              Transcript is still being prepared. Play the voice note above
              — an English transcript will appear here shortly.
            </p>
          ) : (
            <p className="text-[13px] italic leading-5 text-slate-500">
              No description was added.
            </p>
          )}
          {report.transcript_error && (
            <p className="mt-2 text-[11px] text-orange-700">
              Transcript couldn&apos;t be generated automatically. Voice note is
              still available above.
            </p>
          )}
        </div>
      </section>

      {/* Context */}
      <section className="mt-4" aria-label="Context">
        <h2 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
          Context
        </h2>
        <dl className="mt-2 divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
          <Row label="When it happened" value={formatDateTime(report.incident_datetime)} />
          <Row label="Filed" value={formatRelative(report.reported_at)} />
          {report.acknowledged_at && (
            <Row
              label="You acknowledged"
              value={formatRelative(report.acknowledged_at)}
            />
          )}
        </dl>
        <p className="mt-2 text-[11px] leading-4 text-slate-400">
          Reporter identity is visible only to Head Office.
        </p>
      </section>

      {/* Prior resolutions */}
      {resolutions.length > 0 && (
        <section className="mt-5" aria-label="Prior resolution attempts">
          <h2 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
            Prior attempts ({resolutions.length})
          </h2>
          <ul className="mt-2 space-y-2">
            {resolutions.map((r) => (
              <li
                key={r.id}
                className="rounded-2xl border border-slate-200 bg-white p-3"
              >
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    Attempt {r.attempt_number}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {formatRelative(r.resolved_at)}
                  </p>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-[13px] leading-5 text-slate-700">
                  {r.note}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Acknowledge / resolve action bar */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white/95 px-6 py-3 backdrop-blur-sm">
        <div className="mx-auto max-w-xl">
          {report.status === "new" && (
            <>
              <button
                type="button"
                onClick={acknowledge}
                disabled={ackBusy}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-700 px-4 py-3 text-[15px] font-semibold text-white transition hover:bg-indigo-900 focus:outline-none focus:ring-4 focus:ring-indigo-500/40 disabled:bg-slate-300 disabled:text-slate-500"
              >
                {ackBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
                ) : (
                  <Check className="h-4 w-4" strokeWidth={2} />
                )}
                {ackBusy ? "Acknowledging…" : "Acknowledge report"}
              </button>
              {ackError && (
                <p role="alert" className="mt-2 text-center text-[12px] text-orange-700">
                  {ackError}
                </p>
              )}
              <p className="mt-1.5 text-center text-[11px] text-slate-400">
                Confirms you&apos;ve seen this and are working on it.
              </p>
            </>
          )}

          {(report.status === "in_progress" || report.status === "returned") && (
            <>
              <Link
                href={`/m/${store.sap_code}/r/${report.id}/resolve`}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-700 px-4 py-3 text-[15px] font-semibold text-white transition hover:bg-indigo-900 focus:outline-none focus:ring-4 focus:ring-indigo-500/40"
              >
                File resolution
                <ChevronRight className="h-4 w-4" strokeWidth={2} />
              </Link>
              <p className="mt-1.5 text-center text-[11px] text-slate-400">
                {report.status === "returned"
                  ? "HO sent this back — update your fix and re-submit."
                  : "Describe what you did and attach a proof photo."}
              </p>
            </>
          )}

          {report.status === "awaiting_ho" && (
            <div className="rounded-2xl bg-sky-50 px-4 py-3 text-center">
              <p className="text-[13px] font-medium text-sky-800">
                Awaiting Head Office approval
              </p>
              <p className="mt-0.5 text-[11px] text-sky-700">
                You&apos;ll be notified if HO approves, returns, or voids it.
              </p>
            </div>
          )}

          {report.status === "closed" && (
            <div className="rounded-2xl bg-teal-50 px-4 py-3 text-center">
              <p className="text-[13px] font-medium text-teal-800">
                Closed — nothing more to do.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Full-screen photo lightbox */}
      {photoOpen && (
        <PhotoLightbox url={report.photo_url} onClose={() => setPhotoOpen(false)} />
      )}
    </main>
  )
}

// ---- Audio player --------------------------------------------------------

/**
 * Minimal audio player with a 1× / 1.5× speed toggle — faster playback is
 * the one quality-of-life tweak the brief calls out explicitly.
 */
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
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3">
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Pause voice note" : "Play voice note"}
        className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-indigo-700 text-white transition hover:bg-indigo-900 focus:outline-none focus:ring-4 focus:ring-indigo-500/40"
      >
        {playing ? (
          <Pause className="h-5 w-5" strokeWidth={2} />
        ) : (
          <Play className="h-5 w-5" strokeWidth={2} />
        )}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1">
            <Mic className="h-3 w-3" strokeWidth={1.8} aria-hidden /> Voice note
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
        {error && (
          <p className="mt-1 text-[11px] text-orange-700" role="alert">
            {error}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={() => setRate(rate === 1 ? 1.5 : 1)}
        aria-label={`Playback speed ${rate}×. Tap to toggle.`}
        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12px] font-semibold text-slate-700 hover:border-indigo-500 hover:text-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-500/40"
      >
        <Gauge className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden />
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

// ---- Photo lightbox ------------------------------------------------------

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
      className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/95 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Reported photo"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close photo"
        className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-slate-900 shadow-md transition hover:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-500/40"
      >
        <X className="h-5 w-5" strokeWidth={2} />
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

// ---- Helpers --------------------------------------------------------------

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
    <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px]">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-800">{value}</dd>
    </div>
  )
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleString(undefined, {
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
    return new Date(iso).toLocaleDateString(undefined, {
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

