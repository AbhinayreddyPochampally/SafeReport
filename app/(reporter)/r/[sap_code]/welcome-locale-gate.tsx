"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"

/**
 * Client gate mounted on the welcome landing — if the reporter doesn't
 * have a locale set in localStorage yet, send them to /language. That
 * makes Language the literal first interactive page in the Intro →
 * Language → flow order, where the cinematic intro overlay paints.
 *
 * Returning reporters with `sr_locale` set bypass this gate and the
 * welcome page renders normally.
 *
 * Renders nothing visually — just a side-effect redirect on mount.
 */
const LOCALE_KEY = "sr_locale"

export function WelcomeLocaleGate({ sap_code }: { sap_code: string }) {
  const router = useRouter()

  useEffect(() => {
    try {
      const locale = window.localStorage.getItem(LOCALE_KEY)
      if (!locale) {
        router.replace(`/r/${sap_code}/language`)
      }
    } catch {
      // localStorage unavailable (private mode, etc.) — let the welcome
      // page render normally. The "Change language" link is still there
      // so the reporter can pick if they want to.
    }
  }, [router, sap_code])

  return null
}
