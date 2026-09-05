import { Navigate, useLocation } from 'react-router-dom'

import { getDefaultRouteForRole } from './routeAccess'
import { useAuth } from './useAuth'

export function UnknownRouteRedirect() {
  const { account, status } = useAuth()
  const location = useLocation()

  if (status === 'loading') {
    return null
  }

  if (!account) {
    return <Navigate replace state={{ from: location.pathname }} to="/login" />
  }

  return <Navigate replace to={getDefaultRouteForRole(account.role)} />
}
