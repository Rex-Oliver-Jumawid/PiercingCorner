import { getSupabaseClient } from '../../lib/supabase/client'

export interface BusinessProfile {
  singleton: boolean
  studio_name: string
  location: string
  address: string | null
  email: string | null
  phone: string | null
  instagram_url: string | null
  timezone: string
  currency: string
  updated_at: string
}

export interface WaiverTemplate {
  id: string
  version: number
  body: string
  created_at: string
}

export interface StaffAccountSummary {
  id: string
  display_name: string
  role: 'owner' | 'staff'
  status: 'active' | 'inactive'
}

export interface SettingsOverview {
  businessProfile: BusinessProfile
  waiverTemplate: WaiverTemplate
  accounts: StaffAccountSummary[]
}

export type BusinessProfileInput = Pick<BusinessProfile, 'studio_name' | 'location' | 'address' | 'email' | 'phone' | 'instagram_url'>

export async function getSettingsOverview(signal: AbortSignal): Promise<SettingsOverview> {
  const client = getSupabaseClient()
  const [profileResult, waiverResult, accountsResult] = await Promise.all([
    client.from('business_profile').select('*').eq('singleton', true).abortSignal(signal).single(),
    client.from('waiver_templates').select('id, version, body, created_at').order('version', { ascending: false }).limit(1).abortSignal(signal).single(),
    client.from('staff_accounts').select('id, display_name, role, status').order('role').order('display_name').abortSignal(signal),
  ])

  if (profileResult.error || waiverResult.error || accountsResult.error) {
    throw new Error('Unable to load Settings. Please try again.')
  }

  return {
    businessProfile: profileResult.data,
    waiverTemplate: waiverResult.data,
    accounts: accountsResult.data ?? [],
  }
}

function optional(value: string) {
  const trimmed = value.trim()
  return trimmed || null
}

export async function saveBusinessProfile(input: BusinessProfileInput): Promise<BusinessProfile> {
  const value = {
    studio_name: input.studio_name.trim(),
    location: input.location.trim(),
    address: optional(input.address ?? ''),
    email: optional(input.email ?? ''),
    phone: optional(input.phone ?? ''),
    instagram_url: optional(input.instagram_url ?? ''),
  }
  const { data, error } = await getSupabaseClient().from('business_profile').update(value)
    .eq('singleton', true).select('*').single()
  if (error) throw new Error('Could not save the business profile. Please try again.')
  return data
}

export async function createWaiverTemplate(body: string): Promise<WaiverTemplate> {
  const client = getSupabaseClient()
  const latest = await client.from('waiver_templates').select('version').order('version', { ascending: false }).limit(1).single()
  if (latest.error) throw new Error('Could not determine the current waiver version.')
  const { data, error } = await client.from('waiver_templates')
    .insert({ version: latest.data.version + 1, body: body.trim() })
    .select('id, version, body, created_at').single()
  if (error) {
    const conflict = error.code === '23505'
    throw new Error(conflict ? 'The waiver changed elsewhere. Close this editor and try again.' : 'Could not create the new waiver version. Please try again.')
  }
  return data
}
