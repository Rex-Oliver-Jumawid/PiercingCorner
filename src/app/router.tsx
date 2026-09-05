import { createBrowserRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import type { RouteObject } from 'react-router-dom'

import { AppShell } from '../components/layout/AppShell'
import { LoginPage } from '../features/auth/LoginPage'
import { ProtectedRoute } from '../features/auth/ProtectedRoute'
import { RoleLandingRedirect } from '../features/auth/RoleLandingRedirect'
import { UnknownRouteRedirect } from '../features/auth/UnknownRouteRedirect'
import {
  AUTHENTICATED_ROLES,
  OWNER_ONLY_ROLES,
  applicationRoutes,
} from '../features/auth/routeAccess'
import type { ApplicationPath } from '../features/auth/routeAccess'
import { CalendarPage } from '../features/calendar/CalendarPage'
import { ClientsPage } from '../features/clients/ClientsPage'
import { DashboardPage } from '../features/dashboard/DashboardPage'
import { OverviewPage } from '../features/overview/OverviewPage'
import { ReportsPage } from '../features/reports/ReportsPage'
import { SalesPage } from '../features/sales/SalesPage'
import { SettingsPage } from '../features/settings/SettingsPage'
import { StudioPage } from '../features/studio/StudioPage'

const routeElements: Record<ApplicationPath, ReactNode> = {
  '/overview': <OverviewPage />,
  '/dashboard': <DashboardPage />,
  '/clients': <ClientsPage />,
  '/sales': <SalesPage />,
  '/reports': <ReportsPage />,
  '/studio': <StudioPage />,
  '/settings': <SettingsPage />,
  '/calendar': <CalendarPage />,
}

const sharedRoutes = applicationRoutes
  .filter(({ roles }) => roles === AUTHENTICATED_ROLES)
  .map(({ path }) => ({ path: path.slice(1), element: routeElements[path] }))

const ownerRoutes = applicationRoutes
  .filter(({ roles }) => roles === OWNER_ONLY_ROLES)
  .map(({ path }) => ({ path: path.slice(1), element: routeElements[path] }))

export const appRoutes: RouteObject[] = [
  {
    element: <ProtectedRoute />,
    children: [
      {
        path: '/',
        element: <AppShell />,
        children: [
          { index: true, element: <RoleLandingRedirect /> },
          ...sharedRoutes,
          {
            element: <ProtectedRoute allowedRoles={OWNER_ONLY_ROLES} />,
            children: ownerRoutes,
          },
        ],
      },
    ],
  },
  { path: '/login', element: <LoginPage /> },
  { path: '*', element: <UnknownRouteRedirect /> },
]

export const router = createBrowserRouter(appRoutes)
