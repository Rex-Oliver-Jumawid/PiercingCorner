import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../auth/authContext'
import { OverviewPage } from './OverviewPage'
import * as overviewQueries from './overviewQueries'
import * as dashboardQueries from '../dashboard/transactionQueries'

vi.mock('./overviewQueries')
vi.mock('../dashboard/transactionQueries')

beforeEach(() => {
  vi.mocked(overviewQueries.useOwnerOverview).mockReturnValue({ isPending: false, isError: false, data: { today_transactions: 3, open_transactions: 1, clients: 12, collected: 1450, active_services: 4, active_products: 3, waiver_template_version: 2 } } as unknown as ReturnType<typeof overviewQueries.useOwnerOverview>)
  vi.mocked(dashboardQueries.useTransactions).mockReturnValue({ isPending: false, isError: false, data: [] } as unknown as ReturnType<typeof dashboardQueries.useTransactions>)
})

describe('OverviewPage', () => {
  it('renders data-backed Owner metrics and readiness', () => {
    render(<AuthContext.Provider value={{ account: { id: 'owner-1', display_name: 'Owner', role: 'owner', status: 'active' }, status: 'authenticated', signIn: vi.fn(), signOut: vi.fn() }}><OverviewPage /></AuthContext.Provider>)
    expect(screen.getAllByText("Today's transactions")).toHaveLength(2)
    expect(screen.getByText('₱1,450.00')).toBeVisible()
    expect(screen.getByText('4 available')).toBeVisible()
    expect(screen.getByText('Template version 2')).toBeVisible()
    expect(screen.getByText('Studio scheduling is not configured')).toBeVisible()
  })
})
