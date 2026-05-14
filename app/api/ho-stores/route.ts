import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { getHoSession } from "@/lib/ho-auth"

/**
 * Store registry endpoints.
 *
 *   POST   /api/ho-stores  — create a new store
 *   PATCH  /api/ho-stores  — update a single store (incl. QR mark)
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
 *     manager_phone?:  string | null     // identity (paired with email)
 *     manager_email?:  string | null     // identity (paired with phone)
 *     status?:         'active' | 'temporarily_closed' | 'permanently_closed'
 *     qr_downloaded?:  boolean           // marks qr_downloaded_at = now()
 *   }
 *
 * POST body: same as PATCH minus the qr_downloaded flag, plus sap_code is
 * required and must not collide with an existing row. Manager email AND
 * phone are REQUIRED at create time — without both, the store can't
 * accept logins (email+phone is the credential pair per mig 004).
 *
 * Legacy `new_password` field is accepted-but-ignored to avoid breaking
 * any cached client that still POSTs it; auth no longer uses passwords.
 *
 * Auth: requires any HO session. Per-region scope filtering is a Phase E
 * concern; pilot is single-tenant.
 */

const STATUSES = new Set(["active", "temporarily_closed", "permanently_closed"])
const SAP_CODE = /^[A-Z0-9][A-Z0-9-]{1,20}$/
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const EMAIL_MAX = 254

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

  // manager_email — case-preserving on storage, but format-checked. We
  // store as the user typed it (sans leading/trailing space); the auth
  // route lowercases at compare time.
  if ("manager_email" in body) {
    const v = body.manager_email
    if (v === null) {
      patch.manager_email = null
    } else if (typeof v === "string") {
      const trimmed = v.trim()
      if (trimmed === "") {
        patch.manager_email = null
      } else if (trimmed.length > EMAIL_MAX || !EMAIL_RE.test(trimmed)) {
        return NextResponse.json(
          { error: "Enter a valid manager email." },
          { status: 400 },
        )
      } else {
        patch.manager_email = trimmed
      }
    }
  }

  if ("status" in body) {
    const s = body.status
    if (typeof s !== "string" || !STATUSES.has(s)) {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 })
    }
    patch.status = s
  }

  // Legacy field — accept but ignore so cached HO clients posting
  // new_password don't error. Auth no longer uses passwords (mig 004).

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

  // If either credential factor (email or phone) changed, bump the session
  // epoch so every existing manager cookie for this store becomes invalid
  // on the next request. Without this, a rotated identifier wouldn't
  // actually log anyone out until the JWT's natural 7-day expiry.
  if ("manager_email" in patch || "manager_phone" in patch) {
    const { data: cur } = await admin
      .from("stores")
      .select("manager_session_epoch")
      .eq("sap_code", sap)
      .maybeSingle<{ manager_session_epoch: number }>()
    patch.manager_session_epoch = (cur?.manager_session_epoch ?? 0) + 1
  }

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
  const managerPhone = readString("manager_phone", true)
  const managerEmailRaw = readString("manager_email", true)

  // Both credential factors are required at create time. Without them the
  // store can't accept manager logins.
  if (!managerPhone) {
    return NextResponse.json(
      { error: "Manager phone is required — it's half of the login credential." },
      { status: 400 },
    )
  }
  if (!managerEmailRaw) {
    return NextResponse.json(
      { error: "Manager email is required — it's half of the login credential." },
      { status: 400 },
    )
  }
  if (managerEmailRaw.length > EMAIL_MAX || !EMAIL_RE.test(managerEmailRaw)) {
    return NextResponse.json(
      { error: "Enter a valid manager email." },
      { status: 400 },
    )
  }
  const managerEmail = managerEmailRaw

  let status: string = "active"
  if ("status" in body) {
    const s = body.status
    if (typeof s !== "string" || !STATUSES.has(s)) {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 })
    }
    status = s
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
    manager_email: managerEmail,
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
