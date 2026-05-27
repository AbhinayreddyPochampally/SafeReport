"use client"

import { IosInstallCarousel } from "@/components/ios-install-carousel"

/**
 * Client-only mount wrapper for the iOS install carousel on the reporter
 * confirmation screen.
 *
 * The carousel itself is self-gating (returns null on non-iOS UA, on already-
 * installed standalone sessions, and after a session-scoped dismissal), so
 * this wrapper just has to exist as a client component because the host
 * confirm page is a server component and can't `"use client"` itself.
 *
 * Persistence: sessionStorage. Reporters in the pilot are off-roll staff
 * who scan the QR infrequently, so a fresh tab session should re-surface
 * the walkthrough for anyone who tapped dismiss last visit but never
 * actually installed. That's the same persistence shape the pwa-install
 * prompt uses on the landing — see CLAUDE.md §"PWA install nag".
 */
export function ReporterIosInstallMount() {
  return (
    <IosInstallCarousel
      surface="reporter"
      storageKey="sr_ios_install_dismissed_session"
      persistence="session"
    />
  )
}
