"use client"

import { useEffect, useState } from "react"

/**
 * Cinematic first-visit intro for the reporter landing.
 *
 * Plays a 3-scene story (NOTICE → SPEAK → PROTECT) and then resolves into
 * the app's persistent brand mark at the top of the screen. The shield from
 * Scene 3 visually rises up and shrinks into the logo position — answering
 * "why is the icon up there?" with visual continuity rather than abruptly
 * dropping a new brand element in.
 *
 * Behaviour:
 *  - First visit only. Persisted via localStorage key `sr_intro_seen`.
 *  - Mounts a full-viewport overlay; below it the normal landing continues
 *    to render but is hidden until dismiss.
 *  - "Get started" CTA writes the flag and unmounts the overlay.
 *  - prefers-reduced-motion bypasses scenes 1-2 and lands on scene 3 +
 *    final layout statically.
 *
 * Total sequence ~9s with breathing CTA at the end. Tap "Get started" at
 * any point to skip out and proceed to the landing form.
 */

const STORAGE_KEY = "sr_intro_seen"

export function ReporterIntro() {
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
      // ignore
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
        {/* Scene 1: NOTICE */}
        <div className="sr-scene sr-scene-1">
          <div className="sr-big-icon sr-scene-1-icon">
            <span className="sr-ring sr-scene-1-ring" aria-hidden />
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </div>
          <h2 className="sr-caption">You see what we can&apos;t.</h2>
          <p className="sr-sub">
            Every safety issue starts as something someone noticed first.
          </p>
        </div>

        {/* Scene 2: SPEAK + LANGUAGES */}
        <div className="sr-scene sr-scene-2">
          <div className="sr-big-icon sr-scene-2-icon">
            <span className="sr-ripple sr-ripple-1" aria-hidden />
            <span className="sr-ripple sr-ripple-2" aria-hidden />
            <span className="sr-ripple sr-ripple-3" aria-hidden />
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
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

        {/* Scene 3: PROTECT (shield rises from here) */}
        <div className="sr-scene sr-scene-3">
          <div className="sr-big-icon sr-scene-3-icon">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <polyline className="sr-check-path" points="9 12 11 14 15 10" />
            </svg>
          </div>
          <h2 className="sr-caption">Your store becomes safer.</h2>
          <p className="sr-sub">
            Because of what you noticed. Real fixes, fast.
          </p>
        </div>

        {/* Rising icon — the shield from scene 3 transforming into the persistent logo */}
        <div className="sr-rising-icon" aria-hidden>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <polyline points="9 12 11 14 15 10" />
          </svg>
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
    background: #F8FAFC;
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

  /* Scene 1 — amber/notice */
  .sr-scene-1-icon { background: #FEF3C7; color: #B45309; }
  .sr-scene-1-ring {
    position: absolute;
    inset: -10px;
    border-radius: 38px;
    border: 2px solid #B45309;
    opacity: 0;
    pointer-events: none;
  }

  /* Scene 2 — indigo/speak */
  .sr-scene-2-icon { background: #EEF2FF; color: #4338CA; }
  .sr-ripple {
    position: absolute;
    inset: 0;
    border-radius: 30px;
    border: 2px solid #A5B4FC;
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
    border: 1px solid #E2E8F0;
    border-radius: 999px;
    padding: 5px 12px;
    font-size: 12.5px;
    font-weight: 500;
    color: #4338CA;
    opacity: 0;
  }
  .sr-lang-kn { font-family: 'Noto Sans Kannada', 'DM Sans', sans-serif; }
  .sr-lang-ta { font-family: 'Noto Sans Tamil', 'DM Sans', sans-serif; }
  .sr-lang-hi { font-family: 'Noto Sans Devanagari', 'DM Sans', sans-serif; }

  /* Scene 3 — teal/protect */
  .sr-scene-3-icon { background: #CCFBF1; color: #0F766E; }
  .sr-check-path { stroke-dasharray: 24; stroke-dashoffset: 24; }

  /* Rising icon — same shield, animating from scene 3's center to final logo position */
  .sr-rising-icon {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 120px;
    height: 120px;
    border-radius: 30px;
    background: #CCFBF1;
    color: #0F766E;
    display: flex;
    align-items: center;
    justify-content: center;
    transform: translate(-50%, -50%);
    opacity: 0;
    z-index: 5;
  }
  .sr-rising-icon svg { width: 60px; height: 60px; }

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
    background: #EEF2FF;
    color: #4338CA;
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
  @keyframes sr-fadeUpScene { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes sr-fadeOutScene { from { opacity: 1; } to { opacity: 0; } }
  @keyframes sr-iconScale {
    0%   { opacity: 0; transform: scale(0.5); }
    65%  { opacity: 1; transform: scale(1.08); }
    100% { opacity: 1; transform: scale(1); }
  }
  @keyframes sr-eyePulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.08); } }
  @keyframes sr-ringPulse {
    0%   { opacity: 0; transform: scale(1); }
    35%  { opacity: 0.5; }
    100% { opacity: 0; transform: scale(1.3); }
  }
  @keyframes sr-ripple {
    0%   { opacity: 0.7; transform: scale(1); }
    100% { opacity: 0; transform: scale(1.6); }
  }
  @keyframes sr-checkDraw { to { stroke-dashoffset: 0; } }
  @keyframes sr-shieldEnter {
    0%   { opacity: 0; transform: scale(0.5) rotate(-8deg); }
    65%  { opacity: 1; transform: scale(1.06) rotate(0); }
    100% { opacity: 1; transform: scale(1) rotate(0); }
  }
  @keyframes sr-riseAndLand {
    0% {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1);
      background: #CCFBF1;
      color: #0F766E;
      border-radius: 30px;
    }
    40% {
      background: #E0E7FF;
      color: #4338CA;
    }
    100% {
      opacity: 1;
      transform: translate(-50%, calc(-50% - 38vh)) scale(0.583);
      background: #4338CA;
      color: white;
      border-radius: 20px;
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
    0%   { background: #EEF2FF; }
    35%  { background: white; box-shadow: 0 0 0 8px rgba(255,255,255,0.6); }
    100% { background: #EEF2FF; box-shadow: 0 0 0 0 rgba(255,255,255,0); }
  }
  @keyframes sr-boltJiggle {
    0%   { transform: rotate(0deg) scale(1); }
    25%  { transform: rotate(-8deg) scale(1.1); }
    50%  { transform: rotate(6deg) scale(1.1); }
    75%  { transform: rotate(-3deg) scale(1.05); }
    100% { transform: rotate(0deg) scale(1); }
  }
  @keyframes sr-breathe { 0%,100% { transform: scale(1); } 50% { transform: scale(1.02); } }

  /* === Apply animations with delays === */
  .sr-scene-1                   { animation: sr-fadeUpScene 0.45s ease-out 0.3s both, sr-fadeOutScene 0.4s ease-out 1.9s both; }
  .sr-scene-1-icon              { animation: sr-iconScale 0.5s cubic-bezier(0.4,0,0.2,1.05) 0.45s both, sr-eyePulse 1.4s ease-in-out 1.0s 1; }
  .sr-scene-1-ring              { animation: sr-ringPulse 1.4s ease-out 0.9s 1; }
  .sr-scene-1 .sr-caption       { animation: sr-fadeUp 0.4s ease-out 0.7s both; }
  .sr-scene-1 .sr-sub           { animation: sr-fadeUp 0.4s ease-out 0.95s both; }

  .sr-scene-2                   { animation: sr-fadeUpScene 0.45s ease-out 2.3s both, sr-fadeOutScene 0.4s ease-out 4.2s both; }
  .sr-scene-2-icon              { animation: sr-iconScale 0.5s cubic-bezier(0.4,0,0.2,1.05) 2.45s both; }
  .sr-ripple-1                  { animation: sr-ripple 1.6s ease-out 2.8s 1; }
  .sr-ripple-2                  { animation: sr-ripple 1.6s ease-out 3.0s 1; }
  .sr-ripple-3                  { animation: sr-ripple 1.6s ease-out 3.2s 1; }
  .sr-scene-2 .sr-caption       { animation: sr-fadeUp 0.4s ease-out 2.75s both; }
  .sr-lang-en                   { animation: sr-fadeUp 0.4s ease-out 3.0s both; }
  .sr-lang-kn                   { animation: sr-fadeUp 0.4s ease-out 3.2s both; }
  .sr-lang-ta                   { animation: sr-fadeUp 0.4s ease-out 3.4s both; }
  .sr-lang-hi                   { animation: sr-fadeUp 0.4s ease-out 3.6s both; }
  .sr-scene-2 .sr-sub           { animation: sr-fadeUp 0.4s ease-out 3.8s both; }

  .sr-scene-3                   { animation: sr-fadeUpScene 0.45s ease-out 4.6s both, sr-fadeOutScene 0.4s ease-out 6.2s both; }
  .sr-scene-3-icon              { animation: sr-shieldEnter 0.6s cubic-bezier(0.4,0,0.2,1.05) 4.75s both; }
  .sr-check-path                { animation: sr-checkDraw 0.5s ease-out 5.25s both; }
  .sr-scene-3 .sr-caption       { animation: sr-fadeUp 0.4s ease-out 5.05s both; }
  .sr-scene-3 .sr-sub           { animation: sr-fadeUp 0.4s ease-out 5.3s both; }

  .sr-rising-icon               { animation: sr-fadeIn 0.3s ease-out 6.0s forwards, sr-riseAndLand 0.9s cubic-bezier(0.4,0,0.2,1) 6.4s forwards; }

  .sr-final                     { animation: sr-fadeIn 0.5s ease-out 6.6s both; }
  .sr-title                     { animation: sr-fadeUp 0.4s ease-out 7.3s both; }
  .sr-tagline                   { animation: sr-fadeUp 0.4s ease-out 7.55s both; }
  .sr-features                  { animation: sr-fadeIn 0.4s ease-out 7.75s both; }
  .sr-feat-1                    { animation: sr-featEnter 0.45s cubic-bezier(0.4,0,0.2,1.05) 7.85s both; }
  .sr-feat-2                    { animation: sr-featEnter 0.45s cubic-bezier(0.4,0,0.2,1.05) 8.05s both; }
  .sr-feat-3                    { animation: sr-featEnter 0.45s cubic-bezier(0.4,0,0.2,1.05) 8.25s both; }
  .sr-feat-1 .sr-feat-tile svg  { transform-origin: center; animation: sr-micPulse 0.7s ease-out 8.15s both; }
  .sr-feat-2 .sr-feat-tile      { animation: sr-cameraFlash 0.6s ease-out 8.35s both; }
  .sr-feat-3 .sr-feat-tile svg  { transform-origin: center; animation: sr-boltJiggle 0.7s ease-out 8.55s both; }
  .sr-cta                       { animation: sr-fadeUp 0.45s ease-out 8.55s both, sr-breathe 2.4s ease-in-out 9.2s infinite; }

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
