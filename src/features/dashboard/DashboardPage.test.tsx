import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../auth/authContext'
import type { AppRole } from '../auth/types'
import { DashboardPage } from './DashboardPage'
import { useSaleStore } from './saleStore'
import * as service from './transactionService'
import * as clientService from '../clients/clientService'
import type { DashboardTransaction } from './transactionModel'

vi.mock('./transactionService')
vi.mock('../clients/clientService')

const transaction: DashboardTransaction = {
  id: 'tx-1',
  reference_code: 'TXN-260905-000001',
  status: 'pending',
  client_id: 'client-1',
  client_name: 'Ana Cruz',
  recorded_by_name: 'Test Staff',
  created_at: '2026-09-05T02:00:00Z',
  updated_at: '2026-09-05T02:00:00Z',
  items: [
    {
      id: 'item-1',
      item_type: 'product',
      product_id: 'product-1',
      service_id: null,
      name: 'Titanium Stud',
      unit_price: 500,
      quantity: 1,
    },
  ],
  total: 500,
  has_waiver: false,
  payment_count: 0,
}

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open')
  }
})

beforeEach(() => {
  vi.resetAllMocks()
  useSaleStore.getState().reset()
  vi.mocked(service.listTransactions).mockResolvedValue([transaction])
  vi.mocked(service.searchClients).mockResolvedValue([
    { id: 'client-1', full_name: 'Ana Cruz', email: null, phone: null },
  ])
  vi.mocked(service.listActiveCatalog).mockImplementation(async (kind) =>
    kind === 'service'
      ? [{ id: 'service-1', name: 'Lobe Piercing', price: 800, active: true }]
      : [{ id: 'product-1', name: 'Titanium Stud', price: 500, active: true }],
  )
  vi.mocked(service.recordProductSale).mockResolvedValue({
    id: 'tx-2',
    reference_code: 'TXN-260905-000002',
  })
  vi.mocked(service.updateTransactionStatus).mockResolvedValue({ id: 'tx-1' })
  vi.mocked(service.finalizeTransaction).mockResolvedValue({
    id: 'tx-1',
    reference_code: transaction.reference_code,
  })
  vi.mocked(clientService.findDuplicates).mockResolvedValue({ rows: [], count: 0 })
})

function harness(role: AppRole = 'staff') {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}
    >
      <AuthContext.Provider
        value={{
          account: { id: `${role}-1`, display_name: 'Test Staff', role, status: 'active' },
          status: 'authenticated',
          signIn: vi.fn(),
          signOut: vi.fn(),
        }}
      >
        <DashboardPage />
      </AuthContext.Provider>
    </QueryClientProvider>,
  )
}

async function chooseExistingClient() {
  const dialog = screen.getByRole('dialog', { name: 'Add Transaction' })
  fireEvent.click(await within(dialog).findByRole('button', { name: /Ana Cruz/ }))
}

async function selectItem(kind: 'service' | 'product', name: string) {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(kind === 'service' ? 'Services' : 'Products') }))
  const selector = await screen.findByRole('dialog', {
    name: kind === 'service' ? 'Select Services' : 'Select Products',
  })
  fireEvent.click(await within(selector).findByRole('checkbox', { name: new RegExp(name) }))
  fireEvent.click(within(selector).getByRole('button', { name: 'Done' }))
}

describe('Dashboard transaction workflow', () => {
  it.each(['owner', 'staff'] as const)('loads today’s transactions for %s', async (role) => {
    harness(role)
    expect(await screen.findByText(transaction.reference_code)).toBeVisible()
    expect(screen.getByText('Ana Cruz')).toBeVisible()
    expect(screen.getByText('₱500.00')).toBeVisible()
  })

  it('debounces literal transaction search', async () => {
    harness()
    await screen.findByText(transaction.reference_code)
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search transactions' }), {
      target: { value: '%_(),"' },
    })
    await waitFor(() =>
      expect(service.listTransactions).toHaveBeenCalledWith('%_(),"', expect.any(AbortSignal)),
    )
  })

  it('opens details and performs an RLS-protected status change', async () => {
    harness()
    fireEvent.click(await screen.findByRole('button', { name: /Open transaction/ }))
    const dialog = screen.getByRole('dialog', { name: 'Transaction details' })
    fireEvent.change(within(dialog).getByRole('combobox', { name: 'Completion status' }), {
      target: { value: 'ongoing' },
    })
    await waitFor(() =>
      expect(service.updateTransactionStatus).toHaveBeenCalledWith('tx-1', 'ongoing'),
    )
  })

  it('completes an existing-client product sale through atomic checkout', async () => {
    harness()
    await screen.findByText(transaction.reference_code)
    fireEvent.click(screen.getByRole('button', { name: '+ Add Transaction' }))
    await chooseExistingClient()
    await selectItem('product', 'Titanium Stud')
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    const payment = screen.getByRole('dialog', { name: 'Complete Payment' })
    expect(within(payment).getByText('₱500.00')).toBeVisible()
    fireEvent.click(within(payment).getByRole('button', { name: 'Confirm payment' }))
    await waitFor(() =>
      expect(service.recordProductSale).toHaveBeenCalledWith({
        existingClient: { id: 'client-1', full_name: 'Ana Cruz', email: null, phone: null },
        newClient: { first_name: '', last_name: '', email: '', phone: '' },
        productIds: ['product-1'],
        payment: { method: 'cash', reference: '' },
      }, expect.anything()),
    )
  })

  it('keeps a service draft in-session at the Phase 5 waiver handoff', async () => {
    harness()
    await screen.findByText(transaction.reference_code)
    fireEvent.click(screen.getByRole('button', { name: '+ Add Transaction' }))
    await chooseExistingClient()
    await selectItem('service', 'Lobe Piercing')
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    const waiver = screen.getByRole('dialog', { name: 'Client Consent & Waiver' })
    expect(within(waiver).getByText('Signature required before Pending')).toBeVisible()
    expect(within(waiver).getByText(/Nothing has been written to Supabase/)).toBeVisible()
    expect(service.recordProductSale).not.toHaveBeenCalled()
    expect(useSaleStore.getState().serviceIds).toEqual(['service-1'])
  })

  it('finalizes a signed service transaction with one full payment', async () => {
    const signedServiceTransaction: DashboardTransaction = {
      ...transaction,
      has_waiver: true,
      items: [{
        id: 'item-2',
        item_type: 'service',
        product_id: null,
        service_id: 'service-1',
        name: 'Lobe Piercing',
        unit_price: 800,
        quantity: 1,
      }],
      total: 800,
    }
    vi.mocked(service.listTransactions).mockResolvedValue([signedServiceTransaction])
    harness()
    fireEvent.click(await screen.findByRole('button', { name: /Open transaction/ }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Transaction details' })).getByRole('button', { name: 'Finalize' }))
    const finalize = screen.getByRole('dialog', { name: 'Finalize transaction' })
    fireEvent.click(within(finalize).getByRole('button', { name: 'Proceed to payment' }))
    expect(within(finalize).getByText('₱800.00')).toBeVisible()
    fireEvent.click(within(finalize).getByRole('button', { name: 'Confirm payment' }))
    await waitFor(() =>
      expect(service.finalizeTransaction).toHaveBeenCalledWith({
        transactionId: 'tx-1',
        serviceIds: ['service-1'],
        productIds: [],
        payment: { method: 'cash', reference: '' },
      }, expect.anything()),
    )
  })

  it('blocks finalization when a service transaction has no signed waiver', async () => {
    vi.mocked(service.listTransactions).mockResolvedValue([{
      ...transaction,
      items: [{
        id: 'item-2',
        item_type: 'service',
        product_id: null,
        service_id: 'service-1',
        name: 'Lobe Piercing',
        unit_price: 800,
        quantity: 1,
      }],
      total: 800,
    }])
    harness()
    fireEvent.click(await screen.findByRole('button', { name: /Open transaction/ }))
    const details = screen.getByRole('dialog', { name: 'Transaction details' })
    expect(within(details).getByRole('button', { name: 'Finalize' })).toBeDisabled()
    expect(within(details).getByText(/signed waiver is required/)).toBeVisible()
  })

  it('checks new-client duplicates before product payment', async () => {
    vi.mocked(clientService.findDuplicates).mockResolvedValue({
      rows: [{ id: 'client-1', full_name: 'Ana Cruz', email: null, phone: null }],
      count: 1,
    })
    harness()
    await screen.findByText(transaction.reference_code)
    fireEvent.click(screen.getByRole('button', { name: '+ Add Transaction' }))
    fireEvent.click(screen.getByRole('button', { name: 'Walk-in / New Client' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'first name' }), { target: { value: 'Ana' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'last name' }), { target: { value: 'Cruz' } })
    await selectItem('product', 'Titanium Stud')
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByText('Possible matching clients')).toBeVisible()
    expect(screen.getByRole('button', { name: /Ana Cruz.*Use existing/ })).toBeVisible()
    expect(service.recordProductSale).not.toHaveBeenCalled()
  })
})
