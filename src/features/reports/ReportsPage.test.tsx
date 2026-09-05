import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../auth/authContext'
import { ReportsPage } from './ReportsPage'
import * as queries from './reportQueries'

vi.mock('./reportQueries')
vi.mock('./reportService')

beforeEach(() => {
  vi.mocked(queries.useReportSummary).mockReturnValue({ isPending: false, isError: false, data: { revenue: 1000, completed_transactions: 2, service_transactions: 1, average_customer_visits_per_day: 1, peak_hour: 16, peak_hour_average: 1, average_transaction_value: 500, unique_clients: 2, repeat_clients: 1, repeat_client_rate: 50, product_attach_rate: 100 } } as unknown as ReturnType<typeof queries.useReportSummary>)
  vi.mocked(queries.useReportSales).mockReturnValue({ isPending: false, isError: false, isFetching: false, data: { rows: [], count: 0 } } as unknown as ReturnType<typeof queries.useReportSales>)
  vi.mocked(queries.useTopServices).mockReturnValue({ isError: false, data: [] } as unknown as ReturnType<typeof queries.useTopServices>)
  vi.mocked(queries.useWeekdayTraffic).mockReturnValue({ isError: false, data: [] } as unknown as ReturnType<typeof queries.useWeekdayTraffic>)
})

function renderPage() {
  return render(<AuthContext.Provider value={{ account: { id: 'owner-1', display_name: 'Owner', role: 'owner', status: 'active' }, status: 'authenticated', signIn: vi.fn(), signOut: vi.fn() }}><ReportsPage /></AuthContext.Provider>)
}

describe('ReportsPage', () => {
  it('shows date controls and derivable analytics without studio-hours analytics', () => {
    renderPage()
    expect(screen.getByLabelText('From')).toHaveAttribute('type', 'date')
    expect(screen.getByLabelText('To')).toHaveAttribute('type', 'date')
    expect(screen.getByText('Repeat client rate')).toBeVisible()
    expect(screen.getByText('Product attach rate')).toBeVisible()
    expect(screen.queryByText(/open hour/i)).not.toBeInTheDocument()
  })

  it('rejects a reversed custom range before applying it', () => {
    renderPage()
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-09-10' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-09-01' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(screen.getByRole('alert')).toHaveTextContent(/From date must be on or before/)
  })
})
