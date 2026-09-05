import { describe, expect, it } from 'vitest'
import { financialStatusLabel, parseSaleAdjustments, paymentMethodLabel } from './salesModel'

describe('sales model', () => {
  it('labels single and mixed payment methods', () => {
    expect(paymentMethodLabel(['gcash'])).toBe('GCash')
    expect(paymentMethodLabel(['cash', 'cash'])).toBe('Cash')
    expect(paymentMethodLabel(['cash', 'card'])).toBe('Mixed')
    expect(paymentMethodLabel([])).toBe('—')
  })

  it('parses and labels immutable adjustment history', () => {
    expect(parseSaleAdjustments([{ id: 'adjustment-1', type: 'refund', amount: 500, reason: 'Requested', recorded_by_name: 'Owner', created_at: '2026-09-05T03:00:00Z' }])).toHaveLength(1)
    expect(financialStatusLabel('refund')).toBe('Refunded')
    expect(financialStatusLabel('void')).toBe('Voided')
  })
})
