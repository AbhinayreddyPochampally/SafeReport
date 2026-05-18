"use client"

import { ArrowRight } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { PhotoCapture } from "@/components/photo-capture"
import { ReporterScreenHeader } from "@/components/reporter-chrome"
import {
  getDraftBlobs,
  readDraft,
  setDraftPhoto,
  writeDraft,
} from "@/lib/reporter-state"
import { t, useReporterLocale } from "@/lib/reporter-i18n"

/**
 * Screen 1 (post-landing) — Photo.
 *
 * One screen, one purpose: capture a photo of the incident or observation.
 * Photo is required to continue. Voice + text live on the next screen
 * (/describe). Time-of-event moves to /when after /describe.
 *
 * The old single /evidence screen combined photo + voice + text into one
 * dense view that overwhelmed first-time reporters. Splitting it gives
 * each input its own breathing room.
 *
 * Migration 007:
 *  - No category set yet — the reporter never picks one. The accent
 *    tone is slate by default (no observation/incident split is known
 *    until HO confirms the AI category later).
 *  - /when was re-ordered to after /describe so the reporter narrates
 *    the incident first, then recalls the time. /photo no longer
 *    guards on event_at — it's the entry screen after the landing.
 */
export default function PhotoPage({
  params,
}: {
  params: { sap_code: string }
}) {
  const router = useRouter()
  const locale = useReporterLocale()
  const [checked, setChecked] = useState(false)
  const [photo, setPhoto] = useState<Blob | null>(null)

  useEffect(() => {
    // /photo is the entry step after the landing. We initialise a
    // fresh draft if one isn't already in this tab's sessionStorage
    // (a reporter who lands here directly via a bookmark gets a clean
    // draft rather than a redirect loop).
    const draft = readDraft()
    if (draft && draft.sap_code === params.sap_code) {
      const blobs = getDraftBlobs(draft.draftId)
      if (blobs.photo) setPhoto(blobs.photo)
    } else {
      // Seed a draft so /photo onChange has somewhere to stash the
      // photo blob. writeDraft accepts a sap_code-only patch and
      // returns the new draft.
      writeDraft({ sap_code: params.sap_code })
    }
    setChecked(true)
  }, [params.sap_code, router])

  useEffect(() => {
    const d = readDraft()
    if (!d) return
    if (photo) setDraftPhoto(d.draftId, photo)
  }, [photo])

  const canContinue = Boolean(photo)

  function onContinue() {
    if (!canContinue) return
    router.push(`/r/${params.sap_code}/describe`)
  }

  if (!checked) {
    return <main className="min-h-screen bg-slate-50" aria-hidden />
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col px-5 py-7">
      <ReporterScreenHeader
        sap_code={params.sap_code}
        backHref={`/r/${params.sap_code}`}
        step={1}
      />

      <h1 className="mt-5 font-display text-[22px] font-bold leading-tight text-slate-900">
        Add a photo
      </h1>
      {/* Mockup-verbatim sub copy per reporter_flow_v14 — replaces the
          drift "understand what you saw" with the mockup's "understand
          the issue". */}
      <p className="mt-1 text-[13px] leading-5 text-slate-600">
        A clear picture helps the safety team understand the issue.
      </p>

      <section className="mt-6">
        <PhotoCapture value={photo} onChange={setPhoto} tone="slate" />
      </section>

      <p className="mt-3 text-[12px] text-slate-500">
        Required — your report needs at least one photo.
      </p>

      <div className="mt-auto pt-8">
        <button
          type="button"
          onClick={onContinue}
          disabled={!canContinue}
          className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-indigo-700 px-6 text-[15px] font-medium text-white transition hover:bg-indigo-900 focus:outline-none focus:ring-4 focus:ring-indigo-500/40 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t(locale, "common.continue")}
          <ArrowRight className="h-4 w-4" strokeWidth={1.8} aria-hidden />
        </button>
        <p className="mt-3 text-center text-[11px] uppercase tracking-wide text-slate-400">
          {t(locale, "common.anonymous_footer")}
        </p>
      </div>
    </main>
  )
}
