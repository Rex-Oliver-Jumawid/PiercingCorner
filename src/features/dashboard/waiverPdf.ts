import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from 'pdf-lib'
import logoUrl from '../../../logo.png'

const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const MARGIN = 54
const INK = rgb(0.23, 0.16, 0.14)
const ACCENT = rgb(0.64, 0.30, 0.19)

export interface WaiverPdfInput {
  transactionReference: string
  clientName: string
  templateVersion: number
  templateBody: string
  signedAt: string
  signaturePng: Blob
  logoBytes?: ArrayBuffer
}

export function wrapPdfText(text: string, font: PDFFont, size: number, width: number) {
  const lines: string[] = []
  for (const paragraph of text.split(/\n\s*\n/)) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean)
    let line = ''
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word
      if (line && font.widthOfTextAtSize(candidate, size) > width) {
        lines.push(line)
        line = word
      } else {
        line = candidate
      }
    }
    if (line) lines.push(line)
    lines.push('')
  }
  if (lines.at(-1) === '') lines.pop()
  return lines
}

function signedAtLabel(value: string) {
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value))
}

function drawHeader(page: PDFPage, logo: Awaited<ReturnType<PDFDocument['embedPng']>>, bold: PDFFont) {
  const logoSize = logo.scaleToFit(42, 42)
  page.drawImage(logo, { x: MARGIN, y: PAGE_HEIGHT - 76, ...logoSize })
  page.drawText('Piercing Corner', { x: 106, y: PAGE_HEIGHT - 52, size: 19, font: bold, color: INK })
  page.drawText('PARAÑAQUE · CLIENT CONSENT & WAIVER', { x: 106, y: PAGE_HEIGHT - 69, size: 8, font: bold, color: ACCENT })
  page.drawLine({ start: { x: MARGIN, y: PAGE_HEIGHT - 91 }, end: { x: PAGE_WIDTH - MARGIN, y: PAGE_HEIGHT - 91 }, thickness: 1, color: ACCENT })
}

export async function buildWaiverPdf(input: WaiverPdfInput) {
  const document = await PDFDocument.create()
  document.setTitle(`Waiver ${input.transactionReference}`)
  document.setAuthor('Piercing Corner')
  document.setSubject(`Client consent and waiver, template version ${input.templateVersion}`)
  document.setCreator('PiercingCorner')
  document.setKeywords([
    `signed_at:${input.signedAt}`,
    `template_version:${input.templateVersion}`,
    `transaction_reference:${input.transactionReference}`,
  ])
  const regular = await document.embedFont(StandardFonts.Helvetica)
  const bold = await document.embedFont(StandardFonts.HelveticaBold)
  const logoData = input.logoBytes
    ? input.logoBytes
    : await fetch(logoUrl).then((response) => response.arrayBuffer())
  const logo = await document.embedPng(logoData)
  const signature = await document.embedPng(await input.signaturePng.arrayBuffer())

  let page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  drawHeader(page, logo, bold)
  let y = PAGE_HEIGHT - 126

  page.drawText('FULL NAME', { x: MARGIN, y, size: 8, font: bold, color: ACCENT })
  y -= 30
  page.drawRectangle({ x: MARGIN, y: y - 8, width: PAGE_WIDTH - MARGIN * 2, height: 29, borderWidth: 1, borderColor: INK })
  page.drawText(input.clientName, { x: MARGIN + 10, y, size: 12, font: bold, color: INK })
  y -= 43

  const bodyLines = wrapPdfText(input.templateBody, regular, 10, PAGE_WIDTH - MARGIN * 2)
  for (const line of bodyLines) {
    if (y < 90) {
      page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT])
      drawHeader(page, logo, bold)
      y = PAGE_HEIGHT - 120
    }
    if (line) page.drawText(line, { x: MARGIN, y, size: 10, font: regular, color: INK })
    y -= line ? 14 : 9
  }

  if (y < 250) {
    page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    drawHeader(page, logo, bold)
    y = PAGE_HEIGHT - 126
  }
  y -= 14
  page.drawText('CLIENT SIGNATURE', { x: MARGIN, y, size: 9, font: bold, color: ACCENT })
  y -= 145
  page.drawRectangle({ x: MARGIN, y, width: PAGE_WIDTH - MARGIN * 2, height: 130, borderWidth: 1, borderColor: INK })
  const signatureSize = signature.scaleToFit(PAGE_WIDTH - MARGIN * 2 - 50, 88)
  page.drawImage(signature, {
    x: MARGIN + 25,
    y: y + 29,
    width: signatureSize.width,
    height: signatureSize.height,
  })
  page.drawLine({ start: { x: MARGIN + 25, y: y + 25 }, end: { x: PAGE_WIDTH - MARGIN - 25, y: y + 25 }, thickness: 0.7, color: INK })
  page.drawText('Signature', { x: MARGIN + 25, y: y + 12, size: 8, font: regular, color: INK })
  y -= 24
  page.drawText(`Transaction: ${input.transactionReference}`, { x: MARGIN, y, size: 8, font: regular, color: INK })
  y -= 13
  page.drawText(`Template version: ${input.templateVersion}`, { x: MARGIN, y, size: 8, font: regular, color: INK })
  y -= 13
  page.drawText(`Signed: ${signedAtLabel(input.signedAt)} (Asia/Manila)`, { x: MARGIN, y, size: 8, font: regular, color: INK })

  const saved = await document.save()
  const bytes = new Uint8Array(saved.byteLength)
  bytes.set(saved)
  return new Blob([bytes.buffer], { type: 'application/pdf' })
}
