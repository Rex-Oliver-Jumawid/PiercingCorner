import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'

import logoUrl from '../../../logo.png'
import {
  applicationRoutes,
  getRoutesForRole,
} from '../../features/auth/routeAccess'
import type { ApplicationPath } from '../../features/auth/routeAccess'
import { useAuth } from '../../features/auth/useAuth'
import './appShell.css'

const routeIcons: Record<ApplicationPath, string> = {
  '/overview': '▦',
  '/dashboard': '▤',
  '/clients': '♙',
  '/sales': '▣',
  '/reports': '▥',
  '/studio': '⌂',
  '/settings': '⚙',
  '/calendar': '▦',
}

function manilaDate() {
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'long',
    day: 'numeric',
  }).format(new Date())
}

export function AppShell() {
  const { account, signOut } = useAuth()
  const location = useLocation()
  const [navigationOpen, setNavigationOpen] = useState(false)
  const closeButton = useRef<HTMLButtonElement>(null)
  const currentRoute = applicationRoutes.find(
    ({ path }) => path === location.pathname,
  )

  useEffect(() => {
    if (!navigationOpen) return
    closeButton.current?.focus()
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setNavigationOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [navigationOpen])

  if (!account) return null

  const roleLabel = account.role === 'owner' ? 'Owner' : 'Staff'
  const routes = getRoutesForRole(account.role)

  return (
    <div className="app-shell">
      <button
        type="button"
        className={`app-shell-scrim ${navigationOpen ? 'open' : ''}`}
        aria-label="Close navigation"
        tabIndex={navigationOpen ? 0 : -1}
        onClick={() => setNavigationOpen(false)}
      />
      <aside
        id="application-navigation"
        className={`app-sidebar ${navigationOpen ? 'open' : ''}`}
        aria-label="Application sidebar"
      >
        <div className="app-brand">
          <span className="app-brand-mark" aria-hidden="true">
            <img src={logoUrl} alt="" />
          </span>
          <span className="app-brand-copy">
            <strong>Piercing Corner</strong>
            <small>PARAÑAQUE</small>
          </span>
          <button
            ref={closeButton}
            type="button"
            className="app-nav-close"
            aria-label="Close navigation"
            onClick={() => setNavigationOpen(false)}
          >
            ×
          </button>
        </div>

        <p className="app-nav-label">{roleLabel} workspace</p>
        <nav className="app-nav" aria-label="Primary navigation">
          {routes.map(({ path, label }) => (
            <NavLink
              key={path}
              to={path}
              onClick={() => setNavigationOpen(false)}
              className={({ isActive }) =>
                `${path === '/calendar' ? 'calendar ' : ''}${isActive ? 'active' : ''}`
              }
            >
              <span className="app-nav-icon" aria-hidden="true">
                {routeIcons[path]}
              </span>
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <section className="app-account" aria-label="Signed-in account">
          <span className="app-account-avatar" aria-hidden="true">
            {account.display_name
              .split(/\s+/)
              .map((part) => part[0])
              .join('')
              .slice(0, 2)
              .toUpperCase()}
          </span>
          <span className="app-account-copy">
            <strong>{account.display_name}</strong>
            <small>{roleLabel}</small>
          </span>
          <button type="button" onClick={() => void signOut()}>
            Sign out
          </button>
        </section>
      </aside>

      <main className="app-main">
        <header className="app-topbar">
          <button
            type="button"
            className="app-menu-button"
            aria-label="Open navigation"
            aria-controls="application-navigation"
            aria-expanded={navigationOpen}
            onClick={() => setNavigationOpen(true)}
          >
            <span aria-hidden="true">☰</span>
          </button>
          <div className="app-page-heading">
            <p>PIERCING CORNER · {roleLabel.toUpperCase()}</p>
            <div>{currentRoute?.label ?? 'Workspace'}</div>
          </div>
          <span className="app-date" aria-label={`${manilaDate()}, Parañaque`}>
            {manilaDate()} · Parañaque
          </span>
        </header>
        <div className="app-content">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
