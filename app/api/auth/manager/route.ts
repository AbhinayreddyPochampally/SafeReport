import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import {
  clearAttempts,
  getManagerSession,
  managerCookieName,
  managerCookieOptions,
  msUntilUnlock,
  recordFailedAttempt,
  signManagerJwt,
} from "@/lib/manager-auth"

/**
 * Manager PIN auth.
 *
 *   POST   /api/auth/manager   { sap_code, pin }  → set sr_mgr cookie
 *   DELETE /api/auth/manager                       → clear sr_mgr cookie
 *   GET    /api/auth/manager                       → check current session
 *
 * Uses the service-role Supabase client to read `stores.manager_pin_hash`
 * because RLS on `stores` blocks anon reads of the hash column. A 3-strike
 * lockout per SAP code (15-minute window) lives in process memory; good
 * enough for a single-instance pilot.
 */

export const runtime = "nodejs"

const PIN_RE = /^[0-9]{4,8}$/ // 4–8 digit PIN
const MIN_REQUEST_BODY = 2
const MAX_REQUEST_BODY = 200

function fail(reason: string, status = 400, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error: reason, ...extra }, { status })
}

type LoginBody = { sap_code?: unknown; pin?: unknown }

export async function POST(req: Request) {
  let body: LoginBody
  try {
    const text = await req.text()
    if (text.length < MIN_REQUEST_BODY || text.length > MAX_REQUEST_BODY) {
      return fail("Bad request.")
    }
    body = JSON.parse(text) as LoginBody
  } catch {
    return fail("Expected JSON body: { sap_code, pin }.")
  }

  const sap_code = typeof body.sap_code === "string" ? body.sap_code.trim() : ""
  const pin = typeof body.pin === "string" ? body.pin.trim() : ""

  if (!sap_code) return fail("Missing sap_code.")
  if (!PIN_RE.test(pin)) return fail("PIN must be 4–8 digits.")

  // Lockout check before we even query the DB — avoids timing leaks.
  const lockedFor = msUntilUnlock(sap_code)
  if (lockedFor > 0) {
    return fail(
      "Too many attempts. Try again later.",
      429,
      { locked_for_ms: lockedFor },
    )
  }

  const admin = createSupabaseAdminClient()
  const { data: store, error } = await admin
    .from("stores")
    .select("sap_code, status, manager_pin_hash")
    .eq("sap_code", sap_code)
    .maybeSingle<{
      sap_code: string
      status: string
      manager_pin_hash: string | null
    }>()

  if (error) {
    console.error("[api/auth/manager] store lookup failed", error)
    return fail("Something went wrong.", 500)
  }

  if (!store || store.status !== "active" || !store.manager_pin_hash) {
    // Deliberately generic to avoid confirming which SAP codes exist.
    const remaining = recordFailedAttempt(sap_code)
    return fail("Invalid store or PIN.", 401, remaining)
  }

  const ok = await bcrypt.compare(pin, store.manager_pin_hash)
  if (!ok) {
    const remaining = recordFailedAttempt(sap_code)
    if (remaining.lockedForMs > 0) {
      return fail(
        "Too many attempts. Try again later.",
        429,
        { locked_for_ms: remaining.lockedForMs },
      )
    }
    return fail("Invalid store or PIN.", 401, {
      attempts_left: remaining.attemptsLeft,
    })
  }

  // Success — mint JWT, set cookie, clear attempts bucket.
  clearAttempts(sap_code)
  const jwt = await signManagerJwt(sap_code)
  const res = NextResponse.json({ ok: true, sap_code })
  res.cookies.set({
    ...managerCookieOptions(),
    value: jwt,
  })
  return res
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set({
    name: managerCookieName(),
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  })
  return res
}

export async function GET() {
  const session = await getManagerSession()
  if (!session) {
    return NextResponse.json({ signed_in: false }, { status: 200 })
  }
  return NextResponse.json({
    signed_in: true,
    sap_code: session.sap_code,
    exp: session.exp,
  })
}
