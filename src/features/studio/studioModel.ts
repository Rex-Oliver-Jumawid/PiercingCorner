export const STUDIO_DAYS = [
  { value: 1, short: 'Mon', label: 'Monday' },
  { value: 2, short: 'Tue', label: 'Tuesday' },
  { value: 3, short: 'Wed', label: 'Wednesday' },
  { value: 4, short: 'Thu', label: 'Thursday' },
  { value: 5, short: 'Fri', label: 'Friday' },
  { value: 6, short: 'Sat', label: 'Saturday' },
  { value: 7, short: 'Sun', label: 'Sunday' },
] as const

export interface StudioHour {
  weekday: number
  is_open: boolean
  opens_at: string | null
  closes_at: string | null
}

export interface StudioStation {
  id: string
  name: string
  active: boolean
}

export interface StudioService {
  id: string
  name: string
  active: boolean
}

export interface PiercerAvailability {
  piercer_profile_id: string
  weekday: number
  starts_at: string
  ends_at: string
}

export interface PiercerProfile {
  id: string
  display_name: string
  active: boolean
  default_station_id: string | null
}

export interface PiercerQualification {
  piercer_profile_id: string
  service_id: string
}

export interface StudioException {
  id: string
  exception_date: string
  exception_type: 'closed' | 'reduced_hours'
  opens_at: string | null
  closes_at: string | null
  reason: string
}

export interface StudioConfiguration {
  hours: StudioHour[]
  profiles: PiercerProfile[]
  qualifications: PiercerQualification[]
  availability: PiercerAvailability[]
  exceptions: StudioException[]
  services: StudioService[]
  stations: StudioStation[]
}

export function normalizeTime(value: string | null | undefined) {
  return value?.slice(0, 5) ?? ''
}

export function formatStudioTime(value: string | null) {
  if (!value) return ''
  const [hour, minute] = value.slice(0, 5).split(':').map(Number)
  const suffix = hour >= 12 ? 'PM' : 'AM'
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${suffix}`
}

export function validateTimeRange(start: string, end: string) {
  if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) return 'Choose both start and end times.'
  if (start >= end) return 'The start time must be before the end time.'
  return null
}
