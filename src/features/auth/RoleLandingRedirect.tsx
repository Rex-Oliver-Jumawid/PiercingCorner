import { Navigate } from 'react-router-dom'

import { getDefaultRouteForRole } from './routeAccess'
import { useAuth } from './useAuth'

export function RoleLandingRedirect() {
  const { account } = useAuth()

  if (!account) {
    return null
  }

  return <Navigate replace to={getDefaultRouteForRole(account.role)} />
}
