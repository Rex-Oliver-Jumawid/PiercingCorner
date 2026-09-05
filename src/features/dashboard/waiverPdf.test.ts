import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { buildWaiverPdf, wrapPdfText } from './waiverPdf'

const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='), (value) => value.charCodeAt(0))

describe('waiver PDF', () => {
  it('creates an A4 PDF with metadata and paginates long pinned wording', async () => {
    const pdf = await buildWaiverPdf({
      transactionReference: 'TXN-260905-000099',
      clientName: 'Ana Cruz',
      templateVersion: 7,
      templateBody: Array.from({ length: 70 }, (_, index) => `Immutable paragraph ${index + 1} with enough wording to require measured wrapping.`).join('\n\n'),
      signedAt: '2026-09-05T03:15:00.000Z',
      signaturePng: new Blob([png], { type: 'image/png' }),
      logoBytes: png.buffer,
    })
    expect(pdf.type).toBe('application/pdf')
    const loaded = await PDFDocument.load(await pdf.arrayBuffer())
    expect(loaded.getTitle()).toBe('Waiver TXN-260905-000099')
    expect(loaded.getSubject()).toContain('version 7')
    expect(loaded.getKeywords()).toContain('signed_at:2026-09-05T03:15:00.000Z')
    expect(loaded.getPageCount()).toBeGreaterThan(1)
  })

  it('wraps using measured font widths', async () => {
    const document = await PDFDocument.create()
    const font = await document.embedFont('Helvetica')
    expect(wrapPdfText('one two three four', font, 12, font.widthOfTextAtSize('one two', 12))).toEqual(['one two', 'three', 'four'])
  })
})
