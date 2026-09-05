import type { AppRole } from './types'

export const AUTHENTICATED_ROLES = ['owner', 'staff'] as const satisfies readonly AppRole[]
export const OWNER_ONLY_ROLES = ['owner'] as const satisfies readonly AppRole[]

export const applicationRoutes = [
  { path: '/overview', label: 'Overview', roles: OWNER_ONLY_ROLES },
  { path: '/dashboard', label: 'Dashboard', roles: AUTHENTICATED_ROLES },
  { path: '/clients', label: 'Clients', roles: AUTHENTICATED_ROLES },
  { path: '/sales', label: 'Sales', roles: OWNER_ONLY_ROLES },
  { path: '/reports', label: 'Reports', roles: OWNER_ONLY_ROLES },
  { path: '/studio', label: 'Studio', roles: OWNER_ONLY_ROLES },
  { path: '/settings', label: 'Settings', roles: OWNER_ONLY_ROLES },
  { path: '/calendar', label: 'Calendar', roles: OWNER_ONLY_ROLES },
] as const satisfies ReadonlyArray<{
  path: `/${string}`
  label: string
  roles: readonly AppRole[]
}>

export type ApplicationPath = (typeof applicationRoutes)[number]['path']

export function getDefaultRouteForRole(role: AppRole): ApplicationPath {
  return role === 'owner' ? '/overview' : '/dashboard'
}

export function getRoutesForRole(role: AppRole) {
  return applicationRoutes.filter(({ roles }) =>
    roles.some((allowedRole) => allowedRole === role),
  )
}

export function canAccessRoute(role: AppRole, pathname: string) {
  const normalizedPath = pathname.replace(/\/$/, '') || '/'
  return applicationRoutes.some(
    ({ path, roles }) =>
      path === normalizedPath && roles.some((allowedRole) => allowedRole === role),
  )
}

export function getAuthorizedDestination(role: AppRole, requestedPath?: string) {
  if (requestedPath && canAccessRoute(role, requestedPath)) {
    return requestedPath
  }

  return getDefaultRouteForRole(role)
}
