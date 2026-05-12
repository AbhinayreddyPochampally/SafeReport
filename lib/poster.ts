import "server-only"
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib"
import QRCode from "qrcode"

/**
 * Generate the SafeReport "See Something? Say Something." A4 poster as PDF.
 *
 * Layout reference: poster mockup the user provided — navy headline split with
 * an orange "Say Something." accent, big QR code centred above three numbered
 * action tiles (Scan / Tap or speak / Done — fully anonymous), an
 * anonymity-promise footer with shield bookends, and the SafeReport wordmark
 * + a Store Code chip on the bottom row.
 *
 * The "no red" project palette rule applies to the dashboard UI; for the
 * print poster we use Tailwind orange-600 (#EA580C) as the warm accent — same
 * visual weight as the mockup, palette-compliant.
 */

// A4 in PDF points (1 pt = 1/72 in)
const PAGE_W = 595.28
const PAGE_H = 841.89
const MARGIN = 42

// Palette
const NAVY = rgb(0.039, 0.122, 0.275) // #0A1F46 — slate-900-ish
const NAVY_SOFT = rgb(0.231, 0.275, 0.345) // #3B4658 — slate-700
const ACCENT = rgb(0.918, 0.345, 0.047) // #EA580C — orange-600
const SLATE_400 = rgb(0.58, 0.639, 0.722)
const SLATE_200 = rgb(0.886, 0.91, 0.941)
const PAGE_BG = rgb(0.984, 0.988, 0.996) // off-white wash
const QR_DARK = rgb(0.039, 0.122, 0.275)

export type PosterStore = {
  sap_code: string
  /** Optional human-readable store name; if present we surface it in the
   * footer alongside the store code, in case the printer wants to label
   * which mall the poster is going to. */
  name?: string | null
}

/**
 * Render a single store's poster as a PDF and return the bytes.
 *
 * `baseUrl` should be the canonical app URL (e.g. https://safereport.app).
 * The QR encodes `${baseUrl}/r/${sap_code}` — the reporter landing page.
 */
export async function generateStorePoster(
  store: PosterStore,
  baseUrl: string,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([PAGE_W, PAGE_H])

  const helvBold = await doc.embedFont(StandardFonts.HelveticaBold)
  const helv = await doc.embedFont(StandardFonts.Helvetica)

  await drawPoster(doc, page, helvBold, helv, store, baseUrl)
  return await doc.save()
}

/**
 * Render every store's poster into a single multi-page PDF — one A4 page
 * per store. Used by the "Download all QRs" bulk action.
 */
export async function generatePosterBatch(
  stores: PosterStore[],
  baseUrl: string,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const helvBold = await doc.embedFont(StandardFonts.HelveticaBold)
  const helv = await doc.embedFont(StandardFonts.Helvetica)

  for (const store of stores) {
    const page = doc.addPage([PAGE_W, PAGE_H])
    await drawPoster(doc, page, helvBold, helv, store, baseUrl)
  }
  return await doc.save()
}

/* --------------------------- Drawing internals --------------------------- */

async function drawPoster(
  doc: PDFDocument,
  page: PDFPage,
  helvBold: PDFFont,
  helv: PDFFont,
  store: PosterStore,
  baseUrl: string,
) {
  // Background wash
  page.drawRectangle({
    x: 0,
    y: 0,
    width: PAGE_W,
    height: PAGE_H,
    color: PAGE_BG,
  })

  // Outer soft border so the poster has a defined edge when printed
  page.drawRectangle({
    x: 12,
    y: 12,
    width: PAGE_W - 24,
    height: PAGE_H - 24,
    borderColor: NAVY,
    borderWidth: 1.2,
    color: undefined,
  })

  // Headline ------------------------------------------------------------
  // "See Something?" in NAVY, then "Say Something." in ACCENT, on the
  // same line. We measure the first chunk so the second renders flush.
  const headlineSize = 38
  const seeText = "See Something?"
  const sayText = " Say Something."
  const seeWidth = helvBold.widthOfTextAtSize(seeText, headlineSize)
  const sayWidth = helvBold.widthOfTextAtSize(sayText, headlineSize)
  const headlineTotal = seeWidth + sayWidth
  const headlineX = (PAGE_W - headlineTotal) / 2
  const headlineY = PAGE_H - MARGIN - 50

  page.drawText(seeText, {
    x: headlineX,
    y: headlineY,
    size: headlineSize,
    font: helvBold,
    color: NAVY,
  })
  page.drawText(sayText, {
    x: headlineX + seeWidth,
    y: headlineY,
    size: headlineSize,
    font: helvBold,
    color: ACCENT,
  })

  // Subtitle ------------------------------------------------------------
  const subtitle = "Report safety issues anonymously in under 60 seconds."
  const subSize = 14
  const subWidth = helvBold.widthOfTextAtSize(subtitle, subSize)
  page.drawText(subtitle, {
    x: (PAGE_W - subWidth) / 2,
    y: headlineY - 28,
    size: subSize,
    font: helvBold,
    color: NAVY,
  })

  // QR code box ---------------------------------------------------------
  // Big dashed-border box, centred, ~62% of page width.
  const qrBoxW = 360
  const qrBoxH = 360
  const qrBoxX = (PAGE_W - qrBoxW) / 2
  const qrBoxY = headlineY - 50 - qrBoxH

  drawDashedRectangle(page, {
    x: qrBoxX,
    y: qrBoxY,
    width: qrBoxW,
    height: qrBoxH,
    color: NAVY,
    width_: 1.2,
    dash: 6,
    gap: 5,
  })

  // Generate the QR PNG with high error correction (so it stays scannable
  // even with print smudges) and embed at slight inset from the box.
  const target = `${baseUrl.replace(/\/$/, "")}/r/${store.sap_code}`
  const qrPngBytes = await QRCode.toBuffer(target, {
    type: "png",
    errorCorrectionLevel: "H",
    margin: 1,
    width: 720,
    color: { dark: "#0a1f46", light: "#ffffff" },
  })
  const qrImage = await doc.embedPng(qrPngBytes)
  const qrInset = 22
  const qrSize = qrBoxW - qrInset * 2
  page.drawImage(qrImage, {
    x: qrBoxX + qrInset,
    y: qrBoxY + qrInset,
    width: qrSize,
    height: qrSize,
  })
  // Suppress unused if we add more drawing primitives later.
  void QR_DARK

  // Three-step row -----------------------------------------------------
  const stepRowY = qrBoxY - 28
  const stepRowHeight = 110
  const stepWidth = (PAGE_W - MARGIN * 2) / 3

  drawStep(page, helvBold, helv, {
    cx: MARGIN + stepWidth * 0.5,
    cy: stepRowY - stepRowHeight / 2,
    glyph: "phone",
    number: "1",
    label: "Scan",
  })
  drawStep(page, helvBold, helv, {
    cx: MARGIN + stepWidth * 1.5,
    cy: stepRowY - stepRowHeight / 2,
    glyph: "mic",
    number: "2",
    label: "Tap or speak",
  })
  drawStep(page, helvBold, helv, {
    cx: MARGIN + stepWidth * 2.5,
    cy: stepRowY - stepRowHeight / 2,
    glyph: "shield",
    number: "3",
    label: "Done — fully anonymous",
  })

  // Vertical dividers between the three step columns
  const divTop = stepRowY - 16
  const divBottom = stepRowY - stepRowHeight + 16
  for (const k of [1, 2]) {
    const x = MARGIN + stepWidth * k
    page.drawLine({
      start: { x, y: divTop },
      end: { x, y: divBottom },
      color: SLATE_200,
      thickness: 0.8,
    })
  }

  // Anonymity promise --------------------------------------------------
  const promiseY = stepRowY - stepRowHeight - 24
  page.drawLine({
    start: { x: MARGIN, y: promiseY + 18 },
    end: { x: PAGE_W - MARGIN, y: promiseY + 18 },
    color: SLATE_200,
    thickness: 0.8,
  })

  const promiseText =
    "No login. No tracking. No names. Your voice matters."
  const promiseSize = 12.5
  const promiseWidth = helvBold.widthOfTextAtSize(promiseText, promiseSize)
  const promiseX = (PAGE_W - promiseWidth) / 2
  page.drawText(promiseText, {
    x: promiseX,
    y: promiseY,
    size: promiseSize,
    font: helvBold,
    color: NAVY,
  })

  // Tiny shield bookends (orange outline)
  drawShield(page, {
    cx: promiseX - 18,
    cy: promiseY + 4,
    h: 14,
    color: ACCENT,
  })
  drawShield(page, {
    cx: promiseX + promiseWidth + 18,
    cy: promiseY + 4,
    h: 14,
    color: ACCENT,
  })

  // Footer row: SafeReport wordmark left, Store Code chip right ---------
  const footerY = MARGIN + 14

  page.drawText("SafeReport", {
    x: MARGIN,
    y: footerY,
    size: 13,
    font: helvBold,
    color: NAVY,
  })
  page.drawText(" — Workplace Safety System", {
    x: MARGIN + helvBold.widthOfTextAtSize("SafeReport", 13),
    y: footerY,
    size: 11,
    font: helv,
    color: NAVY_SOFT,
  })

  // Store code chip
  const chipText = `Store Code: ${store.sap_code}`
  const chipPadX = 10
  const chipSize = 12
  const chipTextWidth = helvBold.widthOfTextAtSize(chipText, chipSize)
  const chipW = chipTextWidth + chipPadX * 2
  const chipH = 24
  const chipX = PAGE_W - MARGIN - chipW
  const chipY = footerY - 6
  page.drawRectangle({
    x: chipX,
    y: chipY,
    width: chipW,
    height: chipH,
    borderColor: NAVY,
    borderWidth: 1,
    color: undefined,
  })
  page.drawText(chipText, {
    x: chipX + chipPadX,
    y: chipY + 7,
    size: chipSize,
    font: helvBold,
    color: NAVY,
  })

  // Optional store-name caption above the chip — only if a name was passed
  // in. Helps the printer know which physical store gets which poster.
  // The standard PDF Helvetica font we embed only covers Latin-1; any
  // Devanagari/Tamil/Kannada/Telugu glyphs would render as empty boxes
  // (or pdf-lib would throw, depending on version). We strip non-WinAnsi
  // characters and truncate to ~70 chars so the line stays inside the
  // page. If a store name is non-Latin in production, the operator
  // should add a Latin transliteration in HO before printing.
  if (store.name) {
    const nameText = sanitizeForHelvetica(store.name).slice(0, 70)
    if (nameText.length > 0) {
      const nameSize = 8.5
      const nameWidth = helv.widthOfTextAtSize(nameText, nameSize)
      page.drawText(nameText, {
        x: Math.max(MARGIN, PAGE_W - MARGIN - nameWidth),
        y: footerY + 18,
        size: nameSize,
        font: helv,
        color: SLATE_400,
      })
    }
  }
}

/**
 * Strip characters that the standard PDF Helvetica font can't render
 * (anything outside Latin-1) and replace runs of them with a single
 * space. Whitespace at the ends is trimmed afterwards. Empty input
 * returns an empty string so the caller can short-circuit.
 */
function sanitizeForHelvetica(text: string): string {
  let out = ""
  let lastWasGap = false
  for (const ch of text) {
    const code = ch.charCodeAt(0)
    // ASCII printable + Latin-1 supplement = Helvetica's reliable range.
    if (code >= 32 && code <= 255 && code !== 127) {
      out += ch
      lastWasGap = false
    } else if (!lastWasGap) {
      out += " "
      lastWasGap = true
    }
  }
  return out.trim()
}

/* ------------------------------- Step tile ------------------------------- */

function drawStep(
  page: PDFPage,
  bold: PDFFont,
  reg: PDFFont,
  opts: {
    cx: number
    cy: number
    glyph: "phone" | "mic" | "shield"
    number: string
    label: string
  },
) {
  const { cx, cy, glyph, number, label } = opts

  // Glyph
  const glyphCY = cy + 22
  const glyphSize = 36
  if (glyph === "phone") drawPhoneGlyph(page, cx, glyphCY, glyphSize)
  else if (glyph === "mic") drawMicGlyph(page, cx, glyphCY, glyphSize)
  else drawShieldGlyph(page, cx, glyphCY, glyphSize)

  // Numbered circle
  const r = 9
  const circleY = cy - 14
  page.drawCircle({ x: cx, y: circleY, size: r, color: NAVY })
  const numWidth = bold.widthOfTextAtSize(number, 11)
  page.drawText(number, {
    x: cx - numWidth / 2,
    y: circleY - 3.5,
    size: 11,
    font: bold,
    color: rgb(1, 1, 1),
  })

  // Label
  const labelSize = 11
  const labelWidth = bold.widthOfTextAtSize(label, labelSize)
  page.drawText(label, {
    x: cx - labelWidth / 2,
    y: cy - 38,
    size: labelSize,
    font: bold,
    color: NAVY,
  })

  void reg
}

/* ------------------------------- Glyphs ---------------------------------- */
// Hand-drawn primitives so we don't depend on a font icon set. Kept simple
// — each glyph is a navy outline with an orange interior accent, mirroring
// the poster mockup.

function drawPhoneGlyph(page: PDFPage, cx: number, cy: number, h: number) {
  const w = h * 0.55
  const x = cx - w / 2
  const y = cy - h / 2
  const r = 4
  // Body outline
  page.drawRectangle({
    x,
    y,
    width: w,
    height: h,
    borderColor: NAVY,
    borderWidth: 1.4,
    color: rgb(1, 1, 1),
  })
  // Faux rounded top notch — a small inset rect at the top center
  page.drawRectangle({
    x: cx - 4,
    y: y + h - 3,
    width: 8,
    height: 1.2,
    color: NAVY,
  })
  // Camera dot (orange)
  page.drawCircle({
    x: cx,
    y: y + h * 0.55,
    size: w * 0.18,
    color: ACCENT,
  })
  void r
}

function drawMicGlyph(page: PDFPage, cx: number, cy: number, h: number) {
  // Pill body
  const bodyW = h * 0.32
  const bodyH = h * 0.55
  page.drawRectangle({
    x: cx - bodyW / 2,
    y: cy - bodyH / 2 + h * 0.05,
    width: bodyW,
    height: bodyH,
    color: ACCENT,
  })
  page.drawCircle({
    x: cx,
    y: cy + bodyH / 2 + h * 0.05,
    size: bodyW / 2,
    color: ACCENT,
  })
  page.drawCircle({
    x: cx,
    y: cy - bodyH / 2 + h * 0.05,
    size: bodyW / 2,
    color: ACCENT,
  })
  // Stand
  page.drawLine({
    start: { x: cx, y: cy - bodyH / 2 + h * 0.05 - 2 },
    end: { x: cx, y: cy - h * 0.42 },
    color: NAVY,
    thickness: 1.4,
  })
  page.drawLine({
    start: { x: cx - h * 0.13, y: cy - h * 0.42 },
    end: { x: cx + h * 0.13, y: cy - h * 0.42 },
    color: NAVY,
    thickness: 1.4,
  })
  // Sound waves (two arcs faked with short lines)
  for (const side of [-1, 1] as const) {
    page.drawLine({
      start: { x: cx + side * (bodyW / 2 + 4), y: cy + h * 0.05 },
      end: { x: cx + side * (bodyW / 2 + 8), y: cy + h * 0.16 },
      color: ACCENT,
      thickness: 1.3,
    })
    page.drawLine({
      start: { x: cx + side * (bodyW / 2 + 6), y: cy - h * 0.06 },
      end: { x: cx + side * (bodyW / 2 + 11), y: cy + h * 0.05 },
      color: ACCENT,
      thickness: 1.3,
    })
  }
}

function drawShieldGlyph(page: PDFPage, cx: number, cy: number, h: number) {
  drawShield(page, { cx, cy, h, color: NAVY })
  // Padlock body (orange)
  const lockW = h * 0.22
  const lockH = h * 0.18
  page.drawRectangle({
    x: cx - lockW / 2,
    y: cy - lockH / 2,
    width: lockW,
    height: lockH,
    color: ACCENT,
  })
  // Shackle (small arch above lock)
  page.drawCircle({
    x: cx,
    y: cy + lockH / 2 + 2,
    size: lockW / 2,
    borderColor: ACCENT,
    borderWidth: 1.4,
    color: undefined,
  })
}

function drawShield(
  page: PDFPage,
  opts: { cx: number; cy: number; h: number; color: ReturnType<typeof rgb> },
) {
  const { cx, cy, h, color } = opts
  const w = h * 0.85
  // Approximate a shield shape with a rounded rect + a small triangle bottom
  const top = cy + h / 2
  const bottom = cy - h / 2
  const rightX = cx + w / 2
  const leftX = cx - w / 2

  // Body
  page.drawRectangle({
    x: leftX,
    y: bottom + h * 0.18,
    width: w,
    height: h * 0.65,
    borderColor: color,
    borderWidth: 1.4,
    color: undefined,
  })
  // Top arch (small bar to suggest curved top)
  page.drawLine({
    start: { x: leftX + 1, y: top - 0.5 },
    end: { x: rightX - 1, y: top - 0.5 },
    color,
    thickness: 1.4,
  })
  // Bottom V
  page.drawLine({
    start: { x: leftX, y: bottom + h * 0.18 },
    end: { x: cx, y: bottom },
    color,
    thickness: 1.4,
  })
  page.drawLine({
    start: { x: rightX, y: bottom + h * 0.18 },
    end: { x: cx, y: bottom },
    color,
    thickness: 1.4,
  })
}

/* ----------------------------- Dashed border ----------------------------- */

function drawDashedRectangle(
  page: PDFPage,
  opts: {
    x: number
    y: number
    width: number
    height: number
    color: ReturnType<typeof rgb>
    width_: number
    dash: number
    gap: number
  },
) {
  const { x, y, width, height, color, width_, dash, gap } = opts
  // pdf-lib doesn't expose dash patterns at the page-level high API in this
  // version; emulate by drawing many short segments along each edge.
  drawDashedLine(page, x, y, x + width, y, color, width_, dash, gap)
  drawDashedLine(page, x, y + height, x + width, y + height, color, width_, dash, gap)
  drawDashedLine(page, x, y, x, y + height, color, width_, dash, gap)
  drawDashedLine(page, x + width, y, x + width, y + height, color, width_, dash, gap)
}

function drawDashedLine(
  page: PDFPage,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: ReturnType<typeof rgb>,
  thickness: number,
  dash: number,
  gap: number,
) {
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len === 0) return
  const ux = dx / len
  const uy = dy / len
  let pos = 0
  while (pos < len) {
    const segEnd = Math.min(pos + dash, len)
    page.drawLine({
      start: { x: x1 + ux * pos, y: y1 + uy * pos },
      end: { x: x1 + ux * segEnd, y: y1 + uy * segEnd },
      color,
      thickness,
    })
    pos = segEnd + gap
  }
}
