import { describe, expect, it } from 'vitest'
import {
  parseTransactionItems,
  validateNewClient,
  validatePayment,
} from './transactionModel'

describe('transaction model', () => {
  it('validates and normalizes a walk-in client', () => {
    expect(
      validateNewClient({
        first_name: ' Ana ',
        last_name: ' Cruz ',
        email: ' ana@example.test ',
        phone: ' 0917 ',
      }),
    ).toEqual({
      value: {
        full_name: 'Ana Cruz',
        email: 'ana@example.test',
        phone: '0917',
      },
      errors: {},
    })
  })

  it('requires both names and validates optional email', () => {
    const result = validateNewClient({
      first_name: '',
      last_name: '',
      email: 'invalid',
      phone: '',
    })
    expect(result.errors).toEqual({
      first_name: 'Enter the first name.',
      last_name: 'Enter the last name.',
      email: 'Enter a valid email address.',
    })
  })

  it('requires a reference only for non-cash payment', () => {
    expect(validatePayment({ method: 'cash', reference: '' })).toBeNull()
    expect(validatePayment({ method: 'gcash', reference: '' })).toBe(
      'Enter the payment reference number.',
    )
  })

  it('parses trusted transaction item JSON and rejects malformed values', () => {
    expect(
      parseTransactionItems([
        {
          id: 'item-1',
          item_type: 'product',
          product_id: 'product-1',
          service_id: null,
          name: 'Stud',
          unit_price: 500,
          quantity: 1,
        },
      ]),
    ).toHaveLength(1)
    expect(() => parseTransactionItems([{ id: 'bad' }])).toThrow(
      'Unable to read transaction items.',
    )
  })
})
