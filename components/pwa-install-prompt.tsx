"use client"

import { Bell, Check, Download, Share2, X } from "lucide-react"
import { useEffect, useState } from "react"
import { t, useReporterLocale } from "@/lib/reporter-i18n"

/**
 * Persistent PWA-install + notification-permission prompt.
 *
 * Shown on the reporter landing surface. The brief: nag the reporter
 * until BOTH (a) the app is installed to their home screen, and (b)
 * they've granted notification permission. Even on subsequent visits,
 * if either is still missing, we re-show.
 *
 * The component renders inline (not a modal) — it's a card that sits
 * above the form. Reporters can collapse it for the current session
 * via the X, but on reload it returns until both gates are passed.
 *
 * State machine:
 *   - notif: 'unknown' | 'granted' | 'denied' | 'unsupported'
 *   - install: 'unknown' | 'installed' | 'available' | 'unsupported'
 *
 * "Done" = notif==='granted' AND install==='installed'.
 *
 * Service-worker registration is also done here (it's the right
 * client-side moment — anywhere later and the SW isn't ready when
 * push subscriptions are issued).
 */

type NotifState = "unknown" | "granted" | "denied" | "unsupported"
type InstallState = "unknown" | "installed" | "available" | "unsupported"

// Browsers fire beforeinstallprompt only on supported (Chromium) browsers.
// We capture the event so we can trigger the install dialog later.
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

const SESSION_DISMISS_KEY = "sr_pwa_dismissed_this_session"

export function PwaInstallPrompt() {
  const locale = useReporterLocale()
  const [notif, setNotif] = useState<NotifState>("unknown")
  const [install, setInstall] = useState<InstallState>("unknown")
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [showIosHint, setShowIosHint] = useState(false)

  // Detect platform once for the iOS Safari install instructions branch.
  const isIos =
    typeof navigator !== "undefined" &&
    /iphone|ipad|ipod/i.test(navigator.userAgent)

  useEffect(() => {
    // Read session-dismiss flag from sessionStorage so the user gets the
    // prompt back on a hard reload but not on every component re-render.
    try {
      if (sessionStorage.getItem(SESSION_DISMISS_KEY) === "1") {
        setDismissed(true)
      }
    } catch {
      /* sessionStorage unavailable — fine, just always show */
    }

    // Notification permission state
    if (typeof Notification === "undefined") {
      setNotif("unsupported")
    } else if (Notification.permission === "granted") {
      setNotif("granted")
    } else if (Notification.permission === "denied") {
      setNotif("denied")
    } else {
      setNotif("unknown")
    }

    // Install state. The "installed" check must run client-side because
    // matchMedia is undefined during SSR.
    const standalone =
      typeof window !== "undefined" &&
      ((window.matchMedia &&
        window.matchMedia("(display-mode: standalone)").matches) ||
        // iOS Safari fallback
        (window.navigator as { standalone?: boolean }).standalone === true)
    if (standalone) {
      setInstall("installed")
    } else {
      // Listen for the deferred prompt event from Chromium.
      const onBeforeInstall = (e: Event) => {
        e.preventDefault()
        setInstallEvent(e as BeforeInstallPromptEvent)
        setInstall("available")
      }
      window.addEventListener("beforeinstallprompt", onBeforeInstall)

      // If the event never fires (Safari, older Android browsers) we
      // fall back to a platform-specific manual instruction. Mark as
      // "available" so the CTA still shows — clicking it surfaces the
      // iOS hint OR a generic instruction for Android.
      const noEventTimer = window.setTimeout(() => {
        setInstall((prev) => (prev === "unknown" ? "available" : prev))
      }, 1500)

      // Service worker registration — keep separate so any failure here
      // doesn't break the prompt logic above.
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("/sw.js").catch((err) => {
          console.warn("[pwa] SW registration failed:", err)
        })
      }

      return () => {
        window.removeEventListener("beforeinstallprompt", onBeforeInstall)
        window.clearTimeout(noEventTimer)
      }
    }
  }, [])

  async function requestNotifications() {
    if (typeof Notification === "undefined") return
    try {
      const result = await Notification.requestPermission()
      setNotif(result === "granted" ? "granted" : result === "denied" ? "denied" : "unknown")
    } catch (err) {
      console.warn("[pwa] requestPermission failed:", err)
    }
  }

  async function triggerInstall() {
    if (isIos && !installEvent) {
      setShowIosHint(true)
      return
    }
    if (!installEvent) {
      // Android / Chromium without the deferred event captured yet —
      // surface a manual nudge by toggling the iOS-style hint UI.
      setShowIosHint(true)
      return
    }
    try {
      await installEvent.prompt()
      const choice = await installEvent.userChoice
      if (choice.outcome === "accepted") {
        setInstall("installed")
        setInstallEvent(null)
      }
    } catch (err) {
      console.warn("[pwa] install prompt failed:", err)
    }
  }

  function dismissForSession() {
    try {
      sessionStorage.setItem(SESSION_DISMISS_KEY, "1")
    } catch {
      /* ignore */
    }
    setDismissed(true)
  }

  // Hide cases:
  //  1) Both gates passed — nothing to do
  //  2) User dismissed for this session
  //  3) Both unsupported (very old browser) — pointless to nag
  const notifDone = notif === "granted" || notif === "unsupported"
  const installDone = install === "installed" || install === "unsupported"
  if (notifDone && installDone) return null
  if (dismissed) return null

  return (
    <section
      role="region"
      aria-label="Set up SafeReport on this phone"
      className="mt-4 mb-2 rounded-2xl border-2 border-indigo-200 bg-indigo-50 p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-indigo-700">
            {t(locale, "pwa.eyebrow")}
          </p>
          <h3 className="mt-0.5 font-display text-[16px] font-semibold text-slate-900 leading-tight">
            {t(locale, "pwa.title")}
          </h3>
        </div>
        <button
          type="button"
          onClick={dismissForSession}
          aria-label={t(locale, "pwa.dismiss_aria")}
          className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-white hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <ul className="mt-3 space-y-2">
        <Step
          done={notifDone}
          icon={<Bell className="h-4 w-4" strokeWidth={1.8} aria-hidden />}
          title={
            notif === "granted"
              ? t(locale, "pwa.notif.allowed")
              : notif === "denied"
                ? t(locale, "pwa.notif.blocked")
                : t(locale, "pwa.notif.allow")
          }
          subtitle={
            notif === "granted"
              ? t(locale, "pwa.notif.allowed_sub")
              : notif === "denied"
                ? t(locale, "pwa.notif.blocked_sub")
                : t(locale, "pwa.notif.allow_sub")
          }
          ctaLabel={notif === "denied" ? null : t(locale, "pwa.cta.allow")}
          onCta={requestNotifications}
        />
        <Step
          done={installDone}
          icon={<Download className="h-4 w-4" strokeWidth={1.8} aria-hidden />}
          title={
            install === "installed"
              ? t(locale, "pwa.install.installed")
              : t(locale, "pwa.install.installable")
          }
          subtitle={
            install === "installed"
              ? t(locale, "pwa.install.installed_sub")
              : t(locale, "pwa.install.installable_sub")
          }
          ctaLabel={install === "installed" ? null : t(locale, "pwa.cta.install")}
          onCta={triggerInstall}
        />
      </ul>

      {showIosHint && (
        <div className="mt-3 rounded-lg bg-white border border-indigo-200 px-3 py-2.5 text-[12.5px] text-slate-700 leading-5">
          {isIos ? (
            <>
              On iPhone: tap the{" "}
              <Share2 className="inline h-4 w-4 align-text-bottom text-indigo-700" aria-hidden />{" "}
              <span className="font-medium">Share</span> button at the bottom
              of Safari, then choose{" "}
              <span className="font-medium">Add to Home Screen</span>.
            </>
          ) : (
            <>
              Open your browser menu (⋮) and choose{" "}
              <span className="font-medium">Install app</span> or{" "}
              <span className="font-medium">Add to Home screen</span>.
              SafeReport will appear like a normal app.
            </>
          )}
        </div>
      )}
    </section>
  )
}

/* --------------------------------- Step --------------------------------- */

/**
 * One row inside the install/notifications card.
 *
 * Two visual modes:
 *  - pending (default): full bordered row with icon, title, subtitle and
 *    the action CTA. Calls the user's attention to what still needs doing.
 *  - done: a compact single-line pill — small teal check + title only,
 *    no subtitle, no border, no CTA. The completed step recedes so the
 *    pending one is the visual focus. The card itself still disappears
 *    entirely when both steps are done — this is just for the in-between
 *    half-done state.
 */
function Step({
  done,
  icon,
  title,
  subtitle,
  ctaLabel,
  onCta,
}: {
  done: boolean
  icon: React.ReactNode
  title: string
  subtitle: string
  ctaLabel: string | null
  onCta: () => void
}) {
  if (done) {
    return (
      <li className="flex items-center gap-2 px-1 py-1">
        <span
          className="shrink-0 inline-flex h-5 w-5 items-center justify-center rounded-full bg-teal-50 text-teal-700 ring-1 ring-teal-200"
          aria-hidden
        >
          <Check className="h-3 w-3" strokeWidth={2.5} />
        </span>
        <span className="text-[12.5px] font-medium text-slate-700 leading-none">
          {title}
        </span>
      </li>
    )
  }

  return (
    <li className="flex items-start gap-3 rounded-lg bg-white border border-indigo-100 px-3 py-2.5">
      <span
        className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-indigo-700"
        aria-hidden
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-medium text-slate-900 leading-tight">
          {title}
        </p>
        <p className="mt-0.5 text-[12px] text-slate-600 leading-4">
          {subtitle}
        </p>
      </div>
      {ctaLabel && (
        <button
          type="button"
          onClick={onCta}
          className="shrink-0 inline-flex h-8 items-center rounded-md bg-indigo-700 px-3 text-[12.5px] font-semibold text-white hover:bg-indigo-900 focus:outline-none focus:ring-4 focus:ring-indigo-500/40"
        >
          {ctaLabel}
        </button>
      )}
    </li>
  )
}
