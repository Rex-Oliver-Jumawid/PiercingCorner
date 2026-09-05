import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'

import { getSupabaseClient } from '../../lib/supabase/client'
import { AuthContext } from './authContext'
import {
  SignInError,
  resolveStaffAccount,
  restoreAuthorizedSession,
  signInWithPassword,
  signOut as signOutFromSupabase,
} from './authService'
import type { AuthStatus, StaffAccount } from './types'

interface AuthProviderProps {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const queryClient = useQueryClient()
  const [account, setAccount] = useState<StaffAccount | null>(null)
  const [status, setStatus] = useState<AuthStatus>('loading')
  const accountRef = useRef<StaffAccount | null>(null)
  const statusRef = useRef<AuthStatus>('loading')
  const currentUserIdRef = useRef<string | null>(null)
  const authGenerationRef = useRef(0)
  const directSignInInProgressRef = useRef(false)

  const setAuthenticatedAccount = useCallback(
    (nextAccount: StaffAccount, generation: number) => {
      if (generation !== authGenerationRef.current) {
        return false
      }

      const previousUserId = currentUserIdRef.current
      const previousAccount = accountRef.current
      if (
        (previousUserId && previousUserId !== nextAccount.id) ||
        (previousAccount && previousAccount.role !== nextAccount.role)
      ) {
        queryClient.clear()
      }

      currentUserIdRef.current = nextAccount.id
      accountRef.current = nextAccount
      statusRef.current = 'authenticated'
      setAccount(nextAccount)
      setStatus('authenticated')
      return true
    },
    [queryClient],
  )

  const setUnauthenticated = useCallback(() => {
    authGenerationRef.current += 1
    currentUserIdRef.current = null
    accountRef.current = null
    statusRef.current = 'unauthenticated'
    queryClient.clear()
    setAccount(null)
    setStatus('unauthenticated')
  }, [queryClient])

  const synchronizeUser = useCallback(
    async (user: User) => {
      const generation = authGenerationRef.current + 1
      authGenerationRef.current = generation

      const previousUserId = currentUserIdRef.current
      if (previousUserId && previousUserId !== user.id) {
        queryClient.clear()
        accountRef.current = null
        statusRef.current = 'loading'
        setAccount(null)
        setStatus('loading')
      } else if (!accountRef.current) {
        statusRef.current = 'loading'
        setStatus('loading')
      }
      currentUserIdRef.current = user.id

      try {
        const nextAccount = await resolveStaffAccount(user)

        if (currentUserIdRef.current === user.id) {
          setAuthenticatedAccount(nextAccount, generation)
        }
      } catch {
        if (
          generation === authGenerationRef.current &&
          currentUserIdRef.current === user.id
        ) {
          setUnauthenticated()
        }
      }
    },
    [queryClient, setAuthenticatedAccount, setUnauthenticated],
  )

  useEffect(() => {
    let isCurrent = true
    let unsubscribe = () => {}

    async function restoreSession() {
      const generation = authGenerationRef.current + 1
      authGenerationRef.current = generation

      try {
        const restoredAccount = await restoreAuthorizedSession()

        if (!isCurrent || generation !== authGenerationRef.current) {
          return
        }

        if (restoredAccount) {
          setAuthenticatedAccount(restoredAccount, generation)
        } else {
          setUnauthenticated()
        }
      } catch {
        if (isCurrent && generation === authGenerationRef.current) {
          setUnauthenticated()
        }
      }
    }

    void restoreSession()

    try {
      const { data } = getSupabaseClient().auth.onAuthStateChange((event, session) => {
        if (!isCurrent) {
          return
        }

        if (event === 'SIGNED_OUT') {
          setUnauthenticated()
          return
        }

        if (event === 'INITIAL_SESSION') {
          // The explicit restoration above owns initial account resolution.
          return
        }

        const user = session?.user

        if (event === 'TOKEN_REFRESHED') {
          if (!user) {
            setUnauthenticated()
          } else if (
            currentUserIdRef.current !== user.id ||
            !accountRef.current
          ) {
            queueMicrotask(() => void synchronizeUser(user))
          }
          return
        }

        if (event === 'SIGNED_IN') {
          if (!user) {
            setUnauthenticated()
          } else if (directSignInInProgressRef.current) {
            // The Login submit is already resolving this same identity.
          } else if (
            currentUserIdRef.current !== user.id ||
            accountRef.current?.id !== user.id ||
            statusRef.current !== 'authenticated'
          ) {
            queueMicrotask(() => void synchronizeUser(user))
          }
          return
        }

        if (event === 'USER_UPDATED') {
          if (user) {
            queueMicrotask(() => void synchronizeUser(user))
          } else {
            setUnauthenticated()
          }
        }
      })
      unsubscribe = () => data.subscription.unsubscribe()
    } catch {
      // Missing local configuration is presented by the Login form if submitted.
    }

    return () => {
      isCurrent = false
      authGenerationRef.current += 1
      unsubscribe()
    }
  }, [setAuthenticatedAccount, setUnauthenticated, synchronizeUser])

  const value = useMemo(
    () => ({
      account,
      status,
      async signIn(email: string, password: string) {
        const generation = authGenerationRef.current + 1
        authGenerationRef.current = generation
        directSignInInProgressRef.current = true

        try {
          const authorizedAccount = await signInWithPassword(email, password)

          if (!setAuthenticatedAccount(authorizedAccount, generation)) {
            throw new SignInError('service_unavailable')
          }

          return authorizedAccount
        } finally {
          directSignInInProgressRef.current = false
        }
      },
      async signOut() {
        setUnauthenticated()

        try {
          await signOutFromSupabase()
        } catch {
          // Local access is already denied even if remote revocation fails.
        }
      },
    }),
    [account, setAuthenticatedAccount, setUnauthenticated, status],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
