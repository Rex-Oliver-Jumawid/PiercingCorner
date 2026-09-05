import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthProvider } from './AuthProvider'
import type { StaffAccount } from './types'
import { useAuth } from './useAuth'

const authMocks = vi.hoisted(() => ({
  resolveStaffAccount: vi.fn(),
  restoreAuthorizedSession: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
}))

const supabaseMocks = vi.hoisted(() => ({
  onAuthStateChange: vi.fn(),
  unsubscribe: vi.fn(),
}))

vi.mock('./authService', () => {
  class MockSignInError extends Error {
    readonly code: string

    constructor(code: string) {
      super(code)
      this.code = code
    }
  }

  return {
    SignInError: MockSignInError,
    resolveStaffAccount: authMocks.resolveStaffAccount,
    restoreAuthorizedSession: authMocks.restoreAuthorizedSession,
    signInWithPassword: authMocks.signInWithPassword,
    signOut: authMocks.signOut,
  }
})

vi.mock('../../lib/supabase/client', () => ({
  getSupabaseClient: () => ({
    auth: {
      onAuthStateChange: supabaseMocks.onAuthStateChange,
    },
  }),
}))

type AuthListener = (event: AuthChangeEvent, session: Session | null) => void

let authListener: AuthListener

function makeAccount(id: string, role: 'owner' | 'staff' = 'staff'): StaffAccount {
  return {
    id,
    display_name: `${id} account`,
    role,
    status: 'active',
  }
}

function makeSession(id: string, email = `${id}@example.test`) {
  return {
    user: { id, email },
  } as unknown as Session
}

function renderAuth() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    )
  }

  return {
    queryClient,
    ...renderHook(() => useAuth(), { wrapper: Wrapper }),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  authMocks.restoreAuthorizedSession.mockResolvedValue(null)
  authMocks.signOut.mockResolvedValue(undefined)
  supabaseMocks.onAuthStateChange.mockImplementation((listener: AuthListener) => {
    authListener = listener
    return { data: { subscription: { unsubscribe: supabaseMocks.unsubscribe } } }
  })
})

describe('AuthProvider identity and cache synchronization', () => {
  it('restores a persisted active application account', async () => {
    const restoredAccount = makeAccount('user-a', 'owner')
    authMocks.restoreAuthorizedSession.mockResolvedValue(restoredAccount)

    const { result } = renderAuth()

    await waitFor(() => expect(result.current.account).toEqual(restoredAccount))
    expect(result.current.status).toBe('authenticated')
  })

  it('clears private Query data and local access immediately on logout', async () => {
    const { queryClient, result } = renderAuth()
    await waitFor(() => expect(result.current.status).toBe('unauthenticated'))
    queryClient.setQueryData(['private'], { ownerOnly: true })

    await act(async () => result.current.signOut())

    expect(result.current.account).toBeNull()
    expect(result.current.status).toBe('unauthenticated')
    expect(queryClient.getQueryData(['private'])).toBeUndefined()
    expect(authMocks.signOut).toHaveBeenCalledOnce()
  })

  it('handles SIGNED_OUT by denying access and clearing private Query data', async () => {
    const { queryClient, result } = renderAuth()
    await waitFor(() => expect(result.current.status).toBe('unauthenticated'))
    queryClient.setQueryData(['private'], 'cached')

    act(() => authListener('SIGNED_OUT', null))

    expect(result.current.account).toBeNull()
    expect(result.current.status).toBe('unauthenticated')
    expect(queryClient.getQueryData(['private'])).toBeUndefined()
  })

  it('resolves SIGNED_IN and USER_UPDATED accounts from staff_accounts', async () => {
    const initialAccount = makeAccount('user-a', 'staff')
    const updatedAccount = makeAccount('user-a', 'owner')
    authMocks.resolveStaffAccount
      .mockResolvedValueOnce(initialAccount)
      .mockResolvedValueOnce(updatedAccount)
    const { queryClient, result } = renderAuth()
    await waitFor(() => expect(result.current.status).toBe('unauthenticated'))

    act(() => authListener('SIGNED_IN', makeSession('user-a')))
    await waitFor(() => expect(result.current.account).toEqual(initialAccount))
    queryClient.setQueryData(['owner-private'], 'cached')

    act(() => authListener('USER_UPDATED', makeSession('user-a')))
    await waitFor(() => expect(result.current.account).toEqual(updatedAccount))
    expect(authMocks.resolveStaffAccount).toHaveBeenCalledTimes(2)
    expect(queryClient.getQueryData(['owner-private'])).toBeUndefined()
  })

  it('denies access and clears private data when account resolution fails', async () => {
    authMocks.resolveStaffAccount.mockRejectedValue(new Error('unavailable account'))
    const { queryClient, result } = renderAuth()
    await waitFor(() => expect(result.current.status).toBe('unauthenticated'))
    queryClient.setQueryData(['private'], 'cached')

    act(() => authListener('SIGNED_IN', makeSession('unavailable-user')))

    await waitFor(() => expect(queryClient.getQueryData(['private'])).toBeUndefined())
    expect(result.current.account).toBeNull()
    expect(result.current.status).toBe('unauthenticated')
  })

  it('clears cached private data when the authenticated identity changes', async () => {
    let finishUserB: (account: StaffAccount) => void = () => {}
    const userBPromise = new Promise<StaffAccount>((resolve) => {
      finishUserB = resolve
    })
    authMocks.resolveStaffAccount.mockImplementation(async (user: User) => {
      if (user.id === 'user-b') {
        return userBPromise
      }

      return makeAccount(user.id, 'owner')
    })
    const { queryClient, result } = renderAuth()
    await waitFor(() => expect(result.current.status).toBe('unauthenticated'))

    act(() => authListener('SIGNED_IN', makeSession('user-a')))
    await waitFor(() => expect(result.current.account?.id).toBe('user-a'))
    queryClient.setQueryData(['private'], 'owner data')

    act(() => authListener('SIGNED_IN', makeSession('user-b')))
    await waitFor(() => expect(result.current.status).toBe('loading'))
    expect(result.current.account).toBeNull()
    expect(queryClient.getQueryData(['private'])).toBeUndefined()
    await act(async () => finishUserB(makeAccount('user-b')))
    await waitFor(() => expect(result.current.account?.id).toBe('user-b'))

    expect(queryClient.getQueryData(['private'])).toBeUndefined()
  })

  it('keeps same-user cache and account state during routine token refresh', async () => {
    authMocks.resolveStaffAccount.mockResolvedValue(makeAccount('user-a', 'owner'))
    const { queryClient, result } = renderAuth()
    await waitFor(() => expect(result.current.status).toBe('unauthenticated'))

    act(() => authListener('SIGNED_IN', makeSession('user-a')))
    await waitFor(() => expect(result.current.account?.id).toBe('user-a'))
    queryClient.setQueryData(['private'], 'same user data')
    const lookupCount = authMocks.resolveStaffAccount.mock.calls.length

    act(() => authListener('TOKEN_REFRESHED', makeSession('user-a')))

    expect(result.current.account?.id).toBe('user-a')
    expect(queryClient.getQueryData(['private'])).toBe('same user data')
    expect(authMocks.resolveStaffAccount).toHaveBeenCalledTimes(lookupCount)
  })

  it('does not allow a stale account lookup to overwrite a newer identity', async () => {
    let resolveUserA: (account: StaffAccount) => void = () => {}
    let resolveUserB: (account: StaffAccount) => void = () => {}
    const userAPromise = new Promise<StaffAccount>((resolve) => {
      resolveUserA = resolve
    })
    const userBPromise = new Promise<StaffAccount>((resolve) => {
      resolveUserB = resolve
    })
    authMocks.resolveStaffAccount.mockImplementation((user: User) =>
      user.id === 'user-a' ? userAPromise : userBPromise,
    )
    const { result } = renderAuth()
    await waitFor(() => expect(result.current.status).toBe('unauthenticated'))

    act(() => authListener('SIGNED_IN', makeSession('user-a')))
    act(() => authListener('SIGNED_IN', makeSession('user-b')))
    await act(async () => resolveUserB(makeAccount('user-b')))
    await waitFor(() => expect(result.current.account?.id).toBe('user-b'))
    await act(async () => resolveUserA(makeAccount('user-a', 'owner')))

    expect(result.current.account?.id).toBe('user-b')
    expect(result.current.account?.role).toBe('staff')
  })

  it('prevents a late session restore from reviving a signed-out account', async () => {
    let finishRestore: (account: StaffAccount) => void = () => {}
    authMocks.restoreAuthorizedSession.mockImplementation(
      () =>
        new Promise<StaffAccount>((resolve) => {
          finishRestore = resolve
        }),
    )
    const { result } = renderAuth()

    act(() => authListener('SIGNED_OUT', null))
    await act(async () => finishRestore(makeAccount('user-a', 'owner')))

    expect(result.current.account).toBeNull()
    expect(result.current.status).toBe('unauthenticated')
  })

  it('avoids duplicate resolution for the Login submit SIGNED_IN event', async () => {
    const account = makeAccount('user-a', 'owner')
    authMocks.signInWithPassword.mockImplementation(async () => {
      authListener('SIGNED_IN', makeSession('user-a'))
      return account
    })
    const { result } = renderAuth()
    await waitFor(() => expect(result.current.status).toBe('unauthenticated'))

    await act(async () => {
      await result.current.signIn('user-a@example.test', 'password')
    })

    expect(result.current.account).toEqual(account)
    expect(authMocks.resolveStaffAccount).not.toHaveBeenCalled()
  })
})
