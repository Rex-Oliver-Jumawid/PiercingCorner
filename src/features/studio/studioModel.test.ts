import { describe, expect, it } from 'vitest'
import { addCalendarDays, formatStudioDate, formatStudioTime, getManilaDate, getRelevantTemporarySchedules, mapTemporaryStudioSchedules, validateTimeRange } from './studioModel'

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

  it('uses Manila business dates and classifies temporary ranges without treating expired schedules as active', () => {
    expect(getManilaDate(new Date('2026-09-09T16:30:00Z'))).toBe('2026-09-10')
    expect(addCalendarDays('2026-09-20', 1)).toBe('2026-09-21')
    expect(formatStudioDate('2026-09-21', false)).toBe('Sep 21')
    const schedule = (id: string, starts_on: string, ends_on: string) => ({
      id, starts_on, ends_on, created_by: 'owner-1', created_at: '', updated_at: '', hours: [],
    })
    const result = getRelevantTemporarySchedules([
      schedule('expired', '2026-09-01', '2026-09-09'),
      schedule('future', '2026-09-21', '2026-09-25'),
      schedule('active', '2026-09-10', '2026-09-20'),
    ], '2026-09-10')
    expect(result.active?.id).toBe('active')
    expect(result.upcoming.map((item) => item.id)).toEqual(['future'])
  })
})
