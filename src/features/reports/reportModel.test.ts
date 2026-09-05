import { describe, expect, it } from 'vitest'
import { buildSalesCsv, protectSpreadsheetCell, reportPresetRange, validateReportRange } from './reportModel'
import type { CompletedSale } from '../sales/salesModel'

describe('report date and CSV model', () => {
  it('derives Manila calendar presets without using the browser timezone', () => {
    const nearMidnight = new Date('2026-09-06T16:30:00Z')
    expect(reportPresetRange('today', nearMidnight)).toEqual({ from: '2026-09-07', to: '2026-09-07' })
    expect(reportPresetRange('week', nearMidnight)).toEqual({ from: '2026-09-07', to: '2026-09-07' })
    expect(reportPresetRange('month', nearMidnight)).toEqual({ from: '2026-09-01', to: '2026-09-07' })
    expect(reportPresetRange('last_month', nearMidnight)).toEqual({ from: '2026-08-01', to: '2026-08-31' })
  })

  it('validates custom ranges', () => {
    expect(validateReportRange({ from: '2026-09-05', to: '2026-09-01' })).toMatch(/From date/)
    expect(validateReportRange({ from: '', to: '2026-09-01' })).toMatch(/valid/)
    expect(validateReportRange({ from: '2026-13-01', to: '2026-13-02' })).toMatch(/valid/)
    expect(validateReportRange({ from: '2026-09-01', to: '2026-09-05' })).toBeNull()
  })

  it.each(['=SUM(A1:A2)', ' +cmd', '-2+3', '@IMPORT', '\t=cmd', '\r=cmd'])(
    'neutralizes spreadsheet formula input %j',
    (value) => expect(protectSpreadsheetCell(value)).toBe(`'${value}`),
  )

  it('protects textual cells before RFC 4180 serialization', () => {
    const sale: CompletedSale = {
      id: 'sale-1', reference_code: 'TXN-1', client_name: '=HYPERLINK("bad")',
      recorded_by_name: '+Recorder', completed_at: '2026-09-05T02:00:00Z',
      items: [{ id: 'item-1', item_type: 'product', name: 'Comma, "quoted"', unit_price: 10, quantity: 1 }],
      total: 10, paid: 10, adjustments: 0, net_total: 10, financial_status: 'completed',
      payment_methods: ['cash'], has_service: false, has_product: true, has_waiver: false,
    }
    const csv = buildSalesCsv([sale])
    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv).toContain('"\'=HYPERLINK(""bad"")"')
    expect(csv).toContain("'+Recorder")
    expect(csv).toContain('"Comma, ""quoted"" (product, qty 1)"')
    expect(csv.endsWith('\r\n')).toBe(true)
  })
})
