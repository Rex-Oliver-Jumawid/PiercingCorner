import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../../features/auth/authContext'
import type { AppRole } from '../../features/auth/types'
import { AppShell } from './AppShell'

function renderShell(role: AppRole = 'owner') {
  const signOut = vi.fn().mockResolvedValue(undefined)
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <AppShell />,
        children: [
          { path: 'overview', element: <p>Overview content</p> },
          { path: 'dashboard', element: <p>Dashboard content</p> },
          { path: 'clients', element: <p>Clients content</p> },
        ],
      },
    ],
    { initialEntries: [role === 'owner' ? '/overview' : '/dashboard'] },
  )

  render(
    <AuthContext.Provider
      value={{
        account: {
          id: `${role}-id`,
          display_name: role === 'owner' ? 'Studio Owner' : 'Maria Cruz',
          role,
          status: 'active',
        },
        status: 'authenticated',
        signIn: vi.fn(),
        signOut,
      }}
    >
      <RouterProvider router={router} />
    </AuthContext.Provider>,
  )

  return { router, signOut }
}

describe('authenticated application shell', () => {
  it('renders canonical Owner navigation and marks the current route', () => {
    renderShell()
    const navigation = screen.getByRole('navigation', {
      name: 'Primary navigation',
    })
    expect(within(navigation).getAllByRole('link')).toHaveLength(8)
    expect(within(navigation).getByRole('link', { name: 'Overview' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByText('PIERCING CORNER · OWNER')).toBeVisible()
    expect(screen.getByLabelText('Signed-in account')).toHaveTextContent(
      'Studio Owner',
    )
  })

  it('shows only canonical Staff destinations', () => {
    renderShell('staff')
    const navigation = screen.getByRole('navigation', {
      name: 'Primary navigation',
    })
    expect(within(navigation).getAllByRole('link').map((link) => link.textContent)).toEqual([
      '▤Dashboard',
      '♙Clients',
    ])
    expect(within(navigation).queryByRole('link', { name: 'Studio' })).not.toBeInTheDocument()
    expect(screen.getByText('PIERCING CORNER · STAFF')).toBeVisible()
  })

  it('opens and closes the responsive navigation with keyboard support', () => {
    renderShell()
    const menu = screen.getByRole('button', { name: 'Open navigation' })
    const sidebar = screen.getByLabelText('Application sidebar')
    expect(menu).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(menu)
    expect(menu).toHaveAttribute('aria-expanded', 'true')
    expect(sidebar).toHaveClass('open')
    expect(within(sidebar).getByRole('button', { name: 'Close navigation' })).toHaveFocus()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(menu).toHaveAttribute('aria-expanded', 'false')
    expect(sidebar).not.toHaveClass('open')
  })

  it('updates the route heading and invokes logout from the account panel', async () => {
    const { router, signOut } = renderShell()
    await act(async () => {
      await router.navigate('/clients')
    })
    expect(screen.getByText('Clients', { selector: '.app-page-heading > div' })).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(signOut).toHaveBeenCalledOnce()
  })
})
