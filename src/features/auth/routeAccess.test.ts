import { describe, expect, it } from 'vitest'

import {
  applicationRoutes,
  canAccessRoute,
  getAuthorizedDestination,
  getDefaultRouteForRole,
  getRoutesForRole,
} from './routeAccess'

const ownerPaths = [
  '/overview',
  '/dashboard',
  '/clients',
  '/sales',
  '/reports',
  '/studio',
  '/settings',
  '/calendar',
] as const

const staffPaths = ['/dashboard', '/clients'] as const
const staffDeniedPaths = [
  '/overview',
  '/sales',
  '/reports',
  '/studio',
  '/settings',
  '/calendar',
] as const

describe('application access policy', () => {
  it.each(ownerPaths)('allows Owner to access %s', (path) => {
    expect(canAccessRoute('owner', path)).toBe(true)
  })

  it.each(staffPaths)('allows Staff to access %s', (path) => {
    expect(canAccessRoute('staff', path)).toBe(true)
  })

  it.each(staffDeniedPaths)('denies Staff access to %s', (path) => {
    expect(canAccessRoute('staff', path)).toBe(false)
  })

  it('uses the approved role-specific defaults', () => {
    expect(getDefaultRouteForRole('owner')).toBe('/overview')
    expect(getDefaultRouteForRole('staff')).toBe('/dashboard')
  })

  it('returns an authorized remembered destination and rejects an unauthorized one', () => {
    expect(getAuthorizedDestination('owner', '/reports')).toBe('/reports')
    expect(getAuthorizedDestination('staff', '/clients')).toBe('/clients')
    expect(getAuthorizedDestination('staff', '/reports')).toBe('/dashboard')
    expect(getAuthorizedDestination('staff', '/overview')).toBe('/dashboard')
  })

  it('derives role navigation from the canonical route model', () => {
    expect(getRoutesForRole('owner').map(({ path }) => path)).toEqual(ownerPaths)
    expect(getRoutesForRole('staff').map(({ path }) => path)).toEqual(staffPaths)
    expect(applicationRoutes).toHaveLength(8)
  })
})
