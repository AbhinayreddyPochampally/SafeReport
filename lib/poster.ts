import "server-only"
import { PDFDocument, StandardFonts, rgb } from "pdf-lib"
import QRCode from "qrcode"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

/**
 * SafeReport "See Something? Say Something." A4 poster generator.
 *
 * Approach (v3): we embed a high-quality design as a full-page PNG template
 * stored in `public/poster-template.png`, and overlay only the two dynamic
 * pieces — the QR code (in the centre placeholder) and the SAP code (on
 * the Store Code underline in the bottom-right). Everything else — the
 * ABF header, the headline, the hazard / benefit / 3-step columns, the
 * privacy banner, the info cards, the SafeReport footer panel — lives in
 * the template image.
 *
 * Why a template? Hand-drawing the design with pdf-lib primitives produced
 * janky icons at small print sizes (the v2 attempt). A baked PNG gives us
 * a polished, brand-consistent visual; the dynamic overlay is the only
 * part that needs to vary per store, so the cost is paid once at template
 * design time and never again.
 *
 * Template dimensions are 1055 × 1491 px (A4 portrait aspect, drawn to fill
 * the full 595.28 × 841.89 pt page). The two overlay regions were measured
 * once from the rendered template:
 *
 *   - QR placeholder (the bordered white square in the centre column):
 *       x ≈ 205–388 pt,  y ≈ 336–620 pt  (PDF coords, bottom-up)
 *   - Store Code underline (bottom-right):
 *       y ≈ 26 pt,  x ≈ 446–542 pt
 *
 * If the template image is ever regenerated, re-measure these coordinates
 * (scripts/measure-template.py in the repo's history shows the technique).
 */

const PAGE_W = 595.28
const PAGE_H = 841.89

// QR placeholder bounds (measured from public/poster-template.png).
const QR_LEFT   = 205
const QR_RIGHT  = 388
const QR_TOP    = 620
const QR_BOTTOM = 336

// Store Code underline (measured from same template).
const CODE_UNDERLINE_Y       = 27
const CODE_UNDERLINE_X_START = 446
const CODE_UNDERLINE_X_END   = 542

const NAVY = rgb(0x0A / 255, 0x1F / 255, 0x46 / 255)

export type PosterStore = {
  sap_code: string
  /** Optional store name. Kept on the type for backwards compatibility with
   * callers; the template doesn't render it on-page (the SAP code is what
   * the printer routes by). */
  name?: string | null
}

/** Cache the template bytes across requests — the same file is read for
 * every poster generated, including in bulk runs of 20+ stores. */
let templateCache: Uint8Array | null = null
async function loadTemplate(): Promise<Uint8Array> {
  if (templateCache) return templateCache
  // process.cwd() at runtime is the Next.js project root.
  const p = resolve(process.cwd(), "public", "poster-template.png")
  const buf = await readFile(p)
  templateCache = new Uint8Array(buf)
  return templateCache
}

/**
 * Render a single store's poster as a PDF.
 *
 * `baseUrl` is the canonical app URL. The QR encodes `${baseUrl}/r/${sap_code}`
 * — the reporter landing page.
 */
export async function generateStorePoster(
  store: PosterStore,
  baseUrl: string,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const helvBold = await doc.embedFont(StandardFonts.HelveticaBold)
  const templateBytes = await loadTemplate()
  const templateImg = await doc.embedPng(templateBytes)

  await drawOnePage(doc, templateImg, helvBold, store, baseUrl)
  return doc.save()
}

/**
 * Render every store's poster into a single multi-page PDF — one A4 page
 * per store. Embeds the template image once and reuses the same XObject
 * across every page, so bulk PDFs stay small.
 */
export async function generatePosterBatch(
  stores: PosterStore[],
  baseUrl: string,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const helvBold = await doc.embedFont(StandardFonts.HelveticaBold)
  const templateBytes = await loadTemplate()
  const templateImg = await doc.embedPng(templateBytes)

  for (const s of stores) {
    await drawOnePage(doc, templateImg, helvBold, s, baseUrl)
  }
  return doc.save()
}

async function drawOnePage(
  doc: PDFDocument,
  templateImg: Awaited<ReturnType<PDFDocument["embedPng"]>>,
  helvBold: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  store: PosterStore,
  baseUrl: string,
) {
  const page = doc.addPage([PAGE_W, PAGE_H])

  // 1) Template background — fills the full A4 page.
  page.drawImage(templateImg, {
    x: 0, y: 0, width: PAGE_W, height: PAGE_H,
  })

  // 2) QR code — centred in the placeholder, sized to the placeholder's
  //    short side with a small breathing-room inset so the navy border on
  //    the template stays visible.
  //
  // The `?src=qr` tag is what splits scan-originated visits from direct
  // entry on the Analytics → Per-store table. The reporter landing reads
  // it from searchParams and forwards it to the visit beacon. Don't drop
  // this query param — without it the QR/direct column is just zeros.
  const target = `${(baseUrl ?? "").replace(/\/$/, "")}/r/${store.sap_code}?src=qr`
  // High error correction so the QR survives print smudges/folds, plus a
  // generous source resolution — pdf-lib will scale it down to the final
  // print size in vector terms.
  const qrPng = await QRCode.toBuffer(target, {
    type: "png",
    errorCorrectionLevel: "H",
    margin: 1,
    width: 900,
    color: { dark: "#0a1f46", light: "#ffffff" },
  })
  const qrImg = await doc.embedPng(new Uint8Array(qrPng))

  const placeholderW = QR_RIGHT - QR_LEFT
  const placeholderH = QR_TOP - QR_BOTTOM
  const inset = 8
  const qrSize = Math.min(placeholderW, placeholderH) - inset * 2
  const cx = (QR_LEFT + QR_RIGHT) / 2
  const cy = (QR_BOTTOM + QR_TOP) / 2
  page.drawImage(qrImg, {
    x: cx - qrSize / 2,
    y: cy - qrSize / 2,
    width: qrSize,
    height: qrSize,
  })

  // 3) Store code text — sized to fill the underline, centred on it,
  //    sitting just above (the underline acts as a visual baseline).
  //
  //    The chosen font size is the largest that still fits the underline
  //    width with a small inset on each side; for the SafeReport SAP-code
  //    format (e.g. ALS-CHN-042, max 22 chars per the API regex), size 14
  //    is usually right but we scale down if a particularly long code
  //    would overflow.
  const code = store.sap_code
  const underlineW = CODE_UNDERLINE_X_END - CODE_UNDERLINE_X_START
  let codeSize = 14
  while (
    helvBold.widthOfTextAtSize(code, codeSize) > underlineW - 6 &&
    codeSize > 8
  ) {
    codeSize -= 0.5
  }
  const codeW = helvBold.widthOfTextAtSize(code, codeSize)
  const codeX = (CODE_UNDERLINE_X_START + CODE_UNDERLINE_X_END) / 2 - codeW / 2
  // Place the baseline a hair above the underline so the descenders (if
  // any — SAP codes are uppercase ASCII so usually no descenders) don't
  // overlap the line.
  const codeY = CODE_UNDERLINE_Y + 4
  page.drawText(code, {
    x: codeX,
    y: codeY,
    size: codeSize,
    font: helvBold,
    color: NAVY,
  })
}
