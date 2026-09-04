import { NavLink, Outlet } from 'react-router-dom'

import { useAuth } from '../../features/auth/useAuth'
import type { AppRole } from '../../features/auth/types'

const navigationItems: Array<{ to: string; label: string; roles: AppRole[] }> = [
  { to: '/overview', label: 'Overview', roles: ['owner'] },
  { to: '/dashboard', label: 'Dashboard', roles: ['owner', 'staff'] },
  { to: '/clients', label: 'Clients', roles: ['owner', 'staff'] },
  { to: '/sales', label: 'Sales', roles: ['owner'] },
  { to: '/reports', label: 'Reports', roles: ['owner'] },
  { to: '/studio', label: 'Studio', roles: ['owner'] },
  { to: '/settings', label: 'Settings', roles: ['owner'] },
  { to: '/calendar', label: 'Calendar', roles: ['owner'] },
]

export function AppShell() {
  const { account, signOut } = useAuth()

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <header className="border-b border-stone-200 bg-white px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2">
          <div className="mr-auto">
            <p className="text-sm font-semibold">Piercing Corner</p>
            <p className="text-xs text-stone-500">
              {account?.display_name} · {account?.role === 'owner' ? 'Owner' : 'Staff'}
            </p>
          </div>
          <nav aria-label="Primary navigation" className="flex flex-wrap gap-1">
            {navigationItems
              .filter(({ roles }) => account && roles.includes(account.role))
              .map(({ to, label }) => (
                <NavLink
                  className={({ isActive }) =>
                    `rounded px-3 py-1.5 text-sm transition ${
                      isActive
                        ? 'bg-stone-900 text-white'
                        : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
                    }`
                  }
                  key={to}
                  to={to}
                >
                  {label}
                </NavLink>
              ))}
          </nav>
          <button
            className="rounded px-3 py-1.5 text-sm text-stone-600 transition hover:bg-stone-100 hover:text-stone-900"
            type="button"
            onClick={() => void signOut()}
          >
            Sign out
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <Outlet />
      </main>
    </div>
  )
}
