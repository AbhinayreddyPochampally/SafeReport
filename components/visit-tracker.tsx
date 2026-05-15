"use client"

import { useEffect } from "react"

/**
 * Fire-and-forget visit beacon for the reporter landing.
 *
 * Renders nothing. On mount, sends a single POST to /api/visits/log with
 * the store's SAP code and a `source` tag ('qr' if the URL carried
 * ?src=qr, 'direct' otherwise).
 *
 * Why `navigator.sendBeacon`:
 *   - It dispatches in the background and survives a quick tab close —
 *     important on mobile where a reporter might scan, see the page, and
 *     immediately put the phone away.
 *   - It doesn't hold up rendering or paint.
 *   - The browser handles the request lifecycle, so we don't need an
 *     AbortController or any retry plumbing.
 *
 * The server enforces a 60-second per-store cookie throttle, so the
 * Strict-Mode double-effect in dev or a back/forward refresh won't
 * inflate counts. We could also dedupe client-side via sessionStorage,
 * but the server cookie is authoritative — keeping the client thin.
 *
 * Fallback: if sendBeacon isn't available (very old browsers), fall
 * through to fetch() with keepalive. If neither exists, drop the call —
 * a missing tracker is never worth breaking the page over.
 */
export function VisitTracker({
  sap_code,
  source,
}: {
  sap_code: string
  source: "qr" | "direct"
}) {
  useEffect(() => {
    try {
      const body = JSON.stringify({ sap_code, source })
      if (
        typeof navigator !== "undefined" &&
        typeof navigator.sendBeacon === "function"
      ) {
        // sendBeacon expects a Blob, ArrayBuffer, FormData, or string. A
        // Blob with explicit Content-Type lets the route parse it as JSON.
        const blob = new Blob([body], { type: "application/json" })
        navigator.sendBeacon("/api/visits/log", blob)
        return
      }
      if (typeof fetch === "function") {
        void fetch("/api/visits/log", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true,
        }).catch(() => {
          // Swallow — telemetry must never break the user-visible flow.
        })
      }
    } catch {
      // Never propagate.
    }
  }, [sap_code, source])

  return null
}
