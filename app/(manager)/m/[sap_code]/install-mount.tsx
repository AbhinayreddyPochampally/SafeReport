"use client"

import { IosInstallCarousel } from "@/components/ios-install-carousel"

/**
 * Client-only mount wrapper for the iOS install carousel on the manager
 * pre-login screen.
 *
 * Rendered ONLY in the logged-out branch of `/m/[sap_code]/page.tsx` —
 * not for the post-login inbox surface. The carousel goal is to be the
 * first thing a store manager sees on their first iOS visit; once they're
 * signed in, the inbox is the source of truth and we never want a modal
 * sitting on top of an active queue.
 *
 * Persistence: localStorage. Unlike the reporter surface, store managers
 * are named individuals who sign in repeatedly from the same device. Once
 * they've dismissed the walkthrough (whether they installed or not), it
 * should stay dismissed across sessions — re-surfacing on every login
 * attempt would be noise.
 */
export function ManagerIosInstallMount() {
  return (
    <IosInstallCarousel
      surface="manager"
      storageKey="sr_mgr_ios_install_dismissed"
      persistence="local"
    />
  )
}
