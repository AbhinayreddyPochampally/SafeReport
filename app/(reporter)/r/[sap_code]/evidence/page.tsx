"use client"

import { ArrowLeft, ArrowRight } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { PhotoCapture } from "@/components/photo-capture"
import { VoiceRecorder } from "@/components/voice-recorder"
import { CATEGORIES } from "@/lib/categories"
import {
  getDraftBlobs,
  readDraft,
  readProfile,
  setDraftAudio,
  setDraftPhoto,
  writeDraft,
} from "@/lib/reporter-state"

/**
 * Screen 5 — Evidence.
 *
 * One screen, three inputs, one submit rule:
 *   photo (required) + (voice OR text)
 *
 * The page loads the current category off the draft so that the
 * photo-capture tile picks up the right accent tone (slate for observation,
 * amber for incident), and guards against landing here without a draft /
 * profile by bouncing backwards.
 */

const TEXT_MIN = 20
const TEXT_MAX = 500

export default function EvidencePage({
  params,
}: {
  params: { sap_code: string }
}) {
  const router = useRouter()
  const [checked, setChecked] = useState(false)
  const [tone, setTone] = useState<"slate" | "amber">("slate")
  const [categoryLabel, setCategoryLabel] = useState("")

  const [photo, setPhoto] = useState<Blob | null>(null)
  const [audio, setAudio] = useState<Blob | null>(null)
  const [text, setText] = useState("")

  // ---- Hydration guards --------------------------------------------------
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

    // Wire the photo-capture tone to the reporter's chosen category.
    const cat = CATEGORIES.find((c) => c.key === draft.category)
    if (cat) {
      setTone(cat.kind === "observation" ? "slate" : "amber")
      setCategoryLabel(cat.label)
    }

    // Re-hydrate any evidence captured earlier in this tab so a back-forward
    // jump doesn't erase progress.
    const blobs = getDraftBlobs(draft.draftId)
    if (blobs.photo) setPhoto(blobs.photo)
    if (blobs.audio) setAudio(blobs.audio)
    if (typeof draft.description_text === "string") setText(draft.description_text)

    setChecked(true)
  }, [params.sap_code, router])

  // ---- Persist evidence as it's captured --------------------------------
  useEffect(() => {
    const d = readDraft()
    if (!d) return
    if (photo) setDraftPhoto(d.draftId, photo)
  }, [photo])

  useEffect(() => {
    const d = readDraft()
    if (!d) return
    if (audio) setDraftAudio(d.draftId, audio)
  }, [audio])

  // ---- Submit rule -------------------------------------------------------
  const textTrimmed = text.trim()
  const textValid = textTrimmed.length >= TEXT_MIN && textTrimmed.length <= TEXT_MAX
  const hasVoiceOrText = Boolean(audio) || textValid
  const canContinue = Boolean(photo) && hasVoiceOrText

  const missingCopy = useMemo(() => {
    if (!photo && !hasVoiceOrText) {
      return "Take a photo and add either a voice note or a short description."
    }
    if (!photo) return "A photo is required."
    if (!hasVoiceOrText) {
      return `Add a voice note or type at least ${TEXT_MIN} characters.`
    }
    return null
  }, [photo, hasVoiceOrText])

  function onContinue() {
    if (!canContinue) return
    // Persist the text (photo/audio blobs are already in the per-tab store).
    writeDraft({
      sap_code: params.sap_code,
      description_text: textValid ? textTrimmed : undefined,
    })
    router.push(`/r/${params.sap_code}/review`)
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
          Back
        </Link>
        <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
          Step 4 of 4
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
        Show us what happened.
      </h1>
      <p className="mt-1 text-[13px] leading-5 text-slate-600">
        A photo plus either a voice note or a short description.
      </p>

      {/* Photo — required */}
      <section className="mt-6">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-600">
          Photo
        </p>
        <PhotoCapture value={photo} onChange={setPhoto} tone={tone} />
      </section>

      {/* Voice note — optional */}
      <section className="mt-5">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-600">
          Voice note <span className="font-normal normal-case text-slate-400">· optional</span>
        </p>
        <VoiceRecorder value={audio} onChange={setAudio} />
      </section>

      {/* Text fallback — optional */}
      <section className="mt-5">
        <label
          htmlFor="sr-description"
          className="mb-2 block text-[11px] font-bold uppercase tracking-wide text-slate-600"
        >
          Or type a short description{" "}
          <span className="font-normal normal-case text-slate-400">· optional</span>
        </label>
        <textarea
          id="sr-description"
          rows={4}
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, TEXT_MAX))}
          placeholder="What did you see or what happened?"
          className="block w-full rounded-xl border border-slate-200 bg-white p-3 text-[14px] leading-5 text-slate-900 outline-none focus:ring-4 focus:ring-indigo-500/40"
        />
        <div className="mt-1 flex justify-between text-[11px] text-slate-500">
          <span>
            {textTrimmed.length > 0 && !textValid
              ? `At least ${TEXT_MIN} characters`
              : "Use this if you can't record audio"}
          </span>
          <span>
            {textTrimmed.length} / {TEXT_MAX}
          </span>
        </div>
      </section>

      <div className="mt-auto pt-8">
        <button
          type="button"
          onClick={onContinue}
          disabled={!canContinue}
          className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-indigo-700 px-6 text-[15px] font-medium text-white transition hover:bg-indigo-900 focus:outline-none focus:ring-4 focus:ring-indigo-500/40 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Continue
          <ArrowRight className="h-4 w-4" strokeWidth={1.8} aria-hidden />
        </button>
        {missingCopy && (
          <p className="mt-2 text-center text-[12px] text-slate-500">
            {missingCopy}
          </p>
        )}
        <p className="mt-3 text-center text-[11px] uppercase tracking-wide text-slate-400">
          Anonymous to store manager
        </p>
      </div>
    </main>
  )
}
