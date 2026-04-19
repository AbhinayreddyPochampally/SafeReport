"use client"

import { ArrowLeft, CheckCircle2, Mic, Pencil } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { CATEGORIES } from "@/lib/categories"
import {
  clearDraft,
  getDraftBlobs,
  readDraft,
  readProfile,
  type ReporterProfile,
  type ReportDraft,
} from "@/lib/reporter-state"
import { submitReport } from "@/lib/report-submit"

/**
 * Screen 6 — Review + submit.
 *
 * Pulls the draft + per-tab blobs together, shows a compact summary card,
 * and POSTs to /api/reports. On success the draft is cleared and we hop to
 * the confirmation page. On failure we surface the server's error verbatim
 * and let the user try again without losing any evidence.
 */

function humanTime(iso: string | undefined): string {
  if (!iso) return ""
  try {
    const d = new Date(iso)
    return d.toLocaleString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    })
  } catch {
    return ""
  }
}

export default function ReviewPage({
  params,
}: {
  params: { sap_code: string }
}) {
  const router = useRouter()
  const [checked, setChecked] = useState(false)
  const [profile, setProfile] = useState<ReporterProfile | null>(null)
  const [draft, setDraft] = useState<ReportDraft | null>(null)
  const [photo, setPhoto] = useState<Blob | null>(null)
  const [audio, setAudio] = useState<Blob | null>(null)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ---- Hydrate + guard ---------------------------------------------------
  useEffect(() => {
    const p = readProfile()
    if (!p) {
      router.replace(`/r/${params.sap_code}`)
      return
    }
    const d = readDraft()
    if (!d || d.sap_code !== params.sap_code) {
      router.replace(`/r/${params.sap_code}/category`)
      return
    }
    if (!d.category) {
      router.replace(`/r/${params.sap_code}/category`)
      return
    }
    if (!d.event_at) {
      router.replace(`/r/${params.sap_code}/when`)
      return
    }

    const blobs = getDraftBlobs(d.draftId)
    if (!blobs.photo) {
      // Photo is required and the in-tab store is empty (user reopened the
      // tab or navigated here directly). Send them back to re-capture.
      router.replace(`/r/${params.sap_code}/evidence`)
      return
    }
    if (!blobs.audio && !d.description_text) {
      router.replace(`/r/${params.sap_code}/evidence`)
      return
    }

    setProfile(p)
    setDraft(d)
    setPhoto(blobs.photo)
    setAudio(blobs.audio ?? null)
    setPhotoUrl(URL.createObjectURL(blobs.photo))
    if (blobs.audio) setAudioUrl(URL.createObjectURL(blobs.audio))
    setChecked(true)
  }, [params.sap_code, router])

  // Release object URLs on unmount.
  useEffect(() => {
    return () => {
      if (photoUrl) URL.revokeObjectURL(photoUrl)
      if (audioUrl) URL.revokeObjectURL(audioUrl)
    }
  }, [photoUrl, audioUrl])

  const category = useMemo(
    () => CATEGORIES.find((c) => c.key === draft?.category) ?? null,
    [draft],
  )
  const tone: "slate" | "amber" =
    category?.kind === "incident" ? "amber" : "slate"

  async function onSubmit() {
    if (!draft || !profile || !photo || !draft.category || !draft.event_at) return
    setSubmitting(true)
    setError(null)
    try {
      const result = await submitReport({
        sap_code: draft.sap_code,
        category: draft.category,
        event_at: draft.event_at,
        reporter_name: profile.name,
        reporter_phone: profile.phone,
        photo,
        audio: audio ?? null,
        description: draft.description_text ?? null,
      })
      // Draft is in the can — wipe local state before navigating so that a
      // back-button hit from the confirmation screen can't re-submit.
      clearDraft()
      router.replace(`/r/${params.sap_code}/confirm/${result.id}`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Submit failed."
      setError(msg)
      setSubmitting(false)
    }
  }

  if (!checked || !draft || !profile || !category) {
    return <main className="min-h-screen bg-slate-50" aria-hidden />
  }

  const CategoryIcon = category.icon
  const audioDurationLabel = audio ? approxAudioLabel(audio) : null

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col px-6 py-8">
      <div className="flex items-center justify-between text-slate-700">
        <Link
          href={`/r/${params.sap_code}/evidence`}
          className="inline-flex items-center gap-1 text-[13px] font-medium text-slate-700 hover:text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.8} aria-hidden />
          Back
        </Link>
        <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
          Review
        </span>
      </div>

      <h1 className="mt-6 font-display text-[28px] font-bold leading-9 text-slate-900">
        One last check.
      </h1>
      <p className="mt-1 text-[13px] leading-5 text-slate-600">
        If anything&rsquo;s off, tap the edit link next to it.
      </p>

      {/* Summary card */}
      <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {/* Photo */}
        <div className="relative">
          {photoUrl && (
            // Using a plain <img> so we don't force next/image remote config.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoUrl}
              alt="Captured evidence"
              className="block aspect-[4/3] w-full object-cover"
            />
          )}
          <Link
            href={`/r/${params.sap_code}/evidence`}
            className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-full bg-white/90 px-3 py-1 text-[11px] font-medium text-slate-700 shadow backdrop-blur hover:bg-white"
          >
            <Pencil className="h-3 w-3" strokeWidth={1.8} aria-hidden /> Edit
          </Link>
        </div>

        {/* Category */}
        <Row
          label="Category"
          editHref={`/r/${params.sap_code}/category`}
          body={
            <span
              className={`inline-flex items-center gap-2 text-[14px] font-medium ${
                tone === "slate" ? "text-slate-700" : "text-amber-700"
              }`}
            >
              <CategoryIcon
                className="h-4 w-4"
                strokeWidth={1.8}
                aria-hidden
              />
              {category.label}
              {category.acronym ? (
                <span className="text-slate-400">· {category.acronym}</span>
              ) : null}
            </span>
          }
        />

        <Row
          label="When"
          editHref={`/r/${params.sap_code}/when`}
          body={
            <span className="text-[14px] text-slate-700">
              {humanTime(draft.event_at)}
            </span>
          }
        />

        <Row
          label="What you added"
          editHref={`/r/${params.sap_code}/evidence`}
          body={
            <div className="space-y-1 text-[13px] text-slate-700">
              {audio && (
                <div className="inline-flex items-center gap-2">
                  <Mic className="h-4 w-4" strokeWidth={1.8} aria-hidden />
                  Voice note{audioDurationLabel ? ` · ${audioDurationLabel}` : ""}
                </div>
              )}
              {draft.description_text && (
                <p className="line-clamp-3 text-[13px] leading-5 text-slate-700">
                  &ldquo;{draft.description_text}&rdquo;
                </p>
              )}
              {audioUrl && (
                <audio
                  src={audioUrl}
                  controls
                  className="mt-2 w-full"
                  preload="metadata"
                />
              )}
            </div>
          }
        />

        <Row
          label="You"
          editHref={`/r/${params.sap_code}`}
          body={
            <div className="text-[13px] text-slate-700">
              <p>{profile.name}</p>
              <p className="text-slate-500">{profile.phone}</p>
            </div>
          }
          isLast
        />
      </section>

      <p className="mt-3 text-center text-[11px] uppercase tracking-wide text-slate-400">
        Your name &amp; number go only to Head Office
      </p>

      {error && (
        <div
          role="alert"
          className="mt-4 rounded-xl border border-amber-700/30 bg-amber-50 px-4 py-3 text-[13px] leading-5 text-amber-900"
        >
          {error}
        </div>
      )}

      <div className="mt-auto pt-8">
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting}
          className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-indigo-700 px-6 text-[15px] font-medium text-white transition hover:bg-indigo-900 focus:outline-none focus:ring-4 focus:ring-indigo-500/40 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? (
            <>
              <span
                className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
                aria-hidden
              />
              Submitting…
            </>
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4" strokeWidth={1.8} aria-hidden />
              Submit report
            </>
          )}
        </button>
      </div>
    </main>
  )
}

// ---- Summary-card row helper ---------------------------------------------

function Row({
  label,
  body,
  editHref,
  isLast,
}: {
  label: string
  body: React.ReactNode
  editHref: string
  isLast?: boolean
}) {
  return (
    <div
      className={`flex items-start justify-between gap-3 px-4 py-3 ${
        isLast ? "" : "border-b border-slate-100"
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">
          {label}
        </p>
        <div className="min-w-0">{body}</div>
      </div>
      <Link
        href={editHref}
        className="shrink-0 text-[12px] font-medium text-indigo-700 hover:text-indigo-900"
      >
        Edit
      </Link>
    </div>
  )
}

// A duration isn't tracked by the recorder component so we estimate from the
// blob size + a conservative bitrate. Good enough for a "· 12s" affordance.
function approxAudioLabel(blob: Blob): string | null {
  // 32 kbps Opus is roughly what Chrome / Safari MediaRecorder defaults to.
  const kbps = 32
  const seconds = Math.max(1, Math.round((blob.size * 8) / (kbps * 1000)))
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${s.toString().padStart(2, "0")}s`
}
