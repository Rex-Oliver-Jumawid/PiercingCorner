import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { AUTHENTICATED_ROLES, getDefaultRouteForRole } from './routeAccess'
import type { AppRole } from './types'
import { useAuth } from './useAuth'

interface ProtectedRouteProps {
  allowedRoles?: readonly AppRole[]
}

export function ProtectedRoute({ allowedRoles = AUTHENTICATED_ROLES }: ProtectedRouteProps) {
  const { account, status } = useAuth()
  const location = useLocation()

  if (status === 'loading') {
    return (
      <main
        aria-label="Loading Piercing Corner"
        className="grid min-h-screen place-items-center bg-[#fffdf7] text-[#30231f]"
      >
        <span className="size-7 animate-spin rounded-full border-2 border-[#dfd1b9] border-t-[#cf861d]" />
      </main>
    )
  }

  if (!account) {
    return <Navigate replace state={{ from: location.pathname }} to="/login" />
  }

  if (!allowedRoles.includes(account.role)) {
    return <Navigate replace to={getDefaultRouteForRole(account.role)} />
  }

  return <Outlet />
}
