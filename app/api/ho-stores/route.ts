import "server-only"
import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { getHoSession } from "@/lib/ho-auth"

/**
 * Store registry endpoints.
 *
 *   POST   /api/ho-stores  — create a new store
 *   PATCH  /api/ho-stores  — update a single store (incl. password reset, QR mark)
 *
 * PATCH body:
 *   {
 *     sap_code:        string            // REQUIRED — identifies the row
 *     name?:           string
 *     brand?:          string
 *     city?:           string
 *     state?:          string
 *     location?:       string | null
 *     manager_name?:   string | null
 *     manager_phone?:  string | null
 *     status?:         'active' | 'temporarily_closed' | 'permanently_closed'
 *     new_password?:   string | null     // 6-128 chars, bcrypted server-side
 *     qr_downloaded?:  boolean           // marks qr_downloaded_at = now()
 *   }
 *
 * POST body: same as PATCH minus the qr_downloaded flag, plus sap_code is
 * required and must not collide with an existing row. Manager password is
 * optional at create time but the store won't accept logins until set.
 *
 * Auth: requires any HO session. Per-region scope filtering is a Phase E
 * concern; pilot is single-tenant.
 */

const STATUSES = new Set(["active", "temporarily_closed", "permanently_closed"])
const SAP_CODE = /^[A-Z0-9][A-Z0-9-]{1,20}$/
const PASSWORD_MIN = 6
const PASSWORD_MAX = 128

export async function PATCH(req: NextRequest) {
  const session = await getHoSession()
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 })
  }

  const sap = typeof body.sap_code === "string" ? body.sap_code.trim() : ""
  if (!SAP_CODE.test(sap)) {
    return NextResponse.json({ error: "Invalid sap_code." }, { status: 400 })
  }

  // Build the update patch from only the fields that were actually present.
  const patch: Record<string, unknown> = {}

  function pickString(key: string, opts: { min?: number; max?: number } = {}): string | null | undefined {
    if (!(key in body)) return undefined
    const v = body[key]
    if (v === null) return null
    if (typeof v !== "string") return undefined
    const trimmed = v.trim()
    if (trimmed === "") return null
    if (opts.min && trimmed.length < opts.min) return undefined
    if (opts.max && trimmed.length > opts.max) return undefined
    return trimmed
  }

  const name = pickString("name", { min: 1, max: 200 })
  if (name !== undefined) {
    if (name === null) {
      return NextResponse.json({ error: "Store name is required." }, { status: 400 })
    }
    patch.name = name
  }
  const brand = pickString("brand", { min: 1, max: 100 })
  if (brand !== undefined) {
    if (brand === null) {
      return NextResponse.json({ error: "Brand is required." }, { status: 400 })
    }
    patch.brand = brand
  }
  const city = pickString("city", { min: 1, max: 100 })
  if (city !== undefined) {
    if (city === null) {
      return NextResponse.json({ error: "City is required." }, { status: 400 })
    }
    patch.city = city
  }
  const state = pickString("state", { min: 1, max: 100 })
  if (state !== undefined) {
    if (state === null) {
      return NextResponse.json({ error: "State is required." }, { status: 400 })
    }
    patch.state = state
  }
  const location = pickString("location", { max: 200 })
  if (location !== undefined) patch.location = location
  const managerName = pickString("manager_name", { max: 100 })
  if (managerName !== undefined) patch.manager_name = managerName
  const managerPhone = pickString("manager_phone", { max: 40 })
  if (managerPhone !== undefined) patch.manager_phone = managerPhone

  if ("status" in body) {
    const s = body.status
    if (typeof s !== "string" || !STATUSES.has(s)) {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 })
    }
    patch.status = s
  }

  if ("new_password" in body && body.new_password !== null && body.new_password !== "") {
    const pw = body.new_password
    if (typeof pw !== "string" || pw.length < PASSWORD_MIN || pw.length > PASSWORD_MAX) {
      return NextResponse.json(
        { error: `Password must be ${PASSWORD_MIN}-${PASSWORD_MAX} characters.` },
        { status: 400 },
      )
    }
    patch.manager_password_hash = await bcrypt.hash(pw, 10)
  }

  if (body.qr_downloaded === true) {
    // Idempotent — if already set we leave the original timestamp alone via
    // a separate update path below. Setting it from PATCH always overwrites
    // because the click means the user just downloaded again.
    patch.qr_downloaded_at = new Date().toISOString()
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 })
  }

  patch.updated_at = new Date().toISOString()

  const admin = createSupabaseAdminClient()
  const { data, error } = await admin
    .from("stores")
    .update(patch)
    .eq("sap_code", sap)
    .select("sap_code")
    .maybeSingle()

  if (error) {
    console.error("[ho-stores] update failed", { sap, error })
    return NextResponse.json({ error: "Update failed." }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: "Store not found." }, { status: 404 })
  }

  console.info("[ho-stores] updated", {
    sap,
    by: session.email ?? session.user_id,
    fields: Object.keys(patch).filter((k) => k !== "updated_at"),
  })

  return NextResponse.json({ ok: true, sap_code: sap })
}

/* ----------------------------- POST: create ------------------------------ */

export async function POST(req: NextRequest) {
  const session = await getHoSession()
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 })
  }

  const sap = typeof body.sap_code === "string" ? body.sap_code.trim().toUpperCase() : ""
  if (!SAP_CODE.test(sap)) {
    return NextResponse.json(
      { error: "SAP code must be uppercase letters/digits and dashes (2-21 chars)." },
      { status: 400 },
    )
  }

  function readString(key: string, required: boolean): string | null {
    const v = body[key]
    if (typeof v !== "string") return required ? "" : null
    const trimmed = v.trim()
    if (trimmed === "") return required ? "" : null
    return trimmed
  }

  const name = readString("name", true)
  const brand = readString("brand", true)
  const city = readString("city", true)
  const state = readString("state", true)
  if (!name || !brand || !city || !state) {
    return NextResponse.json(
      { error: "name, brand, city, state are required." },
      { status: 400 },
    )
  }

  const location = readString("location", false)
  const managerName = readString("manager_name", false)
  const managerPhone = readString("manager_phone", false)

  let status: string = "active"
  if ("status" in body) {
    const s = body.status
    if (typeof s !== "string" || !STATUSES.has(s)) {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 })
    }
    status = s
  }

  let passwordHash: string | null = null
  if (
    "new_password" in body &&
    body.new_password !== null &&
    body.new_password !== ""
  ) {
    const pw = body.new_password
    if (typeof pw !== "string" || pw.length < PASSWORD_MIN || pw.length > PASSWORD_MAX) {
      return NextResponse.json(
        { error: `Password must be ${PASSWORD_MIN}-${PASSWORD_MAX} characters.` },
        { status: 400 },
      )
    }
    passwordHash = await bcrypt.hash(pw, 10)
  }

  const admin = createSupabaseAdminClient()

  // Conflict check first so we can give a useful 409 instead of a generic
  // unique-constraint error from Postgres.
  const { data: existing } = await admin
    .from("stores")
    .select("sap_code")
    .eq("sap_code", sap)
    .maybeSingle()
  if (existing) {
    return NextResponse.json(
      { error: `Store ${sap} already exists.` },
      { status: 409 },
    )
  }

  const { error } = await admin.from("stores").insert({
    sap_code: sap,
    name,
    brand,
    city,
    state,
    location,
    manager_name: managerName,
    manager_phone: managerPhone,
    manager_password_hash: passwordHash,
    status,
  })

  if (error) {
    console.error("[ho-stores] create failed", { sap, error })
    return NextResponse.json({ error: "Create failed." }, { status: 500 })
  }

  console.info("[ho-stores] created", {
    sap,
    by: session.email ?? session.user_id,
  })

  return NextResponse.json({ ok: true, sap_code: sap }, { status: 201 })
}
