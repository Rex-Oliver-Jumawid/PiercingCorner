import { describe, expect, it } from 'vitest'
import { paymentMethodLabel } from './salesModel'

describe('sales model', () => {
  it('labels single and mixed payment methods', () => {
    expect(paymentMethodLabel(['gcash'])).toBe('GCash')
    expect(paymentMethodLabel(['cash', 'cash'])).toBe('Cash')
    expect(paymentMethodLabel(['cash', 'card'])).toBe('Mixed')
    expect(paymentMethodLabel([])).toBe('—')
  })
})
