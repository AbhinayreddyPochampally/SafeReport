import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { getHoSession } from "@/lib/ho-auth"
import { generatePosterBatch, type PosterStore } from "@/lib/poster"

export const runtime = "nodejs"

const SAP_CODE = /^[A-Z0-9][A-Z0-9-]{1,20}$/

export async function GET(req: NextRequest) {
  const session = await getHoSession()
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 })
  }

  const sp = req.nextUrl.searchParams
  const scope = (sp.get("scope") ?? "new").toLowerCase()
  const codesParam = sp.get("codes")?.trim() ?? ""
  const wantsDownload = sp.get("download") === "1"

  const admin = createSupabaseAdminClient()

  let stores: PosterStore[]
  if (codesParam) {
    const codes = codesParam
      .split(",")
      .map((c) => c.trim().toUpperCase())
      .filter((c) => SAP_CODE.test(c))
    if (codes.length === 0) {
      return NextResponse.json({ error: "No valid SAP codes." }, { status: 400 })
    }
    const { data, error } = await admin
      .from("stores")
      .select("sap_code, name")
      .in("sap_code", codes)
    if (error) {
      console.error("[api/qr/bulk] fetch failed", error)
      return NextResponse.json({ error: "Lookup failed." }, { status: 500 })
    }
    stores = (data ?? []) as PosterStore[]
  } else {
    let query = admin
      .from("stores")
      .select("sap_code, name")
      .eq("status", "active")
      .order("brand", { ascending: true })
      .order("city", { ascending: true })
      .order("sap_code", { ascending: true })
    if (scope === "new") query = query.is("qr_downloaded_at", null)
    const { data, error } = await query
    if (error) {
      console.error("[api/qr/bulk] fetch failed", error)
      return NextResponse.json({ error: "Lookup failed." }, { status: 500 })
    }
    stores = (data ?? []) as PosterStore[]
  }

  if (stores.length === 0) {
    return NextResponse.json(
      {
        error:
          scope === "new"
            ? "No new stores — every active store already has its QR poster downloaded."
            : "No stores match the requested scope.",
      },
      { status: 404 },
    )
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000"

  let pdfBytes: Uint8Array
  try {
    pdfBytes = await generatePosterBatch(stores, baseUrl)
  } catch (err) {
    console.error("[api/qr/bulk] generate failed", err)
    return NextResponse.json(
      { error: "Poster batch generation failed." },
      { status: 500 },
    )
  }

  if (wantsDownload) {
    const codes = stores.map((s) => s.sap_code)
    void admin
      .from("stores")
      .update({ qr_downloaded_at: new Date().toISOString() })
      .in("sap_code", codes)
      .is("qr_downloaded_at", null)
      .then(({ error }) => {
        if (error) console.error("[api/qr/bulk] mark-downloaded failed", error)
      })
  }

  const filename = `safereport-posters-${stores.length}-stores.pdf`
  const headers: Record<string, string> = {
    "Content-Type": "application/pdf",
    "Content-Length": String(pdfBytes.length),
    "Cache-Control": "private, max-age=300",
    "Content-Disposition": wantsDownload
      ? `attachment; filename="${filename}"`
      : `inline; filename="${filename}"`,
  }
  return new NextResponse(pdfBytes as unknown as BodyInit, {
    status: 200,
    headers,
  })
}
