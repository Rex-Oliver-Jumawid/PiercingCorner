import { createContext } from 'react'

import type { AuthStatus, StaffAccount } from './types'

export interface AuthContextValue {
  account: StaffAccount | null
  signIn: (email: string, password: string) => Promise<StaffAccount>
  signOut: () => Promise<void>
  status: AuthStatus
}

export const AuthContext = createContext<AuthContextValue | null>(null)
