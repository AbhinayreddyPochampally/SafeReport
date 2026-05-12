import "server-only"
import { NextRequest, NextResponse } from "next/server"
import QRCode from "qrcode"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { getHoSession } from "@/lib/ho-auth"
import { generateStorePoster } from "@/lib/poster"

export const runtime = "nodejs"

const SAP_CODE = /^[A-Z0-9][A-Z0-9-]{1,20}$/

export async function GET(
  req: NextRequest,
  { params }: { params: { sap_code: string } },
) {
  const session = await getHoSession()
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 })
  }

  const sap = (params.sap_code ?? "").trim().toUpperCase()
  if (!SAP_CODE.test(sap)) {
    return NextResponse.json({ error: "Invalid SAP code." }, { status: 400 })
  }

  const admin = createSupabaseAdminClient()
  const { data: store } = await admin
    .from("stores")
    .select("sap_code, name, status")
    .eq("sap_code", sap)
    .maybeSingle<{ sap_code: string; name: string; status: string }>()
  if (!store) {
    return NextResponse.json({ error: "Store not found." }, { status: 404 })
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000"
  const target = `${baseUrl}/r/${sap}`

  const format = req.nextUrl.searchParams.get("format") ?? "pdf"
  const wantsDownload = req.nextUrl.searchParams.get("download") === "1"

  if (wantsDownload) {
    void admin
      .from("stores")
      .update({ qr_downloaded_at: new Date().toISOString() })
      .eq("sap_code", sap)
      .is("qr_downloaded_at", null)
      .then(({ error }) => {
        if (error) console.error("[api/qr] mark-downloaded failed", error)
      })
  }

  if (format === "png") {
    let buffer: Buffer
    try {
      buffer = await QRCode.toBuffer(target, {
        type: "png",
        errorCorrectionLevel: "M",
        margin: 2,
        width: 720,
        color: { dark: "#0a1f46", light: "#ffffff" },
      })
    } catch (err) {
      console.error("[api/qr] PNG generate failed", { sap, err })
      return NextResponse.json(
        { error: "QR generation failed." },
        { status: 500 },
      )
    }
    const pngFilename = `safereport-qr-${sap}.png`
    const pngHeaders: Record<string, string> = {
      "Content-Type": "image/png",
      "Content-Length": String(buffer.length),
      "Cache-Control": "private, max-age=300",
    }
    if (wantsDownload) {
      pngHeaders["Content-Disposition"] = `attachment; filename="${pngFilename}"`
    }
    return new NextResponse(buffer as unknown as BodyInit, {
      status: 200,
      headers: pngHeaders,
    })
  }

  let pdfBytes: Uint8Array
  try {
    pdfBytes = await generateStorePoster(
      { sap_code: sap, name: store.name },
      baseUrl,
    )
  } catch (err) {
    console.error("[api/qr] poster generate failed", { sap, err })
    return NextResponse.json({ error: "Poster generation failed." }, { status: 500 })
  }

  const pdfFilename = `safereport-poster-${sap}.pdf`
  const pdfHeaders: Record<string, string> = {
    "Content-Type": "application/pdf",
    "Content-Length": String(pdfBytes.length),
    "Cache-Control": "private, max-age=300",
    "Content-Disposition": wantsDownload
      ? `attachment; filename="${pdfFilename}"`
      : `inline; filename="${pdfFilename}"`,
  }
  return new NextResponse(pdfBytes as unknown as BodyInit, {
    status: 200,
    headers: pdfHeaders,
  })
}
