import { Navigate, createBrowserRouter } from 'react-router-dom'

import { AppShell } from '../components/layout/AppShell'
import { LoginPage } from '../features/auth/LoginPage'
import { ProtectedRoute } from '../features/auth/ProtectedRoute'
import { CalendarPage } from '../features/calendar/CalendarPage'
import { ClientsPage } from '../features/clients/ClientsPage'
import { DashboardPage } from '../features/dashboard/DashboardPage'
import { OverviewPage } from '../features/overview/OverviewPage'
import { ReportsPage } from '../features/reports/ReportsPage'
import { SalesPage } from '../features/sales/SalesPage'
import { SettingsPage } from '../features/settings/SettingsPage'
import { StudioPage } from '../features/studio/StudioPage'

export const router = createBrowserRouter([
  {
    element: <ProtectedRoute />,
    children: [
      {
        path: '/',
        element: <AppShell />,
        children: [
          { index: true, element: <Navigate replace to="/dashboard" /> },
          { path: 'dashboard', element: <DashboardPage /> },
          { path: 'clients', element: <ClientsPage /> },
          {
            element: <ProtectedRoute allowedRoles={['owner']} />,
            children: [
              { path: 'overview', element: <OverviewPage /> },
              { path: 'sales', element: <SalesPage /> },
              { path: 'reports', element: <ReportsPage /> },
              { path: 'studio', element: <StudioPage /> },
              { path: 'settings', element: <SettingsPage /> },
              { path: 'calendar', element: <CalendarPage /> },
            ],
          },
        ],
      },
    ],
  },
  { path: '/login', element: <LoginPage /> },
  { path: '*', element: <Navigate replace to="/" /> },
])
