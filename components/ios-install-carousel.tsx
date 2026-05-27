"use client"

import { ChevronLeft, ChevronRight, X } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { type Locale, t, useReporterLocale } from "@/lib/reporter-i18n"

/**
 * iOS Add-to-Home-Screen install walkthrough — three-frame carousel.
 *
 * iOS Safari has no programmatic install API (no `beforeinstallprompt`), so
 * the Chromium one-tap install in `pwa-install-prompt.tsx` is useless on
 * iPhone. This component fills that gap with an annotated, diagrammatic
 * walkthrough that shows the reporter (or store manager) exactly where the
 * Share button is, what to tap inside the Share sheet, and what the SR icon
 * will look like on their home screen.
 *
 * The component is self-gating: it returns null on non-iOS UAs, on already-
 * installed (standalone) sessions, and after the user has dismissed it
 * (write-through to either sessionStorage or localStorage depending on
 * `persistence`). That means callers can mount it unconditionally — the
 * carousel decides for itself whether to render.
 *
 * Visual reference: `outputs/ios_carousel_mockup_utility.html`. The diagrams
 * (Safari toolbar, Share sheet, home grid with ringed SR tile) are hand-
 * rolled inline SVG; lucide doesn't ship pixel-accurate replicas of iOS
 * chrome and a stock-icon substitute reads wrong.
 *
 * Palette: strictly Slate / Indigo / Sky / Orange-accent. No green or red
 * tokens anywhere — see CLAUDE.md §"Palette rules" for the lint check.
 */

type Surface = "reporter" | "manager"
type Persistence = "session" | "local"

type Props = {
  surface: Surface
  storageKey: string
  persistence: Persistence
}

// Hardcoded English copy for the manager surface (manager console is
// English-only per CLAUDE.md — only the reporter surface ships the 5-locale
// translation pack). Keys mirror the reporter `t()` calls so a future
// expansion can swap to `t(locale, ...)` without restructuring.
const MANAGER_EN: Record<string, string> = {
  "ios.install.title": "Keep SafeReport on your home screen",
  "ios.install.subtitle":
    "Two taps and you're done — works offline, sends instant alerts",
  "ios.install.step.1.title": "Tap the Share button",
  "ios.install.step.1.body":
    "It's the square with an up-arrow in Safari's bottom toolbar",
  "ios.install.step.2.title": "Add to Home Screen",
  "ios.install.step.2.body":
    "Scroll the share sheet and tap the row with the plus icon",
  "ios.install.step.3.title": "Open from your home screen",
  "ios.install.step.3.body":
    "Tap the SafeReport icon next time you need to file a report",
  "ios.install.cta.next": "Next",
  "ios.install.cta.back": "Back",
  "ios.install.cta.done": "Got it",
  "ios.install.cta.skip": "Not now",
  "ios.install.dismiss.aria": "Dismiss install guide",
  "ios.install.step.indicator": "Step {n} of 3",
}

function getStore(persistence: Persistence): Storage | null {
  if (typeof window === "undefined") return null
  try {
    return persistence === "session" ? window.sessionStorage : window.localStorage
  } catch {
    return null
  }
}

/**
 * iOS detection — UA-based and explicitly excludes IE/Edge mobile, which
 * historically reported "iPad" in the UA via a feature-detect shim. The
 * `MSStream` guard is the classic Apple-recommended check.
 */
function isIos(): boolean {
  if (typeof navigator === "undefined") return false
  // window.MSStream isn't on the DOM lib types, so cast through unknown.
  const msStream = (window as unknown as { MSStream?: unknown }).MSStream
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !msStream
}

/**
 * Standalone detection — `display-mode: standalone` covers Chromium and
 * iOS Safari 16+, plus the iOS-specific `navigator.standalone` flag for
 * older Safari versions.
 */
function isStandalone(): boolean {
  if (typeof window === "undefined") return false
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return nav.standalone === true
}

export function IosInstallCarousel({ surface, storageKey, persistence }: Props) {
  const reporterLocale = useReporterLocale()
  const [ready, setReady] = useState(false)
  const [shouldRender, setShouldRender] = useState(false)
  const [step, setStep] = useState<0 | 1 | 2>(0)

  // String lookup: reporter surface goes through the i18n hook; manager
  // surface reads from the hardcoded English table (manager console is
  // English-only).
  const lookup = useCallback(
    (key: string): string => {
      if (surface === "manager") return MANAGER_EN[key] ?? key
      return t(reporterLocale as Locale, key as Parameters<typeof t>[1])
    },
    [surface, reporterLocale],
  )

  // Gate the render on mount. We can't decide during SSR (no navigator), so
  // we always render null initially and then re-decide on the client. This
  // also prevents a hydration mismatch where the server emits the modal
  // markup but the client correctly hides it.
  useEffect(() => {
    setReady(true)
    if (!isIos()) return
    if (isStandalone()) return
    const store = getStore(persistence)
    if (store?.getItem(storageKey)) return
    setShouldRender(true)
  }, [storageKey, persistence])

  const dismiss = useCallback(() => {
    const store = getStore(persistence)
    try {
      store?.setItem(storageKey, "1")
    } catch {
      // Storage unavailable (private mode, quota) — still hide the modal
      // for this view; the gate just won't survive a reload.
    }
    setShouldRender(false)
  }, [storageKey, persistence])

  // ESC key dismisses. Bound only while the modal is mounted so we don't
  // hold a listener on every page that imports this file.
  useEffect(() => {
    if (!shouldRender) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") dismiss()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [shouldRender, dismiss])

  if (!ready || !shouldRender) return null

  const stepTitleKey = `ios.install.step.${step + 1}.title`
  const stepBodyKey = `ios.install.step.${step + 1}.body`
  const stepIndicator = lookup("ios.install.step.indicator").replace(
    "{n}",
    String(step + 1),
  )

  const isFirst = step === 0
  const isLast = step === 2

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={lookup("ios.install.title")}
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6"
    >
      {/* Backdrop — slate-900 at 60% per the visual spec; click dismisses. */}
      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        onClick={dismiss}
        className="absolute inset-0 cursor-default bg-slate-900/60"
      />

      {/* Modal card */}
      <div className="relative z-10 flex w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-slate-200">
        {/* Header */}
        <div className="flex items-start justify-between px-5 pb-3 pt-5">
          <div className="pr-3">
            <p className="font-display text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-700">
              {stepIndicator}
            </p>
            <h2 className="mt-1 font-display text-[18px] font-semibold leading-tight tracking-tight text-slate-900">
              {lookup("ios.install.title")}
            </h2>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label={lookup("ios.install.dismiss.aria")}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
          >
            <X className="h-4 w-4" strokeWidth={2.2} aria-hidden />
          </button>
        </div>

        {/* Progress dots — three pill-bars, sky-700 active. */}
        <div className="flex gap-1.5 px-5 pb-3">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={
                "h-1 flex-1 rounded-full " +
                (i === step
                  ? "bg-sky-700"
                  : i < step
                    ? "bg-sky-700/55"
                    : "bg-slate-300")
              }
              aria-hidden
            />
          ))}
        </div>

        {/* Step text */}
        <p className="px-5 font-display text-[11px] font-semibold uppercase tracking-[0.10em] text-slate-500">
          {stepIndicator}
        </p>
        <h3 className="px-5 pt-1 font-display text-[20px] font-semibold leading-snug tracking-tight text-slate-900">
          {lookup(stepTitleKey)}
        </h3>
        <p className="px-5 pb-3 pt-1.5 text-[13px] leading-relaxed text-slate-600">
          {lookup(stepBodyKey)}
        </p>

        {/* Diagram per step */}
        <div className="mx-5 mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
          {step === 0 && <SafariShareDiagram />}
          {step === 1 && <ShareSheetDiagram />}
          {step === 2 && <HomeGridDiagram />}
        </div>

        {/* Subtitle below the diagrams — context line that reads less like
            an instruction and more like a benefit statement. */}
        <p className="px-5 pb-4 text-[12px] leading-relaxed text-slate-600">
          {lookup("ios.install.subtitle")}
        </p>

        {/* Footer — back / cta. CTA on the last step becomes "Got it" and
            dismisses. */}
        <div className="flex items-center gap-2.5 border-t border-slate-100 px-4 py-3.5">
          <button
            type="button"
            onClick={() => setStep((s) => (s > 0 ? ((s - 1) as 0 | 1 | 2) : s))}
            disabled={isFirst}
            aria-label={lookup("ios.install.cta.back")}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 transition enabled:hover:bg-slate-50 disabled:border-slate-100 disabled:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={2.2} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => {
              if (isLast) {
                dismiss()
                return
              }
              setStep((s) => ((s + 1) as 0 | 1 | 2))
            }}
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-700 px-4 font-display text-[14px] font-semibold text-white transition hover:bg-indigo-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
          >
            {isLast ? lookup("ios.install.cta.done") : lookup("ios.install.cta.next")}
            {!isLast && (
              <ChevronRight className="h-4 w-4" strokeWidth={2.2} aria-hidden />
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
 * DIAGRAMS — hand-rolled inline SVG.
 *
 * lucide-react doesn't ship pixel-accurate replicas of iOS Safari chrome,
 * the iOS Share sheet row, or the home-screen tile grid. Substituting
 * stock icons read incorrectly in the original mockup audit ("looks like
 * a different OS"). These three diagrams reuse the structure from the
 * signed-off utility mockup at `outputs/ios_carousel_mockup_utility.html`.
 * ────────────────────────────────────────────────────────────────────── */

/** Frame 1 — faux Safari toolbar with the Share button highlighted and an
 *  indigo arrow callout pointing to it. */
function SafariShareDiagram() {
  return (
    <div className="relative">
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        {/* URL bar */}
        <div className="flex h-[34px] items-center justify-center border-b border-slate-200 px-2.5">
          <div className="flex h-[22px] flex-1 items-center gap-1.5 rounded-md bg-slate-100 px-2 font-display text-[10.5px] font-medium text-slate-600">
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              aria-hidden
            >
              <rect x="4" y="9" width="16" height="11" rx="2" />
              <path d="M8 9V6a4 4 0 018 0v3" />
            </svg>
            safereport.app/r/PNT-BLR-047
          </div>
        </div>

        {/* Body — faux page content (a couple of lines) */}
        <div className="h-[100px] bg-gradient-to-b from-white to-slate-50 px-3 py-2.5 text-[11px] text-slate-700">
          <div className="font-display text-[12px] font-semibold text-slate-900">
            Report received
          </div>
          <div className="mt-2 h-[6px] rounded bg-slate-200" />
          <div className="mt-2 h-[6px] w-3/5 rounded bg-slate-200" />
          <div className="mt-2 h-[6px] rounded bg-slate-200" />
        </div>

        {/* Bottom toolbar */}
        <div className="relative flex h-[42px] items-center justify-around border-t border-slate-200 bg-slate-50 px-3.5 text-slate-500">
          {/* Back chevron */}
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
            <polyline points="15 18 9 12 15 6" />
          </svg>
          {/* Forward chevron */}
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.35"
            aria-hidden
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
          {/* SHARE — orange accent + indigo ring */}
          <span className="relative inline-flex items-center justify-center text-orange-600">
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M12 3v13" />
              <polyline points="7 8 12 3 17 8" />
              <path d="M5 12v6a2 2 0 002 2h10a2 2 0 002-2v-6" />
            </svg>
            <span
              className="pointer-events-none absolute h-9 w-9 rounded-full border-2 border-indigo-700"
              aria-hidden
            />
          </span>
          {/* Book */}
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
            <path d="M4 19V5a1 1 0 011-1h14a1 1 0 011 1v14" />
            <path d="M4 19a1 1 0 001 1h14" />
          </svg>
          {/* Tabs */}
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
          >
            <rect x="4" y="6" width="14" height="14" rx="2" />
            <rect x="8" y="3" width="12" height="14" rx="2" />
          </svg>
        </div>
      </div>

      {/* Callout arrow pointing at the Share button */}
      <svg
        className="pointer-events-none absolute left-[28%] top-[24%]"
        width="110"
        height="78"
        viewBox="0 0 120 80"
        fill="none"
        aria-hidden
      >
        <path
          d="M110 8 C 70 8, 55 30, 56 64"
          stroke="#4338CA"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <polygon points="56,68 50,58 62,58" fill="#4338CA" />
        <text
          x="65"
          y="22"
          fontFamily="IBM Plex Sans, DM Sans, sans-serif"
          fontSize="11"
          fontWeight="600"
          fill="#4338CA"
        >
          Share
        </text>
      </svg>
    </div>
  )
}

/** Frame 2 — iOS Share sheet with "Add to Home Screen" highlighted. */
function ShareSheetDiagram() {
  return (
    <div className="relative">
      <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
        {/* iOS grabber */}
        <div className="mx-auto mb-2.5 mt-0.5 h-1 w-9 rounded-full bg-slate-300" />

        {/* Copy row */}
        <div className="flex items-center justify-between rounded-md px-2.5 py-2 text-[12px] text-slate-700">
          <span className="flex items-center gap-2.5">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-100 text-slate-600">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M12 3v13" />
                <polyline points="7 8 12 3 17 8" />
                <path d="M5 12v6a2 2 0 002 2h10a2 2 0 002-2v-6" />
              </svg>
            </span>
            Copy
          </span>
          <span className="text-slate-400">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          </span>
        </div>

        {/* HIGHLIGHTED "Add to Home Screen" row */}
        <div className="mt-1 flex items-center justify-between rounded-md border border-indigo-100 bg-indigo-50 px-2.5 py-2 text-[12px] font-semibold text-indigo-900">
          <span className="flex items-center gap-2.5">
            <span className="flex h-6 w-6 items-center justify-center rounded-md border border-indigo-100 bg-white text-indigo-700">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <rect x="3" y="3" width="18" height="18" rx="4" />
                <path d="M12 8v8M8 12h8" />
              </svg>
            </span>
            Add to Home Screen
          </span>
          <span className="text-indigo-700">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </span>
        </div>

        {/* Reading list row (greyed) */}
        <div className="mt-1 flex items-center justify-between rounded-md px-2.5 py-2 text-[12px] text-slate-700">
          <span className="flex items-center gap-2.5">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-100 text-slate-600">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v5l3 2" />
              </svg>
            </span>
            Add to Reading List
          </span>
        </div>

        {/* Bookmark row */}
        <div className="mt-1 flex items-center justify-between rounded-md px-2.5 py-2 text-[12px] text-slate-700">
          <span className="flex items-center gap-2.5">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-100 text-slate-600">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M4 7h16M6 7v12a2 2 0 002 2h8a2 2 0 002-2V7" />
                <path d="M9 7V5a3 3 0 016 0v2" />
              </svg>
            </span>
            Bookmark
          </span>
        </div>
      </div>
    </div>
  )
}

/** Frame 3 — iOS home grid with the SR tile ringed in orange. */
function HomeGridDiagram() {
  // Stand-in app labels so the SR tile reads as "one icon among many".
  const tiles: Array<{ label: string; sr?: boolean }> = [
    { label: "Msg" },
    { label: "Maps" },
    { label: "Mail" },
    { label: "Cam" },
    { label: "Calc" },
    { label: "SR", sr: true },
    { label: "Photos" },
    { label: "Notes" },
  ]
  return (
    <div className="rounded-lg bg-gradient-to-br from-slate-800 to-slate-600 p-3.5 text-white">
      <div className="grid grid-cols-4 gap-x-2 gap-y-2.5">
        {tiles.map((tile, i) => {
          if (tile.sr) {
            return (
              <div
                key={i}
                className="relative aspect-square rounded-[13px] bg-indigo-700 ring-2 ring-orange-600 ring-offset-2 ring-offset-slate-700"
                aria-label="SafeReport app icon"
              >
                <span className="absolute inset-0 flex items-center justify-center font-display text-[11px] font-bold text-orange-600">
                  SR
                </span>
                <span
                  className="pointer-events-none absolute -inset-1 rounded-[15px] border-2 border-dashed border-orange-600"
                  aria-hidden
                />
              </div>
            )
          }
          return (
            <div
              key={i}
              className="flex aspect-square items-center justify-center rounded-[13px] border border-white/5 bg-white/10 font-display text-[9px] font-semibold text-white/55"
              aria-hidden
            >
              {tile.label}
            </div>
          )
        })}
      </div>
      <p className="mt-2.5 text-center text-[10.5px] text-white/70">
        SafeReport · tap to open
      </p>
    </div>
  )
}

export default IosInstallCarousel
