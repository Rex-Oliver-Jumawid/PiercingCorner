import type { Database } from '../../types/database'

/** Application access. Studio qualifications are modeled separately from access. */
export type AppRole = Database['public']['Enums']['app_role']
