import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { createHash } from "node:crypto"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

/**
 * POST /api/visits/log — reporter-landing visit beacon.
 *
 * The reporter landing (/r/[sap_code]) fires a single sendBeacon to this
 * endpoint on mount. We persist one row in `page_visits` per accepted call,
 * keyed by SAP code + source ('qr' if the URL carried ?src=qr, 'direct'
 * otherwise) and tagged with a per-day visitor fingerprint hash so HO can
 * count unique visitors without storing identifying info.
 *
 * SECURITY / ABUSE STORY:
 *  - Endpoint is unauthenticated by design (the reporter PWA has no
 *    session). We protect against spam by:
 *      1. Validating the SAP code exists in `v_store_public` before
 *         writing — random codes get rejected.
 *      2. Setting a short cookie `sr_visit_${sap_code}` with a 60-second
 *         TTL. If the cookie is present on a subsequent call, we silently
 *         skip the write. A real reporter only triggers one insert per
 *         minute per store per browser. Refreshes don't inflate counts.
 *      3. The fingerprint is a sha-256 of (user-agent + UTC date), first
 *         16 hex chars. Deterministic within a day, opaque across days,
 *         not reversible to PII.
 *
 * BEACON SHAPE: the client posts JSON `{ sap_code, source }`. sendBeacon
 * sets the request method to POST and the Content-Type to 'text/plain' by
 * default — we parse manually with `req.text()` then JSON.parse, so the
 * route survives either Content-Type.
 *
 * Response is always a tiny JSON object — the client ignores it. We never
 * 500 a tracking call into a user-visible error, so anything unexpected
 * downgrades to a 204-ish "ok: false" response with no row inserted.
 */
export async function POST(req: NextRequest) {
  let body: { sap_code?: unknown; source?: unknown } = {}
  try {
    const text = await req.text()
    body = text ? (JSON.parse(text) as typeof body) : {}
  } catch {
    return NextResponse.json({ ok: false, reason: "bad_json" }, { status: 200 })
  }

  const sapCode = typeof body.sap_code === "string" ? body.sap_code.trim() : ""
  const source = body.source === "qr" ? "qr" : "direct"

  // SAP codes are uppercase letters / digits / dashes only. Reject anything
  // else without burning a DB round-trip.
  if (!sapCode || !/^[A-Z0-9-]{3,32}$/.test(sapCode)) {
    return NextResponse.json(
      { ok: false, reason: "bad_sap" },
      { status: 200 },
    )
  }

  // Throttle: if the visitor already has the per-store cookie, skip.
  const cookieName = `sr_visit_${sapCode}`
  const hasRecent = req.cookies.get(cookieName)
  if (hasRecent) {
    return NextResponse.json({ ok: true, throttled: true }, { status: 200 })
  }

  const admin = createSupabaseAdminClient()

  // Confirm the store exists and is active before writing. Avoids
  // accumulating noise from random scans/probes hitting bogus SAP codes.
  const storeResp = await admin
    .from("v_store_public")
    .select("sap_code, status")
    .eq("sap_code", sapCode)
    .maybeSingle<{ sap_code: string; status: string }>()
  if (storeResp.error || !storeResp.data || storeResp.data.status !== "active") {
    return NextResponse.json(
      { ok: false, reason: "store_unavailable" },
      { status: 200 },
    )
  }

  // Visitor fingerprint — daily-rotating hash over the UA string. Lets us
  // count unique visitors without storing reversible identifiers. The
  // "daily" rotation is intentional: someone visiting 3× in one day counts
  // as one unique visitor; the same browser visiting two days apart counts
  // as two. Matches what most lightweight analytics products do.
  const ua = req.headers.get("user-agent") ?? ""
  const dayKey = new Date().toISOString().slice(0, 10)
  const fingerprint = createHash("sha256")
    .update(`${ua}|${dayKey}`)
    .digest("hex")
    .slice(0, 16)

  const insertResp = await admin.from("page_visits").insert({
    sap_code: sapCode,
    source,
    visitor_fingerprint: fingerprint,
  })
  if (insertResp.error) {
    console.warn("[visits/log] insert failed", insertResp.error.message)
    return NextResponse.json(
      { ok: false, reason: "insert_failed" },
      { status: 200 },
    )
  }

  const res = NextResponse.json({ ok: true }, { status: 200 })
  // 60s throttle cookie — long enough to absorb the rapid double-fires that
  // Strict-Mode dev re-renders and back/forward navigation cause, short
  // enough that a genuine separate visit later in the same session still
  // counts.
  res.cookies.set({
    name: cookieName,
    value: "1",
    maxAge: 60,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  })
  return res
}
