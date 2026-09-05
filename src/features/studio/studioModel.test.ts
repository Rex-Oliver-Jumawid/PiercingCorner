import { describe, expect, it } from 'vitest'
import { formatStudioTime, validateTimeRange } from './studioModel'

describe('Studio schedule model', () => {
  it('formats stored times without depending on the browser timezone', () => {
    expect(formatStudioTime('10:00:00')).toBe('10:00 AM')
    expect(formatStudioTime('20:30:00')).toBe('8:30 PM')
  })

  it('requires a complete increasing same-day range', () => {
    expect(validateTimeRange('', '20:00')).toMatch(/both/)
    expect(validateTimeRange('20:00', '10:00')).toMatch(/before/)
    expect(validateTimeRange('10:00', '20:00')).toBeNull()
  })
})
