"use client"

import { CheckCircle2, Mic, Pencil } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { ReporterScreenHeader } from "@/components/reporter-chrome"
import {
  clearDraft,
  getDraftBlobs,
  readDraft,
  readProfile,
  type ReporterProfile,
  type ReportDraft,
} from "@/lib/reporter-state"
import { submitReport } from "@/lib/report-submit"
import { bcp47, t, useReporterLocale, type Locale } from "@/lib/reporter-i18n"

/**
 * Screen 6 — Review + submit.
 *
 * Pulls the draft + per-tab blobs together, shows a compact summary card,
 * and POSTs to /api/reports. On success the draft is cleared and we hop to
 * the confirmation page. On failure we surface the server's error verbatim
 * and let the user try again without losing any evidence.
 */

function humanTime(iso: string | undefined, locale: Locale): string {
  if (!iso) return ""
  try {
    const d = new Date(iso)
    return d.toLocaleString(bcp47(locale), {
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
  const locale = useReporterLocale()
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
      // Phase 4 facelift: profile is now collected at /identity, not on the
      // landing. Send the reporter there if they reach /review without a
      // profile (typical for a brand-new draft).
      router.replace(`/r/${params.sap_code}/identity`)
      return
    }
    const d = readDraft()
    if (!d || d.sap_code !== params.sap_code) {
      router.replace(`/r/${params.sap_code}/photo`)
      return
    }

    const blobs = getDraftBlobs(d.draftId)
    if (!blobs.photo) {
      // Photo is required and the in-tab store is empty (user reopened the
      // tab or navigated here directly). Phase 3 facelift sends them to
      // the dedicated /photo screen rather than the legacy /evidence.
      router.replace(`/r/${params.sap_code}/photo`)
      return
    }
    if (!blobs.audio && !d.description_text) {
      // Voice OR text required (Phase 3). Send to /describe.
      router.replace(`/r/${params.sap_code}/describe`)
      return
    }
    if (!d.event_at) {
      // Mig 007 follow-up: /when is now after /describe.
      router.replace(`/r/${params.sap_code}/when`)
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

  async function onSubmit() {
    if (!draft || !profile || !photo || !draft.event_at) return
    setSubmitting(true)
    setError(null)
    try {
      const result = await submitReport({
        sap_code: draft.sap_code,
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

  if (!checked || !draft || !profile) {
    return <main className="min-h-screen bg-slate-50" aria-hidden />
  }

  const audioDurationLabel = audio ? approxAudioLabel(audio) : null

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col px-5 py-7">
      <ReporterScreenHeader
        sap_code={params.sap_code}
        backHref={`/r/${params.sap_code}/identity`}
        step={5}
      />

      <h1 className="mt-5 font-display text-[22px] font-bold leading-tight text-slate-900">
        {t(locale, "review.title")}
      </h1>
      <p className="mt-1 text-[13px] leading-5 text-slate-600">
        {t(locale, "review.lede")}
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
            href={`/r/${params.sap_code}/photo`}
            className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-full bg-white/90 px-3 py-1 text-[11px] font-medium text-slate-700 shadow backdrop-blur hover:bg-white"
          >
            <Pencil className="h-3 w-3" strokeWidth={1.8} aria-hidden /> {t(locale, "common.edit")}
          </Link>
        </div>

        {/* Mig 007: no Category row. The reporter never picks a
            category in the flow; HO confirms it on the report-detail
            page post-submission. Surfacing a "category will be set
            by HO" line here adds noise without telling the reporter
            anything actionable. */}
        <Row
          label={t(locale, "review.row.when")}
          editLabel={t(locale, "common.edit")}
          editHref={`/r/${params.sap_code}/when`}
          body={
            <span className="text-[14px] text-slate-700">
              {humanTime(draft.event_at, locale)}
            </span>
          }
        />

        <Row
          label={t(locale, "review.row.added")}
          editLabel={t(locale, "common.edit")}
          editHref={`/r/${params.sap_code}/describe`}
          body={
            <div className="space-y-1 text-[13px] text-slate-700">
              {audio && (
                <div className="inline-flex items-center gap-2">
                  <Mic className="h-4 w-4" strokeWidth={1.8} aria-hidden />
                  {t(locale, "review.row.voicenote")}
                  {audioDurationLabel ? ` · ${audioDurationLabel}` : ""}
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
          label={t(locale, "review.row.you")}
          editLabel={t(locale, "common.edit")}
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
        {t(locale, "review.privacy")}
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
              {t(locale, "review.submitting")}
            </>
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4" strokeWidth={1.8} aria-hidden />
              {t(locale, "review.submit")}
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
  editLabel,
  isLast,
}: {
  label: string
  body: React.ReactNode
  editHref: string
  editLabel: string
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
        {editLabel}
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
