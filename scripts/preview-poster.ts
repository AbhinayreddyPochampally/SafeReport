/**
 * scripts/preview-poster.ts — render one test poster so we can visually
 * verify the QR + store-code overlay is positioned correctly over the
 * current public/poster-template.png.
 *
 * Usage:
 *   tsx scripts/preview-poster.ts
 *   tsx scripts/preview-poster.ts ALS-CHN-042
 *   tsx scripts/preview-poster.ts ALS-CHN-042 "Allen Solly - Phoenix Marketcity"
 *
 * Output: out/poster-preview.pdf (2 pages: front design + back identifier)
 *
 * We can't import lib/poster.ts directly under bare tsx because it pulls
 * Next.js's "server-only" virtual module (unresolvable outside the
 * Next.js bundler). This script duplicates the small bit of pdf-lib glue
 * we need — the layout constants are read straight from poster.ts via
 * regex so the two files can't drift.
 */

import { PDFDocument, PDFFont, StandardFonts, rgb } from "pdf-lib"
import QRCode from "qrcode"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"

const PAGE_W = 595.28
const PAGE_H = 841.89

const NAVY = rgb(0x0a / 255, 0x1f / 255, 0x46 / 255)
const BACK_NAME_COLOR = rgb(0xE2 / 255, 0xE8 / 255, 0xF0 / 255)
const BACK_CODE_COLOR = rgb(0xCB / 255, 0xD5 / 255, 0xE1 / 255)

async function extractConstants() {
  const src = await readFile(resolve("lib/poster.ts"), "utf8")
  const grab = (name: string) => {
    const m = src.match(new RegExp(`const\\s+${name}\\s*=\\s*([0-9.]+)`))
    if (!m) throw new Error(`could not extract ${name} from lib/poster.ts`)
    return Number(m[1])
  }
  return {
    QR_LEFT: grab("QR_LEFT"),
    QR_RIGHT: grab("QR_RIGHT"),
    QR_TOP: grab("QR_TOP"),
    QR_BOTTOM: grab("QR_BOTTOM"),
    CODE_UNDERLINE_X_START: grab("CODE_UNDERLINE_X_START"),
    CODE_UNDERLINE_X_END: grab("CODE_UNDERLINE_X_END"),
    CODE_UNDERLINE_Y: grab("CODE_UNDERLINE_Y"),
  }
}

function drawBack(doc: PDFDocument, font: PDFFont, code: string, name: string) {
  const page = doc.addPage([PAGE_W, PAGE_H])
  const trimmed = name.trim()
  const hasName = trimmed.length > 0 && trimmed.toUpperCase() !== code

  if (hasName) {
    const targetW = PAGE_W * 0.9
    let nameSize = 80
    while (font.widthOfTextAtSize(trimmed, nameSize) > targetW && nameSize > 24) {
      nameSize -= 2
    }
    const nameW = font.widthOfTextAtSize(trimmed, nameSize)
    const nameX = (PAGE_W - nameW) / 2
    const nameY = PAGE_H / 2 - 0.36 * nameSize + 30
    page.drawText(trimmed, { x: nameX, y: nameY, size: nameSize, font, color: BACK_NAME_COLOR })

    const codeSize = Math.max(18, Math.round(nameSize * 0.35))
    const codeW = font.widthOfTextAtSize(code, codeSize)
    const codeX = (PAGE_W - codeW) / 2
    const codeY = nameY - codeSize - 24
    page.drawText(code, { x: codeX, y: codeY, size: codeSize, font, color: BACK_CODE_COLOR })
  } else {
    const targetW = PAGE_W * 0.85
    let size = 90
    while (font.widthOfTextAtSize(code, size) > targetW && size > 32) {
      size -= 2
    }
    const codeW = font.widthOfTextAtSize(code, size)
    const codeX = (PAGE_W - codeW) / 2
    const codeY = PAGE_H / 2 - 0.36 * size
    page.drawText(code, { x: codeX, y: codeY, size, font, color: BACK_NAME_COLOR })
  }
}

async function main() {
  const code = process.argv[2] ?? "ALS-CHN-042"
  const name = process.argv[3] ?? "Allen Solly - Phoenix Marketcity"
  const baseUrl = process.env.APP_URL ?? "https://safereport.example"
  const c = await extractConstants()
  console.log("Using constants from lib/poster.ts:", c)
  console.log(`Rendering: code=${code}  name="${name}"`)

  const doc = await PDFDocument.create()
  const helvBold = await doc.embedFont(StandardFonts.HelveticaBold)
  const templateBytes = await readFile(resolve("public/poster-template.png"))
  const templateImg = await doc.embedPng(new Uint8Array(templateBytes))

  // --- Front page ---
  const page = doc.addPage([PAGE_W, PAGE_H])
  page.drawImage(templateImg, { x: 0, y: 0, width: PAGE_W, height: PAGE_H })

  const target = `${baseUrl.replace(/\/$/, "")}/r/${code}?src=qr`
  const qrPng = await QRCode.toBuffer(target, {
    type: "png",
    errorCorrectionLevel: "H",
    margin: 1,
    width: 900,
    color: { dark: "#0a1f46", light: "#ffffff" },
  })
  const qrImg = await doc.embedPng(new Uint8Array(qrPng))

  const placeholderW = c.QR_RIGHT - c.QR_LEFT
  const placeholderH = c.QR_TOP - c.QR_BOTTOM
  const inset = 8
  const qrSize = Math.min(placeholderW, placeholderH) - inset * 2
  const cx = (c.QR_LEFT + c.QR_RIGHT) / 2
  const cy = (c.QR_BOTTOM + c.QR_TOP) / 2
  page.drawImage(qrImg, {
    x: cx - qrSize / 2,
    y: cy - qrSize / 2,
    width: qrSize,
    height: qrSize,
  })

  const underlineW = c.CODE_UNDERLINE_X_END - c.CODE_UNDERLINE_X_START
  let codeSize = 14
  while (helvBold.widthOfTextAtSize(code, codeSize) > underlineW - 6 && codeSize > 8) {
    codeSize -= 0.5
  }
  const codeW = helvBold.widthOfTextAtSize(code, codeSize)
  const codeX = (c.CODE_UNDERLINE_X_START + c.CODE_UNDERLINE_X_END) / 2 - codeW / 2
  const codeY = c.CODE_UNDERLINE_Y + 4
  page.drawText(code, { x: codeX, y: codeY, size: codeSize, font: helvBold, color: NAVY })

  // --- Back page ---
  drawBack(doc, helvBold, code, name)

  const pdfBytes = await doc.save()
  await mkdir(resolve("out"), { recursive: true })
  const outPath = resolve("out", "poster-preview.pdf")
  await writeFile(outPath, pdfBytes)
  console.log(`wrote ${outPath} (${(pdfBytes.byteLength / 1024).toFixed(1)} KB, ${doc.getPageCount()} pages)`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
