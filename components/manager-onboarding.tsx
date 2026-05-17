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
  ShieldCheck,
} from "lucide-react"
import { useEffect, useState } from "react"

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
 *    - Only shown when running in standalone mode (display-mode: standalone
 *      or navigator.standalone on iOS Safari). Web push requires the PWA
 *      to be installed on iOS 16.4+ so this gate naturally falls AFTER step 1.
 *    - Three trigger rows explain when the manager will be pinged: new
 *      report, HO return, report waiting (24h+).
 *    - Allow → Notification.requestPermission(). On grant, success state.
 *      On deny, soft "you can change this in browser settings" copy.
 *    - "Not now" records the decision and dismisses.
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

    if (isStandalone) {
      // Already installed — check notification step
      const supportsNotif = "Notification" in window
      const notifPerm = supportsNotif ? Notification.permission : "denied"
      const notifDecided = localStorage.getItem(STORAGE_NOTIF_KEY) === "1"
      if (!supportsNotif || notifPerm !== "default" || notifDecided) {
        setStep("hidden")
      } else {
        setStep("notif")
      }
    } else {
      // Browser — install step (unless already decided)
      const installDecided = localStorage.getItem(STORAGE_INSTALL_KEY) === "1"
      if (installDecided) {
        setStep("hidden")
      } else if (isIos) {
        setStep("install_ios")
      } else {
        setStep("install_android")
      }
    }

    return () => window.removeEventListener("beforeinstallprompt", handler)
  }, [])

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
        // After install, the manager typically opens the app from the home
        // screen — that launch will detect standalone and surface the notif
        // step. We dismiss the overlay here so the inbox is visible while
        // they make that home-screen tap.
        setTimeout(() => setStep("hidden"), 1800)
      } else {
        setInstallAction("declined")
      }
    } catch {
      setInstallAction("declined")
    }
  }

  function skipInstall() {
    localStorage.setItem(STORAGE_INSTALL_KEY, "1")
    setStep("hidden")
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
      {/* APP icon at top-left — persistent identity across the manager flow */}
      <div className="flex items-center justify-between">
        <span
          aria-label="SafeReport"
          className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] bg-indigo-700 text-white shadow-[0_2px_6px_rgba(67,56,202,0.25)]"
        >
          <ShieldCheck className="h-6 w-6" strokeWidth={2} aria-hidden />
        </span>
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
