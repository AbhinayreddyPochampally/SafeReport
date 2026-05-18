"use client"

import { ArrowRight, Volume2, VolumeX } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

/**
 * Reporter onboarding intro — three-card image-led carousel.
 *
 * Replaces the previous SVG-primitives cinematic (NOTICE → SPEAK → PROTECT
 * with shield/mic/magnifying glyphs animated through scenes). User
 * feedback drove the rewrite: minimal text, dominant pencil-art
 * illustration per card, a Volume2 read-aloud button next to the text on
 * every card (the design's primary accessibility lever — pilot reporters
 * are off-roll staff with mixed literacy levels), a 3-dot progress
 * indicator at the bottom, and a dominant "Get started" CTA only on
 * the last card. Swipeable on touch, arrow-key navigable on desktop,
 * dot-tap navigable everywhere.
 *
 * Transition rule (rigid, per user spec): the current card's image and
 * text fade to opacity 0 BEFORE the next card's elements become
 * visible. Implemented as a two-phase state machine — `phase: 'in' →
 * 'out' → swap index → 'in'` — so no slow-device or layout-thrash can
 * desync the timing. Each phase is 280 ms; the visible gap between
 * cards is intentional and reads as deliberate pacing rather than as
 * a jank.
 *
 * Read-aloud uses the Web Speech API's SpeechSynthesisUtterance. It
 * works offline in Chrome, Safari, Edge, and the iOS PWA shell. Older
 * Android WebView and locked-down browsers without a synth voice will
 * gracefully render the speaker icon as disabled (VolumeX) rather than
 * crash the intro.
 *
 * Mounted on /r/[sap_code] (the combined landing). Paints over the
 * picker on first visit (sr_intro_seen flag). The `sap_code` prop is
 * unused at runtime (the overlay doesn't navigate on dismiss — the
 * reporter is already on the picker) and is retained only for callers
 * that pass it for backwards compatibility.
 */

const STORAGE_KEY = "sr_intro_seen"

type Card = {
  src: string
  alt: string
  /** Lines below the image. The speaker icon reads ALL of them joined
   *  with spaces — the lines split for visual rhythm, not for separate
   *  utterances. */
  lines: string[]
}

const CARDS: readonly Card[] = [
  {
    src: "/illustrations/card-1-observation.jpg",
    alt: "A worker spotting a wet-floor hazard and reaching for her phone.",
    lines: ["See it."],
  },
  {
    src: "/illustrations/card-2-action.jpg",
    alt: "The worker holding her phone, looking at the SafeReport voice-recording screen.",
    lines: ["Report it fast.", "Voice or photo — any language."],
  },
  {
    src: "/illustrations/card-3-resolution.jpg",
    alt: "The worker giving a thumbs up. The hazard has been cleared by a colleague, with a SAFE banner and Head Office building.",
    lines: ["Fixes go to Head Office.", "Your workplace is safer."],
  },
]

type Props = { sap_code?: string }
type Phase = "in" | "out"

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function ReporterIntro(_props: Props = {}) {
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)
  const [index, setIndex] = useState(0)
  const [phase, setPhase] = useState<Phase>("in")
  const [speaking, setSpeaking] = useState(false)
  const [ttsSupported, setTtsSupported] = useState(true)
  const phaseTimer = useRef<number | null>(null)
  const touchStartX = useRef<number | null>(null)
  const inertNavigation = useRef(false)

  // Mount + first-visit gate. Returning reporters with sr_intro_seen=1
  // skip the overlay entirely.
  useEffect(() => {
    setMounted(true)
    try {
      const seen = window.localStorage.getItem(STORAGE_KEY)
      if (!seen) setVisible(true)
    } catch {
      // localStorage unavailable (private mode etc.) — skip the intro
    }
  }, [])

  // Web Speech API capability check. Browsers without speechSynthesis
  // get a disabled speaker icon instead of a button that does nothing.
  useEffect(() => {
    if (typeof window === "undefined") return
    setTtsSupported("speechSynthesis" in window)
  }, [])

  // Cancel any in-flight utterance + phase timer on unmount so we don't
  // leave the synth talking after the overlay is dismissed.
  useEffect(() => {
    return () => {
      if (phaseTimer.current !== null) window.clearTimeout(phaseTimer.current)
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel()
      }
    }
  }, [])

  // Hard-stop any TTS when the card changes — the reporter taps "next"
  // mid-read, the new card's text shouldn't be queued behind the old
  // one's tail.
  useEffect(() => {
    if (typeof window === "undefined") return
    if ("speechSynthesis" in window) window.speechSynthesis.cancel()
    setSpeaking(false)
  }, [index])

  function dismiss() {
    try {
      window.localStorage.setItem(STORAGE_KEY, "1")
    } catch {
      // ignore — fall through to plain hide
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel()
    }
    setVisible(false)
  }

  // Two-phase transition: 'out' for 280ms (image + text fade to 0),
  // then swap the index and snap back to 'in' (next card's image +
  // text fade up from 0). Guarded against re-entry while transitioning.
  const goTo = useCallback(
    (next: number) => {
      if (inertNavigation.current) return
      if (next < 0 || next >= CARDS.length) return
      if (next === index) return
      inertNavigation.current = true
      setPhase("out")
      if (phaseTimer.current !== null) window.clearTimeout(phaseTimer.current)
      phaseTimer.current = window.setTimeout(() => {
        setIndex(next)
        setPhase("in")
        inertNavigation.current = false
      }, 280)
    },
    [index],
  )

  const next = useCallback(() => goTo(index + 1), [goTo, index])
  const prev = useCallback(() => goTo(index - 1), [goTo, index])

  // Keyboard nav — ArrowRight/Left between cards, Enter on the last
  // card dismisses, Escape dismisses anywhere.
  useEffect(() => {
    if (!visible) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") {
        e.preventDefault()
        if (index < CARDS.length - 1) next()
      } else if (e.key === "ArrowLeft") {
        e.preventDefault()
        if (index > 0) prev()
      } else if (e.key === "Escape") {
        e.preventDefault()
        dismiss()
      } else if (e.key === "Enter" && index === CARDS.length - 1) {
        e.preventDefault()
        dismiss()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [visible, index, next, prev])

  // Touch swipe — left swipe advances, right swipe goes back. 60 px
  // horizontal threshold. Vertical-dominant gestures are ignored so
  // scroll-style flicks don't accidentally page.
  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0]?.clientX ?? null
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return
    const endX = e.changedTouches[0]?.clientX ?? touchStartX.current
    const dx = endX - touchStartX.current
    touchStartX.current = null
    if (Math.abs(dx) < 60) return
    if (dx < 0) next()
    else prev()
  }

  function readAloud() {
    if (typeof window === "undefined") return
    if (!("speechSynthesis" in window)) return
    const synth = window.speechSynthesis
    if (speaking) {
      synth.cancel()
      setSpeaking(false)
      return
    }
    const text = CARDS[index].lines.join(". ")
    const utter = new SpeechSynthesisUtterance(text)
    utter.lang = "en-IN"
    utter.rate = 0.95
    utter.onend = () => setSpeaking(false)
    utter.onerror = () => setSpeaking(false)
    synth.cancel()
    synth.speak(utter)
    setSpeaking(true)
  }

  if (!mounted || !visible) return null
  const card = CARDS[index]
  const isLast = index === CARDS.length - 1

  return (
    <>
      <style>{styles}</style>
      <div
        className="sr-intro"
        role="dialog"
        aria-modal="true"
        aria-label="Welcome to SafeReport"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <button
          type="button"
          className="sr-skip"
          onClick={dismiss}
          aria-label="Skip intro"
        >
          Skip
        </button>

        {/* Image — pencil-art illustration, dominant. */}
        <div className={`sr-image ${phase === "in" ? "is-in" : "is-out"}`}>
          {/* Plain <img> instead of next/image so we avoid the remote-
              config + LCP optimisation noise; these are tiny static
              assets in /public and the loader doesn't help. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={card.src}
            alt={card.alt}
            width={1024}
            height={768}
            draggable={false}
          />
        </div>

        {/* Text + read-aloud button. Same fade phase as the image so
            they enter and leave together — never see one without the
            other. */}
        <div className={`sr-text ${phase === "in" ? "is-in" : "is-out"}`}>
          <div className="sr-lines">
            {card.lines.map((line, i) => (
              <p key={i} className="sr-line">
                {line}
              </p>
            ))}
          </div>
          <button
            type="button"
            className={`sr-tts ${speaking ? "is-speaking" : ""}`}
            onClick={readAloud}
            disabled={!ttsSupported}
            aria-label={
              !ttsSupported
                ? "Read aloud unavailable on this device"
                : speaking
                  ? "Stop reading"
                  : "Read aloud"
            }
            title={
              !ttsSupported
                ? "Read aloud unavailable"
                : speaking
                  ? "Stop"
                  : "Read aloud"
            }
          >
            {!ttsSupported ? (
              <VolumeX className="h-5 w-5" strokeWidth={1.8} aria-hidden />
            ) : (
              <Volume2 className="h-5 w-5" strokeWidth={1.8} aria-hidden />
            )}
          </button>
        </div>

        {/* Card 3 only — primary CTA pinned above the dots. */}
        {isLast ? (
          <button type="button" className="sr-cta" onClick={dismiss}>
            Get started
            <ArrowRight className="h-5 w-5" strokeWidth={2.2} aria-hidden />
          </button>
        ) : (
          // Reserves the CTA's vertical slot so dots don't jump up when
          // we land on the last card. Visual silence.
          <div className="sr-cta-spacer" aria-hidden />
        )}

        {/* Progress dots — active dot indigo-700, inactive slate-300.
            Tappable: lets a returning visitor jump to any card without
            reading through. */}
        <div
          className="sr-dots"
          role="tablist"
          aria-label={`Step ${index + 1} of ${CARDS.length}`}
        >
          {CARDS.map((_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`Go to step ${i + 1}`}
              className={`sr-dot ${i === index ? "is-active" : ""}`}
              onClick={() => goTo(i)}
            />
          ))}
        </div>
      </div>
    </>
  )
}

/* Co-located styles. Class names prefixed `sr-` to avoid collisions. */
const styles = /* css */ `
  .sr-intro {
    position: fixed;
    inset: 0;
    z-index: 50;
    background: #FAFAF9;
    overflow: hidden;
    display: grid;
    /* Row template: image dominant, text block, CTA slot, dots row.
       The image row is fr (consumes remaining space); the rest are
       intrinsic heights with rigid spacing so text/image collisions
       can't happen on short screens. */
    grid-template-rows: 1fr auto auto auto;
    grid-template-columns: 1fr;
    gap: 24px;
    padding: 56px 24px 32px;
    color: #0F172A;
    font-family: 'DM Sans', system-ui, -apple-system, sans-serif;
    -webkit-font-smoothing: antialiased;
  }

  /* === Skip — top-right === */
  .sr-skip {
    position: absolute;
    top: 14px;
    right: 18px;
    background: transparent;
    border: none;
    color: #64748B;
    font-family: inherit;
    font-size: 13px;
    font-weight: 500;
    padding: 8px 12px;
    cursor: pointer;
    z-index: 20;
  }
  .sr-skip:hover { color: #334155; }

  /* === Image (dominant, centred) === */
  .sr-image {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 0;          /* let the 1fr row shrink */
    width: 100%;
    overflow: hidden;
  }
  .sr-image img {
    max-width: 100%;
    max-height: 100%;
    width: auto;
    height: auto;
    object-fit: contain;
    border-radius: 18px;
    user-select: none;
    -webkit-user-drag: none;
    box-shadow: 0 8px 24px rgba(10, 31, 70, 0.08);
  }

  /* === Text block === */
  .sr-text {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    min-height: 76px;       /* reserves room for max-two-line text +
                               read-aloud button so the row below
                               (CTA / dots) never jumps when the line
                               count changes between cards. */
    padding: 0 8px;
  }
  .sr-lines {
    display: flex;
    flex-direction: column;
    gap: 4px;
    text-align: center;
    max-width: 280px;
  }
  .sr-line {
    margin: 0;
    font-family: 'IBM Plex Sans', 'DM Sans', sans-serif;
    color: #0F172A;
    line-height: 1.3;
  }
  .sr-line:first-child {
    font-size: 22px;
    font-weight: 700;
    letter-spacing: -0.01em;
  }
  .sr-line:not(:first-child) {
    font-size: 14px;
    font-weight: 500;
    color: #475569;
  }
  .sr-tts {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 40px;
    height: 40px;
    border-radius: 999px;
    border: 1px solid #E7E5E4;
    background: white;
    color: #0A1F46;
    cursor: pointer;
    transition: transform 0.15s ease-out, background 0.2s ease-out,
                border-color 0.2s ease-out;
  }
  .sr-tts:hover:not(:disabled) {
    border-color: #4338CA;
    color: #4338CA;
  }
  .sr-tts:active:not(:disabled) { transform: scale(0.94); }
  .sr-tts:disabled {
    color: #94A3B8;
    cursor: not-allowed;
    background: #F5F5F4;
  }
  .sr-tts.is-speaking {
    background: #4338CA;
    border-color: #4338CA;
    color: white;
    animation: sr-tts-pulse 1.4s ease-in-out infinite;
  }
  @keyframes sr-tts-pulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(67, 56, 202, 0.45); }
    50%      { box-shadow: 0 0 0 6px rgba(67, 56, 202, 0); }
  }

  /* === Fade phase === Used by image + text together so they enter and
     leave as one. The exit/enter windows do NOT overlap — the two-phase
     state machine swaps the index only after the exit completes. */
  .is-in {
    opacity: 1;
    transform: translateY(0);
    transition: opacity 280ms cubic-bezier(0.2, 0, 0, 1),
                transform 280ms cubic-bezier(0.2, 0, 0, 1);
  }
  .is-out {
    opacity: 0;
    transform: translateY(-6px);
    transition: opacity 280ms cubic-bezier(0.4, 0, 1, 1),
                transform 280ms cubic-bezier(0.4, 0, 1, 1);
  }

  /* === CTA (last card only) === */
  .sr-cta {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    min-height: 56px;
    padding: 0 22px;
    border: none;
    border-radius: 16px;
    background: #4338CA;
    color: white;
    font-family: inherit;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 6px 18px rgba(67, 56, 202, 0.28);
    transition: transform 0.15s ease-out, background 0.2s ease-out;
  }
  .sr-cta:hover { background: #312E81; }
  .sr-cta:active { transform: scale(0.985); }
  .sr-cta-spacer {
    height: 56px;
  }

  /* === Dots === */
  .sr-dots {
    display: flex;
    justify-content: center;
    gap: 10px;
    padding-bottom: env(safe-area-inset-bottom, 0);
  }
  .sr-dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    border: none;
    background: #CBD5E1;
    padding: 0;
    cursor: pointer;
    transition: background 0.25s ease-out, transform 0.25s ease-out,
                width 0.25s ease-out;
  }
  .sr-dot.is-active {
    background: #4338CA;
    width: 20px;
  }
  .sr-dot:hover:not(.is-active) { background: #94A3B8; }

  @media (prefers-reduced-motion: reduce) {
    .is-in, .is-out, .sr-dot, .sr-cta, .sr-tts {
      transition: none !important;
      animation: none !important;
    }
    .is-out { opacity: 0; }
    .is-in  { opacity: 1; transform: none; }
  }
`
