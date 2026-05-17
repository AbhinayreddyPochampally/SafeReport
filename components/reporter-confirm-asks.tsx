"use client"

import { Bell, Download, Share2, X } from "lucide-react"
import { useEffect, useState } from "react"

/**
 * Reporter Confirm-screen install + notification ask card.
 *
 * Replaces the old landing-page PWA nag (which was confusing for first-time
 * reporters). The ask lives on the Confirm screen after a successful
 * submission — the moment of strongest commitment — and frames itself
 * around the just-filed report ("We'll let you know when SR-XXXXXX is
 * resolved").
 *
 * Three states, gated by client-side detection:
 *  - In browser, PWA not installed         → show install ask card
 *  - Standalone (installed), notif unset   → show notification ask card
 *  - Already granted / explicitly declined → render nothing
 *
 * Persistence:
 *  - "Not now" sets sr_install_decided / sr_notif_decided in localStorage
 *    so we don't re-ask on the same device within a few visits.
 *  - On the NEXT successful submission, the flags are cleared so the
 *    reporter sees the ask again (persistent behavior per design).
 *    This re-ask logic lives in the caller (ConfirmPage's mount effect).
 *
 * iOS Safari: no JS install API. We render manual instructions inline
 * ("Tap Share → Add to Home Screen") when the platform is iOS and not
 * already installed.
 */

type AskState = "loading" | "install_browser" | "install_ios" | "notif_ask" | "hidden"

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

type ActionState = "idle" | "waiting" | "success" | "declined"

const STORAGE_INSTALL_KEY = "sr_install_decided"
const STORAGE_NOTIF_KEY = "sr_notif_decided"

export function ReporterConfirmAsks({ reportId }: { reportId: string }) {
  const [state, setState] = useState<AskState>("loading")
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [installAction, setInstallAction] = useState<ActionState>("idle")
  const [notifAction, setNotifAction] = useState<ActionState>("idle")

  useEffect(() => {
    if (typeof window === "undefined") return

    // Listen for the install prompt event on Android Chrome
    const handler = (e: Event) => {
      e.preventDefault()
      setInstallEvent(e as BeforeInstallPromptEvent)
    }
    window.addEventListener("beforeinstallprompt", handler)

    // Detect state
    const ua = navigator.userAgent
    const isIos = /iphone|ipad|ipod/i.test(ua)
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // iOS Safari only exposes this on the standalone window
      (window.navigator as unknown as { standalone?: boolean }).standalone === true

    if (isStandalone) {
      // Inside installed PWA — check notification state
      const supportsNotif = "Notification" in window
      const notifPerm = supportsNotif ? Notification.permission : "denied"
      const notifDecided = localStorage.getItem(STORAGE_NOTIF_KEY) === "1"
      if (!supportsNotif || notifPerm === "granted" || notifPerm === "denied" || notifDecided) {
        setState("hidden")
      } else {
        setState("notif_ask")
      }
    } else {
      // In browser — install ask (unless already declined)
      const installDecided = localStorage.getItem(STORAGE_INSTALL_KEY) === "1"
      if (installDecided) {
        setState("hidden")
      } else if (isIos) {
        setState("install_ios")
      } else {
        setState("install_browser")
      }
    }

    return () => window.removeEventListener("beforeinstallprompt", handler)
  }, [])

  async function handleInstall() {
    if (!installEvent) {
      // Event hasn't fired yet (or browser doesn't support it).
      // On Android Chrome the event normally fires within ~1s of load —
      // if it's missing, fall through to the iOS-style manual hint state.
      setState("install_ios")
      return
    }
    setInstallAction("waiting")
    try {
      await installEvent.prompt()
      const choice = await installEvent.userChoice
      if (choice.outcome === "accepted") {
        setInstallAction("success")
        localStorage.setItem(STORAGE_INSTALL_KEY, "1")
        // Hide after a beat so the success state is visible
        setTimeout(() => setState("hidden"), 1600)
      } else {
        setInstallAction("declined")
      }
    } catch {
      setInstallAction("declined")
    }
  }

  async function handleNotif() {
    if (!("Notification" in window)) {
      setState("hidden")
      return
    }
    setNotifAction("waiting")
    try {
      const result = await Notification.requestPermission()
      localStorage.setItem(STORAGE_NOTIF_KEY, "1")
      if (result === "granted") {
        setNotifAction("success")
        setTimeout(() => setState("hidden"), 1600)
      } else {
        setNotifAction("declined")
      }
    } catch {
      setNotifAction("declined")
    }
  }

  function dismissInstall() {
    localStorage.setItem(STORAGE_INSTALL_KEY, "1")
    setState("hidden")
  }

  function dismissNotif() {
    localStorage.setItem(STORAGE_NOTIF_KEY, "1")
    setState("hidden")
  }

  if (state === "loading" || state === "hidden") return null

  if (state === "install_browser") {
    return (
      <div className="mt-6 w-full rounded-2xl border border-slate-200 bg-white p-4 text-left">
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700"
          >
            <Download className="h-5 w-5" strokeWidth={1.8} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-[14.5px] font-semibold leading-snug text-slate-900">
              Install SafeReport
            </p>
            <p className="mt-0.5 text-[12.5px] leading-snug text-slate-600">
              {reportId
                ? `We'll let you know when ${reportId} is resolved.`
                : "We'll let you know when your report is resolved."}
            </p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={handleInstall}
            disabled={installAction === "waiting" || installAction === "success"}
            className={
              installAction === "success"
                ? "flex-1 rounded-[10px] bg-teal-700 px-4 py-2.5 text-[13px] font-semibold text-white"
                : installAction === "waiting"
                  ? "flex-1 rounded-[10px] bg-slate-200 px-4 py-2.5 text-[13px] font-semibold text-slate-700"
                  : "flex-1 rounded-[10px] bg-indigo-700 px-4 py-2.5 text-[13px] font-semibold text-white transition hover:bg-indigo-900"
            }
          >
            {installAction === "success"
              ? "✓ Installed"
              : installAction === "waiting"
                ? "Waiting…"
                : installAction === "declined"
                  ? "Try again"
                  : "Install"}
          </button>
          <button
            type="button"
            onClick={dismissInstall}
            className="text-[12px] text-slate-500 underline-offset-2 hover:underline"
          >
            Not now
          </button>
        </div>
      </div>
    )
  }

  if (state === "install_ios") {
    return (
      <div className="mt-6 w-full rounded-2xl border border-slate-200 bg-white p-4 text-left">
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700"
          >
            <Share2 className="h-5 w-5" strokeWidth={1.8} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-[14.5px] font-semibold leading-snug text-slate-900">
              Add to home screen
            </p>
            <p className="mt-0.5 text-[12.5px] leading-snug text-slate-600">
              {reportId
                ? `Get notified when ${reportId} is resolved.`
                : "Get notified when your report is resolved."}
            </p>
          </div>
        </div>
        <ol className="mt-3 space-y-2 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-[12px] text-slate-700">
          <li className="flex items-center gap-2">
            <span className="inline-flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-full bg-indigo-700 text-[10.5px] font-bold text-white">
              1
            </span>
            <span>
              Tap the{" "}
              <span className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-1.5 py-0.5">
                <Share2 className="h-3 w-3" strokeWidth={2} aria-hidden />
                <span className="text-[10.5px]">Share</span>
              </span>{" "}
              icon at the bottom of Safari
            </span>
          </li>
          <li className="flex items-center gap-2">
            <span className="inline-flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-full bg-indigo-700 text-[10.5px] font-bold text-white">
              2
            </span>
            <span>
              Choose <strong>"Add to Home Screen"</strong>
            </span>
          </li>
          <li className="flex items-center gap-2">
            <span className="inline-flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-full bg-indigo-700 text-[10.5px] font-bold text-white">
              3
            </span>
            <span>
              Tap <strong>"Add"</strong>
            </span>
          </li>
        </ol>
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={dismissInstall}
            className="text-[12px] text-slate-500 underline-offset-2 hover:underline"
          >
            Not now
          </button>
        </div>
      </div>
    )
  }

  if (state === "notif_ask") {
    return (
      <div className="mt-6 w-full rounded-2xl border border-indigo-100 bg-gradient-to-b from-white to-indigo-50/40 p-4 text-left">
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700"
          >
            <Bell className="h-5 w-5" strokeWidth={1.8} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-[14.5px] font-semibold leading-snug text-slate-900">
              Want to know when this is resolved?
            </p>
            <p className="mt-0.5 text-[12.5px] leading-snug text-slate-600">
              {reportId
                ? `We'll ping you once the safety team closes ${reportId}.`
                : "We'll ping you once the safety team closes your report."}
            </p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={handleNotif}
            disabled={notifAction === "waiting" || notifAction === "success"}
            className={
              notifAction === "success"
                ? "flex-1 rounded-[10px] bg-teal-700 px-4 py-2.5 text-[13px] font-semibold text-white"
                : notifAction === "waiting"
                  ? "flex-1 rounded-[10px] bg-slate-200 px-4 py-2.5 text-[13px] font-semibold text-slate-700"
                  : notifAction === "declined"
                    ? "flex-1 rounded-[10px] border border-orange-700 bg-white px-4 py-2.5 text-[13px] font-semibold text-orange-700"
                    : "flex-1 rounded-[10px] bg-indigo-700 px-4 py-2.5 text-[13px] font-semibold text-white transition hover:bg-indigo-900"
            }
          >
            {notifAction === "success"
              ? "✓ Notifications on"
              : notifAction === "waiting"
                ? "Waiting…"
                : notifAction === "declined"
                  ? "Denied — change in browser settings"
                  : "Allow notifications"}
          </button>
          <button
            type="button"
            onClick={dismissNotif}
            className="text-[12px] text-slate-500 underline-offset-2 hover:underline"
          >
            Not now
          </button>
        </div>
      </div>
    )
  }

  return null
}
