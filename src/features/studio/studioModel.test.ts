import { describe, expect, it } from 'vitest'
import { formatStudioTime, mapTemporaryStudioSchedules, validateTimeRange } from './studioModel'

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

  it('maps persisted temporary hours to their schedule in weekday order', () => {
    const schedules = [{
      id: 'schedule-1',
      starts_on: '2026-09-17',
      ends_on: '2026-09-20',
      created_by: 'owner-1',
      created_at: '2026-09-10T00:00:00Z',
      updated_at: '2026-09-10T00:00:00Z',
    }]
    const result = mapTemporaryStudioSchedules(schedules, [
      { schedule_id: 'schedule-1', weekday: 7, is_open: false, opens_at: null, closes_at: null },
      { schedule_id: 'other', weekday: 1, is_open: true, opens_at: '10:00:00', closes_at: '20:00:00' },
      { schedule_id: 'schedule-1', weekday: 4, is_open: true, opens_at: '12:00:00', closes_at: '18:00:00' },
    ])

    expect(result[0].hours.map((hour) => hour.weekday)).toEqual([4, 7])
    expect(result[0].hours[1]).toEqual(expect.objectContaining({ is_open: false, opens_at: null, closes_at: null }))
  })
})
