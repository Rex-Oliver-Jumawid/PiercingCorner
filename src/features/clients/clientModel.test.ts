import { describe, expect, it } from 'vitest'
import { cents, dateTime, money, validateClient } from './clientModel'

describe('client input and history formatting', () => {
  it('requires a name and validates a supplied email', () => {
    expect(
      validateClient({ full_name: '  ', email: 'bad', phone: null }).errors,
    ).toEqual({ full_name: expect.any(String), email: expect.any(String) })
  })
  it('trims input, saves optional blanks as null, and preserves phone formatting', () => {
    expect(
      validateClient({
        full_name: '  Ana  ',
        email: ' ',
        phone: ' +63 (917) 123-4567 ',
      }),
    ).toEqual({
      value: { full_name: 'Ana', email: null, phone: '+63 (917) 123-4567' },
      errors: {},
    })
  })
  it('sums exact centavos without floating-point multiplication', () => {
    expect(money(cents(0.1) * 3n + cents('1234.56'))).toBe('₱1,234.86')
    expect(money(cents('9999999999.99') * 2147483647n)).toBe(
      '₱21,474,836,469,978,525,163.53',
    )
    expect(money(0n)).toBe('₱0.00')
  })
  it('rejects malformed monetary data', () => {
    expect(() => cents('1.001')).toThrow()
    expect(() => cents(-1)).toThrow()
  })
  it('uses Manila dates even when UTC is on the previous day', () => {
    expect(dateTime('2026-09-04T18:30:00Z')).toBe('Sep 5, 2026')
  })
})
