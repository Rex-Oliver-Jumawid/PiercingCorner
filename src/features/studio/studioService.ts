import { getSupabaseClient } from '../../lib/supabase/client'
import type {
  PiercerProfile,
  StudioConfiguration,
  StudioException,
} from './studioModel'

export async function getStudioConfiguration(signal: AbortSignal): Promise<StudioConfiguration> {
  const client = getSupabaseClient()
  const [hours, profiles, qualifications, availability, exceptions, services, stations] = await Promise.all([
    client.from('studio_hours').select('*').order('weekday').abortSignal(signal),
    client.from('piercer_profiles').select('id, display_name, active, default_station_id').order('active', { ascending: false }).order('display_name').order('id').abortSignal(signal),
    client.from('piercer_service_qualifications').select('piercer_profile_id, service_id').abortSignal(signal),
    client.from('piercer_availability').select('piercer_profile_id, weekday, starts_at, ends_at').order('weekday').abortSignal(signal),
    client.from('studio_exceptions').select('id, exception_date, exception_type, opens_at, closes_at, reason').order('exception_date').abortSignal(signal),
    client.from('services').select('id, name, active').order('active', { ascending: false }).order('name').abortSignal(signal),
    client.from('stations').select('id, name, active').order('active', { ascending: false }).order('name').abortSignal(signal),
  ])
  if ([hours, profiles, qualifications, availability, exceptions, services, stations].some((result) => result.error)) {
    throw new Error('Unable to load Studio configuration. Please try again.')
  }
  return {
    hours: hours.data ?? [], profiles: profiles.data ?? [], qualifications: qualifications.data ?? [],
    availability: availability.data ?? [], exceptions: exceptions.data ?? [],
    services: services.data ?? [], stations: stations.data ?? [],
  }
}

export async function saveStudioHour(input: { weekday: number; isOpen: boolean; opensAt: string; closesAt: string }) {
  const { data, error } = await getSupabaseClient().from('studio_hours').update({
    is_open: input.isOpen,
    opens_at: input.isOpen ? input.opensAt : null,
    closes_at: input.isOpen ? input.closesAt : null,
  }).eq('weekday', input.weekday).select('*').single()
  if (error) {
    const conflict = error.message.includes('availability')
    throw new Error(conflict ? 'Update the conflicting piercer availability before shortening these hours.' : 'Could not save Studio Hours. Please try again.')
  }
  return data
}

export async function savePiercer(input: { id?: string; displayName: string; active: boolean; defaultStationId: string | null }): Promise<PiercerProfile> {
  const value = { display_name: input.displayName.trim(), active: input.active, default_station_id: input.defaultStationId }
  const table = getSupabaseClient().from('piercer_profiles')
  const request = input.id ? table.update(value).eq('id', input.id) : table.insert(value)
  const { data, error } = await request.select('id, display_name, active, default_station_id').single()
  if (error) throw new Error('Could not save this piercer profile. Please try again.')
  return data
}

export async function replaceQualifications(piercerId: string, serviceIds: string[]) {
  const { error } = await getSupabaseClient().rpc('replace_piercer_qualifications', {
    target_piercer_profile_id: piercerId,
    selected_service_ids: serviceIds,
  })
  if (error) throw new Error('Could not update the services offered. Please try again.')
}

export async function saveAvailability(input: { piercerId: string; weekday: number; available: boolean; startsAt: string; endsAt: string }) {
  const client = getSupabaseClient()
  if (!input.available) {
    const { error } = await client.from('piercer_availability').delete().eq('piercer_profile_id', input.piercerId).eq('weekday', input.weekday)
    if (error) throw new Error('Could not update piercer availability. Please try again.')
    return
  }
  const { error } = await client.from('piercer_availability').upsert({
    piercer_profile_id: input.piercerId, weekday: input.weekday,
    starts_at: input.startsAt, ends_at: input.endsAt,
  }, { onConflict: 'piercer_profile_id,weekday' })
  if (error) {
    const outsideHours = error.message.includes('studio hours')
    throw new Error(outsideHours ? 'Availability must stay within the configured Studio Hours.' : 'Could not update piercer availability. Please try again.')
  }
}

export async function saveStudioException(input: Omit<StudioException, 'id'> & { id?: string }) {
  const value = {
    exception_date: input.exception_date,
    exception_type: input.exception_type,
    opens_at: input.exception_type === 'closed' ? null : input.opens_at,
    closes_at: input.exception_type === 'closed' ? null : input.closes_at,
    reason: input.reason.trim(),
  }
  const table = getSupabaseClient().from('studio_exceptions')
  const request = input.id ? table.update(value).eq('id', input.id) : table.insert(value)
  const { data, error } = await request.select('*').single()
  if (error) {
    const duplicate = error.code === '23505'
    throw new Error(duplicate ? 'That date already has a closure or exception.' : 'Could not save this closure or exception. Please try again.')
  }
  return data
}

export async function deleteStudioException(id: string) {
  const { error } = await getSupabaseClient().from('studio_exceptions').delete().eq('id', id)
  if (error) throw new Error('Could not remove this closure or exception. Please try again.')
}

