"use client"

import {
  Bell,
  BellOff,
  Check,
  ChevronRight,
  Clock,
  Download,
  MessageSquare,
  RotateCcw,
  Share2,
} from "lucide-react"
import { useEffect, useState } from "react"
import { AppIcon } from "@/components/app-icon"

/**
 * Manager onboarding overlay — install + allow-notifications gates.
 *
 * Runs once per device, on top of the just-logged-in manager inbox.
 *
 *  Step 1: Install the PWA.
 *    - Android Chrome: capture `beforeinstallprompt`, fire `.prompt()` on
 *      tap, show waiting / success / declined feedback in our own button.
 *    - iOS Safari: no JS install API → render manual Share → Add to Home
 *      Screen instructions inline with a "Got it, continue" dismiss.
 *    - Both: "Continue in browser" skip link that records the decision so
 *      the manager isn't asked again on this device.
 *
 *  Step 2: Allow notifications.
 *    - Shown unconditionally after Step 1 (install decided — success OR
 *      skip), matching install_notification_design_v3 which places the ask
 *      between Login and Inbox regardless of standalone mode. Previous
 *      revision gated this on isStandalone so a browser-mode manager never
 *      saw the ask; the mockup-audit flagged that as a divergence.
 *    - Three trigger rows explain when the manager will be pinged: new
 *      report, HO return, report waiting (24h+).
 *    - Allow → Notification.requestPermission(). On grant, success state.
 *      On deny, soft "you can change this in browser settings" copy.
 *    - "Not now" records the decision and dismisses.
 *    - Gracefully no-ops when the Notification API is unavailable (old
 *      Android WebView etc.) — we transition straight to "hidden" instead
 *      of showing a useless ask. On iOS Safari in browser mode the API
 *      exists; requestPermission may resolve to denied, which is handled
 *      by the declined state in the existing UI.
 *
 * Both steps are one-time per device. localStorage holds the flags so
 * future sign-ins (cookie expired → re-login) skip onboarding.
 *
 * Mounted inside <ManagerInbox> — overlays the inbox until both gates
 * pass or the manager skips out.
 */

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

type Step = "loading" | "install_android" | "install_ios" | "notif" | "hidden"
type ActionState = "idle" | "waiting" | "success" | "declined"

const STORAGE_INSTALL_KEY = "sr_mgr_install_decided"
const STORAGE_NOTIF_KEY = "sr_mgr_notif_decided"

export function ManagerOnboarding() {
  const [step, setStep] = useState<Step>("loading")
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [installAction, setInstallAction] = useState<ActionState>("idle")
  const [notifAction, setNotifAction] = useState<ActionState>("idle")

  useEffect(() => {
    if (typeof window === "undefined") return

    const handler = (e: Event) => {
      e.preventDefault()
      setInstallEvent(e as BeforeInstallPromptEvent)
    }
    window.addEventListener("beforeinstallprompt", handler)

    const ua = navigator.userAgent
    const isIos = /iphone|ipad|ipod/i.test(ua)
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true

    // Decide initial step.
    //
    // Notif-step gate (shared between standalone + browser paths):
    //   - Notification API exists in window
    //   - Browser permission is still "default" (user hasn't already
    //     granted or blocked)
    //   - We haven't already recorded a decision this device
    const supportsNotif = "Notification" in window
    const notifPerm = supportsNotif ? Notification.permission : "denied"
    const notifDecided = localStorage.getItem(STORAGE_NOTIF_KEY) === "1"
    const notifAsk = supportsNotif && notifPerm === "default" && !notifDecided
    const installDecided = localStorage.getItem(STORAGE_INSTALL_KEY) === "1"

    if (isStandalone) {
      // Already installed — install step doesn't apply, jump straight to
      // the notif ask (or hidden if nothing to ask).
      setStep(notifAsk ? "notif" : "hidden")
    } else if (!installDecided) {
      // Browser — start at the install step. Notif ask follows after the
      // manager either installs or skips (see transitionPostInstall).
      setStep(isIos ? "install_ios" : "install_android")
    } else {
      // Browser, install already decided previously — don't re-nag the
      // install, but DO surface the notif ask if it's still open (mockup
      // calls for the ask between login and inbox regardless of standalone).
      setStep(notifAsk ? "notif" : "hidden")
    }

    return () => window.removeEventListener("beforeinstallprompt", handler)
  }, [])

  // Decide what to render after the install step is "decided" (either
  // the install completed, or the manager skipped). The mockup
  // (install_notification_design_v3) puts the notif ask unconditionally
  // here, so we route to the notif step whenever it would do anything
  // useful (API exists, permission is still "default", not already
  // decided this session) and fall through to hidden otherwise.
  function transitionPostInstall() {
    if (typeof window === "undefined") {
      setStep("hidden")
      return
    }
    const supportsNotif = "Notification" in window
    const notifPerm = supportsNotif ? Notification.permission : "denied"
    const notifDecided = localStorage.getItem(STORAGE_NOTIF_KEY) === "1"
    if (!supportsNotif || notifPerm !== "default" || notifDecided) {
      setStep("hidden")
    } else {
      setStep("notif")
    }
  }

  async function handleInstall() {
    if (!installEvent) {
      // No event captured (event hasn't fired yet OR browser doesn't support it).
      // Switch to the iOS-style manual instructions as a fallback so the manager
      // has SOME path forward — better than a dead button.
      setStep("install_ios")
      return
    }
    setInstallAction("waiting")
    try {
      await installEvent.prompt()
      const choice = await installEvent.userChoice
      if (choice.outcome === "accepted") {
        setInstallAction("success")
        localStorage.setItem(STORAGE_INSTALL_KEY, "1")
        // After install, fade in the notification ask. (Previously the
        // overlay just dismissed itself and waited for the manager to
        // re-launch via the home-screen icon to trigger the standalone-
        // only notif gate — the mockup wants the ask unconditionally,
        // so we ask right here on the browser tab.)
        setTimeout(() => transitionPostInstall(), 1800)
      } else {
        setInstallAction("declined")
      }
    } catch {
      setInstallAction("declined")
    }
  }

  function skipInstall() {
    localStorage.setItem(STORAGE_INSTALL_KEY, "1")
    // Mockup: even when the manager declines install, they still see the
    // notif ask before the inbox. Old behavior dropped them straight into
    // the inbox with no chance to enable alerts unless they later
    // re-installed and re-opened from the home screen.
    transitionPostInstall()
  }

  async function handleNotif() {
    if (!("Notification" in window)) {
      setStep("hidden")
      return
    }
    setNotifAction("waiting")
    try {
      const result = await Notification.requestPermission()
      localStorage.setItem(STORAGE_NOTIF_KEY, "1")
      if (result === "granted") {
        setNotifAction("success")
        setTimeout(() => setStep("hidden"), 1600)
      } else {
        setNotifAction("declined")
      }
    } catch {
      setNotifAction("declined")
    }
  }

  function skipNotif() {
    localStorage.setItem(STORAGE_NOTIF_KEY, "1")
    setStep("hidden")
  }

  if (step === "loading" || step === "hidden") return null

  /* ----------- INSTALL (Android Chrome) ----------- */
  if (step === "install_android") {
    return (
      <Overlay onSkip={skipInstall} skipLabel="Continue in browser">
        <Hero>
          <Download className="h-12 w-12" strokeWidth={1.6} aria-hidden />
        </Hero>
        <Title>Install SafeReport</Title>
        <Sub>One-tap access to your inbox. Receive alerts when reports come in or Head Office responds.</Sub>
        <button
          type="button"
          onClick={handleInstall}
          disabled={installAction === "waiting" || installAction === "success"}
          className={
            installAction === "success"
              ? "mt-2 inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-teal-700 px-6 text-[15px] font-semibold text-white"
              : installAction === "waiting"
                ? "mt-2 inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-slate-200 px-6 text-[15px] font-semibold text-slate-700"
                : installAction === "declined"
                  ? "mt-2 inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl border border-orange-700 bg-white px-6 text-[15px] font-semibold text-orange-700"
                  : "mt-2 inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-indigo-700 px-6 text-[15px] font-semibold text-white transition hover:bg-indigo-900"
          }
        >
          {installAction === "success" ? (
            <>
              <Check className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
              SafeReport installed
            </>
          ) : installAction === "waiting" ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" aria-hidden />
              Waiting for Chrome…
            </>
          ) : installAction === "declined" ? (
            <>
              <RotateCcw className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden />
              Try again
            </>
          ) : (
            <>
              <Download className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden />
              Install SafeReport
            </>
          )}
        </button>
        {installAction === "idle" ? (
          <p className="mt-2 text-center text-[11.5px] text-slate-500">
            Chrome will show a system dialog to confirm.
          </p>
        ) : null}
      </Overlay>
    )
  }

  /* ----------- INSTALL (iOS Safari) ----------- */
  if (step === "install_ios") {
    return (
      <Overlay onSkip={skipInstall} skipLabel="Continue in Safari">
        <Hero>
          <Share2 className="h-12 w-12" strokeWidth={1.6} aria-hidden />
        </Hero>
        <Title>Add to your home screen</Title>
        <Sub>One-tap access to your inbox. Receive alerts when reports come in or Head Office responds.</Sub>
        <ol className="mt-3 space-y-2">
          <IosStep n={1}>
            Tap the{" "}
            <span className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-0.5">
              <Share2 className="h-3 w-3" strokeWidth={2} aria-hidden />
              <span className="text-[11px]">Share</span>
            </span>{" "}
            icon at the bottom of Safari.
          </IosStep>
          <IosStep n={2}>
            Choose <strong>&ldquo;Add to Home Screen&rdquo;</strong>.
          </IosStep>
          <IosStep n={3}>
            Tap <strong>&ldquo;Add&rdquo;</strong> in the top-right.
          </IosStep>
        </ol>
        <p className="mt-3 text-center text-[12px] text-slate-500">
          Then reopen SafeReport from your home screen to finish setup.
        </p>
      </Overlay>
    )
  }

  /* ----------- ALLOW NOTIFICATIONS ----------- */
  if (step === "notif") {
    return (
      <Overlay onSkip={skipNotif} skipLabel="Not now">
        <Hero
          className={
            notifAction === "success"
              ? "bg-teal-100 text-teal-700"
              : notifAction === "declined"
                ? "bg-orange-100 text-orange-700"
                : "bg-indigo-50 text-indigo-700"
          }
        >
          {notifAction === "success" ? (
            <Check className="h-12 w-12" strokeWidth={2.2} aria-hidden />
          ) : notifAction === "declined" ? (
            <BellOff className="h-12 w-12" strokeWidth={1.6} aria-hidden />
          ) : (
            <Bell className="h-12 w-12" strokeWidth={1.6} aria-hidden />
          )}
        </Hero>
        <Title>
          {notifAction === "success"
            ? "Notifications enabled"
            : notifAction === "declined"
              ? "Notifications off"
              : "Allow notifications"}
        </Title>
        <Sub>
          {notifAction === "success"
            ? "We'll ping you when a new report arrives, when Head Office returns a resolution, or when a report needs your attention."
            : notifAction === "declined"
              ? "You won't get pings — you'll still see new reports when you open the inbox. To turn on later: browser settings → Site permissions → Notifications → Allow."
              : "SafeReport pings you only when something needs your attention."}
        </Sub>
        {notifAction === "idle" || notifAction === "waiting" ? (
          <div className="my-1 rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-1">
            <Trigger icon={<MessageSquare className="h-4 w-4" strokeWidth={2} aria-hidden />}>
              A new report arrives in your inbox
            </Trigger>
            <Trigger icon={<RotateCcw className="h-4 w-4" strokeWidth={2} aria-hidden />}>
              Head Office returns a resolution for revision
            </Trigger>
            <Trigger icon={<Clock className="h-4 w-4" strokeWidth={2} aria-hidden />}>
              A report you haven&apos;t opened yet
            </Trigger>
          </div>
        ) : null}
        <button
          type="button"
          onClick={notifAction === "success" || notifAction === "declined" ? skipNotif : handleNotif}
          disabled={notifAction === "waiting"}
          className={
            notifAction === "success"
              ? "mt-2 inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-teal-700 px-6 text-[15px] font-semibold text-white"
              : notifAction === "declined"
                ? "mt-2 inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-indigo-700 px-6 text-[15px] font-semibold text-white"
                : notifAction === "waiting"
                  ? "mt-2 inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-slate-200 px-6 text-[15px] font-semibold text-slate-700"
                  : "mt-2 inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-indigo-700 px-6 text-[15px] font-semibold text-white transition hover:bg-indigo-900"
          }
        >
          {notifAction === "success" || notifAction === "declined" ? (
            <>
              Continue to Inbox
              <ChevronRight className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
            </>
          ) : notifAction === "waiting" ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" aria-hidden />
              Waiting for permission…
            </>
          ) : (
            "Allow notifications"
          )}
        </button>
      </Overlay>
    )
  }

  return null
}

/* -------- shared layout primitives -------- */

function Overlay({
  children,
  onSkip,
  skipLabel,
}: {
  children: React.ReactNode
  onSkip: () => void
  skipLabel: string
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex flex-col bg-slate-50 px-6 pb-6 pt-8"
    >
      {/* Designed APP icon at top-left — persistent identity across the
          manager flow. */}
      <div className="flex items-center justify-between">
        <AppIcon
          size={40}
          className="rounded-[10px] shadow-[0_2px_6px_rgba(10,31,70,0.18)]"
        />
        <button
          type="button"
          onClick={onSkip}
          className="text-[13px] font-medium text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline"
        >
          {skipLabel}
        </button>
      </div>
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center">
        {children}
      </div>
    </div>
  )
}

function Hero({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      aria-hidden
      className={
        className ??
        "mx-auto mb-5 inline-flex h-[108px] w-[108px] items-center justify-center rounded-[22px] bg-indigo-50 text-indigo-700"
      }
      style={
        className
          ? {
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 108,
              height: 108,
              borderRadius: 22,
              margin: "0 auto 20px",
            }
          : undefined
      }
    >
      {children}
    </div>
  )
}

function Title({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="font-display text-center text-[22px] font-bold leading-tight tracking-tight text-slate-900">
      {children}
    </h1>
  )
}

function Sub({ children }: { children: React.ReactNode }) {
  return (
    <p className="mx-auto mt-2 mb-5 max-w-[290px] text-center text-[13.5px] leading-[1.55] text-slate-600">
      {children}
    </p>
  )
}

function Trigger({
  icon,
  children,
}: {
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-2.5 border-b border-dashed border-slate-200 py-2 last:border-b-0">
      <span className="mt-0.5 flex-shrink-0 text-slate-500">{icon}</span>
      <span className="text-[12.5px] leading-snug text-slate-800">{children}</span>
    </div>
  )
}

function IosStep({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
      <span className="inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-indigo-700 text-[12px] font-bold text-white">
        {n}
      </span>
      <span className="text-[12.5px] leading-snug text-slate-800">{children}</span>
    </li>
  )
}
