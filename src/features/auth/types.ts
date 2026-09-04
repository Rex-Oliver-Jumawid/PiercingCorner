import type { Database } from '../../types/database'

/** Application access. Studio qualifications are modeled separately from access. */
export type AppRole = Database['public']['Enums']['app_role']

export type StaffAccount = Pick<
  Database['public']['Tables']['staff_accounts']['Row'],
  'display_name' | 'id' | 'role' | 'status'
>

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'
