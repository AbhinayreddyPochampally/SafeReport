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
 * Manager phone+password auth.
 *
 *   POST   /api/auth/manager   { sap_code, phone, password }  → set sr_mgr cookie
 *   DELETE /api/auth/manager                                   → clear sr_mgr cookie
 *   GET    /api/auth/manager                                   → check current session
 *
 * Migrated from PIN-only auth (mig 002). Manager identifies themselves with
 * the phone number HO has on file for that store, plus a password set by HO
 * (or self-service via reset flow — out of pilot scope).
 *
 * Uses the service-role Supabase client to read `stores.manager_password_hash`
 * because RLS on `stores` blocks anon reads of the hash column. A 3-strike
 * lockout per SAP code (15-minute window) lives in process memory; good
 * enough for a single-instance pilot.
 */

export const runtime = "nodejs"

const PHONE_RE = /^[+0-9 \-()]{7,20}$/
const PASSWORD_MIN = 6
const PASSWORD_MAX = 128
const MIN_REQUEST_BODY = 2
const MAX_REQUEST_BODY = 600

function fail(reason: string, status = 400, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error: reason, ...extra }, { status })
}

/** Strip everything except digits — comparison is digits-only so "+91 98 200"
 * matches "+91-9820011234" matches "9820011234". Last 10 digits is the
 * canonical phone in India. */
function normalizePhone(s: string): string {
  return s.replace(/\D/g, "").slice(-10)
}

type LoginBody = {
  sap_code?: unknown
  phone?: unknown
  password?: unknown
  /** Legacy clients may still POST `pin` — we reject explicitly so the UX
   * surfaces a "please update the app" message instead of a generic 400. */
  pin?: unknown
}

export async function POST(req: Request) {
  let body: LoginBody
  try {
    const text = await req.text()
    if (text.length < MIN_REQUEST_BODY || text.length > MAX_REQUEST_BODY) {
      return fail("Bad request.")
    }
    body = JSON.parse(text) as LoginBody
  } catch {
    return fail("Expected JSON body: { sap_code, phone, password }.")
  }

  if (body.pin !== undefined && body.password === undefined) {
    return fail(
      "PIN login is no longer supported. Use phone + password.",
      410,
    )
  }

  const sap_code = typeof body.sap_code === "string" ? body.sap_code.trim() : ""
  const phoneInput = typeof body.phone === "string" ? body.phone.trim() : ""
  const password = typeof body.password === "string" ? body.password : ""

  if (!sap_code) return fail("Missing sap_code.")
  if (!PHONE_RE.test(phoneInput)) return fail("Enter a valid phone number.")
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    return fail(`Password must be ${PASSWORD_MIN}–${PASSWORD_MAX} characters.`)
  }
  const normPhone = normalizePhone(phoneInput)
  if (normPhone.length < 10) return fail("Enter a valid phone number.")

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
    .select("sap_code, status, manager_phone, manager_password_hash")
    .eq("sap_code", sap_code)
    .maybeSingle<{
      sap_code: string
      status: string
      manager_phone: string | null
      manager_password_hash: string | null
    }>()

  if (error) {
    console.error("[api/auth/manager] store lookup failed", error)
    return fail("Something went wrong.", 500)
  }

  // Compare phone digits-only so spacing/punctuation differences don't trip
  // a real manager. We still require an exact match on the trailing 10 digits.
  const storePhoneNorm = normalizePhone(store?.manager_phone ?? "")
  const phoneMatches = storePhoneNorm.length >= 10 && storePhoneNorm === normPhone

  if (
    !store ||
    store.status !== "active" ||
    !store.manager_password_hash ||
    !phoneMatches
  ) {
    // Deliberately generic to avoid confirming which SAP codes / phone
    // numbers exist on file. Same lockout-aware response shape as the
    // bcrypt-fail branch below so a brute-forcer hitting unknown SAP
    // codes also gets a 429 once they trip the threshold.
    const remaining = recordFailedAttempt(sap_code)
    if (remaining.lockedForMs > 0) {
      return fail(
        "Too many attempts. Try again later.",
        429,
        { locked_for_ms: remaining.lockedForMs },
      )
    }
    return fail("Invalid phone or password.", 401, {
      attempts_left: remaining.attemptsLeft,
    })
  }

  const ok = await bcrypt.compare(password, store.manager_password_hash)
  if (!ok) {
    const remaining = recordFailedAttempt(sap_code)
    if (remaining.lockedForMs > 0) {
      return fail(
        "Too many attempts. Try again later.",
        429,
        { locked_for_ms: remaining.lockedForMs },
      )
    }
    return fail("Invalid phone or password.", 401, {
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
