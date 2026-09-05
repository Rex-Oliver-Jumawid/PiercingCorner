import { render, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import type { InitialEntry } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'

import { AuthContext } from '../features/auth/authContext'
import type { AppRole, StaffAccount } from '../features/auth/types'
import { appRoutes } from './router'

vi.mock('../features/clients/clientService', () => ({
  listClients: vi.fn().mockResolvedValue({ rows: [], count: 0 }),
}))

function makeAccount(role: AppRole): StaffAccount {
  return {
    id: `${role}-id`,
    display_name: `${role} account`,
    role,
    status: 'active',
  }
}

function renderRoute(initialEntry: InitialEntry, role?: AppRole) {
  const account = role ? makeAccount(role) : null
  const router = createMemoryRouter(appRoutes, {
    initialEntries: [initialEntry],
  })

  render(
    <AuthContext.Provider
      value={{
        account,
        status: account ? 'authenticated' : 'unauthenticated',
        signIn: vi.fn(),
        signOut: vi.fn(),
      }}
    >
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <RouterProvider router={router} />
      </QueryClientProvider>
    </AuthContext.Provider>,
  )

  return router
}

async function expectPath(
  initialEntry: InitialEntry,
  expectedPath: string,
  role?: AppRole,
) {
  const router = renderRoute(initialEntry, role)
  await waitFor(() => expect(router.state.location.pathname).toBe(expectedPath))
}

describe('protected application routing', () => {
  it.each(['/dashboard', '/sales'])(
    'sends unauthenticated %s requests to Login',
    async (path) => {
      await expectPath(path, '/login')
    },
  )

  it.each(['/dashboard', '/clients'])(
    'allows Staff to enter %s',
    async (path) => {
      await expectPath(path, path, 'staff')
    },
  )

  it.each([
    '/overview',
    '/sales',
    '/reports',
    '/studio',
    '/settings',
    '/calendar',
  ])('redirects Staff away from %s', async (path) => {
    await expectPath(path, '/dashboard', 'staff')
  })

  it.each(['/overview', '/sales', '/settings'])(
    'allows Owner to enter %s',
    async (path) => {
      await expectPath(path, path, 'owner')
    },
  )

  it('routes authenticated Owner at root to Overview', async () => {
    await expectPath('/', '/overview', 'owner')
  })

  it('routes authenticated Staff at root to Dashboard', async () => {
    await expectPath('/', '/dashboard', 'staff')
  })

  it('routes unknown paths to the current role default', async () => {
    await expectPath('/not-a-route', '/overview', 'owner')
    await expectPath('/not-a-route', '/dashboard', 'staff')
  })

  it('routes an unauthenticated unknown path to Login without looping', async () => {
    await expectPath('/not-a-route', '/login')
  })

  it('redirects authenticated Login visits to the role default', async () => {
    await expectPath('/login', '/overview', 'owner')
    await expectPath('/login', '/dashboard', 'staff')
  })

  it('honors only authorized remembered destinations from Login', async () => {
    await expectPath(
      { pathname: '/login', state: { from: '/reports' } },
      '/reports',
      'owner',
    )
    await expectPath(
      { pathname: '/login', state: { from: '/clients' } },
      '/clients',
      'staff',
    )
    await expectPath(
      { pathname: '/login', state: { from: '/reports' } },
      '/dashboard',
      'staff',
    )
  })
})
