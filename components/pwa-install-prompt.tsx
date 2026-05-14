"use client"

import { Bell, Check, Download, Share2, X } from "lucide-react"
import { useEffect, useState } from "react"
import { t, useReporterLocale } from "@/lib/reporter-i18n"

/**
 * PWA install + notification-permission prompt.
 *
 * Two-step setup card shown on the reporter landing. The brief:
 * (a) install the app to the home screen, then (b) allow notifications.
 *
 * Steps are explicitly ordered and the second one is gated behind the first:
 *   1. Install (Add to Home Screen).
 *   2. Allow notifications. Available only once the app is open from the
 *      home-screen icon (standalone mode).
 *
 * Why gate notifications behind install? On iOS notifications only work
 * when the page is open from the home-screen icon (iOS 16.4+ requirement —
 * regular Safari can't request push permission). On Android the OS allows
 * notifications from a normal tab, but routing through install gives the
 * cleaner mental model and ensures the app sticks around for re-use.
 *
 * State machine:
 *   - notif: 'unknown' | 'granted' | 'denied' | 'unsupported'
 *   - install: 'unknown' | 'installed' | 'available' | 'unsupported'
 *
 * Card is hidden when both gates are passed (or dismissed for the session).
 * Once a single gate is satisfied it collapses to a compact "done" pill so
 * the pending one is the visual focus.
 *
 * Service-worker registration is also done here — earliest reliable
 * client-side moment, so the SW is ready by the time push subscribes.
 */

type NotifState = "unknown" | "granted" | "denied" | "unsupported"
type InstallState = "unknown" | "installed" | "available" | "unsupported"

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
  const [showInstallHint, setShowInstallHint] = useState(false)

  // Platform detection. Runs at module-eval inside the component closure so
  // it's stable across renders. We re-evaluate inside the hook body because
  // SSR has no navigator.
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : ""
  const isIos = /iphone|ipad|ipod/i.test(ua)
  const isAndroid = /android/i.test(ua)

  useEffect(() => {
    try {
      if (sessionStorage.getItem(SESSION_DISMISS_KEY) === "1") {
        setDismissed(true)
      }
    } catch {
      /* sessionStorage unavailable — fine, just always show */
    }

    if (typeof Notification === "undefined") {
      setNotif("unsupported")
    } else if (Notification.permission === "granted") {
      setNotif("granted")
    } else if (Notification.permission === "denied") {
      setNotif("denied")
    } else {
      setNotif("unknown")
    }

    const standalone =
      typeof window !== "undefined" &&
      ((window.matchMedia &&
        window.matchMedia("(display-mode: standalone)").matches) ||
        (window.navigator as { standalone?: boolean }).standalone === true)

    if (standalone) {
      setInstall("installed")
    } else {
      const onBeforeInstall = (e: Event) => {
        e.preventDefault()
        setInstallEvent(e as BeforeInstallPromptEvent)
        setInstall("available")
      }
      window.addEventListener("beforeinstallprompt", onBeforeInstall)

      // Fallback: if beforeinstallprompt never fires (Safari, older
      // Android WebView) we still surface a CTA after a short timeout.
      // Tapping it opens the platform-specific manual instructions.
      const noEventTimer = window.setTimeout(() => {
        setInstall((prev) => (prev === "unknown" ? "available" : prev))
      }, 1500)

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
      setNotif(
        result === "granted"
          ? "granted"
          : result === "denied"
            ? "denied"
            : "unknown",
      )
    } catch (err) {
      console.warn("[pwa] requestPermission failed:", err)
    }
  }

  async function triggerInstall() {
    if (!installEvent) {
      // No deferred prompt — show the platform-specific manual hint.
      // Works for iOS Safari (always) and for any Android browser that
      // didn't fire beforeinstallprompt.
      setShowInstallHint(true)
      return
    }
    try {
      await installEvent.prompt()
      const choice = await installEvent.userChoice
      if (choice.outcome === "accepted") {
        setInstall("installed")
        setInstallEvent(null)
        setShowInstallHint(false)
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

  // Derived state.
  const notifDone = notif === "granted" || notif === "unsupported"
  const installDone = install === "installed" || install === "unsupported"
  // Notifications are pending-install on every platform until the app is
  // running in standalone mode. iOS requires this; Android we choose this
  // for clarity.
  const notifPendingInstall = !installDone && notif !== "granted"

  if (notifDone && installDone) return null
  if (dismissed) return null

  // Blocked-subtitle dispatch — platform-aware. iOS / Android route to the
  // OS Settings app; desktop browsers route to the address-bar lock icon.
  const blockedSub = isIos
    ? t(locale, "pwa.notif.blocked_ios_sub")
    : isAndroid
      ? t(locale, "pwa.notif.blocked_android_sub")
      : t(locale, "pwa.notif.blocked_sub")

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
        {/* Step 1 — Install */}
        <Step
          stepNumber={1}
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
          tone="action"
        />

        {/* Step 2 — Notifications */}
        <Step
          stepNumber={2}
          done={notifDone}
          icon={<Bell className="h-4 w-4" strokeWidth={1.8} aria-hidden />}
          title={
            notif === "granted"
              ? t(locale, "pwa.notif.allowed")
              : notif === "denied"
                ? t(locale, "pwa.notif.blocked")
                : notifPendingInstall
                  ? t(locale, "pwa.notif.pending_install")
                  : t(locale, "pwa.notif.allow")
          }
          subtitle={
            notif === "granted"
              ? t(locale, "pwa.notif.allowed_sub")
              : notif === "denied"
                ? blockedSub
                : notifPendingInstall
                  ? t(locale, "pwa.notif.pending_install_sub")
                  : t(locale, "pwa.notif.allow_sub")
          }
          ctaLabel={
            // No CTA when granted, when blocked (the action is in OS
            // settings), or when pending-install (the user has to do
            // step 1 first).
            notif === "granted" || notif === "denied" || notifPendingInstall
              ? null
              : t(locale, "pwa.cta.allow")
          }
          onCta={requestNotifications}
          tone={
            notif === "denied"
              ? "blocked"
              : notifPendingInstall
                ? "muted"
                : "action"
          }
        />
      </ul>

      {showInstallHint && install !== "installed" && (
        <div className="mt-3 rounded-lg bg-white border border-indigo-200 px-3 py-2.5 text-[12.5px] text-slate-700 leading-5">
          {isIos ? (
            <>
              On iPhone: tap the{" "}
              <Share2 className="inline h-4 w-4 align-text-bottom text-indigo-700" aria-hidden />{" "}
              <span className="font-medium">Share</span> button at the bottom
              of Safari, then choose{" "}
              <span className="font-medium">Add to Home Screen</span>.
              <p className="mt-2 text-slate-600">
                {t(locale, "pwa.install.followup")}
              </p>
            </>
          ) : (
            <>
              Open your browser menu (⋮) and choose{" "}
              <span className="font-medium">Install app</span> or{" "}
              <span className="font-medium">Add to Home screen</span>.
              <p className="mt-2 text-slate-600">
                {t(locale, "pwa.install.followup")}
              </p>
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
 * Three visual modes:
 *  - **done** (compact): single-line pill with a small teal check and the
 *    title. Used when the step's gate is passed but the OTHER step still
 *    needs attention (the whole card disappears when both are done).
 *  - **pending action** (full): bordered row with numbered badge, title,
 *    subtitle and the action CTA. The primary call-to-action.
 *  - **pending blocked / muted**: same layout as pending, but no CTA and
 *    the visual tone is dimmer. Used when (a) notifications were blocked
 *    by the OS and the user has to fix it in Settings, or (b) the step
 *    is gated on a prior step (e.g. notifications waiting for install).
 */
type StepTone = "action" | "blocked" | "muted"

function Step({
  stepNumber,
  done,
  icon,
  title,
  subtitle,
  ctaLabel,
  onCta,
  tone,
}: {
  stepNumber: 1 | 2
  done: boolean
  icon: React.ReactNode
  title: string
  subtitle: string
  ctaLabel: string | null
  onCta: () => void
  tone: StepTone
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

  // Tone affects (a) the badge styling and (b) the title colour.
  const badgeClasses =
    tone === "blocked"
      ? "bg-orange-50 text-orange-700 ring-1 ring-orange-200"
      : tone === "muted"
        ? "bg-slate-100 text-slate-500 ring-1 ring-slate-200"
        : "bg-indigo-100 text-indigo-700"

  const titleClasses =
    tone === "muted"
      ? "text-[13.5px] font-medium text-slate-500 leading-tight"
      : "text-[13.5px] font-medium text-slate-900 leading-tight"

  return (
    <li className="flex items-start gap-3 rounded-lg bg-white border border-indigo-100 px-3 py-2.5">
      <span
        className={`shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-full text-[12px] font-bold ${badgeClasses}`}
        aria-hidden
      >
        {/* Numbered badge with the step icon tucked underneath for
            visual context. The number reads as "Step N"; the icon
            communicates the action (download → install, bell →
            notifications) at a glance. */}
        <span className="relative inline-flex items-center justify-center">
          <span aria-hidden>{stepNumber}</span>
          <span className="sr-only">Step {stepNumber}</span>
        </span>
      </span>
      <div className="min-w-0 flex-1">
        <p className={titleClasses}>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="text-slate-400">
              {icon}
            </span>
            <span>{title}</span>
          </span>
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
