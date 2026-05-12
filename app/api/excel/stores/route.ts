import "server-only"
import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { getHoSession } from "@/lib/ho-auth"

/**
 * POST /api/excel/stores — CSV import for the store registry.
 *
 * Accepts multipart/form-data with a single field named `file`, plus an
 * optional `prune=1` form field. Expects a CSV whose header row is a
 * permutation/subset of:
 *
 *   sap_code, name, brand, city, state, location,
 *   manager_name, manager_phone, password, status
 *
 * `sap_code` is the primary key and must be present. Rows upsert by it.
 * Plain-text passwords are bcrypted before any DB write. Rows that fail
 * per-row validation are reported back in `errors[]` alongside the counts.
 *
 * Prune mode: when `prune=1`, any active store NOT in the CSV is marked
 * `permanently_closed` (it stays in the DB for audit trail; reports stay
 * intact). This implements the "remove closed store from the list (if not
 * present in the master remove)" requirement without losing history.
 *
 * We deliberately roll a minimal CSV parser here instead of adding SheetJS
 * — the input is small (≤ a few thousand rows) and the sandbox's CDN
 * allowlist has bitten us on external bundles before. SheetJS lands in
 * Phase F where we need .xlsx writing.
 */

const STATUSES = new Set(["active", "temporarily_closed", "permanently_closed"])
const SAP_CODE = /^[A-Z0-9][A-Z0-9-]{1,20}$/
const PASSWORD_MIN = 6
const PASSWORD_MAX = 128

// Canonical column names we accept, including a few common alternates.
// Both the new `password` column AND the legacy `pin` column are recognised
// so existing CSVs don't break — pin values get rejected with a helpful
// error pointing operators at the new column.
const HEADER_ALIASES: Record<string, string> = {
  sap: "sap_code",
  sap_code: "sap_code",
  "sap code": "sap_code",
  name: "name",
  "store name": "name",
  brand: "brand",
  city: "city",
  state: "state",
  location: "location",
  mall: "location",
  manager: "manager_name",
  manager_name: "manager_name",
  "manager name": "manager_name",
  phone: "manager_phone",
  manager_phone: "manager_phone",
  "manager phone": "manager_phone",
  password: "password",
  manager_password: "password",
  pin: "_legacy_pin",
  manager_pin: "_legacy_pin",
  status: "status",
}

type ParsedRow = {
  sap_code: string
  name?: string
  brand?: string
  city?: string
  state?: string
  location?: string | null
  manager_name?: string | null
  manager_phone?: string | null
  password?: string | null
  status?: string
}

/**
 * Minimal CSV parser that handles:
 *   - quoted fields ("a,b" is one field)
 *   - escaped quotes ("a""b" is a"b)
 *   - CRLF or LF line endings
 *   - trailing blank lines
 *
 * Returns an array of string[] rows. Caller handles header mapping.
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cell += c
      }
      continue
    }
    if (c === '"') {
      inQuotes = true
      continue
    }
    if (c === ",") {
      row.push(cell)
      cell = ""
      continue
    }
    if (c === "\r") continue
    if (c === "\n") {
      row.push(cell)
      cell = ""
      if (row.some((x) => x.length > 0)) rows.push(row)
      row = []
      continue
    }
    cell += c
  }
  // Flush any trailing cell/row.
  if (cell.length > 0 || row.length > 0) {
    row.push(cell)
    if (row.some((x) => x.length > 0)) rows.push(row)
  }
  return rows
}

export async function POST(req: NextRequest) {
  const session = await getHoSession()
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 })
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json(
      { error: "Expected multipart/form-data." },
      { status: 400 },
    )
  }

  const file = formData.get("file")
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Missing 'file' field in upload." },
      { status: 400 },
    )
  }
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json(
      { error: "CSV exceeds 5MB cap. Split and retry." },
      { status: 413 },
    )
  }

  let text: string
  try {
    text = await file.text()
  } catch {
    return NextResponse.json({ error: "Could not read file." }, { status: 400 })
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1) // strip BOM

  const rows = parseCsv(text)
  if (rows.length === 0) {
    return NextResponse.json({ error: "CSV is empty." }, { status: 400 })
  }

  const header = rows[0].map((h) => h.trim().toLowerCase())
  const mapped = header.map((h) => HEADER_ALIASES[h] ?? null)

  if (!mapped.includes("sap_code")) {
    return NextResponse.json(
      { error: "CSV must include a 'sap_code' column." },
      { status: 400 },
    )
  }

  const errors: string[] = []
  const parsed: ParsedRow[] = []

  let legacyPinSeen = false
  for (let i = 1; i < rows.length; i++) {
    const raw = rows[i]
    const rec: Partial<ParsedRow> & { _legacy_pin?: string | null } = {}
    for (let j = 0; j < raw.length; j++) {
      const key = mapped[j]
      if (!key) continue
      const val = raw[j].trim()
      if (val === "") {
        if (
          key === "location" ||
          key === "manager_name" ||
          key === "manager_phone" ||
          key === "password"
        ) {
          ;(rec as Record<string, unknown>)[key] = null
        }
        continue
      }
      ;(rec as Record<string, unknown>)[key] = val
    }
    if (!rec.sap_code) {
      errors.push(`Row ${i + 1}: missing sap_code`)
      continue
    }
    rec.sap_code = rec.sap_code.toUpperCase()
    if (!SAP_CODE.test(rec.sap_code)) {
      errors.push(`Row ${i + 1}: invalid sap_code "${rec.sap_code}"`)
      continue
    }
    if (rec.status && !STATUSES.has(rec.status)) {
      errors.push(
        `Row ${i + 1} (${rec.sap_code}): invalid status "${rec.status}"`,
      )
      continue
    }
    if (rec._legacy_pin) {
      legacyPinSeen = true
      errors.push(
        `Row ${i + 1} (${rec.sap_code}): the 'pin' column is no longer supported. Use 'password' instead.`,
      )
      continue
    }
    if (
      rec.password != null &&
      rec.password !== "" &&
      (rec.password.length < PASSWORD_MIN || rec.password.length > PASSWORD_MAX)
    ) {
      errors.push(
        `Row ${i + 1} (${rec.sap_code}): password must be ${PASSWORD_MIN}-${PASSWORD_MAX} characters`,
      )
      continue
    }
    parsed.push(rec as ParsedRow)
  }

  if (legacyPinSeen) {
    errors.unshift(
      "Detected legacy 'pin' column. Migration 002 replaced PIN with password — update your CSV to a 'password' column with 6+ char values.",
    )
  }

  // Reject duplicate sap_codes within the same file. Without this, two
  // rows for the same store would race in the upsert (last write wins
  // silently) — operator copy-paste errors stay invisible.
  {
    const seen = new Set<string>()
    const dupes = new Set<string>()
    for (const p of parsed) {
      if (seen.has(p.sap_code)) dupes.add(p.sap_code)
      seen.add(p.sap_code)
    }
    if (dupes.size > 0) {
      for (const d of dupes) {
        errors.push(`Duplicate sap_code in CSV: ${d} (each store must appear once)`)
      }
      // Keep only the first occurrence of each duplicated code.
      const kept: typeof parsed = []
      const used = new Set<string>()
      for (const p of parsed) {
        if (used.has(p.sap_code)) continue
        used.add(p.sap_code)
        kept.push(p)
      }
      parsed.length = 0
      parsed.push(...kept)
    }
  }

  if (parsed.length === 0) {
    return NextResponse.json(
      {
        inserted: 0,
        updated: 0,
        skipped: rows.length - 1,
        errors: errors.length ? errors : ["No parseable rows in CSV."],
      },
      { status: 200 },
    )
  }

  const admin = createSupabaseAdminClient()

  // Figure out which SAP codes already exist so we can split the counts.
  const { data: existing, error: existErr } = await admin
    .from("stores")
    .select("sap_code")
    .in(
      "sap_code",
      parsed.map((p) => p.sap_code),
    )

  if (existErr) {
    console.error("[excel/stores] existence check failed", existErr)
    return NextResponse.json({ error: "Lookup failed." }, { status: 500 })
  }

  const existingSet = new Set((existing ?? []).map((e) => e.sap_code as string))

  // Pre-hash all passwords in parallel (capped at 4 concurrent) before
  // the per-row loop. bcrypt cost 10 is ~150-200ms per hash; sequentially
  // that's 3-5s for a 20-row CSV and over 30s for a 200-row import — past
  // the Vercel/Railway request timeout. Parallelising stays well inside.
  const passwordHashes = new Map<string, string>()
  {
    const toHash = parsed.filter((p) => p.password)
    const CONCURRENT = 4
    for (let i = 0; i < toHash.length; i += CONCURRENT) {
      const chunk = toHash.slice(i, i + CONCURRENT)
      const hashes = await Promise.all(
        chunk.map((p) => bcrypt.hash(p.password as string, 10)),
      )
      chunk.forEach((p, j) => passwordHashes.set(p.sap_code, hashes[j]))
    }
  }

  // Build the upsert payload. For NEW rows, fill required columns with
  // sensible defaults if the CSV omits them. For EXISTING rows, only
  // overwrite the columns that were actually present in the CSV.
  const toInsert: Record<string, unknown>[] = []
  const toUpdate: Record<string, unknown>[] = []
  let skipped = 0

  for (const rec of parsed) {
    const isNew = !existingSet.has(rec.sap_code)
    if (isNew) {
      // A new store MUST provide the required NOT NULL columns.
      const missing: string[] = []
      if (!rec.name) missing.push("name")
      if (!rec.brand) missing.push("brand")
      if (!rec.city) missing.push("city")
      if (!rec.state) missing.push("state")
      if (missing.length > 0) {
        errors.push(
          `${rec.sap_code}: new store missing required field(s) ${missing.join(", ")}`,
        )
        skipped += 1
        continue
      }
    }

    const row: Record<string, unknown> = { sap_code: rec.sap_code }
    if (rec.name != null) row.name = rec.name
    if (rec.brand != null) row.brand = rec.brand
    if (rec.city != null) row.city = rec.city
    if (rec.state != null) row.state = rec.state
    if ("location" in rec) row.location = rec.location
    if ("manager_name" in rec) row.manager_name = rec.manager_name
    if ("manager_phone" in rec) row.manager_phone = rec.manager_phone
    if (rec.status) row.status = rec.status
    if (rec.password) {
      row.manager_password_hash = passwordHashes.get(rec.sap_code)
    }
    row.updated_at = new Date().toISOString()

    if (isNew) {
      toInsert.push(row)
    } else {
      toUpdate.push(row)
    }
  }

  let inserted = 0
  let updated = 0

  if (toInsert.length > 0) {
    const { error } = await admin.from("stores").insert(toInsert)
    if (error) {
      console.error("[excel/stores] insert failed", error)
      return NextResponse.json(
        { error: "Insert failed — no rows were written." },
        { status: 500 },
      )
    }
    inserted = toInsert.length
  }

  // PostgREST doesn't do multi-row UPDATE in one shot by a non-PK match;
  // per-row is fine at pilot size. If this becomes slow we'll batch with
  // an RPC.
  for (const row of toUpdate) {
    const { sap_code, ...rest } = row
    const { error } = await admin
      .from("stores")
      .update(rest)
      .eq("sap_code", sap_code as string)
    if (error) {
      console.error("[excel/stores] update failed", { sap_code, error })
      errors.push(`${sap_code}: update failed — ${error.message}`)
      skipped += 1
    } else {
      updated += 1
    }
  }

  // Optional prune: stores not in the master CSV become permanently_closed.
  // Soft delete (status flip) instead of DELETE so historical reports stay
  // intact and the SAP code stays unique-reserved. Reporters who scan an
  // old QR will land on a 404 on the manager side.
  let pruned = 0
  const pruneFlag = formData.get("prune")
  if (pruneFlag === "1" || pruneFlag === "true") {
    const masterCodes = new Set(parsed.map((p) => p.sap_code))
    const { data: actives } = await admin
      .from("stores")
      .select("sap_code")
      .eq("status", "active")
    const orphaned =
      (actives ?? [])
        .map((r) => r.sap_code as string)
        .filter((c) => !masterCodes.has(c))
    if (orphaned.length > 0) {
      const { error: pruneErr } = await admin
        .from("stores")
        .update({
          status: "permanently_closed",
          updated_at: new Date().toISOString(),
        })
        .in("sap_code", orphaned)
      if (pruneErr) {
        console.error("[excel/stores] prune failed", pruneErr)
        errors.push(
          `Prune step failed (${pruneErr.message}); imports above succeeded.`,
        )
      } else {
        pruned = orphaned.length
      }
    }
  }

  console.info("[excel/stores] imported", {
    by: session.email ?? session.user_id,
    inserted,
    updated,
    skipped,
    pruned,
    errors: errors.length,
  })

  return NextResponse.json({
    inserted,
    updated,
    skipped,
    pruned,
    errors,
  })
}
