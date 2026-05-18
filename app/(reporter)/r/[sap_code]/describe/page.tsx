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
import { useEffect, useState } from "react"
import type { ReactNode } from "react"
import { ReporterScreenHeader } from "@/components/reporter-chrome"
import { VoiceRecorder, type VoiceRecorderStatus } from "@/components/voice-recorder"
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
  // Watermark density bumped May 2026 — earlier rev clustered tokens at
  // the top and bottom, leaving a visible "dead band" through the middle
  // of the screen where the recorder card sat. Now every horizontal band
  // gets glyphs from at least three scripts so the texture reads as a
  // continuous wash rather than two header/footer crops.
  const DV = "'Noto Sans Devanagari'"
  const TE = "'Noto Sans Telugu'"
  const KN = "'Noto Sans Kannada'"
  const TA = "'Noto Sans Tamil'"
  const GU = "'Noto Sans Gujarati'"
  const BN = "'Noto Sans Bengali'"
  const ML = "'Noto Sans Malayalam'"
  const tokens: Tok[] = [
    // --- Band 1 (y 40-160): hero title sits here on the page; we keep
    // tokens to the screen edges so they don't fight the headline ---
    { c: "A", x: 80, y: 70, s: 36, o: 0.18 },
    { c: "अ", x: 200, y: 80, s: 36, o: 0.18, f: DV },
    { c: "क", x: 285, y: 76, s: 36, o: 0.18, f: DV },
    { c: "ক", x: 28, y: 110, s: 24, o: 0.16, f: BN },
    { c: "मराठी", x: 300, y: 130, s: 18, o: 0.2, f: DV },
    { c: "ద", x: 235, y: 145, s: 28, o: 0.16, f: TE },
    { c: "ണ", x: 360, y: 155, s: 22, o: 0.18, f: ML },

    // --- Band 2 (y 160-320): sub-copy + top of the recorder card ---
    { c: "తెలుగు", x: 215, y: 175, s: 16, o: 0.2, f: TE },
    { c: "ಕ", x: 70, y: 180, s: 26, o: 0.18, f: KN },
    { c: "ಕನ್ನಡ", x: 110, y: 235, s: 18, o: 0.2, f: KN },
    { c: "தமிழ்", x: 240, y: 220, s: 18, o: 0.2, f: TA },
    { c: "ಶ್", x: 40, y: 270, s: 30, o: 0.18, f: KN },
    { c: "क", x: 245, y: 280, s: 28, o: 0.16, f: DV },
    { c: "ગુજરાતી", x: 270, y: 305, s: 18, o: 0.2, f: GU },
    { c: "অ", x: 22, y: 320, s: 24, o: 0.16, f: BN },
    { c: "த", x: 360, y: 220, s: 28, o: 0.18, f: TA },

    // --- Band 3 (y 320-470): middle of the recorder card. Tokens hug the
    // left/right gutters since the card itself is opaque-ish; the goal is
    // to keep the watermark visible in the margins ---
    { c: "ਪ", x: 12, y: 360, s: 24, o: 0.16, f: DV },
    { c: "क", x: 370, y: 370, s: 26, o: 0.16, f: DV },
    { c: "ಕ", x: 22, y: 410, s: 22, o: 0.18, f: KN },
    { c: "ਅ", x: 365, y: 410, s: 22, o: 0.16, f: DV },
    { c: "ద", x: 8, y: 450, s: 26, o: 0.14, f: TE },
    { c: "த", x: 372, y: 460, s: 24, o: 0.16, f: TA },

    // --- Band 4 (y 470-620): bottom of the recorder card + helper bar.
    // Slightly higher opacity here to balance the busier top half ---
    { c: "क", x: 22, y: 540, s: 30, o: 0.16, f: DV },
    { c: "मराठी", x: 280, y: 500, s: 18, o: 0.2, f: DV },
    { c: "மொ", x: 26, y: 500, s: 22, o: 0.18, f: TA },
    { c: "మ", x: 345, y: 575, s: 22, o: 0.18, f: TE },
    { c: "త", x: 38, y: 622, s: 24, o: 0.16, f: TE },
    { c: "অ", x: 312, y: 610, s: 26, o: 0.18, f: BN },
    { c: "ગુ", x: 198, y: 595, s: 22, o: 0.14, f: GU },
    { c: "ண", x: 110, y: 632, s: 26, o: 0.16, f: TA },

    // --- Band 5 (y 620-780): "Prefer typing?" row + Continue button ---
    { c: "ಶ್", x: 24, y: 680, s: 28, o: 0.16, f: KN },
    { c: "ਅ", x: 372, y: 700, s: 26, o: 0.18, f: DV },
    { c: "ગુ", x: 320, y: 740, s: 26, o: 0.18, f: GU },
    { c: "தமிழ்", x: 38, y: 730, s: 18, o: 0.2, f: TA },
    { c: "ক", x: 200, y: 758, s: 22, o: 0.16, f: BN },
    { c: "ద", x: 358, y: 778, s: 24, o: 0.16, f: TE },

    // --- Band 6 (y 780-900): bottom margin under the CTA ---
    { c: "తెలుగు", x: 30, y: 800, s: 16, o: 0.2, f: TE },
    { c: "বাংলা", x: 240, y: 830, s: 18, o: 0.2, f: BN },
    { c: "क", x: 20, y: 870, s: 26, o: 0.16, f: DV },
    { c: "ಕ", x: 360, y: 870, s: 26, o: 0.16, f: KN },
    { c: "ந", x: 145, y: 880, s: 22, o: 0.16, f: TA },

    // --- Curly quotation marks scattered as accents (mirror the mockup) ---
    { c: "“", x: 270, y: 200, s: 44, o: 0.22 },
    { c: "”", x: 90, y: 720, s: 44, o: 0.18 },
    { c: "“", x: 350, y: 690, s: 32, o: 0.18 },
    { c: "”", x: 18, y: 850, s: 32, o: 0.18 },
    { c: "“", x: 12, y: 450, s: 36, o: 0.18 },
    { c: "”", x: 358, y: 540, s: 36, o: 0.18 },
    { c: "“", x: 168, y: 392, s: 30, o: 0.16 },
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
  const [mode, setMode] = useState<"voice" | "text">("voice")
  const [audio, setAudio] = useState<Blob | null>(null)
  const [text, setText] = useState("")
  const [recStatus, setRecStatus] = useState<VoiceRecorderStatus>("idle")

  useEffect(() => {
    const draft = readDraft()
    if (!draft || draft.sap_code !== params.sap_code) {
      router.replace(`/r/${params.sap_code}/photo`)
      return
    }
    const blobs = getDraftBlobs(draft.draftId)
    if (!blobs.photo) {
      // Photo is the strict prerequisite. event_at lives on the /when
      // screen AFTER this one in the re-ordered flow, so we don't
      // guard on it here.
      router.replace(`/r/${params.sap_code}/photo`)
      return
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

  function onContinue() {
    if (!canContinue) return
    writeDraft({
      sap_code: params.sap_code,
      description_text: textValid ? textTrimmed : undefined,
    })
    // Mig 007 follow-up: /when now lives after /describe.
    router.push(`/r/${params.sap_code}/when`)
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
        step={2}
      />

      <h1 className="mt-6 font-display text-[26px] font-bold leading-tight text-slate-900">
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
