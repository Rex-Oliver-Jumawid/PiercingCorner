import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import { AuthContext } from './authContext'
import {
  restoreAuthorizedSession,
  signInWithPassword,
  signOut as signOutFromSupabase,
} from './authService'
import type { AuthStatus, StaffAccount } from './types'
import { getSupabaseClient } from '../../lib/supabase/client'

interface AuthProviderProps {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [account, setAccount] = useState<StaffAccount | null>(null)
  const [status, setStatus] = useState<AuthStatus>('loading')

  useEffect(() => {
    let isCurrent = true
    let unsubscribe = () => {}

    async function restoreSession() {
      try {
        const restoredAccount = await restoreAuthorizedSession()

        if (isCurrent) {
          setAccount(restoredAccount)
          setStatus(restoredAccount ? 'authenticated' : 'unauthenticated')
        }
      } catch {
        if (isCurrent) {
          setAccount(null)
          setStatus('unauthenticated')
        }
      }
    }

    void restoreSession()

    try {
      const { data } = getSupabaseClient().auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT' && isCurrent) {
          setAccount(null)
          setStatus('unauthenticated')
        }
      })
      unsubscribe = () => data.subscription.unsubscribe()
    } catch {
      // Missing local configuration is presented by the Login form if submitted.
    }

    return () => {
      isCurrent = false
      unsubscribe()
    }
  }, [])

  const value = useMemo(
    () => ({
      account,
      status,
      async signIn(email: string, password: string) {
        const authorizedAccount = await signInWithPassword(email, password)
        setAccount(authorizedAccount)
        setStatus('authenticated')
        return authorizedAccount
      },
      async signOut() {
        try {
          await signOutFromSupabase()
        } catch {
          // Clear local access even if the remote session cannot be revoked.
        } finally {
          setAccount(null)
          setStatus('unauthenticated')
        }
      },
    }),
    [account, status],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
