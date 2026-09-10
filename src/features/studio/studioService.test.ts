import { createClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSupabaseClient } from '../../lib/supabase/client'
import type { Database } from '../../types/database'
import { configureTemporaryStudioSchedule, getStudioConfiguration } from './studioService'

vi.mock('../../lib/supabase/client', () => ({ getSupabaseClient: vi.fn() }))
const fetcher = vi.fn<typeof fetch>()
const client = createClient<Database>('https://local.example.test', 'key', {
  global: { fetch: fetcher },
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})

beforeEach(() => {
  fetcher.mockReset()
  vi.mocked(getSupabaseClient).mockReturnValue(client)
})

function responseFor(path: string) {
  if (path.endsWith('/studio_temporary_schedules')) {
    return [{
      id: 'schedule-1', starts_on: '2026-09-17', ends_on: '2026-09-20',
      created_by: 'owner-1', created_at: '2026-09-10T00:00:00Z', updated_at: '2026-09-10T00:00:00Z',
    }]
  }
  if (path.endsWith('/studio_temporary_hours')) {
    return [
      { schedule_id: 'schedule-1', weekday: 7, is_open: false, opens_at: null, closes_at: null },
      { schedule_id: 'schedule-1', weekday: 4, is_open: true, opens_at: '12:00:00', closes_at: '18:00:00' },
    ]
  }
  return []
}

describe('Studio Supabase service boundary', () => {
  it('loads temporary schedules separately from recurring Studio Hours', async () => {
    fetcher.mockImplementation(async (input) => {
      const path = new URL(String(input)).pathname
      return new Response(JSON.stringify(responseFor(path)), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    const configuration = await getStudioConfiguration(new AbortController().signal)

    expect(configuration.recurringHours).toEqual([])
    expect(configuration.temporarySchedules).toHaveLength(1)
    expect(configuration.temporarySchedules[0].hours.map((hour) => hour.weekday)).toEqual([4, 7])
    expect(fetcher.mock.calls.map(([input]) => new URL(String(input)).pathname)).toEqual(expect.arrayContaining([
      '/rest/v1/studio_hours',
      '/rest/v1/studio_temporary_schedules',
      '/rest/v1/studio_temporary_hours',
    ]))
  })

  it('sends all seven weekdays in one atomic temporary-schedule RPC', async () => {
    fetcher.mockResolvedValueOnce(new Response(JSON.stringify('schedule-1'), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    const hours = Array.from({ length: 7 }, (_, index) => ({
      weekday: index + 1,
      is_open: index < 6,
      opens_at: index < 6 ? '12:00' : null,
      closes_at: index < 6 ? '18:00' : null,
    }))

    await configureTemporaryStudioSchedule({
      startsOn: '2026-09-17',
      endsOn: '2026-09-20',
      hours,
    })

    const [input, init] = fetcher.mock.calls[0]
    expect(new URL(String(input)).pathname).toBe('/rest/v1/rpc/configure_temporary_studio_schedule')
    expect(JSON.parse(String(init?.body))).toEqual({
      schedule_starts_on: '2026-09-17',
      schedule_ends_on: '2026-09-20',
      daily_hours: hours,
    })
  })

  it('normalizes closed-day times and hides overlap database details', async () => {
    fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ message: 'conflicting key details', code: '23P01' }), {
      status: 409,
      headers: { 'Content-Type': 'application/json' },
    }))

    await expect(configureTemporaryStudioSchedule({
      id: 'schedule-1',
      startsOn: '2026-09-17',
      endsOn: '2026-09-20',
      hours: Array.from({ length: 7 }, (_, index) => ({
        weekday: index + 1,
        is_open: false,
        opens_at: '12:00',
        closes_at: '18:00',
      })),
    })).rejects.toThrow('overlaps another temporary Studio schedule')

    const body = JSON.parse(String(fetcher.mock.calls[0][1]?.body))
    expect(body.daily_hours[0]).toEqual({ weekday: 1, is_open: false, opens_at: null, closes_at: null })
  })
})
