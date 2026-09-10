export const STUDIO_DAYS = [
  { value: 1, short: 'Mon', label: 'Monday' },
  { value: 2, short: 'Tue', label: 'Tuesday' },
  { value: 3, short: 'Wed', label: 'Wednesday' },
  { value: 4, short: 'Thu', label: 'Thursday' },
  { value: 5, short: 'Fri', label: 'Friday' },
  { value: 6, short: 'Sat', label: 'Saturday' },
  { value: 7, short: 'Sun', label: 'Sunday' },
] as const

/**
 * The persistent weekly default from `studio_hours`. This is intentionally
 * distinct from the future date-resolved Effective Studio Hours concept.
 */
export interface RecurringStudioHour {
  weekday: number
  is_open: boolean
  opens_at: string | null
  closes_at: string | null
}

export interface TemporaryStudioHour {
  schedule_id: string
  weekday: number
  is_open: boolean
  opens_at: string | null
  closes_at: string | null
}

export interface TemporaryStudioSchedule {
  id: string
  starts_on: string
  ends_on: string
  created_by: string
  created_at: string
  updated_at: string
  hours: TemporaryStudioHour[]
}

export interface ConfigureTemporaryStudioScheduleInput {
  id?: string
  startsOn: string
  endsOn: string
  hours: Array<Omit<TemporaryStudioHour, 'schedule_id'>>
}

export interface ConfigureRecurringStudioHoursInput {
  hours: RecurringStudioHour[]
}

export type TemporaryPiercerAvailabilityMode = 'studio' | 'custom'

export interface TemporaryPiercerAvailability {
  schedule_id: string
  weekday: number
  is_available: boolean
  mode: TemporaryPiercerAvailabilityMode | null
  starts_at: string | null
  ends_at: string | null
}

export interface TemporaryPiercerSchedule {
  id: string
  piercer_profile_id: string
  starts_on: string
  ends_on: string
  created_by: string
  created_at: string
  updated_at: string
  availability: TemporaryPiercerAvailability[]
}

export interface ConfigureTemporaryPiercerScheduleInput {
  id?: string
  piercerProfileId: string
  startsOn: string
  endsOn: string
  availability: Array<Omit<TemporaryPiercerAvailability, 'schedule_id'>>
}

export interface ConfigureRecurringPiercerAvailabilityInput {
  piercerProfileId: string
  availability: Array<Omit<TemporaryPiercerAvailability, 'schedule_id'>>
}

export interface EffectiveStudioHours {
  schedule_date: string
  weekday: number
  is_open: boolean
  opens_at: string | null
  closes_at: string | null
  source: 'recurring' | 'temporary' | 'exception'
  temporary_schedule_id: string | null
  exception_id: string | null
  exception_type: 'closed' | 'reduced_hours' | null
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

export type RecurringPiercerAvailabilityMode = 'studio' | 'custom'

export interface RecurringPiercerAvailability {
  piercer_profile_id: string
  weekday: number
  mode: RecurringPiercerAvailabilityMode
  starts_at: string | null
  ends_at: string | null
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
  recurringHours: RecurringStudioHour[]
  temporarySchedules: TemporaryStudioSchedule[]
  temporaryPiercerSchedules: TemporaryPiercerSchedule[]
  effectiveToday: EffectiveStudioHours | null
  profiles: PiercerProfile[]
  qualifications: PiercerQualification[]
  availability: RecurringPiercerAvailability[]
  exceptions: StudioException[]
  services: StudioService[]
  stations: StudioStation[]
}

export function getManilaDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

export function addCalendarDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function formatStudioDate(value: string, includeYear = true) {
  return new Intl.DateTimeFormat('en-PH', {
    month: 'short',
    day: 'numeric',
    ...(includeYear ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`))
}

export function getRelevantTemporarySchedules(schedules: TemporaryStudioSchedule[], today: string) {
  const active = schedules.find((schedule) => schedule.starts_on <= today && schedule.ends_on >= today) ?? null
  const upcoming = schedules.filter((schedule) => schedule.starts_on > today)
    .sort((left, right) => left.starts_on.localeCompare(right.starts_on))
  return { active, upcoming }
}

export function getRelevantTemporaryPiercerSchedules(schedules: TemporaryPiercerSchedule[], piercerId: string, today: string) {
  const matching = schedules.filter((schedule) => schedule.piercer_profile_id === piercerId)
  const active = matching.find((schedule) => schedule.starts_on <= today && schedule.ends_on >= today) ?? null
  const upcoming = matching.filter((schedule) => schedule.starts_on > today).sort((a, b) => a.starts_on.localeCompare(b.starts_on))
  return { active, upcoming }
}

export function mapTemporaryStudioSchedules(
  schedules: Array<Omit<TemporaryStudioSchedule, 'hours'>>,
  hours: TemporaryStudioHour[],
): TemporaryStudioSchedule[] {
  return schedules.map((schedule) => ({
    ...schedule,
    hours: hours
      .filter((hour) => hour.schedule_id === schedule.id)
      .sort((left, right) => left.weekday - right.weekday),
  }))
}

export function mapTemporaryPiercerSchedules(
  schedules: Array<Omit<TemporaryPiercerSchedule, 'availability'>>,
  availability: TemporaryPiercerAvailability[],
): TemporaryPiercerSchedule[] {
  return schedules.map((schedule) => ({
    ...schedule,
    availability: availability
      .filter((entry) => entry.schedule_id === schedule.id)
      .sort((left, right) => left.weekday - right.weekday),
  }))
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
