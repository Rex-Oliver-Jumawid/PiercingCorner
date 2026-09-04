import type { AppRole } from './types'

const staffRoutes = new Set(['/dashboard', '/clients'])
const ownerRoutes = new Set([
  '/overview',
  '/dashboard',
  '/clients',
  '/sales',
  '/reports',
  '/studio',
  '/settings',
  '/calendar',
])

export function canAccessRoute(role: AppRole, pathname: string) {
  const normalizedPath = pathname.replace(/\/$/, '') || '/'
  return (role === 'owner' ? ownerRoutes : staffRoutes).has(normalizedPath)
}

export function getAuthorizedDestination(role: AppRole, requestedPath?: string) {
  if (requestedPath && canAccessRoute(role, requestedPath)) {
    return requestedPath
  }

  return role === 'owner' ? '/overview' : '/dashboard'
}
