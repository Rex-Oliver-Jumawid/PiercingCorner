import { getSupabaseClient } from '../../lib/supabase/client'

export async function getOwnerOverview(signal: AbortSignal) {
  const { data, error } = await getSupabaseClient().rpc('get_owner_overview').abortSignal(signal).single()
  if (error) throw new Error('Unable to load the Owner overview. Please try again.')
  return data
}
