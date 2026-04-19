import { NextResponse } from "next/server"

/**
 * GET /api/push/vapid-public-key
 *
 * Returns the VAPID public key as a base64url string, or an empty
 * string if the environment isn't configured. The browser needs this
 * BEFORE it calls `pushManager.subscribe()` so we can't avoid the
 * round trip.
 *
 * Returning empty (rather than 404) lets the client treat "push not
 * configured yet" as a no-op without exception spam.
 */
export function GET() {
  const key = process.env.VAPID_PUBLIC_KEY ?? ""
  return NextResponse.json({ public_key: key })
}
