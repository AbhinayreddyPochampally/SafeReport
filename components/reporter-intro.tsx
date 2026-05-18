"use client"

import { useEffect, useState } from "react"
import { AppIcon } from "@/components/app-icon"

/**
 * Reporter onboarding intro — auto-playing cinematic with three
 * pencil-art illustrations, then the SafeReport reveal card.
 *
 * Three rewrites converged into this shape over the May 2026 design
 * pass:
 *   1. The original SVG-primitives cinematic (magnifying glass + mic
 *      + AppIcon morph) was visually weak.
 *   2. A three-card swipeable carousel with TTS speaker buttons read
 *      as "two surfaces glued together" — too interactive, lost the
 *      cinematic feel.
 *   3. This version restores the cinematic auto-play and crossfading
 *      timeline but uses the authored pencil-art illustrations as the
 *      hero imagery on each scene. Scene 2 carries the language pills
 *      so the multilingual feature is part of the story, not buried
 *      in supporting copy. The final reveal — AppIcon centred, title,
 *      tagline, three feature glyphs, "Get started" CTA — is
 *      preserved from the original cinematic; per the user it's the
 *      destination, not a card in the carousel.
 *
 * No carousel, no swipe, no dots, no Web Speech API. Skip-top-right is
 * the only manual interaction during the timeline; "Get started" is
 * the action that dismisses at the end.
 *
 * Total timeline ≈ 9.6 s before the breathing CTA settles. The intro
 * is gated behind localStorage so returning reporters see it once.
 *
 * Transitions: each scene's image + text fade in together and fade out
 * together, with a ~0.25 s crossfade overlap into the next scene —
 * no dead frame, no overlap between an outgoing scene's text and the
 * incoming scene's image (they share a fade phase, locked together).
 *
 * The `sap_code` prop is retained for backwards compatibility with
 * callers that still pass it; the overlay doesn't navigate on dismiss
 * (the reporter is already on the picker underneath).
 */

const STORAGE_KEY = "sr_intro_seen"

type Props = { sap_code?: string }

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function ReporterIntro(_props: Props = {}) {
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    setMounted(true)
    try {
      const seen = window.localStorage.getItem(STORAGE_KEY)
      if (!seen) setVisible(true)
    } catch {
      // localStorage unavailable (private mode etc.) — skip the intro
    }
  }, [])

  function dismiss() {
    try {
      window.localStorage.setItem(STORAGE_KEY, "1")
    } catch {
      // ignore — fall through to plain hide
    }
    setVisible(false)
  }

  if (!mounted || !visible) return null

  return (
    <>
      <style>{styles}</style>
      <div
        className="sr-intro"
        role="dialog"
        aria-modal="true"
        aria-label="Welcome to SafeReport"
      >
        <button
          type="button"
          className="sr-skip"
          onClick={dismiss}
          aria-label="Skip intro"
        >
          Skip
        </button>

        {/* Scene 1 — WHAT IT'S FOR. Anchors the reporter on the kind
            of thing the app exists to capture: concrete unsafe spots
            they can see on the floor. Examples in the sub are the
            three most common pilot-store reports so a first-time
            reporter can pattern-match what they're looking at. */}
        <div className="sr-scene sr-scene-1">
          <div className="sr-image">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/illustrations/card-1-observation.jpg"
              alt="A worker spotting a wet-floor hazard."
              width={1024}
              height={768}
              draggable={false}
            />
          </div>
          <h2 className="sr-caption">Spot something unsafe?</h2>
          <p className="sr-sub">Wet floor, broken shelf, anything risky.</p>
        </div>

        {/* Scene 2 — WHAT TO DO. The action itself: three short verbs
            that map to the actual flow downstream (tap a category,
            speak a voice note, submit). Language pills below the
            caption show "any language" rather than stating it. */}
        <div className="sr-scene sr-scene-2">
          <div className="sr-image">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/illustrations/card-2-action.jpg"
              alt="The worker speaking into the SafeReport voice-recording screen."
              width={1024}
              height={768}
              draggable={false}
            />
          </div>
          <h2 className="sr-caption">Tap. Speak. Send.</h2>
          <div className="sr-lang-pills">
            <span className="sr-lang-pill sr-lang-en">English</span>
            <span className="sr-lang-pill sr-lang-kn">ಕನ್ನಡ</span>
            <span className="sr-lang-pill sr-lang-hi">हिन्दी</span>
            <span className="sr-lang-pill sr-lang-ta">தமிழ்</span>
            <span className="sr-lang-pill sr-lang-te">తెలుగు</span>
          </div>
          <p className="sr-sub">Any language. Add a photo if you can.</p>
        </div>

        {/* Scene 3 — HOW IT HELPS. Closes the loop on the outcome,
            not the chain of actors (the previous draft led with
            "Head Office fixes it fast" — but the reporter doesn't
            care which step of the manager → HO chain does the fix,
            they care that the unsafe thing they spotted is dealt
            with). The anonymity line stays because that's the
            biggest barrier to first-time reports in pilot
            interviews — naming it here is load-bearing. */}
        <div className="sr-scene sr-scene-3">
          <div className="sr-image">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/illustrations/card-3-resolution.jpg"
              alt="The worker giving a thumbs up. The hazard has been cleared; a SAFE banner with the Head Office building behind."
              width={1024}
              height={768}
              draggable={false}
            />
          </div>
          <h2 className="sr-caption">It gets fixed, fast.</h2>
          <p className="sr-sub">Your store stays safer. You stay anonymous.</p>
        </div>

        {/* Final reveal. AppIcon centred (per user spec — "App icon in
            the middle"), title, tagline, three feature glyphs in a
            row, and the dominant indigo-700 Get-started CTA at the
            bottom. */}
        <div className="sr-final">
          <div className="sr-final-icon" aria-hidden>
            <AppIcon size={88} aria-hidden />
          </div>
          <h1 className="sr-title">SafeReport</h1>
          {/* Tagline is the one-line summary of the loop the three
              scenes just told. Mirrors the scene verbs (spot → tap →
              fixed) and stays outcome-first, not actor-first — "They
              get fixed" reads as a promise to the reporter, "Head
              Office fixes them" reads as bureaucratic transmission. */}
          <p className="sr-tagline">
            Report unsafe spots. They get fixed. You stay anonymous.
          </p>
          <div className="sr-features">
            <div className="sr-feat sr-feat-1">
              <span className="sr-feat-tile">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <rect x="9" y="2" width="6" height="11" rx="3" />
                  <path d="M5 10v2a7 7 0 0 0 14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="22" />
                </svg>
              </span>
              <span className="sr-feat-label">Speak any language</span>
            </div>
            <div className="sr-feat sr-feat-2">
              <span className="sr-feat-tile">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              </span>
              <span className="sr-feat-label">Add a photo</span>
            </div>
            <div className="sr-feat sr-feat-3">
              <span className="sr-feat-tile">
                {/* CheckCircle replaces the bolt (Zap) icon. The bolt
                    read as "transmission / sent" — mid-flow, not the
                    close. A check-in-circle reads as "resolved /
                    fixed", which is the outcome the reporter actually
                    cares about and matches Scene 3's caption ("It
                    gets fixed, fast.") The check stroke draws itself
                    in via stroke-dashoffset so the resolution lands
                    visually as well as semantically — the icon
                    *finishes* itself the moment the reporter looks
                    at it. */}
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <circle cx="12" cy="12" r="10" />
                  <path className="sr-feat-check" d="m8 12 3 3 5-6" />
                </svg>
              </span>
              <span className="sr-feat-label">Fixed fast</span>
            </div>
          </div>
          <button type="button" className="sr-cta" onClick={dismiss}>
            Get started
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      </div>
    </>
  )
}

/* Co-located styles, prefixed sr- to avoid collisions. */
const styles = /* css */ `
  .sr-intro {
    position: fixed;
    inset: 0;
    z-index: 50;
    /* Warm cream — softer than slate-50 for an intro surface. */
    background: #FAFAF9;
    overflow: hidden;
    -webkit-font-smoothing: antialiased;
    color: #0F172A;
    font-family: 'DM Sans', system-ui, -apple-system, sans-serif;
  }

  /* === Skip === */
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

  /* === Scenes ===

     Each scene is a centred vertical stack: illustration on top,
     caption + sub (or pills) below. Scenes share the same absolute
     position so they stack and only one is opacity 1 at a time. */
  .sr-scene {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 32px 24px;
    gap: 18px;
    opacity: 0;
    pointer-events: none;
    text-align: center;
  }
  .sr-image {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    max-width: 340px;
    aspect-ratio: 4 / 3;
    border-radius: 18px;
    overflow: hidden;
    box-shadow: 0 8px 24px rgba(10, 31, 70, 0.10);
    background: #ffffff;
  }
  .sr-image img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    user-select: none;
    -webkit-user-drag: none;
  }
  .sr-caption {
    font-family: 'IBM Plex Sans', 'DM Sans', sans-serif;
    font-weight: 700;
    font-size: 26px;
    color: #0F172A;
    letter-spacing: -0.02em;
    margin: 4px 0 0;
    line-height: 1.2;
    opacity: 0;
  }
  .sr-sub {
    font-size: 14px;
    color: #475569;
    line-height: 1.5;
    margin: 0;
    max-width: 300px;
    opacity: 0;
  }

  /* Scene 2 — language pills. Stone-100 + navy palette, mirrors the
     reporter-landing language picker tiles below. */
  .sr-lang-pills {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 6px;
    max-width: 320px;
  }
  .sr-lang-pill {
    background: white;
    border: 1px solid #E7E5E4;
    border-radius: 999px;
    padding: 5px 12px;
    font-size: 12.5px;
    font-weight: 500;
    color: #0A1F46;
    opacity: 0;
  }
  .sr-lang-kn { font-family: 'Noto Sans Kannada', 'DM Sans', sans-serif; }
  .sr-lang-hi { font-family: 'Noto Sans Devanagari', 'DM Sans', sans-serif; }
  .sr-lang-ta { font-family: 'Noto Sans Tamil', 'DM Sans', sans-serif; }
  .sr-lang-te { font-family: 'Noto Sans Telugu', 'DM Sans', sans-serif; }

  /* === Final reveal ===

     User spec: AppIcon centred, text, three SVG feature icons, then
     the Get-started CTA pinned at the bottom. Lives in the same
     fixed overlay; fades in after the last scene completes. */
  .sr-final {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 48px 24px 32px;
    gap: 0;
    opacity: 0;
    text-align: center;
  }
  .sr-final-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    filter: drop-shadow(0 8px 22px rgba(10, 31, 70, 0.18));
    opacity: 0;
    transform: scale(0.6);
  }
  .sr-title {
    font-family: 'IBM Plex Sans', 'DM Sans', sans-serif;
    font-weight: 700;
    font-size: 30px;
    color: #0F172A;
    letter-spacing: -0.02em;
    margin: 16px 0 6px;
    line-height: 1.1;
    opacity: 0;
  }
  .sr-tagline {
    font-size: 14px;
    color: #475569;
    line-height: 1.5;
    margin: 0 auto 24px;
    max-width: 280px;
    opacity: 0;
  }
  .sr-features {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    width: 100%;
    max-width: 320px;
    margin: 0 0 28px;
    opacity: 0;
  }
  .sr-feat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }
  .sr-feat-tile {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 52px;
    height: 52px;
    border-radius: 14px;
    background: #F5F5F4;
    color: #0A1F46;
    flex-shrink: 0;
    transition: transform 0.18s ease-out;
  }
  .sr-feat-tile svg { width: 26px; height: 26px; }
  .sr-feat-label {
    font-weight: 500;
    font-size: 12px;
    color: #334155;
    text-align: center;
    line-height: 1.3;
    max-width: 96px;
  }
  .sr-cta {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    max-width: 360px;
    min-height: 56px;
    margin-top: auto;
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
    opacity: 0;
    transition: transform 0.15s ease-out, background 0.2s ease-out;
  }
  .sr-cta:hover { background: #312E81; }
  .sr-cta:active { transform: scale(0.985); }

  /* === Keyframes === */
  @keyframes sr-fadeIn   { from { opacity: 0; } to { opacity: 1; } }
  @keyframes sr-fadeUp   { from { opacity: 0; transform: translateY(8px); }
                           to   { opacity: 1; transform: translateY(0); } }
  @keyframes sr-sceneIn  { from { opacity: 0; transform: translateY(10px); }
                           to   { opacity: 1; transform: translateY(0); } }
  @keyframes sr-sceneOut { from { opacity: 1; transform: translateY(0); }
                           to   { opacity: 0; transform: translateY(-8px); } }
  @keyframes sr-iconPop  {
    0%   { opacity: 0; transform: scale(0.55); }
    65%  { opacity: 1; transform: scale(1.06); }
    100% { opacity: 1; transform: scale(1); }
  }
  @keyframes sr-featPop {
    0%   { opacity: 0; transform: translateY(8px) scale(0.92); }
    70%  { opacity: 1; transform: translateY(0) scale(1.04); }
    100% { opacity: 1; transform: translateY(0) scale(1); }
  }
  @keyframes sr-breathe { 0%,100% { transform: scale(1); }
                          50%     { transform: scale(1.02); } }

  /* Check stroke draw-in for the end-card "Fixed fast" feature.
     The path m8 12 3 3 5-6 is roughly 12 units long. Setting
     stroke-dasharray to 14 (comfortably larger than the path) and
     starting at dashoffset=14 means the stroke is invisible at
     rest; the keyframe animates dashoffset back to 0 to draw the
     check in. */
  .sr-feat-check {
    stroke-dasharray: 14;
    stroke-dashoffset: 14;
  }
  @keyframes sr-drawCheck { to { stroke-dashoffset: 0; } }

  /* === Timeline ===

     Scenes are now strictly SEQUENTIAL, not crossfaded. The previous
     0.30s overlap window worked fine with the SVG-primitives version
     where each scene's icon was small and tile-bgged — but with full
     pencil-art illustrations, two scenes at 50% opacity during the
     overlap reads as "muddy stack of images", not "smooth wash". So
     each scene fully exits (opacity 0) before the next enters. The
     0.1-0.2s blank breath between scenes reads as a deliberate beat
     against the warm cream background, more cinematic than a
     conflicted dissolve.

     Per-scene structure: enter 0.55s with a slight rise → hold for
     ~1.5s → exit 0.55s with a slight lift. Captions / subs / pills
     cascade in after the scene body stabilises and exit with the
     scene as a unit (caption/sub are inside the .sr-scene-N parent,
     so the parent's opacity controls visibility).

     fill-mode notes: sr-sceneIn uses 'both' so scenes 2 and 3 stay
     at opacity 0 pre-start. sr-sceneOut uses 'forwards' so it
     applies the TO keyframe (opacity 0) after ending but contributes
     nothing pre-start. With both-and-both, the later-listed animation
     wins pre-start and would apply sr-sceneOut's FROM (opacity 1) —
     which would stack all three scenes at opacity 1 on first load. */

  /* Scene 1: in @ 0.25s, out @ 2.30s, exit complete @ 2.85s */
  .sr-scene-1                  { animation: sr-sceneIn 0.55s cubic-bezier(0.2,0,0,1) 0.25s both,
                                            sr-sceneOut 0.55s cubic-bezier(0.4,0,1,1) 2.30s forwards; }
  .sr-scene-1 .sr-caption      { animation: sr-fadeUp 0.5s cubic-bezier(0.2,0,0,1) 0.55s both; }
  .sr-scene-1 .sr-sub          { animation: sr-fadeUp 0.5s cubic-bezier(0.2,0,0,1) 0.80s both; }

  /* Scene 2: in @ 3.00s (after Scene 1 exit @ 2.85s + 0.15s breath),
     out @ 5.85s. Holds longer than scenes 1 + 3 to give the language
     pill cascade room to land. */
  .sr-scene-2                  { animation: sr-sceneIn 0.55s cubic-bezier(0.2,0,0,1) 3.00s both,
                                            sr-sceneOut 0.55s cubic-bezier(0.4,0,1,1) 5.85s forwards; }
  .sr-scene-2 .sr-caption      { animation: sr-fadeUp 0.5s cubic-bezier(0.2,0,0,1) 3.30s both; }
  .sr-lang-en                  { animation: sr-fadeUp 0.4s cubic-bezier(0.2,0,0,1) 3.55s both; }
  .sr-lang-kn                  { animation: sr-fadeUp 0.4s cubic-bezier(0.2,0,0,1) 3.70s both; }
  .sr-lang-hi                  { animation: sr-fadeUp 0.4s cubic-bezier(0.2,0,0,1) 3.85s both; }
  .sr-lang-ta                  { animation: sr-fadeUp 0.4s cubic-bezier(0.2,0,0,1) 4.00s both; }
  .sr-lang-te                  { animation: sr-fadeUp 0.4s cubic-bezier(0.2,0,0,1) 4.15s both; }
  .sr-scene-2 .sr-sub          { animation: sr-fadeUp 0.5s cubic-bezier(0.2,0,0,1) 4.40s both; }

  /* Scene 3: in @ 6.55s (after Scene 2 exit @ 6.40s + 0.15s breath),
     out @ 8.55s. */
  .sr-scene-3                  { animation: sr-sceneIn 0.55s cubic-bezier(0.2,0,0,1) 6.55s both,
                                            sr-sceneOut 0.55s cubic-bezier(0.4,0,1,1) 8.55s forwards; }
  .sr-scene-3 .sr-caption      { animation: sr-fadeUp 0.5s cubic-bezier(0.2,0,0,1) 6.85s both; }
  .sr-scene-3 .sr-sub          { animation: sr-fadeUp 0.5s cubic-bezier(0.2,0,0,1) 7.10s both; }

  /* Final reveal: starts @ 9.20s (after Scene 3 exit @ 9.10s + breath) */
  .sr-final                    { animation: sr-fadeIn 0.5s ease-out 9.20s both; }
  .sr-final-icon               { animation: sr-iconPop 0.7s cubic-bezier(0.4,0,0.2,1.05) 9.40s both; }
  .sr-title                    { animation: sr-fadeUp 0.5s cubic-bezier(0.2,0,0,1) 9.80s both; }
  .sr-tagline                  { animation: sr-fadeUp 0.5s cubic-bezier(0.2,0,0,1) 10.00s both; }
  .sr-features                 { animation: sr-fadeIn 0.4s ease-out 10.15s both; }
  .sr-feat-1                   { animation: sr-featPop 0.5s cubic-bezier(0.4,0,0.2,1.05) 10.25s both; }
  .sr-feat-2                   { animation: sr-featPop 0.5s cubic-bezier(0.4,0,0.2,1.05) 10.40s both; }
  .sr-feat-3                   { animation: sr-featPop 0.5s cubic-bezier(0.4,0,0.2,1.05) 10.55s both; }
  /* Check stroke draws in just as the third feature finishes its
     scale-pop. 11.10s = 10.55s pop start + ~0.55s for the scale
     gesture to settle, then 0.55s to trace the check itself. */
  .sr-feat-check               { animation: sr-drawCheck 0.55s cubic-bezier(0.2,0,0.2,1) 11.10s forwards; }
  .sr-cta                      { animation: sr-fadeUp 0.55s cubic-bezier(0.2,0,0,1) 10.65s both,
                                            sr-breathe 2.6s ease-in-out 11.35s infinite; }

  /* prefers-reduced-motion — skip the scenes entirely, show the final
     reveal statically. The user has signalled they don't want the
     cinematic; honour it. */
  @media (prefers-reduced-motion: reduce) {
    .sr-scene-1, .sr-scene-2, .sr-scene-3 { display: none !important; }
    .sr-final, .sr-final *, .sr-cta {
      animation: none !important;
      opacity: 1 !important;
      transform: none !important;
    }
    /* Without this, disabling the draw-in animation leaves the
       check at its base stroke-dashoffset: 14 (invisible). Reset
       to 0 so the check is fully visible at rest. */
    .sr-feat-check { stroke-dashoffset: 0 !important; }
  }
`
