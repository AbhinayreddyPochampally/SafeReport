"use client"

import { ArrowRight, Mic } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { ReporterScreenHeader } from "@/components/reporter-chrome"
import { VoiceRecorder, type VoiceRecorderStatus } from "@/components/voice-recorder"
import { CATEGORIES, labelFor } from "@/lib/categories"
import {
  getDraftBlobs,
  readDraft,
  setDraftAudio,
  writeDraft,
} from "@/lib/reporter-state"
import { t, useReporterLocale } from "@/lib/reporter-i18n"

/**
 * Screen 7 (Phase 3 facelift) — Describe.
 *
 * Voice is the primary affordance per docs/DESIGN.md. Text fallback is
 * available for reporters who can't speak right now (silent stockroom,
 * shy, hearing-impaired etc.). ONE OF the two is mandatory — voice OR
 * text — but not both required. Voice if recorded counts; otherwise text
 * must hit the 20-char minimum.
 *
 * UI mode:
 *  - 'voice' (default) — big mic recorder + small "Can't speak right
 *    now? Type a description instead" link
 *  - 'text' — large textarea + small "Back to voice" link
 *
 * Per CLAUDE.md the mandatory either-or rule is the Phase 3 design
 * change. Previous /evidence screen treated both as optional with photo
 * required.
 */

const TEXT_MIN = 20
const TEXT_MAX = 500

export default function DescribePage({
  params,
}: {
  params: { sap_code: string }
}) {
  const router = useRouter()
  const locale = useReporterLocale()
  const [checked, setChecked] = useState(false)
  const [tone, setTone] = useState<"slate" | "amber">("slate")
  const [categoryKey, setCategoryKey] = useState("")
  const [mode, setMode] = useState<"voice" | "text">("voice")
  const [audio, setAudio] = useState<Blob | null>(null)
  const [text, setText] = useState("")
  // Tracks the VoiceRecorder's internal status so the sub-copy below the
  // heading can switch to "Recording — tap to stop." while the reporter
  // is actively capturing — per reporter_flow_v14 line 1805.
  const [recStatus, setRecStatus] = useState<VoiceRecorderStatus>("idle")

  useEffect(() => {
    // Phase 10: profile is collected at /identity AFTER describe. So we no
    // longer guard on profile here.
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
    // Guard against landing here without a photo — photo is the prior step.
    const blobs = getDraftBlobs(draft.draftId)
    if (!blobs.photo) {
      router.replace(`/r/${params.sap_code}/photo`)
      return
    }

    const cat = CATEGORIES.find((c) => c.key === draft.category)
    if (cat) {
      setTone(cat.kind === "observation" ? "slate" : "amber")
      setCategoryKey(cat.key)
    }
    if (blobs.audio) {
      setAudio(blobs.audio)
      setMode("voice")
    } else if (typeof draft.description_text === "string" && draft.description_text.length > 0) {
      setText(draft.description_text)
      setMode("text")
    }
    setChecked(true)
  }, [params.sap_code, router])

  useEffect(() => {
    const d = readDraft()
    if (!d) return
    if (audio) setDraftAudio(d.draftId, audio)
  }, [audio])

  const textTrimmed = text.trim()
  const textValid = textTrimmed.length >= TEXT_MIN && textTrimmed.length <= TEXT_MAX
  const canContinue = Boolean(audio) || textValid

  const categoryLabel = useMemo(() => {
    const cat = CATEGORIES.find((c) => c.key === categoryKey)
    return cat ? labelFor(cat, locale) : ""
  }, [categoryKey, locale])

  function onContinue() {
    if (!canContinue) return
    writeDraft({
      sap_code: params.sap_code,
      description_text: textValid ? textTrimmed : undefined,
    })
    router.push(`/r/${params.sap_code}/identity`)
  }

  if (!checked) {
    return <main className="min-h-screen bg-slate-50" aria-hidden />
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col px-5 py-7">
      <ReporterScreenHeader
        sap_code={params.sap_code}
        backHref={`/r/${params.sap_code}/photo`}
        step={5}
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
        {mode === "voice" ? "Tell us what happened" : "Type a description"}
      </h1>
      {/* Sub copy has three states in voice mode (idle / counting / recording)
          plus the text-mode variant. The "Recording — tap to stop." line is
          the mockup spec for the active-capture state — without it the
          screen gives no copy-level signal that the mic is hot. */}
      <p className="mt-1 text-[13px] leading-5 text-slate-600">
        {mode === "text"
          ? "In any language. We'll translate it for the safety team."
          : recStatus === "recording"
            ? "Recording — tap to stop."
            : recStatus === "counting"
              ? "Get ready — recording starts in a moment."
              : "Speak in any language — we'll translate it for the safety team."}
      </p>

      {mode === "voice" ? (
        <>
          {/* Stone-100 plate as documented in docs/VISUAL_LANGUAGE.md (bg-warm) */}
          <section className="mt-6 rounded-2xl border border-stone-200 bg-stone-100 p-6">
            <VoiceRecorder
              value={audio}
              onChange={setAudio}
              onStatusChange={setRecStatus}
            />
          </section>
          <button
            type="button"
            onClick={() => setMode("text")}
            className="mt-4 self-center text-center text-[13px] text-slate-600 underline-offset-2 hover:text-indigo-700 hover:underline"
          >
            Can&apos;t speak right now?{" "}
            <span className="font-medium text-indigo-700">Type a description instead</span>
          </button>
        </>
      ) : (
        <>
          <section className="mt-6">
            <label htmlFor="sr-description" className="sr-only">
              Description
            </label>
            <textarea
              id="sr-description"
              rows={8}
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, TEXT_MAX))}
              placeholder="What happened? You can write in English, Kannada, Hindi, Telugu…"
              className="block w-full rounded-xl border border-slate-300 bg-white p-3.5 text-[14px] leading-6 text-slate-900 outline-none focus:ring-4 focus:ring-indigo-500/40"
            />
            <div className="mt-1 flex justify-between text-[11px] text-slate-500">
              <span>
                {textTrimmed.length > 0 && !textValid
                  ? `At least ${TEXT_MIN} characters`
                  : `${TEXT_MIN}-${TEXT_MAX} characters`}
              </span>
              <span>
                {textTrimmed.length} / {TEXT_MAX}
              </span>
            </div>
          </section>
          <button
            type="button"
            onClick={() => setMode("voice")}
            className="mt-4 inline-flex items-center justify-center gap-1.5 self-center text-center text-[13px] text-slate-600 underline-offset-2 hover:text-indigo-700 hover:underline"
          >
            <Mic className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden />
            Back to voice
          </button>
        </>
      )}

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
        {!canContinue && (
          <p className="mt-2 text-center text-[12px] text-slate-500">
            Record a voice note or type a description to continue.
          </p>
        )}
        <p className="mt-3 text-center text-[11px] uppercase tracking-wide text-slate-400">
          {t(locale, "common.anonymous_footer")}
        </p>
      </div>
    </main>
  )
}
