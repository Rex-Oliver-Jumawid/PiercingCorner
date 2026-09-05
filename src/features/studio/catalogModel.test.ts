import { describe, expect, it } from 'vitest'
import { formatCatalogPrice, validateCatalog } from './catalogModel'

describe('catalog model', () => {
  it('normalizes valid catalog input', () => {
    expect(
      validateCatalog({
        name: '  Lobe Piercing ',
        description: '  Ear piercing ',
        price: '800.50',
        active: true,
      }),
    ).toEqual({
      value: {
        name: 'Lobe Piercing',
        description: 'Ear piercing',
        price: 800.5,
        active: true,
      },
      errors: {},
    })
  })

  it.each(['', '-1', '1.001', 'not-money', '12345678901'])(
    'rejects invalid price %s',
    (price) => {
      expect(
        validateCatalog({ name: 'Item', description: '', price, active: true })
          .errors.price,
      ).toBeTruthy()
    },
  )

  it('formats exact display prices in Philippine pesos', () => {
    expect(formatCatalogPrice(1250.5)).toBe('₱1,250.50')
  })
})
