import "server-only"
import { PDFDocument, StandardFonts, rgb } from "pdf-lib"
import QRCode from "qrcode"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

/**
 * SafeReport "See Something? Say Something." A4 poster generator.
 *
 * Output shape (v5, May 2026): each store gets a TWO-PAGE PDF.
 *   - Page 1 (front): the v4 customer-facing design with the QR code in
 *     the centre placeholder and the SAP code on the underline at the
 *     bottom-right. Identical to the single-page output we had before.
 *   - Page 2 (back): nearly-blank A4 with the store NAME rendered very
 *     large and very pale (slate-200) in the middle of the page, with
 *     the SAP code slightly darker (slate-300) beneath it. Purpose: when
 *     HO duplex-prints a stack of bulk posters, the back side identifies
 *     each sheet at a glance without flipping. The text is intentionally
 *     low-contrast so it doesn't compete visually with the front design
 *     if you're holding the sheet up to light, but stays readable from
 *     arm's length.
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
 * Template dimensions: A4 portrait aspect (drawn to fill the full
 * 595.28 × 841.89 pt page). The currently installed template is the v4
 * "See Something? Say Something." redesign (1054 × 1492 px, May 2026 —
 * supersedes the v3 hand-laid version that had a 1055 × 1491 px export).
 * The two overlay regions were measured from the rendered template:
 *
 *   - QR placeholder (the bordered white square in the centre column):
 *       x ≈ 225–386 pt,  y ≈ 343–568 pt  (PDF coords, bottom-up)
 *   - Store Code underline (bottom-right):
 *       y ≈ 19 pt,  x ≈ 435–544 pt
 *
 * If the template image is ever regenerated, drop the new PNG into
 * public/poster-template.png and re-measure with:
 *
 *     python3 scripts/measure-template.py
 *
 * Paste the printed constants back into the block below. The PNG swap
 * and the constants update must land in the same change — a mismatched
 * pair will misplace the QR and the store code on the printed poster.
 */

const PAGE_W = 595.28
const PAGE_H = 841.89

// QR placeholder bounds (measured from public/poster-template.png — v4).
const QR_LEFT   = 225
const QR_RIGHT  = 386
const QR_TOP    = 568
const QR_BOTTOM = 343

// Store Code underline (measured from same template).
const CODE_UNDERLINE_Y       = 19
const CODE_UNDERLINE_X_START = 435
const CODE_UNDERLINE_X_END   = 544

const NAVY = rgb(0x0A / 255, 0x1F / 255, 0x46 / 255)
// Back-page colours. Slate-200 for the name (so it reads as a watermark,
// not a headline) and slate-300 for the SAP code (slightly darker so the
// hierarchy still reads when both are scanned by eye). Anything lighter
// disappears on most laser printers; anything darker competes with the
// front-page design when you hold the sheet up to a window.
const BACK_NAME_COLOR = rgb(0xE2 / 255, 0xE8 / 255, 0xF0 / 255) // slate-200
const BACK_CODE_COLOR = rgb(0xCB / 255, 0xD5 / 255, 0xE1 / 255) // slate-300

export type PosterStore = {
  sap_code: string
  /** Store name. Rendered very lightly on the back side of each sheet so
   * a duplex-printed stack identifies itself at a glance. If null or
   * empty, the back falls back to the SAP code only. */
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

  await drawFrontPage(doc, templateImg, helvBold, store, baseUrl)
  drawBackPage(doc, helvBold, store)
  return doc.save()
}

/**
 * Render every store's poster into a single multi-page PDF — TWO A4 pages
 * per store (front design + back identifier). Embeds the template image
 * once and reuses the same XObject across every front page, so bulk PDFs
 * stay small. For N stores this returns a 2N-page PDF; pair with the
 * printer's duplex setting to get a single physical sheet per store.
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
    await drawFrontPage(doc, templateImg, helvBold, s, baseUrl)
    drawBackPage(doc, helvBold, s)
  }
  return doc.save()
}

async function drawFrontPage(
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

/**
 * Render the back page — a near-blank A4 carrying the store name in
 * very-light text so a duplex-printed stack identifies itself.
 *
 *  - Name is auto-fit to ~90% of the page width: starts at 80 pt and
 *    steps down by 2 pt until it fits, never below 24 pt. A two-line
 *    fallback would be nicer for very long names but adds complexity;
 *    the longest active pilot store name fits at 36 pt, so a single
 *    line works for the pilot.
 *  - Vertical centring puts the visual mid of the cap-height text on
 *    PAGE_H/2 (Helvetica's cap height is ~0.72 em, hence the 0.36
 *    offset). The SAP code sits in a fixed gap below.
 *  - If `store.name` is null, empty, or just the SAP code repeated,
 *    we skip the name line and render the SAP code alone in the
 *    centre at a larger size. Same visual purpose, less repetition.
 */
function drawBackPage(
  doc: PDFDocument,
  helvBold: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  store: PosterStore,
) {
  const page = doc.addPage([PAGE_W, PAGE_H])

  const rawName = (store.name ?? "").trim()
  const hasName = rawName.length > 0 && rawName.toUpperCase() !== store.sap_code

  if (hasName) {
    const targetW = PAGE_W * 0.9
    let nameSize = 80
    while (
      helvBold.widthOfTextAtSize(rawName, nameSize) > targetW &&
      nameSize > 24
    ) {
      nameSize -= 2
    }
    const nameW = helvBold.widthOfTextAtSize(rawName, nameSize)
    const nameX = (PAGE_W - nameW) / 2
    const nameY = PAGE_H / 2 - 0.36 * nameSize + 30 // nudge up so SAP code below stays balanced
    page.drawText(rawName, {
      x: nameX,
      y: nameY,
      size: nameSize,
      font: helvBold,
      color: BACK_NAME_COLOR,
    })

    const codeSize = Math.max(18, Math.round(nameSize * 0.35))
    const codeW = helvBold.widthOfTextAtSize(store.sap_code, codeSize)
    const codeX = (PAGE_W - codeW) / 2
    const codeY = nameY - codeSize - 24
    page.drawText(store.sap_code, {
      x: codeX,
      y: codeY,
      size: codeSize,
      font: helvBold,
      color: BACK_CODE_COLOR,
    })
  } else {
    // Name missing — render the SAP code as the sole identifier, larger
    // so the back side still carries a usable signal.
    const targetW = PAGE_W * 0.85
    let size = 90
    while (
      helvBold.widthOfTextAtSize(store.sap_code, size) > targetW &&
      size > 32
    ) {
      size -= 2
    }
    const codeW = helvBold.widthOfTextAtSize(store.sap_code, size)
    const codeX = (PAGE_W - codeW) / 2
    const codeY = PAGE_H / 2 - 0.36 * size
    page.drawText(store.sap_code, {
      x: codeX,
      y: codeY,
      size,
      font: helvBold,
      color: BACK_NAME_COLOR,
    })
  }
}
