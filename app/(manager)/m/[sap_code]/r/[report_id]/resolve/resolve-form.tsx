"use client"

import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  Trash2,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { CATEGORIES } from "@/lib/categories"

/**
 * Manager resolution form.
 *
 * Captures two things:
 *   - A proof photo (REQUIRED — we don't accept text-only resolutions;
 *     CLAUDE.md DESIGN.md makes photo proof mandatory so HO can verify)
 *   - A note describing what was done, 20–500 chars
 *
 * On submit: POSTs multipart to /api/resolutions. Server auto-increments
 * attempt_number, uploads the photo, inserts the row, and flips the
 * report's status to 'awaiting_ho'. On success we route back to the
 * inbox with a success toast via a sessionStorage hand-off.
 *
 * For returned reports we render the HO's feedback from the latest
 * prior attempt inline at the top of the screen so the manager can see
 * exactly what needs to change.
 */

const NOTE_MIN = 20
const NOTE_MAX = 500
const MAX_BLOB_BYTES = 10 * 1024 * 1024

type Store = {
  sap_code: string
  name: string
  brand: string
  city: string
}

type ResolvableReport = {
  id: string
  type: "observation" | "incident"
  category: string
  status: "new" | "in_progress" | "returned"
  description: string | null
  transcript: string | null
  photo_url: string
  audio_url: string | null
}

type PriorResolution = {
  id: string
  attempt_number: number
  note: string
  photo_url: string
  resolved_at: string
}

export function ResolveForm({
  store,
  report,
  priorAttempts,
}: {
  store: Store
  report: ResolvableReport
  priorAttempts: PriorResolution[]
}) {
  const router = useRouter()
  const [note, setNote] = useState("")
  const [photo, setPhoto] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const photoInputRef = useRef<HTMLInputElement | null>(null)

  const cat = CATEGORIES.find((c) => c.key === report.category)
  const attemptNumber = priorAttempts.length + 1
  const isRework = report.status === "returned"
  const trimmedLen = note.trim().length
  const canSubmit =
    !busy &&
    photo !== null &&
    trimmedLen >= NOTE_MIN &&
    trimmedLen <= NOTE_MAX

  // Preview URL lifecycle — always revoke the old object URL to keep the
  // in-memory blob table tidy.
  useEffect(() => {
    if (!photo) {
      setPhotoPreview(null)
      return
    }
    const url = URL.createObjectURL(photo)
    setPhotoPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [photo])

  function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    if (f.size > MAX_BLOB_BYTES) {
      setError("Proof photo must be 10 MB or smaller.")
      e.target.value = ""
      return
    }
    if (!f.type.startsWith("image/")) {
      setError("Proof photo must be an image.")
      e.target.value = ""
      return
    }
    setError(null)
    setPhoto(f)
  }

  function clearPhoto() {
    setPhoto(null)
    if (photoInputRef.current) photoInputRef.current.value = ""
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit || !photo) return
    setBusy(true)
    setError(null)
    try {
      const form = new FormData()
      form.append("report_id", report.id)
      form.append("note", note.trim())
      form.append("photo", photo)

      const res = await fetch("/api/resolutions", {
        method: "POST",
        body: form,
      })
      const body = (await res.json().catch(() => null)) as
        | {
            ok?: boolean
            status?: string
            attempt_number?: number
            warning?: string
            error?: string
          }
        | null

      if (res.status === 401) {
        router.replace(`/m/${store.sap_code}`)
        return
      }
      if (!res.ok || !body?.ok) {
        throw new Error(body?.error || `HTTP ${res.status}`)
      }

      // Stash a one-shot success flag so the inbox can flash a toast.
      try {
        sessionStorage.setItem(
          "sr_mgr_toast",
          JSON.stringify({
            kind: "resolution_sent",
            report_id: report.id,
            attempt: body.attempt_number ?? attemptNumber,
            warning: body.warning ?? null,
          }),
        )
      } catch {
        /* sessionStorage unavailable — no-op */
      }

      router.replace(`/m/${store.sap_code}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't submit.")
      setBusy(false)
    }
  }

  const latestPrior = priorAttempts[priorAttempts.length - 1] ?? null
  const tone: "slate" | "amber" = report.type === "incident" ? "amber" : "slate"
  const snippet =
    report.transcript?.trim() ||
    report.description?.trim() ||
    (report.audio_url ? "Voice note attached — transcript pending." : "")

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col px-6 pb-10 pt-5">
      <Link
        href={`/m/${store.sap_code}/r/${report.id}`}
        className="inline-flex w-fit items-center gap-1 text-[13px] font-medium text-slate-700 hover:text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={1.8} aria-hidden />
        Back to report
      </Link>

      <div className="mt-5">
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
          {store.brand} · {store.city} · {report.id}
        </p>
        <h1 className="mt-1 font-display text-[22px] font-bold leading-7 text-slate-900">
          {isRework ? "Re-file resolution" : "File resolution"}
        </h1>
        <p className="mt-1 text-[13px] leading-5 text-slate-600">
          Attempt #{attemptNumber}
          {isRework ? " · Head Office asked for re-work" : ""}.
        </p>
      </div>

      {/* What the reporter said — kept compact so the form remains in focus */}
      <section
        className="mt-4 rounded-2xl border border-slate-200 bg-white p-3"
        aria-label="Original report summary"
      >
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
              tone === "slate"
                ? "border-slate-200 bg-slate-50 text-slate-700"
                : "border-amber-200 bg-amber-50 text-amber-800"
            }`}
          >
            {cat?.label ?? report.category}
            {cat?.acronym ? ` · ${cat.acronym}` : ""}
          </span>
        </div>
        {snippet && (
          <p className="mt-2 line-clamp-3 text-[13px] leading-5 text-slate-600">
            “{snippet}”
          </p>
        )}
      </section>

      {/* HO pushback — only for returned reports */}
      {isRework && latestPrior && (
        <section
          className="mt-4 rounded-2xl border border-orange-200 bg-orange-50 p-3"
          aria-label="Head Office feedback"
        >
          <div className="flex items-center gap-2">
            <RefreshCw
              className="h-3.5 w-3.5 text-orange-700"
              strokeWidth={1.8}
              aria-hidden
            />
            <p className="text-[11px] font-bold uppercase tracking-wide text-orange-700">
              Your last attempt was returned
            </p>
          </div>
          <p className="mt-2 whitespace-pre-wrap text-[13px] leading-5 text-orange-900">
            {latestPrior.note}
          </p>
          <p className="mt-1.5 text-[11px] text-orange-700/80">
            Attempt {latestPrior.attempt_number} · filed{" "}
            {formatRelative(latestPrior.resolved_at)}
          </p>
        </section>
      )}

      <form onSubmit={submit} className="mt-5 flex flex-col gap-5">
        {/* Proof photo */}
        <div>
          <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
            Proof photo <span className="text-orange-700">required</span>
          </label>
          <p className="mt-1 text-[12px] leading-4 text-slate-500">
            Show the fix in place — a photo of the guard reinstalled, the
            spill cleaned, the barrier up, etc.
          </p>

          {photoPreview ? (
            <div className="mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
              <div className="relative aspect-[4/3] w-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photoPreview}
                  alt="Proof of fix"
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  onClick={clearPhoto}
                  className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-slate-900/75 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-sm hover:bg-slate-900 focus:outline-none focus:ring-4 focus:ring-indigo-500/40"
                >
                  <Trash2 className="h-3 w-3" strokeWidth={1.8} aria-hidden />
                  Replace
                </button>
              </div>
            </div>
          ) : (
            <label
              htmlFor="resolve-photo"
              className="mt-2 flex aspect-[4/3] w-full cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-white text-slate-500 transition hover:border-indigo-500 hover:text-indigo-700 focus-within:border-indigo-500 focus-within:text-indigo-700"
            >
              <Camera className="h-9 w-9" strokeWidth={1.6} aria-hidden />
              <span className="mt-2 text-[13px] font-medium">
                Tap to take a photo
              </span>
              <span className="mt-0.5 text-[11px] text-slate-400">
                JPEG or PNG · up to 10 MB
              </span>
            </label>
          )}
          <input
            ref={photoInputRef}
            id="resolve-photo"
            type="file"
            accept="image/*"
            capture="environment"
            onChange={onPickPhoto}
            className="sr-only"
          />
        </div>

        {/* Note */}
        <div>
          <label
            htmlFor="resolve-note"
            className="text-[11px] font-bold uppercase tracking-wide text-slate-500"
          >
            What did you do to fix it?
          </label>
          <p className="mt-1 text-[12px] leading-4 text-slate-500">
            {NOTE_MIN}–{NOTE_MAX} characters. Mention the action taken, who
            did it, and any follow-ups still pending.
          </p>
          <textarea
            id="resolve-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={6}
            maxLength={NOTE_MAX + 100 /* soft tolerance; server enforces */}
            placeholder="e.g. Reinstalled the machine guard that was missing, toolbox-talked the morning shift about LOTO, and added a weekly check to the store opening checklist."
            className="mt-2 w-full resize-y rounded-2xl border border-slate-200 bg-white p-3 text-[14px] leading-6 text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/30"
          />
          <div className="mt-1 flex items-center justify-between text-[11px]">
            <span
              className={
                trimmedLen > 0 && trimmedLen < NOTE_MIN
                  ? "text-orange-700"
                  : "text-slate-400"
              }
            >
              {trimmedLen < NOTE_MIN
                ? `${NOTE_MIN - trimmedLen} more characters needed`
                : "Looks good"}
            </span>
            <span
              className={
                trimmedLen > NOTE_MAX ? "text-orange-700" : "text-slate-400"
              }
            >
              {trimmedLen}/{NOTE_MAX}
            </span>
          </div>
        </div>

        {/* Prior attempts list (short, mostly for reference) */}
        {priorAttempts.length > 0 && (
          <details className="rounded-2xl border border-slate-200 bg-white">
            <summary className="cursor-pointer list-none px-4 py-3 text-[12px] font-medium text-slate-700 focus:outline-none focus:ring-4 focus:ring-indigo-500/40">
              <span className="inline-flex items-center gap-2">
                <ImageIcon className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden />
                Your {priorAttempts.length} prior attempt
                {priorAttempts.length === 1 ? "" : "s"}
              </span>
            </summary>
            <ul className="divide-y divide-slate-100 px-4 pb-3 text-[12px] leading-5 text-slate-600">
              {priorAttempts.map((p) => (
                <li key={p.id} className="py-2.5">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    Attempt {p.attempt_number} ·{" "}
                    {formatRelative(p.resolved_at)}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap">{p.note}</p>
                </li>
              ))}
            </ul>
          </details>
        )}

        {error && (
          <p
            role="alert"
            className="rounded-md bg-orange-100 px-3 py-2 text-[12px] font-medium text-orange-700"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-700 px-4 py-3 text-[15px] font-semibold text-white transition hover:bg-indigo-900 focus:outline-none focus:ring-4 focus:ring-indigo-500/40 disabled:bg-slate-300 disabled:text-slate-500"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
          ) : (
            <CheckCircle2 className="h-4 w-4" strokeWidth={2} />
          )}
          {busy ? "Submitting…" : "Send to Head Office"}
        </button>
        <p className="text-center text-[11px] text-slate-400">
          Sends the report to HO for approval. You&apos;ll hear back when
          they approve, return, or void it.
        </p>
      </form>
    </main>
  )
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
