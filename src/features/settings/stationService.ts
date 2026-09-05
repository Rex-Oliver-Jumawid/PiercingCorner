import { getSupabaseClient } from '../../lib/supabase/client'

export interface Station {
  id: string
  name: string
  active: boolean
}

export async function listStations(signal: AbortSignal): Promise<Station[]> {
  const { data, error } = await getSupabaseClient().from('stations').select('id, name, active')
    .order('active', { ascending: false }).order('name').order('id').abortSignal(signal)
  if (error) throw new Error('Unable to load stations. Please try again.')
  return data ?? []
}

export async function saveStation(input: { id?: string; name: string; active: boolean }): Promise<Station> {
  const value = { name: input.name.trim(), active: input.active }
  const table = getSupabaseClient().from('stations')
  const request = input.id ? table.update(value).eq('id', input.id) : table.insert(value)
  const { data, error } = await request.select('id, name, active').single()
  if (error) {
    const duplicate = error.code === '23505'
    throw new Error(duplicate ? 'A station with that name already exists.' : 'Could not save this station. Please try again.')
  }
  return data
}

