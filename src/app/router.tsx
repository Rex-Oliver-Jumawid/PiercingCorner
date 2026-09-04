import { Navigate, createBrowserRouter } from 'react-router-dom'

import { AppShell } from '../components/layout/AppShell'
import { LoginPage } from '../features/auth/LoginPage'
import { ClientsPage } from '../features/clients/ClientsPage'
import { DashboardPage } from '../features/dashboard/DashboardPage'
import { ReportsPage } from '../features/reports/ReportsPage'
import { SalesPage } from '../features/sales/SalesPage'
import { SettingsPage } from '../features/settings/SettingsPage'
import { StudioPage } from '../features/studio/StudioPage'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate replace to="/dashboard" /> },
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'clients', element: <ClientsPage /> },
      { path: 'sales', element: <SalesPage /> },
      { path: 'reports', element: <ReportsPage /> },
      { path: 'studio', element: <StudioPage /> },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
  { path: '/login', element: <LoginPage /> },
  { path: '*', element: <Navigate replace to="/dashboard" /> },
])
