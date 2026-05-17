"use client"

import { ArrowLeft, ArrowRight } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { PhotoCapture } from "@/components/photo-capture"
import { CATEGORIES, labelFor } from "@/lib/categories"
import {
  getDraftBlobs,
  readDraft,
  readProfile,
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
    if (!readProfile()) {
      router.replace(`/r/${params.sap_code}`)
      return
    }
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
    <main className="mx-auto flex min-h-screen max-w-xl flex-col px-6 py-8">
      <div className="flex items-center justify-between text-slate-700">
        <Link
          href={`/r/${params.sap_code}/when`}
          className="inline-flex items-center gap-1 text-[13px] font-medium text-slate-700 hover:text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.8} aria-hidden />
          {t(locale, "common.back")}
        </Link>
        <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
          Step 4 of 6
        </span>
      </div>

      {categoryLabel && (
        <p
          className={`mt-6 text-[11px] font-bold uppercase tracking-wide ${
            tone === "slate" ? "text-slate-600" : "text-amber-700"
          }`}
        >
          {categoryLabel}
        </p>
      )}
      <h1 className="mt-1 font-display text-[28px] font-bold leading-9 text-slate-900">
        Add a photo
      </h1>
      <p className="mt-1 text-[13px] leading-5 text-slate-600">
        A clear picture helps the safety team understand what you saw.
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
