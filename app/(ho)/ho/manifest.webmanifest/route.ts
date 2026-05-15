import { NextResponse } from "next/server"

/**
 * HO console web app manifest.
 *
 * Why this exists as its own route handler instead of relying on the root
 * `app/manifest.ts`:
 *
 * The root manifest's `start_url` is `/`, and `app/page.tsx` redirects `/`
 * to `/r/PNT-MUM-047` (the demo store reporter landing — a sensible
 * destination for someone who typed the bare domain, but the wrong
 * destination for an installed HO app). So when an HO user clicked
 * "Install app" on /ho or /ho/stores, the installed icon would open the
 * **demo store's reporter flow** instead of the HO console.
 *
 * Fix: serve a per-surface manifest. This one binds `start_url` and `id`
 * to `/ho`, so the installed launcher tile reopens the HO console.
 *
 * Same trick the per-store reporter manifest uses
 * (`app/(reporter)/r/[sap_code]/manifest.webmanifest/route.ts`) — different
 * `id` per manifest means Chromium treats this install as a distinct app
 * from the reporter PWA. An HO user who covers a store on the reporter
 * side can install both icons and they don't fight.
 *
 * Unauthenticated route: returning the manifest body doesn't leak any
 * data, and we need it to be fetchable from a logged-out /ho/login page
 * too. The middleware allowlists this path; if it ever stops doing that
 * the manifest 401s and Chromium silently falls back to root.
 */

export const dynamic = "force-static"

export function GET() {
  const manifest = {
    name: "SafeReport — Head Office",
    short_name: "SafeReport HO",
    description:
      "SafeReport Head Office Console — pilot-wide approvals, analytics, and store roster for ABF.",
    // The pair that does the work: launcher tile reopens /ho, and the
    // unique `id` keeps this PWA install slot separate from the reporter
    // and (future) manager installs.
    start_url: "/ho",
    id: "/ho",
    // `scope: "/"` so that in-app navigation across /ho/* stays inside the
    // standalone window (any link out to /r or /m still opens, just inside
    // the same PWA frame, which is fine for the pilot).
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#0A1F46", // matches the SafeReport icon navy
    theme_color: "#0A1F46",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  }

  return NextResponse.json(manifest, {
    headers: {
      "Content-Type": "application/manifest+json",
      // Manifest content is static — long cache is fine. Bumping the file
      // name (or busting via deploy) is how we'd push a change.
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  })
}
