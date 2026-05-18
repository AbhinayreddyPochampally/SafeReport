"use client"

import {
  ArrowRight,
  ChevronRight,
  Globe,
  Lock,
  MessageSquareText,
  MessagesSquare,
  Mic,
  Pencil,
  ShieldCheck,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import type { ReactNode } from "react"
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
 * Screen 5 — Describe (voice or text).
 *
 * May 2026 mockup facelift: the previous rev showed an 8-language chip
 * plate + a stone-coloured recorder card. The new mockup leans on three
 * affordances:
 *   - "Any language is okay"           — globe glyph
 *   - "You can mix languages"          — chat-bubbles glyph
 *   - "No need for perfect English"    — shield-check glyph
 * plus a faded multi-script watermark sitting behind the whole screen,
 * a helper bar listing example languages, and a dedicated "Prefer typing?"
 * row instead of the small underlined link. The mic recorder itself
 * (VoiceRecorder) is reused as-is — it owns the idle / counting /
 * recording / ready / playing state machine. We only restyle the chrome.
 *
 * Either-or rule (voice OR text) preserved from the previous rev; photo
 * stays required and is captured on the prior /photo screen.
 */

const TEXT_MIN = 20
const TEXT_MAX = 500

/**
 * Decorative full-screen watermark of Indian-language scripts. Pure
 * presentation; sits behind everything else at low opacity. Anchors the
 * "speak in any language" promise visually before the reporter has read
 * a single word of copy.
 */
function ScriptWatermark() {
  type Tok = { c: string; x: number; y: number; s: number; o: number; f?: string }
  const tokens: Tok[] = [
    { c: "A", x: 80, y: 70, s: 36, o: 0.18 },
    { c: "अ", x: 200, y: 80, s: 36, o: 0.18, f: "'Noto Sans Devanagari'" },
    { c: "क", x: 285, y: 76, s: 36, o: 0.18, f: "'Noto Sans Devanagari'" },
    { c: "मराठी", x: 300, y: 130, s: 18, o: 0.2, f: "'Noto Sans Devanagari'" },
    { c: "ద", x: 235, y: 145, s: 28, o: 0.16, f: "'Noto Sans Telugu'" },
    { c: "తెలుగు", x: 215, y: 175, s: 16, o: 0.2, f: "'Noto Sans Telugu'" },
    { c: "ಕ", x: 70, y: 180, s: 26, o: 0.18, f: "'Noto Sans Kannada'" },
    { c: "ಕನ್ನಡ", x: 110, y: 235, s: 18, o: 0.2, f: "'Noto Sans Kannada'" },
    { c: "தமிழ்", x: 240, y: 220, s: 18, o: 0.2, f: "'Noto Sans Tamil'" },
    { c: "ಶ್", x: 40, y: 270, s: 30, o: 0.18, f: "'Noto Sans Kannada'" },
    { c: "क", x: 245, y: 280, s: 28, o: 0.16, f: "'Noto Sans Devanagari'" },
    { c: "ગુજરાતી", x: 270, y: 305, s: 18, o: 0.2, f: "'Noto Sans Gujarati'" },
    { c: "क", x: 22, y: 540, s: 30, o: 0.14, f: "'Noto Sans Devanagari'" },
    { c: "ગુ", x: 320, y: 740, s: 26, o: 0.18, f: "'Noto Sans Gujarati'" },
    { c: "మ", x: 345, y: 575, s: 22, o: 0.18, f: "'Noto Sans Telugu'" },
    { c: "త", x: 38, y: 622, s: 24, o: 0.14, f: "'Noto Sans Telugu'" },
    { c: "తెలుగు", x: 30, y: 760, s: 16, o: 0.2, f: "'Noto Sans Telugu'" },
    { c: "বাংলা", x: 285, y: 815, s: 18, o: 0.2, f: "'Noto Sans Bengali'" },
    { c: "“", x: 270, y: 200, s: 44, o: 0.22 },
    { c: "”", x: 90, y: 720, s: 44, o: 0.18 },
    { c: "“", x: 350, y: 690, s: 32, o: 0.18 },
    { c: "”", x: 18, y: 850, s: 32, o: 0.18 },
  ]
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
    >
      <svg
        viewBox="0 0 400 900"
        preserveAspectRatio="xMidYMid slice"
        className="h-full w-full"
      >
        {tokens.map((tok, i) => (
          <text
            key={i}
            x={tok.x}
            y={tok.y}
            fontSize={tok.s}
            fill="#312E81"
            opacity={tok.o}
            style={{
              fontFamily: tok.f
                ? `${tok.f}, 'DM Sans', sans-serif`
                : "'DM Sans', sans-serif",
              fontWeight: 600,
            }}
          >
            {tok.c}
          </text>
        ))}
        <g opacity="0.16" transform="translate(48 150)">
          <path
            d="M0 8 a8 8 0 0 1 8 -8 h28 a8 8 0 0 1 8 8 v18 a8 8 0 0 1 -8 8 h-21 l-10 8 v-8 h-5 a8 8 0 0 1 -8 -8 z"
            fill="#312E81"
          />
          <circle cx="14" cy="17" r="1.5" fill="#FFFFFF" />
          <circle cx="22" cy="17" r="1.5" fill="#FFFFFF" />
          <circle cx="30" cy="17" r="1.5" fill="#FFFFFF" />
        </g>
      </svg>
    </div>
  )
}

function Affordance({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-2 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-50">
        {icon}
      </span>
      <span className="text-[11.5px] font-medium leading-tight text-slate-700">
        {label}
      </span>
    </div>
  )
}

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
  const [recStatus, setRecStatus] = useState<VoiceRecorderStatus>("idle")

  useEffect(() => {
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
    } else if (
      typeof draft.description_text === "string" &&
      draft.description_text.length > 0
    ) {
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
  const textValid =
    textTrimmed.length >= TEXT_MIN && textTrimmed.length <= TEXT_MAX
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
    <main className="relative mx-auto flex min-h-screen max-w-sm flex-col overflow-hidden bg-slate-50 px-5 py-7">
      <ScriptWatermark />

      <ReporterScreenHeader
        sap_code={params.sap_code}
        backHref={`/r/${params.sap_code}/photo`}
        step={5}
      />

      {categoryLabel && (
        <p
          className={`mt-6 text-[11px] font-bold uppercase tracking-wide ${
            tone === "slate" ? "text-slate-600" : "text-amber-700"
          }`}
        >
          {categoryLabel}
        </p>
      )}
      <h1 className="mt-1 font-display text-[26px] font-bold leading-tight text-slate-900">
        {mode === "voice" ? "Tell us what happened" : "Type a description"}
      </h1>
      <p className="mt-2 text-[13.5px] leading-5 text-slate-600">
        {mode === "text"
          ? "In any language. We'll translate it for the safety team."
          : recStatus === "recording"
            ? "Recording — tap to stop."
            : recStatus === "counting"
              ? "Get ready — recording starts in a moment."
              : "Speak in any language. We'll translate it for the safety team."}
      </p>

      {mode === "voice" ? (
        <>
          <section className="relative mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white/85 shadow-[0_1px_2px_rgba(15,23,42,0.04)] backdrop-blur-sm">
            <div className="grid grid-cols-3 divide-x divide-slate-200 px-2 py-5">
              <Affordance
                icon={
                  <Globe
                    className="h-5 w-5 text-indigo-700"
                    strokeWidth={1.8}
                    aria-hidden
                  />
                }
                label="Any language is okay"
              />
              <Affordance
                icon={
                  <MessagesSquare
                    className="h-5 w-5 text-indigo-700"
                    strokeWidth={1.8}
                    aria-hidden
                  />
                }
                label="You can mix languages"
              />
              <Affordance
                icon={
                  <ShieldCheck
                    className="h-5 w-5 text-indigo-700"
                    strokeWidth={1.8}
                    aria-hidden
                  />
                }
                label="No need for perfect English"
              />
            </div>

            <div className="mx-4 mb-4 rounded-xl border border-indigo-100 bg-indigo-50/60 p-2">
              <VoiceRecorder
                value={audio}
                onChange={setAudio}
                onStatusChange={setRecStatus}
              />
            </div>

            <div className="mx-4 mb-4 flex items-start gap-2.5 rounded-xl bg-slate-50 px-3 py-2.5">
              <span className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-indigo-50">
                <MessageSquareText
                  className="h-3.5 w-3.5 text-indigo-700"
                  strokeWidth={1.8}
                  aria-hidden
                />
              </span>
              <p className="text-[12px] leading-snug text-slate-600">
                For example, you can speak in{" "}
                <b className="font-semibold text-slate-800">
                  Hindi, Marathi, Kannada, Telugu, Tamil, English
                </b>{" "}
                — or switch between them.
              </p>
            </div>
          </section>

          <button
            type="button"
            onClick={() => setMode("text")}
            className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/80 px-4 py-3.5 text-left transition hover:border-indigo-300 hover:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-500/40"
          >
            <span className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-indigo-50">
                <Pencil
                  className="h-3.5 w-3.5 text-indigo-700"
                  strokeWidth={1.8}
                  aria-hidden
                />
              </span>
              <span className="text-[13px]">
                <span className="text-slate-700">Prefer typing? </span>
                <span className="font-semibold text-indigo-700">
                  Type a description instead
                </span>
              </span>
            </span>
            <ChevronRight
              className="h-4 w-4 flex-none text-slate-400"
              strokeWidth={2}
              aria-hidden
            />
          </button>
        </>
      ) : (
        <>
          <section className="mt-5 rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] backdrop-blur-sm">
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
            className="mt-3 inline-flex items-center justify-center gap-1.5 self-center rounded-md px-3 py-1.5 text-[13px] text-slate-600 transition hover:text-indigo-700"
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
        <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[10.5px] font-medium uppercase tracking-wide text-slate-400">
          <Lock className="h-3 w-3" strokeWidth={2} aria-hidden />
          {t(locale, "common.anonymous_footer")}
        </p>
      </div>
    </main>
  )
}
