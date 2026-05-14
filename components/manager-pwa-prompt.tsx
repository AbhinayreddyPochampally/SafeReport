"use client"

import { Bell, Check, Download, Share2, X } from "lucide-react"
import { useEffect, useState } from "react"

/**
 * Manager-side variant of the PWA install + notification prompt.
 *
 * Mirrors the reporter prompt's two-gate state machine, but the framing
 * is operational rather than civic ("Get alerts the moment a report
 * lands at this store" rather than "Set up SafeReport on this phone").
 * English-only — managers are internal users, no Kannada toggle here.
 *
 * Mounted on both the manager login screen AND the inbox, because:
 *  - On login, the prompt onboards a freshly-issued manager phone or
 *    a desktop browser the manager just opened.
 *  - Inside the inbox, the prompt re-surfaces if either gate is still
 *    open (e.g. permission was deferred during login, or the session
 *    started in a browser that doesn't support beforeinstallprompt).
 *
 * Service-worker registration is co-located here for the same reason
 * as the reporter version: it's the earliest reliable client moment.
 * Wrapped in try/catch so a SW failure doesn't break the state machine.
 *
 * Desktop behaviour: on desktop browsers `beforeinstallprompt` still
 * fires in Chromium (gives a one-click "Install"). Safari on macOS
 * supports add-to-dock; we surface a manual hint. Firefox doesn't have
 * a desktop install — we mark install as "unsupported" and the prompt
 * silently collapses once notifications are granted.
 */

type NotifState = "unknown" | "granted" | "denied" | "unsupported"
type InstallState = "unknown" | "installed" | "available" | "unsupported"

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

const SESSION_DISMISS_KEY = "sr_mgr_pwa_dismissed_this_session"

export function ManagerPwaPrompt({
  variant = "inbox",
}: {
  /** "login" tightens the framing for someone who isn't signed in yet
   * (no mention of "this store's reports"); "inbox" assumes the manager
   * is already viewing their feed. */
  variant?: "login" | "inbox"
}) {
  const [notif, setNotif] = useState<NotifState>("unknown")
  const [install, setInstall] = useState<InstallState>("unknown")
  const [installEvent, setInstallEvent] =
    useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [showManualHint, setShowManualHint] = useState(false)

  // Platform sniffing for the install-hint copy. Kept simple — we only
  // need to distinguish iOS Safari (Share → Add to Home Screen) from
  // everything else (browser menu → Install).
  const isIos =
    typeof navigator !== "undefined" &&
    /iphone|ipad|ipod/i.test(navigator.userAgent)
  const isMac =
    typeof navigator !== "undefined" &&
    /mac/i.test(navigator.platform || navigator.userAgent)

  useEffect(() => {
    try {
      if (sessionStorage.getItem(SESSION_DISMISS_KEY) === "1") {
        setDismissed(true)
      }
    } catch {
      /* sessionStorage unavailable — fine */
    }

    // Notifications
    if (typeof Notification === "undefined") {
      setNotif("unsupported")
    } else if (Notification.permission === "granted") {
      setNotif("granted")
    } else if (Notification.permission === "denied") {
      setNotif("denied")
    } else {
      setNotif("unknown")
    }

    // Install detection
    const standalone =
      typeof window !== "undefined" &&
      ((window.matchMedia &&
        window.matchMedia("(display-mode: standalone)").matches) ||
        (window.navigator as { standalone?: boolean }).standalone === true)
    if (standalone) {
      setInstall("installed")
      return
    }

    const onBeforeInstall = (e: Event) => {
      e.preventDefault()
      setInstallEvent(e as BeforeInstallPromptEvent)
      setInstall("available")
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstall)

    // If the event never fires within 1.5s, fall back to "available
    // with manual instructions" — covers Safari (iOS + macOS) and
    // any older browser that doesn't support the deferred prompt.
    const noEventTimer = window.setTimeout(() => {
      setInstall((prev) => (prev === "unknown" ? "available" : prev))
    }, 1500)

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.warn("[manager-pwa] SW registration failed:", err)
      })
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall)
      window.clearTimeout(noEventTimer)
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
      console.warn("[manager-pwa] requestPermission failed:", err)
    }
  }

  async function triggerInstall() {
    if (!installEvent) {
      // No deferred prompt available → surface manual instructions.
      setShowManualHint(true)
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
      console.warn("[manager-pwa] install prompt failed:", err)
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

  const notifDone = notif === "granted" || notif === "unsupported"
  const installDone = install === "installed" || install === "unsupported"
  if (notifDone && installDone) return null
  if (dismissed) return null

  const eyebrow = "Stay alerted"
  const title =
    variant === "login"
      ? "Get notified the moment a report comes in"
      : "Get notified when a new report lands"

  return (
    <section
      role="region"
      aria-label="Set up SafeReport notifications and install"
      className="rounded-2xl border-2 border-indigo-200 bg-indigo-50 p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-indigo-700">
            {eyebrow}
          </p>
          <h3 className="mt-0.5 font-display text-[16px] font-semibold leading-tight text-slate-900">
            {title}
          </h3>
        </div>
        <button
          type="button"
          onClick={dismissForSession}
          aria-label="Dismiss setup card for this session"
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-white hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
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
              ? "Notifications on"
              : notif === "denied"
                ? "Notifications blocked"
                : "Allow notifications"
          }
          subtitle={
            notif === "granted"
              ? "We'll buzz this device the moment a new report lands."
              : notif === "denied"
                ? "Re-enable from your browser site settings to receive alerts."
                : variant === "login"
                  ? "So you don't miss anything urgent at your store."
                  : "Alerts for new reports, HO returns, and approvals."
          }
          ctaLabel={notif === "denied" ? null : "Allow"}
          onCta={requestNotifications}
        />
        <Step
          done={installDone}
          icon={<Download className="h-4 w-4" strokeWidth={1.8} aria-hidden />}
          title={
            install === "installed"
              ? "Installed on this device"
              : "Add to home screen"
          }
          subtitle={
            install === "installed"
              ? "SafeReport opens like a normal app."
              : "Reach the inbox in one tap, even when offline."
          }
          ctaLabel={install === "installed" ? null : "Install"}
          onCta={triggerInstall}
        />
      </ul>

      {showManualHint && (
        <div className="mt-3 rounded-lg border border-indigo-200 bg-white px-3 py-2.5 text-[12.5px] leading-5 text-slate-700">
          {isIos ? (
            <>
              On iPhone, tap the{" "}
              <Share2
                className="inline h-4 w-4 align-text-bottom text-indigo-700"
                aria-hidden
              />{" "}
              <span className="font-medium">Share</span> button in Safari, then
              choose{" "}
              <span className="font-medium">Add to Home Screen</span>.
            </>
          ) : isMac ? (
            <>
              In Safari, open the{" "}
              <span className="font-medium">File</span> menu and choose{" "}
              <span className="font-medium">Add to Dock…</span> — or open this
              page in Chrome / Edge for one-click install.
            </>
          ) : (
            <>
              Open your browser menu (⋮) and choose{" "}
              <span className="font-medium">Install app</span> or{" "}
              <span className="font-medium">Add to Home screen</span>. SafeReport
              will appear like a normal app.
            </>
          )}
        </div>
      )}
    </section>
  )
}

/* --------------------------------- Step --------------------------------- */

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
  return (
    <li className="flex items-start gap-3 rounded-lg border border-indigo-100 bg-white px-3 py-2.5">
      <span
        className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          done
            ? "bg-teal-50 text-teal-700 ring-1 ring-teal-200"
            : "bg-indigo-100 text-indigo-700"
        }`}
        aria-hidden
      >
        {done ? <Check className="h-4 w-4" strokeWidth={2} /> : icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-medium leading-tight text-slate-900">
          {title}
        </p>
        <p className="mt-0.5 text-[12px] leading-4 text-slate-600">{subtitle}</p>
      </div>
      {ctaLabel && (
        <button
          type="button"
          onClick={onCta}
          className="inline-flex h-8 shrink-0 items-center rounded-md bg-indigo-700 px-3 text-[12.5px] font-semibold text-white hover:bg-indigo-900 focus:outline-none focus:ring-4 focus:ring-indigo-500/40"
        >
          {ctaLabel}
        </button>
      )}
    </li>
  )
}
