import type { User } from '@supabase/supabase-js'

import { getSupabaseClient } from '../../lib/supabase/client'
import type { StaffAccount } from './types'

export type SignInErrorCode =
  | 'invalid_credentials'
  | 'account_unavailable'
  | 'service_unavailable'

export class SignInError extends Error {
  readonly code: SignInErrorCode

  constructor(code: SignInErrorCode) {
    super(code)
    this.name = 'SignInError'
    this.code = code
  }
}

async function clearUnauthorizedSession() {
  try {
    await getSupabaseClient().auth.signOut()
  } catch {
    // Local application access remains denied if remote sign-out fails.
  }
}

export async function resolveStaffAccount(user: User): Promise<StaffAccount> {
  const { data, error } = await getSupabaseClient()
    .from('staff_accounts')
    .select('id, display_name, role, status')
    .eq('id', user.id)
    .maybeSingle()

  if (error) {
    await clearUnauthorizedSession()
    throw new SignInError('service_unavailable')
  }

  if (!data || data.status !== 'active') {
    await clearUnauthorizedSession()
    throw new SignInError('account_unavailable')
  }

  return data
}

export async function restoreAuthorizedSession(): Promise<StaffAccount | null> {
  const { data, error } = await getSupabaseClient().auth.getSession()

  if (error) {
    throw new SignInError('service_unavailable')
  }

  if (!data.session?.user) {
    return null
  }

  return resolveStaffAccount(data.session.user)
}

export async function signInWithPassword(
  email: string,
  password: string,
): Promise<StaffAccount> {
  const { data, error } = await getSupabaseClient().auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    if (error.message.toLowerCase().includes('invalid login credentials')) {
      throw new SignInError('invalid_credentials')
    }

    throw new SignInError('service_unavailable')
  }

  if (!data.user) {
    throw new SignInError('service_unavailable')
  }

  return resolveStaffAccount(data.user)
}

export async function signOut() {
  const { error } = await getSupabaseClient().auth.signOut()

  if (error) {
    throw new SignInError('service_unavailable')
  }
}
