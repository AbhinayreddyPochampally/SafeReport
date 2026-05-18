"use client"

import { ArrowRight } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { PhotoCapture } from "@/components/photo-capture"
import { ReporterScreenHeader } from "@/components/reporter-chrome"
import { CATEGORIES, labelFor } from "@/lib/categories"
import {
  getDraftBlobs,
  readDraft,
  setDraftPhoto,
} from "@/lib/reporter-state"
import { t, useReporterLocale } from "@/lib/reporter-i18n"

/**
 * Screen 6 (Phase 3 facelift) — Photo.
 *
 * One screen, one purpose: capture a photo of the incident or observation.
 * Photo is required to continue. Voice + text live on the next screen
 * (/describe).
 *
 * The old single /evidence screen combined photo + voice + text into one
 * dense view that overwhelmed first-time reporters. Splitting it gives
 * each input its own breathing room.
 */
export default function PhotoPage({
  params,
}: {
  params: { sap_code: string }
}) {
  const router = useRouter()
  const locale = useReporterLocale()
  const [checked, setChecked] = useState(false)
  const [tone, setTone] = useState<"slate" | "amber">("slate")
  const [categoryKey, setCategoryKey] = useState("")
  const [photo, setPhoto] = useState<Blob | null>(null)

  useEffect(() => {
    // Phase 10: profile no longer gating; collected at /identity.
    const draft = readDraft()
    if (!draft || draft.sap_code !== params.sap_code) {
      router.replace(`/r/${params.sap_code}/category`)
      return
    }
    if (!draft.category) {
      router.replace(`/r/${params.sap_code}/category`)
      return
    }
    if (!draft.event_at) {
      router.replace(`/r/${params.sap_code}/when`)
      return
    }
    const cat = CATEGORIES.find((c) => c.key === draft.category)
    if (cat) {
      setTone(cat.kind === "observation" ? "slate" : "amber")
      setCategoryKey(cat.key)
    }
    const blobs = getDraftBlobs(draft.draftId)
    if (blobs.photo) setPhoto(blobs.photo)
    setChecked(true)
  }, [params.sap_code, router])

  useEffect(() => {
    const d = readDraft()
    if (!d) return
    if (photo) setDraftPhoto(d.draftId, photo)
  }, [photo])

  const canContinue = Boolean(photo)

  const categoryLabel = useMemo(() => {
    const cat = CATEGORIES.find((c) => c.key === categoryKey)
    return cat ? labelFor(cat, locale) : ""
  }, [categoryKey, locale])

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
        backHref={`/r/${params.sap_code}/when`}
        step={4}
      />

      {categoryLabel && (
        <p
          className={`mt-5 text-[11px] font-bold uppercase tracking-wide ${
            tone === "slate" ? "text-slate-600" : "text-amber-700"
          }`}
        >
          {categoryLabel}
        </p>
      )}
      <h1 className="mt-1 font-display text-[22px] font-bold leading-tight text-slate-900">
        Add a photo
      </h1>
      {/* Mockup-verbatim sub copy per reporter_flow_v14 — replaces the
          drift "understand what you saw" with the mockup's "understand
          the issue". */}
      <p className="mt-1 text-[13px] leading-5 text-slate-600">
        A clear picture helps the safety team understand the issue.
      </p>

      <section className="mt-6">
        <PhotoCapture value={photo} onChange={setPhoto} tone={tone} />
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
