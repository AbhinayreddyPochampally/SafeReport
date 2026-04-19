import "server-only"
import { SignJWT, jwtVerify, type JWTPayload } from "jose"
import { cookies } from "next/headers"

/**
 * Manager-side session: a signed JWT in an HttpOnly cookie scoped to a single
 * SAP code. We deliberately sidestep Supabase Auth for managers — they sign in
 * with a 4-digit store PIN, not an email + password, and we don't want them
 * showing up as auth.users rows or hitting anyone's RLS surface. The HO team
 * authenticates via Supabase Auth separately (Phase D).
 *
 * Cookie contract:
 *   sr_mgr = JWT signed with HS256 using SESSION_SECRET
 *   payload: { sap_code, iat, exp }
 *   lifetime: 7 days, HttpOnly, SameSite=Lax, Secure in prod
 *
 * The 3-strikes lockout is in-memory for the pilot — acceptable because a
 * single Railway instance serves all traffic and the whole pilot is ten
 * stores. If we scale the service horizontally, this moves to Redis.
 */

const COOKIE_NAME = "sr_mgr"
const SESSION_DAYS = 7
const LOCKOUT_MAX_ATTEMPTS = 3
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000 // 15 minutes

export type ManagerSession = {
  sap_code: string
  iat: number
  exp: number
}

function secret(): Uint8Array {
  const s = process.env.SESSION_SECRET
  if (!s || s.length < 16) {
    throw new Error(
      "SESSION_SECRET is missing or too short. Set it in .env.local (32+ bytes).",
    )
  }
  return new TextEncoder().encode(s)
}

// ---- Sign / verify -------------------------------------------------------

export async function signManagerJwt(sap_code: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const exp = now + SESSION_DAYS * 24 * 60 * 60
  return new SignJWT({ sap_code })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(await Promise.resolve(secret()))
}

export async function verifyManagerJwt(
  token: string,
): Promise<ManagerSession | null> {
  try {
    const { payload } = await jwtVerify(token, secret())
    if (!isManagerPayload(payload)) return null
    return {
      sap_code: payload.sap_code,
      iat: payload.iat,
      exp: payload.exp,
    }
  } catch {
    return null
  }
}

function isManagerPayload(
  p: JWTPayload,
): p is JWTPayload & { sap_code: string; iat: number; exp: number } {
  return (
    typeof p.sap_code === "string" &&
    p.sap_code.length > 0 &&
    typeof p.iat === "number" &&
    typeof p.exp === "number"
  )
}

// ---- Cookie helpers ------------------------------------------------------

/**
 * Read the signed manager cookie on the server. Returns null if there's no
 * cookie, the JWT is invalid, or (when `requiredSapCode` is given) the
 * session is scoped to a different store — we never let a manager with a
 * PNT-MUM-047 cookie peek into PNT-DEL-023's inbox.
 */
export async function getManagerSession(
  requiredSapCode?: string,
): Promise<ManagerSession | null> {
  const jar = cookies()
  const raw = jar.get(COOKIE_NAME)?.value
  if (!raw) return null
  const s = await verifyManagerJwt(raw)
  if (!s) return null
  if (requiredSapCode && s.sap_code !== requiredSapCode) return null
  return s
}

export function managerCookieName() {
  return COOKIE_NAME
}

export function managerCookieOptions() {
  return {
    name: COOKIE_NAME,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  }
}

// ---- PIN rate-limit (in-memory, per SAP code) ----------------------------

type Attempt = { count: number; firstAt: number; lockedUntil: number | null }
const attempts = new Map<string, Attempt>()

function getBucket(sap_code: string): Attempt {
  const now = Date.now()
  const existing = attempts.get(sap_code)
  if (!existing) {
    const fresh = { count: 0, firstAt: now, lockedUntil: null }
    attempts.set(sap_code, fresh)
    return fresh
  }
  // Reset bucket if the 15-minute window has elapsed with no lockout active.
  if (!existing.lockedUntil && now - existing.firstAt > LOCKOUT_WINDOW_MS) {
    existing.count = 0
    existing.firstAt = now
  }
  return existing
}

/** Returns ms-until-unlock, or 0 if the bucket is currently accepting attempts. */
export function msUntilUnlock(sap_code: string): number {
  const b = getBucket(sap_code)
  if (!b.lockedUntil) return 0
  const remaining = b.lockedUntil - Date.now()
  if (remaining <= 0) {
    // Lockout expired — clear and let the next attempt start fresh.
    b.lockedUntil = null
    b.count = 0
    b.firstAt = Date.now()
    return 0
  }
  return remaining
}

export function recordFailedAttempt(sap_code: string): {
  attemptsLeft: number
  lockedForMs: number
} {
  const b = getBucket(sap_code)
  b.count += 1
  if (b.count >= LOCKOUT_MAX_ATTEMPTS) {
    b.lockedUntil = Date.now() + LOCKOUT_WINDOW_MS
    return { attemptsLeft: 0, lockedForMs: LOCKOUT_WINDOW_MS }
  }
  return { attemptsLeft: LOCKOUT_MAX_ATTEMPTS - b.count, lockedForMs: 0 }
}

export function clearAttempts(sap_code: string) {
  attempts.delete(sap_code)
}
