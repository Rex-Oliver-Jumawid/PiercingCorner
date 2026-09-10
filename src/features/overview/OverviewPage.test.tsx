import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext } from '../auth/authContext'
import { OverviewPage } from './OverviewPage'
import * as overviewQueries from './overviewQueries'
import * as dashboardQueries from '../dashboard/transactionQueries'

vi.mock('./overviewQueries')
vi.mock('../dashboard/transactionQueries')

const overviewData = {
  today_transactions: 3, open_transactions: 1, clients: 12, collected: 1450,
  active_services: 4, active_products: 3, waiver_template_version: 2,
  studio_days_configured: 7, studio_open_days: 6,
  studio_is_open_today: true, studio_opens_at_today: '10:00:00',
  studio_closes_at_today: '20:00:00', studio_schedule_source_today: 'recurring',
}

function renderOverview() {
  return render(<MemoryRouter><AuthContext.Provider value={{ account: { id: 'owner-1', display_name: 'Owner', role: 'owner', status: 'active' }, status: 'authenticated', signIn: vi.fn(), signOut: vi.fn() }}><OverviewPage /></AuthContext.Provider></MemoryRouter>)
}

beforeEach(() => {
  vi.mocked(overviewQueries.useOwnerOverview).mockReturnValue({ isPending: false, isError: false, data: overviewData } as unknown as ReturnType<typeof overviewQueries.useOwnerOverview>)
  vi.mocked(dashboardQueries.useTransactions).mockReturnValue({ isPending: false, isError: false, data: [] } as unknown as ReturnType<typeof dashboardQueries.useTransactions>)
})

describe('OverviewPage', () => {
  it('renders data-backed Owner metrics and readiness', () => {
    renderOverview()
    expect(screen.getAllByText("Today's transactions")).toHaveLength(2)
    expect(screen.getByText('₱1,450.00')).toBeVisible()
    expect(screen.getByText('4 available')).toBeVisible()
    expect(screen.getByText('Template version 2')).toBeVisible()
    expect(screen.getByText('6 days open each week')).toBeVisible()
    expect(screen.getByLabelText("Today's studio operating state")).toHaveTextContent('10:00 AM — 8:00 PM')
    expect(screen.getByLabelText("Today's studio operating state")).toHaveTextContent('Recurring schedule')
    expect(screen.queryByRole('button', { name: /configure|edit/i })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to Studio Hours' })).toHaveAttribute('href', '/studio#studio-hours')
    expect(screen.getByRole('link', { name: 'Go to Active services' })).toHaveAttribute('href', '/studio#service-catalog')
    expect(screen.getByRole('link', { name: 'Go to Active products' })).toHaveAttribute('href', '/studio#product-catalog')
    expect(screen.getByRole('link', { name: 'Go to Waiver and Consent' })).toHaveAttribute('href', '/settings#waiver-settings')
  })

  it('distinguishes an intentionally closed week from an incomplete schedule', () => {
    vi.mocked(overviewQueries.useOwnerOverview).mockReturnValue({ isPending: false, isError: false, data: { ...overviewData, today_transactions: 0, open_transactions: 0, clients: 0, collected: 0, active_services: 0, active_products: 0, waiver_template_version: null, studio_open_days: 0, studio_is_open_today: false } } as unknown as ReturnType<typeof overviewQueries.useOwnerOverview>)
    const { rerender } = renderOverview()
    expect(screen.getByText('All 7 days are marked closed')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Go to Studio Hours' })).toHaveTextContent('Closed')

    vi.mocked(overviewQueries.useOwnerOverview).mockReturnValue({ isPending: false, isError: false, data: { ...overviewData, today_transactions: 0, open_transactions: 0, clients: 0, collected: 0, active_services: 0, active_products: 0, waiver_template_version: null, studio_days_configured: 5, studio_open_days: 5 } } as unknown as ReturnType<typeof overviewQueries.useOwnerOverview>)
    rerender(<MemoryRouter><AuthContext.Provider value={{ account: { id: 'owner-1', display_name: 'Owner', role: 'owner', status: 'active' }, status: 'authenticated', signIn: vi.fn(), signOut: vi.fn() }}><OverviewPage /></AuthContext.Provider></MemoryRouter>)
    expect(screen.getByText('5 of 7 days configured')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Go to Studio Hours' })).toHaveTextContent('Action needed')
  })

  it('keeps recurring configuration ready while a temporary schedule controls today', () => {
    vi.mocked(overviewQueries.useOwnerOverview).mockReturnValue({ isPending: false, isError: false, data: { ...overviewData, studio_opens_at_today: '12:00:00', studio_closes_at_today: '18:00:00', studio_schedule_source_today: 'temporary' } } as unknown as ReturnType<typeof overviewQueries.useOwnerOverview>)
    renderOverview()
    expect(screen.getByLabelText("Today's studio operating state")).toHaveTextContent('12:00 PM — 6:00 PM')
    expect(screen.getByLabelText("Today's studio operating state")).toHaveTextContent('Temporary schedule')
    expect(screen.getByRole('link', { name: 'Go to Studio Hours' })).toHaveTextContent('Ready')
  })

  it('shows an exception closure or reduced effective interval without changing setup readiness', () => {
    vi.mocked(overviewQueries.useOwnerOverview).mockReturnValue({ isPending: false, isError: false, data: { ...overviewData, studio_is_open_today: false, studio_opens_at_today: null, studio_closes_at_today: null, studio_schedule_source_today: 'exception' } } as unknown as ReturnType<typeof overviewQueries.useOwnerOverview>)
    const { rerender } = renderOverview()
    expect(screen.getByLabelText("Today's studio operating state")).toHaveTextContent('Closed todayStudio exception')
    expect(screen.getByRole('link', { name: 'Go to Studio Hours' })).toHaveTextContent('Ready')

    vi.mocked(overviewQueries.useOwnerOverview).mockReturnValue({ isPending: false, isError: false, data: { ...overviewData, studio_opens_at_today: '13:00:00', studio_closes_at_today: '17:00:00', studio_schedule_source_today: 'exception' } } as unknown as ReturnType<typeof overviewQueries.useOwnerOverview>)
    rerender(<MemoryRouter><AuthContext.Provider value={{ account: { id: 'owner-1', display_name: 'Owner', role: 'owner', status: 'active' }, status: 'authenticated', signIn: vi.fn(), signOut: vi.fn() }}><OverviewPage /></AuthContext.Provider></MemoryRouter>)
    expect(screen.getByLabelText("Today's studio operating state")).toHaveTextContent('1:00 PM — 5:00 PM')
    expect(screen.getByLabelText("Today's studio operating state")).toHaveTextContent('Studio exception')
  })

  it('uses the existing safe overview error state instead of showing an operational fallback', () => {
    vi.mocked(overviewQueries.useOwnerOverview).mockReturnValue({ isPending: false, isError: true, error: new Error('Unable to load the Owner overview.'), data: undefined } as unknown as ReturnType<typeof overviewQueries.useOwnerOverview>)
    renderOverview()
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to load the Owner overview.')
    expect(screen.queryByLabelText("Today's studio operating state")).not.toBeInTheDocument()
  })
})
