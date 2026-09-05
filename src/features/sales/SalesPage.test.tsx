import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../auth/authContext'
import { SalesPage } from './SalesPage'
import * as queries from './salesQueries'

vi.mock('./salesQueries')

const sale = {
  id: 'sale-1', reference_code: 'TXN-260905-1', client_name: 'Ana Cruz', recorded_by_name: 'Studio Owner',
  completed_at: '2026-09-05T03:00:00Z', items: [{ id: 'item-1', item_type: 'service' as const, name: 'Lobe Piercing', unit_price: 500, quantity: 1 }],
  total: 500, paid: 500, payment_methods: ['cash'], has_service: true, has_product: false, has_waiver: false,
}

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
})

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(queries.useSalesMetrics).mockReturnValue({ isPending: false, isError: false, data: { collected: 500, completed_transactions: 1, service_sales: 1 } } as ReturnType<typeof queries.useSalesMetrics>)
  vi.mocked(queries.useCompletedSales).mockReturnValue({ isPending: false, isError: false, isFetching: false, data: { rows: [sale], count: 1 }, refetch: vi.fn() } as unknown as ReturnType<typeof queries.useCompletedSales>)
  vi.mocked(queries.useCompletedSale).mockReturnValue({ isPending: false, isError: false, data: { ...sale, payments: [{ id: 'payment-1', amount: 500, method: 'cash', reference: null, paid_at: sale.completed_at }] } } as unknown as ReturnType<typeof queries.useCompletedSale>)
  vi.mocked(queries.useSaleWaiver).mockReturnValue({ data: null } as unknown as ReturnType<typeof queries.useSaleWaiver>)
})

function renderPage() {
  return render(<AuthContext.Provider value={{ account: { id: 'owner-1', display_name: 'Owner', role: 'owner', status: 'active' }, status: 'authenticated', signIn: vi.fn(), signOut: vi.fn() }}><SalesPage /></AuthContext.Provider>)
}

describe('SalesPage', () => {
  it('shows data-backed metrics and no Sales date controls', () => {
    renderPage()
    expect(screen.getByText('Collected revenue')).toBeVisible()
    expect(screen.getByText('Service sales')).toBeVisible()
    expect(screen.getByText('TXN-260905-1')).toBeVisible()
    expect(screen.queryByLabelText('From')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('To')).not.toBeInTheDocument()
  })

  it('applies type and payment filters at the server-query boundary', async () => {
    renderPage()
    fireEvent.change(screen.getByLabelText('Item type'), { target: { value: 'service' } })
    fireEvent.change(screen.getByLabelText('Payment method'), { target: { value: 'cash' } })
    await waitFor(() => expect(queries.useCompletedSales).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'service', paymentMethod: 'cash' }), 0))
    const applied = vi.mocked(queries.useCompletedSales).mock.calls.at(-1)?.[0]
    expect(applied).not.toHaveProperty('fromDate')
    expect(applied).not.toHaveProperty('toDate')
  })

  it('opens a read-only completed-sale detail', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Open sale TXN-260905-1' }))
    const dialog = screen.getByRole('dialog', { name: 'Completed sale details' })
    expect(within(dialog).getByText('Immutable item snapshots')).toBeVisible()
    expect(within(dialog).getByText('Recorded payments')).toBeVisible()
    expect(within(dialog).queryByText(/refund|void|delete/i)).not.toBeInTheDocument()
  })
})
