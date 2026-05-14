import { NextResponse } from "next/server"
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
 * Manager email+phone auth (mig 004).
 *
 *   POST   /api/auth/manager   { sap_code, email, phone }  → set sr_mgr cookie
 *   DELETE /api/auth/manager                                → clear sr_mgr cookie
 *   GET    /api/auth/manager                                → check current session
 *
 * Pilot-grade identity check: the manager submits the email and phone HO
 * has on file for that store. Both must match the stored values exactly
 * (email case-insensitive, phone on trailing 10 digits). No password.
 *
 * This is not authentication in the cryptographic sense — anyone who knows
 * a manager's email AND phone can sign in. Trade-off was approved for the
 * pilot launch: 20 retail stores, low-sensitivity workflow, dramatically
 * lower friction for non-tech-savvy floor managers.
 *
 * Legacy clients still POSTing { phone, password } get a 410 Gone so the
 * UI surfaces a clear "update the app" message instead of a generic 400.
 * Same convention as the earlier PIN → password migration.
 *
 * Uses the service-role Supabase client to read `stores.manager_email`
 * (and friends) because RLS on `stores` blocks anon reads. A 3-strike
 * lockout per SAP code (15-minute window) lives in process memory — good
 * enough for the single-instance pilot box on Railway.
 */

export const runtime = "nodejs"

const PHONE_RE = /^[+0-9 \-()]{7,20}$/
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const EMAIL_MAX = 254
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

/** Canonicalize email for comparison — trim + lowercase. Both sides are
 * lowered so case typos on either entry or HO record don't break login. */
function normalizeEmail(s: string): string {
  return s.trim().toLowerCase()
}

type LoginBody = {
  sap_code?: unknown
  email?: unknown
  phone?: unknown
  /** Legacy field — old clients POSTing the password-flow body. */
  password?: unknown
  /** Legacy field — old clients POSTing the PIN-flow body. */
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
    return fail("Expected JSON body: { sap_code, email, phone }.")
  }

  // Legacy-client guards — surface the right "you need to refresh" message
  // depending on which old shape the browser sent.
  if (body.pin !== undefined && body.email === undefined) {
    return fail(
      "PIN login is no longer supported. Refresh the page and sign in with your email and phone.",
      410,
    )
  }
  if (body.password !== undefined && body.email === undefined) {
    return fail(
      "Password login is no longer supported. Refresh the page and sign in with your email and phone.",
      410,
    )
  }

  const sap_code = typeof body.sap_code === "string" ? body.sap_code.trim() : ""
  const emailInput = typeof body.email === "string" ? body.email.trim() : ""
  const phoneInput = typeof body.phone === "string" ? body.phone.trim() : ""

  if (!sap_code) return fail("Missing sap_code.")
  if (!emailInput || emailInput.length > EMAIL_MAX || !EMAIL_RE.test(emailInput)) {
    return fail("Enter a valid email address.")
  }
  if (!PHONE_RE.test(phoneInput)) return fail("Enter a valid phone number.")
  const normEmail = normalizeEmail(emailInput)
  const normPhone = normalizePhone(phoneInput)
  if (normPhone.length < 10) return fail("Enter a valid phone number.")

  // Lockout check before we touch the DB — avoids any timing-leak path.
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
    .select(
      "sap_code, status, manager_email, manager_phone, manager_session_epoch",
    )
    .eq("sap_code", sap_code)
    .maybeSingle<{
      sap_code: string
      status: string
      manager_email: string | null
      manager_phone: string | null
      manager_session_epoch: number
    }>()

  if (error) {
    console.error("[api/auth/manager] store lookup failed", error)
    return fail("Something went wrong.", 500)
  }

  // Compare both factors. Email case-insensitive; phone digits-only on
  // trailing 10 digits. Both must match exactly.
  const storeEmailNorm = normalizeEmail(store?.manager_email ?? "")
  const storePhoneNorm = normalizePhone(store?.manager_phone ?? "")
  const emailMatches = storeEmailNorm.length > 0 && storeEmailNorm === normEmail
  const phoneMatches = storePhoneNorm.length >= 10 && storePhoneNorm === normPhone

  if (
    !store ||
    store.status !== "active" ||
    !store.manager_email ||
    !store.manager_phone ||
    !emailMatches ||
    !phoneMatches
  ) {
    // Deliberately generic to avoid confirming which SAP / email / phone
    // combinations exist on file. Single error string for both "wrong
    // email" and "wrong phone" so attackers can't enumerate either field.
    const remaining = recordFailedAttempt(sap_code)
    if (remaining.lockedForMs > 0) {
      return fail(
        "Too many attempts. Try again later.",
        429,
        { locked_for_ms: remaining.lockedForMs },
      )
    }
    return fail("Email and phone don't match what HO has on file.", 401, {
      attempts_left: remaining.attemptsLeft,
    })
  }

  // Success — mint JWT, set cookie, clear attempts bucket. Embed the
  // current session epoch so HO can invalidate this cookie later by
  // bumping it (e.g. on email or phone change for this store).
  clearAttempts(sap_code)
  const jwt = await signManagerJwt(sap_code, store.manager_session_epoch ?? 0)
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
