import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { revalidateTag } from "next/cache"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { getHoSession } from "@/lib/ho-auth"

/**
 * Stores-needing-attention dismiss endpoint.
 *
 *   POST  /api/ho-store-attention  — mark a store's attention row "handled"
 *   DELETE /api/ho-store-attention — clear the handled flag (re-flag for review)
 *
 * The HO Stores tab surfaces stores that match attention criteria
 * (never reported / low traffic / dormant). HO phones the store manager
 * offline; once the conversation has happened, they tap "Mark resolved"
 * and the row drops out of the panel.
 *
 * "Resolved" is persistent and global, not per-HO-user, so two HO
 * teammates don't both call the same store. Implemented via the
 * stores.attention_handled_at column added in migration 005.
 *
 * v1 rule: once handled, the row stays out of the panel until either
 *   (a) DELETE clears it, or
 *   (b) future iteration: a new significant event happens (e.g. a fresh
 *       30-day quiet window after activity briefly recovered).
 * The pilot can live with (a) only.
 *
 * Auth: HO session required.
 */

const SAP_CODE = /^[A-Z0-9][A-Z0-9-]{1,20}$/

async function readSapCode(req: NextRequest): Promise<string | null> {
  try {
    const body = await req.json()
    const sap = typeof body?.sap_code === "string" ? body.sap_code.trim() : ""
    return SAP_CODE.test(sap) ? sap : null
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  const session = await getHoSession()
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 })
  }
  const sap = await readSapCode(req)
  if (!sap) {
    return NextResponse.json({ error: "Invalid sap_code." }, { status: 400 })
  }

  const admin = createSupabaseAdminClient()
  const now = new Date().toISOString()
  const { data, error } = await admin
    .from("stores")
    .update({
      attention_handled_at: now,
      attention_handled_by: session.user_id,
      updated_at: now,
    })
    .eq("sap_code", sap)
    .select("sap_code, attention_handled_at")
    .maybeSingle()

  if (error) {
    console.error("[ho-store-attention] resolve failed", { sap, error })
    return NextResponse.json({ error: "Update failed." }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: "Store not found." }, { status: 404 })
  }
  // Bust the cached /ho/stores aggregate so the row drops out on the
  // next page load instead of waiting for the 30-second TTL.
  revalidateTag("ho-stores-data")
  console.info("[ho-store-attention] resolved", {
    sap,
    by: session.email ?? session.user_id,
  })
  return NextResponse.json({
    ok: true,
    sap_code: sap,
    attention_handled_at: data.attention_handled_at,
  })
}

export async function DELETE(req: NextRequest) {
  const session = await getHoSession()
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 })
  }
  const sap = await readSapCode(req)
  if (!sap) {
    return NextResponse.json({ error: "Invalid sap_code." }, { status: 400 })
  }

  const admin = createSupabaseAdminClient()
  const now = new Date().toISOString()
  const { data, error } = await admin
    .from("stores")
    .update({
      attention_handled_at: null,
      attention_handled_by: null,
      updated_at: now,
    })
    .eq("sap_code", sap)
    .select("sap_code")
    .maybeSingle()

  if (error) {
    console.error("[ho-store-attention] unresolve failed", { sap, error })
    return NextResponse.json({ error: "Update failed." }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: "Store not found." }, { status: 404 })
  }
  revalidateTag("ho-stores-data")
  console.info("[ho-store-attention] re-flagged", {
    sap,
    by: session.email ?? session.user_id,
  })
  return NextResponse.json({ ok: true, sap_code: sap })
}
