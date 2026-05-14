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
 * SafeReport "See Something? Say Something." A4 poster generator.
 *
 * Reference layout (matches the ChatGPT-produced design v2):
 *   - Top navy header bar with "ADITYA BIRLA FASHION" + orange corner wedge
 *   - Centred orange "See Something?" / navy "Say Something." headline
 *   - Subhead "Report safety issues anonymously in under 60 seconds." with
 *     "under 60 seconds." highlighted in orange
 *   - Decorative divider rule with a navy shield-with-check medallion
 *   - Three-column body:
 *       Left  — "REPORT ANYTHING THAT COULD CAUSE HARM OR IMPACT SAFETY"
 *               with 8 numbered hazard rows (slips, hazards, near-misses,
 *               injuries, fire, electrical, behaviour, housekeeping)
 *       Center — QR code in a thin-bordered card
 *       Right — "YOUR REPORT MAKES A DIFFERENCE" with 5 benefit rows
 *               (prevent, protect, customers, improve, zero harm)
 *   - "REPORT IN 3 SIMPLE STEPS" — phone / mic / shield-lock with arrows
 *   - Dark navy banner: lock · "No login. No tracking. No names. Your voice
 *     matters." · heart
 *   - Two slate info cards (phone privacy + bell updates)
 *   - Footer: navy SafeReport panel (shield, wordmark, tagline, orange wedge)
 *     + a Store Code box on the right
 *
 * The "no red / no green" project palette rule applies to the dashboard UI;
 * for the printed poster we use Tailwind orange-600 (#EA580C) as the warm
 * accent — same visual weight as the reference, palette-compliant per
 * CLAUDE.md's print-poster exception.
 *
 * Note on the previous version: it shipped only a centred QR + 3-step row
 * and rendered the store name as smudged grey text overlapping the Store
 * Code chip. This version omits the on-page store name entirely (the SAP
 * code is enough for the printer to route each poster to the right store)
 * and uses the full reference layout.
 */

// A4 portrait, 1 pt = 1/72 in
const PAGE_W = 595.28
const PAGE_H = 841.89

// Palette — navy + orange + slate. Orange-600 is the print-poster exception
// to the otherwise no-warm-red rule (see CLAUDE.md → Palette rules).
const NAVY        = rgb(0x0A / 255, 0x1F / 255, 0x46 / 255) // #0A1F46
const ORANGE      = rgb(0xEA / 255, 0x58 / 255, 0x0C / 255) // #EA580C
const ORANGE_DARK = rgb(0xC2 / 255, 0x41 / 255, 0x0C / 255) // #C2410C
const SLATE_700   = rgb(0x33 / 255, 0x44 / 255, 0x66 / 255)
const SLATE_300   = rgb(0xCB / 255, 0xD5 / 255, 0xE1 / 255)
const SLATE_200   = rgb(0xE2 / 255, 0xE8 / 255, 0xF0 / 255)
const SLATE_100   = rgb(0xF1 / 255, 0xF5 / 255, 0xF9 / 255)
const SLATE_50    = rgb(0xF8 / 255, 0xFA / 255, 0xFC / 255)
const WHITE       = rgb(1, 1, 1)

type Color = ReturnType<typeof rgb>

export type PosterStore = {
  sap_code: string
  /** Optional store name. The previous version printed this as a faint
   * grey caption above the Store Code chip — at print resolution it came
   * out smudged. We deliberately don't draw the name on the poster
   * anymore; the SAP code is what the printer needs. The field is kept
   * on the type for backwards compatibility with callers. */
  name?: string | null
}

/**
 * Render a single store's poster as a PDF.
 *
 * `baseUrl` is the canonical app URL (e.g. https://safereport.up.railway.app).
 * The QR encodes `${baseUrl}/r/${sap_code}` — the reporter landing page.
 */
export async function generateStorePoster(
  store: PosterStore,
  baseUrl: string,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([PAGE_W, PAGE_H])
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const reg  = await doc.embedFont(StandardFonts.Helvetica)
  await drawPoster(doc, page, bold, reg, store, baseUrl)
  return doc.save()
}

/**
 * Render every store's poster into a single multi-page PDF — one A4 page
 * per store. Used by the HO "Download all QRs" bulk action.
 */
export async function generatePosterBatch(
  stores: PosterStore[],
  baseUrl: string,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const reg  = await doc.embedFont(StandardFonts.Helvetica)
  for (const s of stores) {
    const p = doc.addPage([PAGE_W, PAGE_H])
    await drawPoster(doc, p, bold, reg, s, baseUrl)
  }
  return doc.save()
}

/* ────────────────────────────────────────────────────────────────────── */
/* Master draw                                                             */
/* ────────────────────────────────────────────────────────────────────── */

async function drawPoster(
  doc: PDFDocument,
  page: PDFPage,
  bold: PDFFont,
  reg: PDFFont,
  store: PosterStore,
  baseUrl: string,
) {
  page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: WHITE })

  // 1 — Navy header bar with brand + orange corner wedge
  const headerH = 38
  const headerY = PAGE_H - headerH
  page.drawRectangle({ x: 0, y: headerY, width: PAGE_W, height: headerH, color: NAVY })
  page.drawText("ADITYA BIRLA FASHION", {
    x: 30, y: headerY + headerH / 2 - 5,
    size: 13, font: bold, color: WHITE,
  })
  drawRightWedge(page, PAGE_W - 110, headerY, 110, headerH, ORANGE)

  // 2 — Headline + subhead
  const headlineSize = 52
  const line1 = "See Something?"
  const line2 = "Say Something."
  const line1W = bold.widthOfTextAtSize(line1, headlineSize)
  const line2W = bold.widthOfTextAtSize(line2, headlineSize)
  const headlineTop = headerY - 24
  const line1Y = headlineTop - headlineSize * 0.75
  page.drawText(line1, {
    x: (PAGE_W - line1W) / 2, y: line1Y,
    size: headlineSize, font: bold, color: ORANGE,
  })
  const line2Y = line1Y - (headlineSize * 0.95)
  page.drawText(line2, {
    x: (PAGE_W - line2W) / 2, y: line2Y,
    size: headlineSize, font: bold, color: NAVY,
  })

  const subSize = 14
  const subA = "Report safety issues anonymously in "
  const subB = "under 60 seconds."
  const subAW = bold.widthOfTextAtSize(subA, subSize)
  const subBW = bold.widthOfTextAtSize(subB, subSize)
  const subTotalW = subAW + subBW
  const subX = (PAGE_W - subTotalW) / 2
  const subY = line2Y - 30
  page.drawText(subA, { x: subX,         y: subY, size: subSize, font: bold, color: NAVY })
  page.drawText(subB, { x: subX + subAW, y: subY, size: subSize, font: bold, color: ORANGE })

  // Divider with shield medallion
  const divY = subY - 18
  const halfLine = 150
  const cxMid = PAGE_W / 2
  page.drawLine({
    start: { x: cxMid - halfLine, y: divY },
    end:   { x: cxMid - 18,        y: divY },
    color: NAVY, thickness: 1,
  })
  page.drawLine({
    start: { x: cxMid + 18,        y: divY },
    end:   { x: cxMid + halfLine, y: divY },
    color: NAVY, thickness: 1,
  })
  drawShield(page, cxMid, divY, 22, NAVY, ORANGE)

  // 3 — Body: hazards · QR · benefits
  const bodyTop = divY - 30
  const bodyBot = 388
  const bodyH = bodyTop - bodyBot

  const sideMargin = 28
  const leftColW   = 150
  const rightColW  = 150
  const centerColW = PAGE_W - sideMargin * 2 - leftColW - rightColW - 20
  const leftColX   = sideMargin
  const centerColX = sideMargin + leftColW + 10
  const rightColX  = centerColX + centerColW + 10

  drawSectionHeader(page, bold, leftColX, bodyTop,
    "REPORT ANYTHING", "THAT COULD CAUSE HARM", "OR IMPACT SAFETY")

  const hazards: { label: string; icon: HazardIcon }[] = [
    { label: "Slips, Trips\n& Falls",         icon: "fall" },
    { label: "Hazards /\nUnsafe Conditions",  icon: "alert" },
    { label: "Near-misses",                   icon: "cone" },
    { label: "Injuries /\nIncidents",         icon: "firstaid" },
    { label: "Fire Safety",                   icon: "flame" },
    { label: "Electrical\nSafety",            icon: "bolt" },
    { label: "Behaviour /\nPolicy Violation", icon: "userwarn" },
    { label: "Housekeeping\n& Cleanliness",   icon: "box" },
  ]
  const hazTop = bodyTop - 42
  const hazRowH = (hazTop - bodyBot - 6) / 8
  for (let i = 0; i < hazards.length; i++) {
    drawHazardRow(page, bold, {
      x: leftColX,
      y: hazTop - hazRowH * i - hazRowH * 0.55,
      w: leftColW, number: i + 1,
      label: hazards[i].label, icon: hazards[i].icon,
    })
  }

  drawSectionHeader(page, bold, rightColX, bodyTop,
    "YOUR REPORT", "MAKES A DIFFERENCE", "")

  const benefits: { label: string; icon: BenefitIcon }[] = [
    { label: "Prevent\naccidents",         icon: "shieldcheck" },
    { label: "Protect our\npeople",        icon: "heart" },
    { label: "Keep our\ncustomers safe",   icon: "bag" },
    { label: "Improve our\nworkplace",     icon: "chart" },
    { label: "Zero harm.\nEveryone.\nEvery day.", icon: "star" },
  ]
  const benTop = bodyTop - 42
  const benRowH = (benTop - bodyBot - 6) / 5
  for (let i = 0; i < benefits.length; i++) {
    drawBenefitRow(page, bold, {
      x: rightColX, y: benTop - benRowH * i - benRowH * 0.5,
      w: rightColW, label: benefits[i].label, icon: benefits[i].icon,
    })
  }

  // Center QR card
  const qrAreaX = centerColX
  const qrAreaY = bodyBot + 10
  const qrAreaW = centerColW
  const qrAreaH = bodyH - 30
  const qrPad = 16
  const qrSize = Math.min(qrAreaW - qrPad * 2, qrAreaH - qrPad * 2)
  page.drawRectangle({
    x: qrAreaX, y: qrAreaY, width: qrAreaW, height: qrAreaH,
    color: WHITE, borderColor: NAVY, borderWidth: 1,
  })
  const qrX = qrAreaX + (qrAreaW - qrSize) / 2
  const qrY = qrAreaY + (qrAreaH - qrSize) / 2
  const target = `${(baseUrl ?? "").replace(/\/$/, "")}/r/${store.sap_code}`
  const qrPng = await QRCode.toBuffer(target, {
    type: "png",
    errorCorrectionLevel: "H",
    margin: 1,
    width: 720,
    color: { dark: "#0a1f46", light: "#ffffff" },
  })
  const qrImg = await doc.embedPng(qrPng)
  page.drawImage(qrImg, { x: qrX, y: qrY, width: qrSize, height: qrSize })

  // 4 — REPORT IN 3 SIMPLE STEPS
  const stepsTop = bodyBot - 12
  const stepsTitle = "REPORT IN 3 SIMPLE STEPS"
  const stepsTitleSize = 11
  const stepsTitleW = bold.widthOfTextAtSize(stepsTitle, stepsTitleSize)
  const stepsLineY = stepsTop - 4
  page.drawLine({
    start: { x: sideMargin, y: stepsLineY },
    end:   { x: (PAGE_W - stepsTitleW) / 2 - 12, y: stepsLineY },
    color: NAVY, thickness: 0.8,
  })
  page.drawLine({
    start: { x: (PAGE_W + stepsTitleW) / 2 + 12, y: stepsLineY },
    end:   { x: PAGE_W - sideMargin, y: stepsLineY },
    color: NAVY, thickness: 0.8,
  })
  page.drawText(stepsTitle, {
    x: (PAGE_W - stepsTitleW) / 2, y: stepsLineY - 4,
    size: stepsTitleSize, font: bold, color: NAVY,
  })

  const stepsBaseY = stepsLineY - 26
  const stepW = (PAGE_W - sideMargin * 2) / 3
  drawStep(page, bold, reg, {
    cx: sideMargin + stepW * 0.5 + 10, cy: stepsBaseY - 36,
    number: 1, glyph: "phone", title: "Scan",
    body: "Open your phone\ncamera and scan\nthe QR code.",
  })
  drawStep(page, bold, reg, {
    cx: sideMargin + stepW * 1.5,      cy: stepsBaseY - 36,
    number: 2, glyph: "mic", title: "Tap or speak",
    body: "Select a category,\nshare what you saw\nor heard. Add details\nor photos if needed.",
  })
  drawStep(page, bold, reg, {
    cx: sideMargin + stepW * 2.5 - 10, cy: stepsBaseY - 36,
    number: 3, glyph: "shieldlock", title: "Done —\nfully anonymous",
    body: "Your report is\nsubmitted. No login.\nNo names.\nWe act on it.",
  })
  drawArrow(page, sideMargin + stepW * 1.0, stepsBaseY - 36, ORANGE)
  drawArrow(page, sideMargin + stepW * 2.0, stepsBaseY - 36, ORANGE)

  // 5 — Dark privacy banner
  const banY = 188
  const banH = 36
  page.drawRectangle({
    x: sideMargin, y: banY, width: PAGE_W - sideMargin * 2, height: banH,
    color: NAVY,
  })
  drawLockIcon(page, sideMargin + 22, banY + banH / 2, 22, ORANGE)
  drawHeartIcon(page, PAGE_W - sideMargin - 22, banY + banH / 2, 20, ORANGE)
  const bA = "No login. No tracking. No names. "
  const bB = "Your voice matters."
  const bSize = 12
  const bAW = bold.widthOfTextAtSize(bA, bSize)
  const bBW = bold.widthOfTextAtSize(bB, bSize)
  const bTotal = bAW + bBW
  const bX = (PAGE_W - bTotal) / 2
  const bY = banY + banH / 2 - 4
  page.drawText(bA, { x: bX,       y: bY, size: bSize, font: bold, color: WHITE })
  page.drawText(bB, { x: bX + bAW, y: bY, size: bSize, font: bold, color: ORANGE })
  page.drawLine({
    start: { x: bX + bAW,           y: bY - 2 },
    end:   { x: bX + bAW + bBW,     y: bY - 2 },
    color: ORANGE, thickness: 1,
  })

  // 6 — Two info cards
  const cardsTop = banY - 12
  const cardsH = 75
  const cardsW = (PAGE_W - sideMargin * 2 - 12) / 2
  const card1X = sideMargin
  const card2X = sideMargin + cardsW + 12
  const cardsY = cardsTop - cardsH

  page.drawRectangle({ x: card1X, y: cardsY, width: cardsW, height: cardsH, color: SLATE_100 })
  drawCircleIcon(page, card1X + 22, cardsY + cardsH - 22, 14, NAVY, WHITE, "phone")
  page.drawText("We collect your phone number", {
    x: card1X + 48, y: cardsY + cardsH - 18, size: 9.5, font: bold, color: NAVY,
  })
  page.drawText("to update you on your report.", {
    x: card1X + 48, y: cardsY + cardsH - 30, size: 9.5, font: bold, color: NAVY,
  })
  drawWrapped(page, reg, {
    x: card1X + 48, y: cardsY + cardsH - 44,
    size: 8.5, color: SLATE_700, lineH: 11, maxW: cardsW - 60,
    text: "It is never visible to store managers and is used only by the system.",
  })

  page.drawRectangle({ x: card2X, y: cardsY, width: cardsW, height: cardsH, color: SLATE_100 })
  drawCircleIcon(page, card2X + 22, cardsY + cardsH - 22, 14, NAVY, WHITE, "bell")
  page.drawText("You will receive updates on", {
    x: card2X + 48, y: cardsY + cardsH - 18, size: 9.5, font: bold, color: NAVY,
  })
  page.drawText("your report status.", {
    x: card2X + 48, y: cardsY + cardsH - 30, size: 9.5, font: bold, color: NAVY,
  })
  drawWrapped(page, reg, {
    x: card2X + 48, y: cardsY + cardsH - 44,
    size: 8.5, color: SLATE_700, lineH: 11, maxW: cardsW - 60,
    text: "When resolved, you'll know what action was taken.",
  })

  // 7 — Footer: SafeReport navy panel + Store Code box
  const footerY = 28
  const footerH = 58
  const leftPanelW = (PAGE_W - sideMargin * 2) * 0.58
  page.drawRectangle({ x: sideMargin, y: footerY, width: leftPanelW, height: footerH, color: NAVY })
  drawRightWedge(page, sideMargin + leftPanelW - 22, footerY, 22, footerH, ORANGE)
  drawShield(page, sideMargin + 28, footerY + footerH / 2, 30, WHITE, ORANGE)
  page.drawText("SafeReport", {
    x: sideMargin + 56, y: footerY + footerH - 22,
    size: 18, font: bold, color: WHITE,
  })
  page.drawText("Workplace Safety System", {
    x: sideMargin + 56, y: footerY + footerH - 36,
    size: 9, font: reg, color: SLATE_300,
  })
  page.drawText("Report. Act. Prevent.", {
    x: sideMargin + 56, y: footerY + footerH - 50,
    size: 9.5, font: bold, color: ORANGE,
  })

  const storeBoxX = sideMargin + leftPanelW + 12
  const storeBoxW = PAGE_W - sideMargin - storeBoxX
  page.drawRectangle({
    x: storeBoxX, y: footerY, width: storeBoxW, height: footerH,
    color: WHITE, borderColor: NAVY, borderWidth: 1.2,
  })
  page.drawText("Store Code:", {
    x: storeBoxX + 14, y: footerY + footerH / 2 - 5,
    size: 13, font: bold, color: NAVY,
  })
  const codeStartX = storeBoxX + 14 + bold.widthOfTextAtSize("Store Code:", 13) + 8
  page.drawText(store.sap_code, {
    x: codeStartX, y: footerY + footerH / 2 - 5,
    size: 13, font: bold, color: NAVY,
  })
  const codeW = bold.widthOfTextAtSize(store.sap_code, 13)
  page.drawLine({
    start: { x: codeStartX,             y: footerY + footerH / 2 - 8 },
    end:   { x: codeStartX + codeW + 6, y: footerY + footerH / 2 - 8 },
    color: NAVY, thickness: 1,
  })
}

/* ────────────────────────────────────────────────────────────────────── */
/* Layout helpers                                                          */
/* ────────────────────────────────────────────────────────────────────── */

function drawSectionHeader(
  page: PDFPage, bold: PDFFont, x: number, y: number,
  line1: string, line2: string, line3: string,
) {
  const size = 9
  page.drawText(line1, { x, y: y - size,       size, font: bold, color: ORANGE_DARK })
  page.drawText(line2, { x, y: y - size * 2.3, size, font: bold, color: ORANGE_DARK })
  if (line3) page.drawText(line3, { x, y: y - size * 3.6, size, font: bold, color: ORANGE_DARK })
}

type HazardIcon =
  | "fall" | "alert" | "cone" | "firstaid"
  | "flame" | "bolt" | "userwarn" | "box"

type BenefitIcon = "shieldcheck" | "heart" | "bag" | "chart" | "star"

function drawHazardRow(
  page: PDFPage, bold: PDFFont,
  opts: { x: number; y: number; w: number; number: number; label: string; icon: HazardIcon },
) {
  const { x, y, w, number, label, icon } = opts
  const cx0 = x + 10
  page.drawCircle({ x: cx0, y, size: 9, color: NAVY })
  const numStr = String(number)
  const numW = bold.widthOfTextAtSize(numStr, 10)
  page.drawText(numStr, {
    x: cx0 - numW / 2, y: y - 3.5,
    size: 10, font: bold, color: WHITE,
  })
  drawHazardIcon(page, x + 30, y, icon)
  const labelX = x + 52
  const lines = label.split("\n")
  const lineH = 10
  const startY = y + (lines.length > 1 ? 4 : -3)
  for (let i = 0; i < lines.length; i++) {
    page.drawText(lines[i], {
      x: labelX, y: startY - i * lineH,
      size: 9, font: bold, color: NAVY,
    })
  }
  page.drawLine({
    start: { x: x + 24, y: y - 14 },
    end:   { x: x + w - 4, y: y - 14 },
    color: SLATE_200, thickness: 0.6,
  })
}

function drawBenefitRow(
  page: PDFPage, bold: PDFFont,
  opts: { x: number; y: number; w: number; label: string; icon: BenefitIcon },
) {
  const { x, y, w, label, icon } = opts
  drawBenefitIcon(page, x + 12, y, icon)
  const labelX = x + 32
  const lines = label.split("\n")
  const lineH = 10
  const startY = y + (lines.length > 1 ? (lines.length - 1) * lineH / 2 : -3)
  for (let i = 0; i < lines.length; i++) {
    page.drawText(lines[i], {
      x: labelX, y: startY - i * lineH,
      size: 9, font: bold, color: NAVY,
    })
  }
  page.drawLine({
    start: { x: x, y: y - 14 },
    end:   { x: x + w - 4, y: y - 14 },
    color: SLATE_200, thickness: 0.6,
  })
}

function drawStep(
  page: PDFPage, bold: PDFFont, reg: PDFFont,
  opts: {
    cx: number; cy: number; number: number;
    glyph: "phone" | "mic" | "shieldlock";
    title: string; body: string;
  },
) {
  const { cx, cy, number, glyph, title, body } = opts
  if (glyph === "phone")      drawPhoneStepIcon(page, cx, cy + 24, 30)
  else if (glyph === "mic")   drawMicStepIcon(page, cx, cy + 24, 30)
  else                        drawShieldLockStepIcon(page, cx, cy + 24, 30)

  const r = 8
  const cxN = cx - 32
  const cyN = cy - 4
  page.drawCircle({ x: cxN, y: cyN, size: r, color: NAVY })
  const ns = String(number)
  const nsW = bold.widthOfTextAtSize(ns, 9)
  page.drawText(ns, {
    x: cxN - nsW / 2, y: cyN - 3,
    size: 9, font: bold, color: WHITE,
  })

  const titleLines = title.split("\n")
  const tSize = 11
  for (let i = 0; i < titleLines.length; i++) {
    page.drawText(titleLines[i], {
      x: cxN + 14, y: cyN - 2 - i * 12,
      size: tSize, font: bold, color: ORANGE,
    })
  }

  const bodyLines = body.split("\n")
  const bSize = 8.5
  const bLineH = 11
  const bodyStartY = cyN - 2 - titleLines.length * 12 - 6
  for (let i = 0; i < bodyLines.length; i++) {
    page.drawText(bodyLines[i], {
      x: cxN - 6, y: bodyStartY - i * bLineH,
      size: bSize, font: reg, color: SLATE_700,
    })
  }
}

function drawArrow(page: PDFPage, x: number, cy: number, color: Color) {
  const size = 8
  page.drawLine({
    start: { x: x - size / 2, y: cy + size / 2 },
    end:   { x: x + size / 2, y: cy },
    color, thickness: 1.8,
  })
  page.drawLine({
    start: { x: x - size / 2, y: cy - size / 2 },
    end:   { x: x + size / 2, y: cy },
    color, thickness: 1.8,
  })
}

function drawWrapped(
  page: PDFPage, font: PDFFont,
  opts: { x: number; y: number; size: number; color: Color; lineH: number; maxW: number; text: string },
) {
  const { x, y, size, color, lineH, maxW, text } = opts
  const words = text.split(/\s+/)
  let line = ""
  let row = 0
  for (const w of words) {
    const trial = line ? line + " " + w : w
    if (font.widthOfTextAtSize(trial, size) > maxW && line) {
      page.drawText(line, { x, y: y - row * lineH, size, font, color })
      line = w
      row++
    } else {
      line = trial
    }
  }
  if (line) page.drawText(line, { x, y: y - row * lineH, size, font, color })
}

/* ────────────────────────────────────────────────────────────────────── */
/* Icon primitives                                                         */
/* ────────────────────────────────────────────────────────────────────── */

function drawRightWedge(
  page: PDFPage, x: number, y: number, w: number, h: number, color: Color,
) {
  page.drawSvgPath(`M ${x} ${y + h} L ${x + w} ${y + h} L ${x + w} ${y} Z`, {
    color, borderColor: color, borderWidth: 0,
  })
}

function drawShield(
  page: PDFPage, cx: number, cy: number, h: number, fill: Color, accent: Color,
) {
  // Lucide-style shield silhouette in a 24×24 viewBox.
  const scale = h / 24
  const path =
    "M 12 2 " +
    "L 21 5 " +
    "L 21 11 " +
    "C 21 16 17 20 12 22 " +
    "C 7 20 3 16 3 11 " +
    "L 3 5 " +
    "Z"
  page.drawSvgPath(path, {
    x: cx - 12 * scale, y: cy + 12 * scale, scale,
    color: fill, borderColor: fill, borderWidth: 0,
  })
  const t = Math.max(1.4, h * 0.12)
  page.drawLine({
    start: { x: cx - h * 0.22, y: cy - h * 0.02 },
    end:   { x: cx - h * 0.06, y: cy - h * 0.18 },
    color: accent, thickness: t,
  })
  page.drawLine({
    start: { x: cx - h * 0.06, y: cy - h * 0.18 },
    end:   { x: cx + h * 0.22, y: cy + h * 0.18 },
    color: accent, thickness: t,
  })
}

function drawHazardIcon(page: PDFPage, cx: number, cy: number, kind: HazardIcon) {
  switch (kind) {
    case "fall":     return drawFallIcon(page, cx, cy)
    case "alert":    return drawAlertIcon(page, cx, cy)
    case "cone":     return drawConeIcon(page, cx, cy)
    case "firstaid": return drawFirstAidIcon(page, cx, cy)
    case "flame":    return drawFlameIcon(page, cx, cy)
    case "bolt":     return drawBoltIcon(page, cx, cy)
    case "userwarn": return drawUserWarnIcon(page, cx, cy)
    case "box":      return drawBoxIcon(page, cx, cy)
  }
}

function drawFallIcon(page: PDFPage, cx: number, cy: number) {
  const head = { x: cx - 3, y: cy + 6 }
  page.drawCircle({ x: head.x, y: head.y, size: 2.4, color: NAVY })
  page.drawLine({ start: { x: head.x, y: head.y - 2.2 }, end: { x: cx + 3, y: cy - 3 }, color: NAVY, thickness: 1.6 })
  page.drawLine({ start: { x: cx, y: cy + 2 }, end: { x: cx + 6, y: cy + 4 }, color: NAVY, thickness: 1.6 })
  page.drawLine({ start: { x: cx + 3, y: cy - 3 }, end: { x: cx + 7, y: cy - 7 }, color: NAVY, thickness: 1.6 })
  page.drawLine({ start: { x: cx + 3, y: cy - 3 }, end: { x: cx - 4, y: cy - 7 }, color: NAVY, thickness: 1.6 })
  page.drawLine({ start: { x: cx - 9, y: cy + 4 }, end: { x: cx - 6, y: cy + 2 }, color: ORANGE, thickness: 1.2 })
  page.drawLine({ start: { x: cx - 10, y: cy + 1 }, end: { x: cx - 6, y: cy - 1 }, color: ORANGE, thickness: 1.2 })
  page.drawLine({ start: { x: cx - 7, y: cy - 8 }, end: { x: cx + 8, y: cy - 8 }, color: NAVY, thickness: 0.8 })
}

function drawAlertIcon(page: PDFPage, cx: number, cy: number) {
  const h = 14
  const w = 14
  page.drawSvgPath(
    `M ${cx} ${cy + h / 2} L ${cx + w / 2} ${cy - h / 2} L ${cx - w / 2} ${cy - h / 2} Z`,
    { color: ORANGE, borderColor: ORANGE, borderWidth: 0 },
  )
  page.drawRectangle({ x: cx - 0.9, y: cy - 3, width: 1.8, height: 7, color: WHITE })
  page.drawCircle({ x: cx, y: cy - 5, size: 1, color: WHITE })
}

function drawConeIcon(page: PDFPage, cx: number, cy: number) {
  const w = 12
  const h = 14
  page.drawSvgPath(
    `M ${cx - w / 2} ${cy - h / 2 + 2} ` +
    `L ${cx + w / 2} ${cy - h / 2 + 2} ` +
    `L ${cx + 2}     ${cy + h / 2} ` +
    `L ${cx - 2}     ${cy + h / 2} Z`,
    { color: ORANGE, borderColor: ORANGE, borderWidth: 0 },
  )
  page.drawRectangle({ x: cx - w / 2 - 1, y: cy - h / 2 - 1, width: w + 2, height: 3, color: NAVY })
  page.drawRectangle({ x: cx - 5, y: cy - 1, width: 10, height: 2, color: WHITE })
}

function drawFirstAidIcon(page: PDFPage, cx: number, cy: number) {
  page.drawRectangle({ x: cx - 8, y: cy - 6, width: 16, height: 12, color: NAVY })
  page.drawRectangle({ x: cx - 1, y: cy - 4, width: 2, height: 8, color: WHITE })
  page.drawRectangle({ x: cx - 4, y: cy - 1, width: 8, height: 2, color: WHITE })
  page.drawRectangle({ x: cx - 3, y: cy + 6, width: 6, height: 1.5, color: ORANGE })
}

function drawFlameIcon(page: PDFPage, cx: number, cy: number) {
  const h = 16
  const scale = h / 24
  const path =
    "M 12 2 " +
    "C 13 6 17 8 17 14 " +
    "C 17 18 14 22 12 22 " +
    "C 10 22 7 18 7 14 " +
    "C 7 11 9 9 10 7 " +
    "C 11 10 12 11 13 9 " +
    "C 13 7 12 5 12 2 " +
    "Z"
  page.drawSvgPath(path, {
    x: cx - 12 * scale, y: cy + 12 * scale, scale,
    color: ORANGE, borderColor: ORANGE, borderWidth: 0,
  })
}

function drawBoltIcon(page: PDFPage, cx: number, cy: number) {
  page.drawSvgPath(
    `M ${cx + 1} ${cy + 8} ` +
    `L ${cx - 5} ${cy + 1} ` +
    `L ${cx - 1} ${cy + 1} ` +
    `L ${cx - 3} ${cy - 8} ` +
    `L ${cx + 5} ${cy + 0} ` +
    `L ${cx + 1} ${cy + 0} ` +
    `L ${cx + 3} ${cy + 8} Z`,
    { color: ORANGE, borderColor: ORANGE, borderWidth: 0 },
  )
}

function drawUserWarnIcon(page: PDFPage, cx: number, cy: number) {
  page.drawCircle({ x: cx - 1, y: cy + 4, size: 3, color: NAVY })
  page.drawSvgPath(
    `M ${cx - 7} ${cy - 6} ` +
    `Q ${cx - 7} ${cy + 1}, ${cx - 1} ${cy + 1} ` +
    `Q ${cx + 5} ${cy + 1}, ${cx + 5} ${cy - 6} Z`,
    { color: NAVY, borderColor: NAVY, borderWidth: 0 },
  )
  page.drawCircle({ x: cx + 5, y: cy + 5, size: 2.8, color: ORANGE })
  page.drawRectangle({ x: cx + 4.6, y: cy + 4.2, width: 0.8, height: 1.6, color: WHITE })
  page.drawCircle({ x: cx + 5, y: cy + 3.5, size: 0.5, color: WHITE })
}

function drawBoxIcon(page: PDFPage, cx: number, cy: number) {
  page.drawRectangle({
    x: cx - 7, y: cy - 6, width: 14, height: 12,
    borderColor: NAVY, borderWidth: 1.4, color: WHITE,
  })
  page.drawRectangle({ x: cx - 7, y: cy + 4, width: 14, height: 1.5, color: ORANGE })
  page.drawLine({
    start: { x: cx, y: cy + 6 }, end: { x: cx, y: cy + 4 },
    color: NAVY, thickness: 1.2,
  })
}

function drawBenefitIcon(page: PDFPage, cx: number, cy: number, kind: BenefitIcon) {
  switch (kind) {
    case "shieldcheck": return drawShield(page, cx, cy, 16, NAVY, ORANGE)
    case "heart":       return drawHeartIcon(page, cx, cy, 14, ORANGE)
    case "bag":         return drawBagIcon(page, cx, cy)
    case "chart":       return drawChartIcon(page, cx, cy)
    case "star":        return drawStarIcon(page, cx, cy)
  }
}

function drawHeartIcon(page: PDFPage, cx: number, cy: number, h: number, color: Color) {
  const scale = h / 24
  const path =
    "M 12 21 " +
    "C 12 21 3 14 3 8 " +
    "C 3 5 5 3 8 3 " +
    "C 10 3 12 4 12 6 " +
    "C 12 4 14 3 16 3 " +
    "C 19 3 21 5 21 8 " +
    "C 21 14 12 21 12 21 " +
    "Z"
  page.drawSvgPath(path, {
    x: cx - 12 * scale, y: cy + 12 * scale, scale,
    color, borderColor: color, borderWidth: 0,
  })
}

function drawBagIcon(page: PDFPage, cx: number, cy: number) {
  page.drawRectangle({ x: cx - 7, y: cy - 7, width: 14, height: 11, color: NAVY })
  const handleR = 3
  const yTop = cy + 4
  for (const sign of [-1, 1] as const) {
    const x0 = cx + sign * 3 - handleR
    const x1 = cx + sign * 3 + handleR
    page.drawSvgPath(
      `M ${x0} ${yTop} A ${handleR} ${handleR} 0 0 1 ${x1} ${yTop}`,
      { borderColor: ORANGE, borderWidth: 1.6, color: undefined },
    )
  }
  page.drawRectangle({ x: cx - 6, y: cy + 1, width: 12, height: 1.2, color: ORANGE })
}

function drawChartIcon(page: PDFPage, cx: number, cy: number) {
  const baseY = cy - 7
  page.drawRectangle({ x: cx - 8, y: baseY, width: 3, height: 5,  color: NAVY })
  page.drawRectangle({ x: cx - 2, y: baseY, width: 3, height: 9,  color: NAVY })
  page.drawRectangle({ x: cx + 4, y: baseY, width: 3, height: 13, color: NAVY })
  page.drawLine({
    start: { x: cx - 7, y: baseY + 6 },
    end:   { x: cx + 6, y: baseY + 14 },
    color: ORANGE, thickness: 1.8,
  })
  page.drawLine({
    start: { x: cx + 6, y: baseY + 14 },
    end:   { x: cx + 2, y: baseY + 13 },
    color: ORANGE, thickness: 1.8,
  })
  page.drawLine({
    start: { x: cx + 6, y: baseY + 14 },
    end:   { x: cx + 5, y: baseY + 10 },
    color: ORANGE, thickness: 1.8,
  })
}

function drawStarIcon(page: PDFPage, cx: number, cy: number) {
  const r = 8
  const inner = r * 0.42
  const pts: [number, number][] = []
  for (let i = 0; i < 10; i++) {
    const ang = (-Math.PI / 2) + i * (Math.PI / 5)
    const rad = i % 2 === 0 ? r : inner
    pts.push([cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad])
  }
  let path = `M ${pts[0][0]} ${pts[0][1]} `
  for (let i = 1; i < pts.length; i++) path += `L ${pts[i][0]} ${pts[i][1]} `
  path += "Z"
  page.drawSvgPath(path, { color: ORANGE, borderColor: ORANGE, borderWidth: 0 })
}

function drawPhoneStepIcon(page: PDFPage, cx: number, cy: number, h: number) {
  const w = h * 0.55
  page.drawRectangle({
    x: cx - w / 2, y: cy - h / 2,
    width: w, height: h,
    borderColor: NAVY, borderWidth: 1.6, color: WHITE,
  })
  page.drawRectangle({
    x: cx - w / 2 + 1.6, y: cy - h / 2 + 4,
    width: w - 3.2, height: h - 8,
    borderColor: NAVY, borderWidth: 0.8, color: SLATE_50,
  })
  page.drawCircle({ x: cx + w / 2 - 3, y: cy + h / 2 - 3, size: 1.8, color: ORANGE })
  const bx = cx - w / 2 + 4
  const by = cy - h / 2 + 7
  const bw = w - 8
  const bh = h - 14
  const cornerLen = 3
  for (const [dx, dy] of [[0, 0], [bw, 0], [0, bh], [bw, bh]] as const) {
    page.drawLine({
      start: { x: bx + dx, y: by + dy },
      end:   { x: bx + dx + (dx > 0 ? -cornerLen : cornerLen), y: by + dy },
      color: NAVY, thickness: 1,
    })
    page.drawLine({
      start: { x: bx + dx, y: by + dy },
      end:   { x: bx + dx, y: by + dy + (dy > 0 ? -cornerLen : cornerLen) },
      color: NAVY, thickness: 1,
    })
  }
  for (let i = 0; i < 3; i++) {
    page.drawLine({
      start: { x: cx - w / 2 - 2, y: cy + 4 - i * 3 },
      end:   { x: cx - w / 2 - 6, y: cy + 4 - i * 3 },
      color: ORANGE, thickness: 1.4,
    })
  }
}

function drawMicStepIcon(page: PDFPage, cx: number, cy: number, h: number) {
  const bodyW = h * 0.42
  const bodyH = h * 0.55
  page.drawRectangle({
    x: cx - bodyW / 2, y: cy - bodyH / 2 + h * 0.05,
    width: bodyW, height: bodyH, color: ORANGE,
  })
  page.drawCircle({ x: cx, y: cy + bodyH / 2 + h * 0.05, size: bodyW / 2, color: ORANGE })
  page.drawCircle({ x: cx, y: cy - bodyH / 2 + h * 0.05, size: bodyW / 2, color: ORANGE })
  page.drawLine({
    start: { x: cx, y: cy - bodyH / 2 + h * 0.05 - 2 },
    end:   { x: cx, y: cy - h * 0.42 },
    color: NAVY, thickness: 1.8,
  })
  page.drawLine({
    start: { x: cx - h * 0.14, y: cy - h * 0.42 },
    end:   { x: cx + h * 0.14, y: cy - h * 0.42 },
    color: NAVY, thickness: 1.8,
  })
  for (const side of [-1, 1] as const) {
    page.drawLine({
      start: { x: cx + side * (bodyW / 2 + 4), y: cy + h * 0.12 },
      end:   { x: cx + side * (bodyW / 2 + 9), y: cy + h * 0.22 },
      color: ORANGE, thickness: 1.5,
    })
    page.drawLine({
      start: { x: cx + side * (bodyW / 2 + 4), y: cy - h * 0.04 },
      end:   { x: cx + side * (bodyW / 2 + 10), y: cy + h * 0.06 },
      color: ORANGE, thickness: 1.5,
    })
  }
}

function drawShieldLockStepIcon(page: PDFPage, cx: number, cy: number, h: number) {
  drawShield(page, cx, cy + 1, h, NAVY, NAVY)
  page.drawRectangle({ x: cx - 5, y: cy - 5, width: 10, height: 7, color: ORANGE })
  page.drawCircle({
    x: cx, y: cy + 2, size: 4,
    borderColor: ORANGE, borderWidth: 1.6, color: undefined,
  })
  page.drawRectangle({ x: cx - 5, y: cy - 5, width: 10, height: 7, color: ORANGE })
}

function drawLockIcon(page: PDFPage, cx: number, cy: number, h: number, color: Color) {
  const bodyW = h * 0.72
  const bodyH = h * 0.55
  const bodyY = cy - h * 0.48
  page.drawRectangle({ x: cx - bodyW / 2, y: bodyY, width: bodyW, height: bodyH, color })
  const shackleR = h * 0.28
  const shackleStroke = Math.max(1.4, h * 0.14)
  const shackleCY = bodyY + bodyH - shackleR * 0.25
  page.drawCircle({
    x: cx, y: shackleCY, size: shackleR,
    borderColor: color, borderWidth: shackleStroke, color: undefined,
  })
  page.drawRectangle({
    x: cx - shackleR - 2, y: shackleCY - shackleR - 1,
    width: (shackleR + 2) * 2, height: shackleR + 1, color,
  })
  page.drawRectangle({ x: cx - bodyW / 2, y: bodyY, width: bodyW, height: bodyH, color })
  page.drawCircle({ x: cx, y: bodyY + bodyH * 0.6, size: h * 0.07, color: NAVY })
  page.drawRectangle({
    x: cx - h * 0.04, y: bodyY + bodyH * 0.2,
    width: h * 0.08, height: bodyH * 0.42, color: NAVY,
  })
}

function drawCircleIcon(
  page: PDFPage, cx: number, cy: number, r: number,
  fill: Color, glyphColor: Color, kind: "phone" | "bell",
) {
  page.drawCircle({ x: cx, y: cy, size: r, color: fill })
  if (kind === "phone") {
    page.drawRectangle({
      x: cx - 4, y: cy - 5.5, width: 8, height: 11,
      borderColor: glyphColor, borderWidth: 1, color: undefined,
    })
    page.drawCircle({ x: cx, y: cy - 3.5, size: 0.8, color: glyphColor })
    page.drawRectangle({ x: cx - 2, y: cy + 3.5, width: 4, height: 0.8, color: glyphColor })
  } else {
    const path =
      `M ${cx - 5} ${cy - 2} ` +
      `Q ${cx - 5} ${cy + 4}, ${cx} ${cy + 4} ` +
      `Q ${cx + 5} ${cy + 4}, ${cx + 5} ${cy - 2} ` +
      `L ${cx + 6} ${cy - 4} ` +
      `L ${cx - 6} ${cy - 4} Z`
    page.drawSvgPath(path, { color: glyphColor, borderColor: glyphColor, borderWidth: 0 })
    page.drawCircle({ x: cx, y: cy - 5, size: 1.3, color: glyphColor })
    page.drawRectangle({ x: cx - 0.6, y: cy + 4, width: 1.2, height: 2, color: glyphColor })
  }
}
