"use client"

import { useEffect, useState } from "react"
import { AppIcon } from "@/components/app-icon"

/**
 * Cinematic first-visit intro overlay — mounted on /r/[sap_code] (the
 * combined reporter landing: store card + language picker). Paints over
 * the picker until dismissed.
 *
 * Plays a 3-scene story (NOTICE → SPEAK → PROTECT) and then resolves into
 * the app's persistent brand mark at the top of the screen. The shield from
 * Scene 3 visually rises up and shrinks into the logo position — answering
 * "why is the icon up there?" with visual continuity rather than abruptly
 * dropping a new brand element in.
 *
 * Behaviour:
 *  - First visit only. Persisted via localStorage key `sr_intro_seen`.
 *  - Mounts a full-viewport overlay; below it the language picker
 *    continues to render but is hidden until dismiss.
 *  - "Get started" CTA writes the flag and unmounts the overlay — the
 *    reporter is already on the language picker, so no navigation is
 *    needed.
 *  - prefers-reduced-motion bypasses scenes 1-2 and lands on scene 3 +
 *    final layout statically.
 *
 * Total sequence ~9s with breathing CTA at the end. Tap "Get started"
 * at any point to skip out and start picking a language.
 *
 * The `sap_code` prop is retained as a prop for backwards compatibility
 * with any callers that still pass it — the overlay no longer routes on
 * dismiss, so the prop isn't read at runtime.
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
      // ignore — fall through to plain dismiss
    }
    setVisible(false)
  }

  if (!mounted || !visible) return null

  return (
    <>
      <style>{styles}</style>
      <div
        className="sr-intro-overlay"
        role="dialog"
        aria-modal="true"
        aria-label="Welcome to SafeReport"
      >
        {/* Scene 1: NOTICE. Magnifying glass focused on a small
            warm-orange dot — reads as "you spotted something" without
            the spooky eye. The orange dot is the same accent that
            lands on the brand icon in Scene 3, so the three scenes
            connect through colour (notice → speak → protect). */}
        <div className="sr-scene sr-scene-1">
          <div className="sr-big-icon sr-scene-1-icon">
            <span className="sr-ring sr-scene-1-ring" aria-hidden />
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <circle cx="10.5" cy="10.5" r="6.5" />
              <line x1="20" y1="20" x2="15.4" y2="15.4" />
              <circle cx="10.5" cy="10.5" r="2.2" fill="#EA580C" stroke="none" />
            </svg>
          </div>
          <h2 className="sr-caption">You see what we can&apos;t.</h2>
          <p className="sr-sub">
            Every safety issue starts as something someone noticed first.
          </p>
        </div>

        {/* Scene 2: SPEAK + LANGUAGES. Microphone glyph (was a chat-bubble
            in the previous rev — voice is the primary input affordance,
            text is the fallback, so a mic icon reads truer). The
            sr-ripple pulses around the tile suggest captured sound. */}
        <div className="sr-scene sr-scene-2">
          <div className="sr-big-icon sr-scene-2-icon">
            <span className="sr-ripple sr-ripple-1" aria-hidden />
            <span className="sr-ripple sr-ripple-2" aria-hidden />
            <span className="sr-ripple sr-ripple-3" aria-hidden />
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
          </div>
          <h2 className="sr-caption">Speak any language.</h2>
          <div className="sr-lang-pills">
            <span className="sr-lang-pill sr-lang-en">English</span>
            <span className="sr-lang-pill sr-lang-kn">ಕನ್ನಡ</span>
            <span className="sr-lang-pill sr-lang-ta">தமிழ்</span>
            <span className="sr-lang-pill sr-lang-hi">हिन्दी</span>
          </div>
          <p className="sr-sub">
            We translate to English for the safety team. Anonymous to your
            coworkers.
          </p>
        </div>

        {/* Scene 3: PROTECT. The designed SafeReport app icon (navy
            tile + white shield + report card + warm-orange alert mark)
            renders here as the brand reveal. Previously a generic
            lucide shield + checkmark drawn from primitives — user
            feedback flagged the visuals as weak; switching to the
            authored brand mark is the fix. The same icon rises into
            the persistent brand-bar position in the next beat. */}
        <div className="sr-scene sr-scene-3">
          <div className="sr-scene-3-icon-wrap" aria-hidden>
            <AppIcon size={120} aria-hidden />
          </div>
          <h2 className="sr-caption">Your store becomes safer.</h2>
          <p className="sr-sub">
            Because of what you noticed. Real fixes, fast.
          </p>
        </div>

        {/* Rising icon — same designed app icon, animating from the
            scene-3 centre up to the brand-bar position above the title.
            No colour morph needed; the icon is self-contained. */}
        <div className="sr-rising-icon" aria-hidden>
          <AppIcon size={120} aria-hidden />
        </div>

        {/* Final state: title, tagline, features, CTA arranged around the now-landed logo */}
        <div className="sr-final">
          <h1 className="sr-title">SafeReport</h1>
          <p className="sr-tagline">
            Tell your safety team. Anonymous to your coworkers.
          </p>
          <div className="sr-features">
            <div className="sr-feat sr-feat-1">
              <span className="sr-feat-tile">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
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
                  strokeWidth="1.8"
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
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
              </span>
              <span className="sr-feat-label">Sent to Head Office</span>
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
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>

        {/* Quiet "skip" affordance — always tappable so the reporter can bail out at any beat */}
        <button
          type="button"
          className="sr-skip"
          onClick={dismiss}
          aria-label="Skip intro"
        >
          Skip
        </button>
      </div>
    </>
  )
}

/* All keyframes + per-class animation wiring lives here.
   Co-located with the component so the intro is a single drop-in file —
   no separate CSS module to keep in sync. Class names are prefixed `sr-`
   to avoid colliding with anything else in the app. */
const styles = /* css */ `
  .sr-intro-overlay {
    position: fixed;
    inset: 0;
    z-index: 50;
    /* Warm stone-50 instead of cool slate-50 — softer, more reading-room
       than utility-app. CLAUDE.md's slate-50 page-background hard rule
       applies to the live reporter screens (which still use slate-50);
       this overlay is the one place we lean warm. */
    background: #FAFAF9;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    padding: 32px 24px 24px;
    -webkit-font-smoothing: antialiased;
    color: #0F172A;
    font-family: 'DM Sans', system-ui, -apple-system, sans-serif;
  }

  /* === Scenes — full-screen takeovers === */
  .sr-scene {
    position: absolute;
    inset: 32px 24px 24px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 32px 8px;
    opacity: 0;
    pointer-events: none;
  }
  .sr-big-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 120px;
    height: 120px;
    border-radius: 30px;
    margin-bottom: 24px;
    position: relative;
  }
  .sr-big-icon svg {
    width: 60px;
    height: 60px;
    position: relative;
    z-index: 2;
  }
  .sr-caption {
    font-family: 'IBM Plex Sans', 'DM Sans', sans-serif;
    font-weight: 700;
    font-size: 24px;
    color: #0F172A;
    text-align: center;
    letter-spacing: -0.025em;
    margin: 0 0 10px;
    line-height: 1.2;
  }
  .sr-sub {
    font-size: 13.5px;
    color: #475569;
    text-align: center;
    line-height: 1.5;
    margin: 0;
    max-width: 300px;
  }

  /* Scene tiles share a single warm palette — stone-100 well, navy
     glyph, warm-orange accent. Earlier amber/indigo/teal mix read as
     three separate vocabularies; pulling them into one navy + orange
     language matches the brand icon that lands at the end and stops
     the cool/warm jump between scenes. */
  .sr-scene-1-icon { background: #F5F5F4; color: #0A1F46; }
  .sr-scene-1-ring {
    position: absolute;
    inset: -10px;
    border-radius: 38px;
    border: 2px solid #EA580C;
    opacity: 0;
    pointer-events: none;
  }

  .sr-scene-2-icon { background: #F5F5F4; color: #0A1F46; }
  .sr-ripple {
    position: absolute;
    inset: 0;
    border-radius: 30px;
    border: 2px solid #0A1F46;
    opacity: 0;
    pointer-events: none;
  }
  .sr-lang-pills {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 6px;
    margin: -8px 0 18px;
    max-width: 300px;
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
  .sr-lang-ta { font-family: 'Noto Sans Tamil', 'DM Sans', sans-serif; }
  .sr-lang-hi { font-family: 'Noto Sans Devanagari', 'DM Sans', sans-serif; }

  /* Scene 3 — the designed app icon renders self-contained (navy tile
     + white shield + report card + warm-orange alert mark). No tile
     wrapper needed; we just centre the AppIcon. */
  .sr-scene-3-icon-wrap {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 120px;
    height: 120px;
    margin-bottom: 24px;
    border-radius: 30px;
    filter: drop-shadow(0 12px 28px rgba(10, 31, 70, 0.18));
  }
  .sr-scene-3-icon-wrap > svg { width: 120px; height: 120px; }

  /* Rising icon — same designed app icon, animating from scene 3's
     centre up to the brand-bar position. Self-contained colours, so no
     bg/colour morph; only position + scale. */
  .sr-rising-icon {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 120px;
    height: 120px;
    display: flex;
    align-items: center;
    justify-content: center;
    transform: translate(-50%, -50%);
    opacity: 0;
    z-index: 5;
    filter: drop-shadow(0 12px 28px rgba(10, 31, 70, 0.18));
  }
  .sr-rising-icon > svg { width: 120px; height: 120px; }

  /* === Final state — title, tagline, features, CTA === */
  .sr-final {
    opacity: 0;
    display: flex;
    flex-direction: column;
    flex: 1;
    padding-top: 124px;  /* leaves room above for the now-landed logo */
  }
  .sr-title {
    font-family: 'IBM Plex Sans', 'DM Sans', sans-serif;
    font-weight: 700;
    font-size: 28px;
    color: #0F172A;
    text-align: center;
    letter-spacing: -0.025em;
    margin: 0 0 8px;
    line-height: 1.1;
    opacity: 0;
  }
  .sr-tagline {
    font-size: 14px;
    color: #475569;
    text-align: center;
    line-height: 1.5;
    margin: 0 auto 22px;
    max-width: 280px;
    opacity: 0;
  }
  .sr-features {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    margin-bottom: 16px;
    opacity: 0;
  }
  .sr-feat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 7px;
  }
  .sr-feat-tile {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 50px;
    height: 50px;
    border-radius: 13px;
    /* Stone-100 + navy to match the scene-icon palette upstream.
       Previously indigo-50 + indigo-700, which clashed with the warm
       overlay background. */
    background: #F5F5F4;
    color: #0A1F46;
    flex-shrink: 0;
  }
  .sr-feat-tile svg { width: 24px; height: 24px; }
  .sr-feat-label {
    font-weight: 500;
    font-size: 12px;
    color: #334155;
    text-align: center;
    line-height: 1.3;
    max-width: 96px;
  }
  .sr-cta {
    width: 100%;
    height: 52px;
    border: none;
    border-radius: 14px;
    background: #4338CA;
    color: white;
    font-family: inherit;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin-top: auto;
    opacity: 0;
    transform-origin: center;
    flex-shrink: 0;
    box-shadow: 0 4px 14px rgba(67, 56, 202, 0.25);
  }
  .sr-cta:active { transform: scale(0.98); }

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

  /* === Keyframes === */
  @keyframes sr-fadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes sr-fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes sr-fadeUpScene { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  /* Slide-up exit mirrors the slide-up entry so the scene leaves with
     the same kinetic gesture it arrived with — no abrupt cut. The exit
     window overlaps the next scene's entry by ~0.25s (see the
     per-scene timings below), which crossfades the two and removes
     the dead frame the original sequential timing introduced. */
  @keyframes sr-fadeOutScene { from { opacity: 1; transform: translateY(0); } to { opacity: 0; transform: translateY(-8px); } }
  @keyframes sr-iconScale {
    0%   { opacity: 0; transform: scale(0.5); }
    65%  { opacity: 1; transform: scale(1.08); }
    100% { opacity: 1; transform: scale(1); }
  }
  /* Scene-1 icon tile subtle scale pulse — was sr-eyePulse for the
     old eye glyph; same gesture, renamed since the glyph is now a
     magnifying glass. */
  @keyframes sr-iconPulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.06); } }
  @keyframes sr-ringPulse {
    0%   { opacity: 0; transform: scale(1); }
    35%  { opacity: 0.5; }
    100% { opacity: 0; transform: scale(1.3); }
  }
  @keyframes sr-ripple {
    0%   { opacity: 0.7; transform: scale(1); }
    100% { opacity: 0; transform: scale(1.6); }
  }
  /* sr-checkDraw was the stroke-dashoffset animation on the old
     scene-3 shield's checkmark polyline. The scene now renders the
     designed app icon (which has no stroked check) — keyframe
     removed. */
  @keyframes sr-shieldEnter {
    0%   { opacity: 0; transform: scale(0.5) rotate(-8deg); }
    65%  { opacity: 1; transform: scale(1.06) rotate(0); }
    100% { opacity: 1; transform: scale(1) rotate(0); }
  }
  @keyframes sr-riseAndLand {
    /* AppIcon is self-contained (navy + white + warm orange), so the
       morph is now purely positional. Lands at scale 0.333 so 120 px
       resolves to 40 px — the same size as the brand-bar tile on the
       reporter landing underneath the overlay, for visual continuity. */
    0% {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1);
    }
    100% {
      opacity: 1;
      transform: translate(-50%, calc(-50% - 38vh)) scale(0.333);
    }
  }
  @keyframes sr-featEnter {
    0%   { opacity: 0; transform: translateY(10px) scale(0.92); }
    70%  { opacity: 1; transform: translateY(0) scale(1.04); }
    100% { opacity: 1; transform: translateY(0) scale(1); }
  }
  @keyframes sr-micPulse {
    0%   { transform: scale(1); }
    35%  { transform: scale(1.18); }
    65%  { transform: scale(0.95); }
    100% { transform: scale(1); }
  }
  @keyframes sr-cameraFlash {
    0%   { background: #F5F5F4; }
    35%  { background: white; box-shadow: 0 0 0 8px rgba(255,255,255,0.6); }
    100% { background: #F5F5F4; box-shadow: 0 0 0 0 rgba(255,255,255,0); }
  }
  @keyframes sr-boltJiggle {
    0%   { transform: rotate(0deg) scale(1); }
    25%  { transform: rotate(-8deg) scale(1.1); }
    50%  { transform: rotate(6deg) scale(1.1); }
    75%  { transform: rotate(-3deg) scale(1.05); }
    100% { transform: rotate(0deg) scale(1); }
  }
  @keyframes sr-breathe { 0%,100% { transform: scale(1); } 50% { transform: scale(1.02); } }

  /* === Apply animations with delays ===

     Timing rebuilt for crossfade smoothness. Each scene's fade-out
     overlaps the next scene's fade-in by ~0.25s — no dead frame, no
     abrupt cuts. Total sequence still resolves around 9s. Easing
     uses a unified ease-out (the cubic-bezier(0.4,0,0.2,1.05) "bump"
     curve is reserved for the icon scales where overshoot reads as
     emphasis, not transition jitter). */

  /* Scene 1 — 0.3s enter, holds, 2.1s exits (overlaps Scene 2's entry) */
  .sr-scene-1                   { animation: sr-fadeUpScene 0.5s cubic-bezier(0.2,0,0,1) 0.3s both, sr-fadeOutScene 0.5s cubic-bezier(0.4,0,1,1) 2.1s both; }
  .sr-scene-1-icon              { animation: sr-iconScale 0.55s cubic-bezier(0.4,0,0.2,1.05) 0.45s both, sr-iconPulse 1.4s ease-in-out 1.0s 1; }
  .sr-scene-1-ring              { animation: sr-ringPulse 1.4s ease-out 0.9s 1; }
  .sr-scene-1 .sr-caption       { animation: sr-fadeUp 0.45s cubic-bezier(0.2,0,0,1) 0.7s both; }
  .sr-scene-1 .sr-sub           { animation: sr-fadeUp 0.45s cubic-bezier(0.2,0,0,1) 0.95s both; }

  /* Scene 2 — 2.35s enter (overlapping Scene 1's exit by 0.25s) */
  .sr-scene-2                   { animation: sr-fadeUpScene 0.5s cubic-bezier(0.2,0,0,1) 2.35s both, sr-fadeOutScene 0.5s cubic-bezier(0.4,0,1,1) 4.3s both; }
  .sr-scene-2-icon              { animation: sr-iconScale 0.55s cubic-bezier(0.4,0,0.2,1.05) 2.5s both; }
  .sr-ripple-1                  { animation: sr-ripple 1.6s ease-out 2.8s 1; }
  .sr-ripple-2                  { animation: sr-ripple 1.6s ease-out 3.0s 1; }
  .sr-ripple-3                  { animation: sr-ripple 1.6s ease-out 3.2s 1; }
  .sr-scene-2 .sr-caption       { animation: sr-fadeUp 0.45s cubic-bezier(0.2,0,0,1) 2.8s both; }
  .sr-lang-en                   { animation: sr-fadeUp 0.45s cubic-bezier(0.2,0,0,1) 3.05s both; }
  .sr-lang-kn                   { animation: sr-fadeUp 0.45s cubic-bezier(0.2,0,0,1) 3.2s both; }
  .sr-lang-ta                   { animation: sr-fadeUp 0.45s cubic-bezier(0.2,0,0,1) 3.35s both; }
  .sr-lang-hi                   { animation: sr-fadeUp 0.45s cubic-bezier(0.2,0,0,1) 3.5s both; }
  .sr-scene-2 .sr-sub           { animation: sr-fadeUp 0.45s cubic-bezier(0.2,0,0,1) 3.85s both; }

  /* Scene 3 — 4.55s enter (overlapping Scene 2's exit by 0.25s) */
  .sr-scene-3                   { animation: sr-fadeUpScene 0.5s cubic-bezier(0.2,0,0,1) 4.55s both, sr-fadeOutScene 0.5s cubic-bezier(0.4,0,1,1) 6.3s both; }
  .sr-scene-3-icon-wrap         { animation: sr-shieldEnter 0.65s cubic-bezier(0.4,0,0.2,1.05) 4.7s both; }
  .sr-scene-3 .sr-caption       { animation: sr-fadeUp 0.45s cubic-bezier(0.2,0,0,1) 5.0s both; }
  .sr-scene-3 .sr-sub           { animation: sr-fadeUp 0.45s cubic-bezier(0.2,0,0,1) 5.25s both; }

  /* Rising icon enters just before Scene 3 dissolves; the rise begins
     once Scene 3 is fully gone so the brand mark reads as one continuous
     object moving up rather than two competing icons. */
  .sr-rising-icon               { animation: sr-fadeIn 0.3s ease-out 6.1s forwards, sr-riseAndLand 0.95s cubic-bezier(0.4,0,0.2,1) 6.55s forwards; }

  .sr-final                     { animation: sr-fadeIn 0.55s ease-out 6.8s both; }
  .sr-title                     { animation: sr-fadeUp 0.45s cubic-bezier(0.2,0,0,1) 7.4s both; }
  .sr-tagline                   { animation: sr-fadeUp 0.45s cubic-bezier(0.2,0,0,1) 7.65s both; }
  .sr-features                  { animation: sr-fadeIn 0.4s ease-out 7.85s both; }
  .sr-feat-1                    { animation: sr-featEnter 0.45s cubic-bezier(0.4,0,0.2,1.05) 7.95s both; }
  .sr-feat-2                    { animation: sr-featEnter 0.45s cubic-bezier(0.4,0,0.2,1.05) 8.15s both; }
  .sr-feat-3                    { animation: sr-featEnter 0.45s cubic-bezier(0.4,0,0.2,1.05) 8.35s both; }
  .sr-feat-1 .sr-feat-tile svg  { transform-origin: center; animation: sr-micPulse 0.7s ease-out 8.25s both; }
  .sr-feat-2 .sr-feat-tile      { animation: sr-cameraFlash 0.6s ease-out 8.45s both; }
  .sr-feat-3 .sr-feat-tile svg  { transform-origin: center; animation: sr-boltJiggle 0.7s ease-out 8.65s both; }
  .sr-cta                       { animation: sr-fadeUp 0.5s cubic-bezier(0.2,0,0,1) 8.65s both, sr-breathe 2.4s ease-in-out 9.3s infinite; }

  @media (prefers-reduced-motion: reduce) {
    .sr-scene-1, .sr-scene-2, .sr-rising-icon { display: none !important; }
    .sr-scene-3, .sr-scene-3 *, .sr-final, .sr-final * {
      animation: none !important;
      opacity: 1 !important;
      transform: none !important;
      stroke-dashoffset: 0 !important;
    }
  }
`
