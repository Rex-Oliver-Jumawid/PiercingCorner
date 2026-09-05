import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../auth/authContext'
import type { AppRole } from '../auth/types'
import { DashboardPage } from './DashboardPage'
import { useSaleStore } from './saleStore'
import * as service from './transactionService'
import * as clientService from '../clients/clientService'
import * as waiverPdf from './waiverPdf'
import type { DashboardTransaction } from './transactionModel'

vi.mock('./transactionService')
vi.mock('../clients/clientService')
vi.mock('./waiverPdf', () => ({
  buildWaiverPdf: vi.fn(async () => new Blob(['pdf'], { type: 'application/pdf' })),
}))
vi.mock('./SignaturePad', async () => {
  const React = await import('react')
  return {
    SignaturePad: React.forwardRef(function MockSignaturePad(
      { onInkChange }: { onInkChange: (hasInk: boolean) => void },
      ref: React.ForwardedRef<{ clear: () => void; toPngBlob: () => Promise<Blob> }>,
    ) {
      React.useImperativeHandle(ref, () => ({
        clear: () => onInkChange(false),
        toPngBlob: async () => new Blob(['signature'], { type: 'image/png' }),
      }))
      return <button type="button" aria-label="Draw test signature" onClick={() => onInkChange(true)}>Signature drawing area</button>
    }),
  }
})

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
  vi.mocked(service.listAssignablePiercers).mockResolvedValue([
    { id: 'piercer-1', name: 'Ana Santos', default_station_id: null },
  ])
  vi.mocked(service.listActiveStations).mockResolvedValue([
    { id: 'station-1', name: 'Station 1' },
  ])
  vi.mocked(service.recordProductSale).mockResolvedValue({
    id: 'tx-2',
    reference_code: 'TXN-260905-000002',
  })
  vi.mocked(service.updateTransactionStatus).mockResolvedValue({ id: 'tx-1' })
  vi.mocked(service.finalizeTransaction).mockResolvedValue({
    id: 'tx-1',
    reference_code: transaction.reference_code,
  })
  vi.mocked(service.prepareWaiverSigning).mockResolvedValue({
    event_id: 'event-1',
    transaction_id: null,
    template_id: 'template-1',
    template_version: 1,
    template_body: 'Approved waiver paragraph one.\n\nApproved waiver paragraph two.',
    client_name: null,
    expires_at: '2026-09-05T03:00:00Z',
  })
  vi.mocked(service.getTransactionWaiver).mockResolvedValue(null)
  vi.mocked(service.getRecoverableWaiverSigning).mockResolvedValue(null)
  vi.mocked(service.acceptNewServiceWaiver).mockResolvedValue({
    id: 'tx-2',
    reference_code: 'TXN-260905-000002',
    client_name: 'Ana Cruz',
    created_at: '2026-09-05T03:00:00Z',
    total: 800,
    event_id: 'event-1',
    template_id: 'template-1',
    template_version: 1,
    template_body: 'Approved waiver paragraph one.\n\nApproved waiver paragraph two.',
    signed_at: '2026-09-05T03:01:00Z',
  })
  vi.mocked(service.uploadWaiverDocuments).mockResolvedValue({
    signature: 'transactions/tx-2/waivers/event-1/signature.png',
    pdf: 'transactions/tx-2/waivers/event-1/waiver.pdf',
  })
  vi.mocked(service.finalizeSignedWaiver).mockResolvedValue({
    id: 'event-1', transaction_id: 'tx-2', signed_at: '2026-09-05T03:01:00Z',
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
  const customerSearch = within(dialog).getByRole('textbox', { name: 'Customer' })
  fireEvent.focus(customerSearch)
  fireEvent.change(customerSearch, {
    target: { value: 'Ana' },
  })
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

async function chooseServiceAssignment() {
  const dialog = screen.getByRole('dialog', { name: 'Add Transaction' })
  const piercer = within(dialog).getByRole('textbox', { name: 'Piercer' })
  fireEvent.focus(piercer)
  fireEvent.click(await within(dialog).findByRole('button', { name: 'Ana Santos' }))
  const station = within(dialog).getByRole('textbox', { name: 'Station' })
  fireEvent.focus(station)
  fireEvent.click(await within(dialog).findByRole('button', { name: 'Station 1' }))
}

describe('Dashboard transaction workflow', () => {
  it('shows client choices when the customer search receives focus', async () => {
    harness()
    await screen.findByText(transaction.reference_code)
    fireEvent.click(screen.getByRole('button', { name: /Add Transaction/i }))

    const dialog = screen.getByRole('dialog', { name: 'Add Transaction' })
    expect(within(dialog).queryByRole('listbox', { name: 'Customer results' })).not.toBeInTheDocument()
    expect(service.searchClients).not.toHaveBeenCalled()

    fireEvent.focus(within(dialog).getByRole('textbox', { name: 'Customer' }))
    expect(await within(dialog).findByRole('listbox', { name: 'Customer results' })).toBeVisible()
    expect(service.searchClients).toHaveBeenCalledWith('', expect.any(AbortSignal))
  })

  it('opens item choices above the unchanged Add Transaction modal', async () => {
    harness()
    await screen.findByText(transaction.reference_code)
    fireEvent.click(screen.getByRole('button', { name: /Add Transaction/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Services' }))

    expect(screen.getByRole('dialog', { name: 'Add Transaction' })).toBeVisible()
    expect(screen.getByRole('dialog', { name: 'Select Services' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Create Transaction Preview' })).toBeVisible()
  })

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

  it('confirms transaction cancellation with the designed dialog', async () => {
    harness()
    fireEvent.click(await screen.findByRole('button', { name: /Open transaction/ }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Transaction details' })).getByRole('button', { name: 'Cancel' }))

    const confirmation = screen.getByRole('alertdialog', { name: 'Cancel this transaction?' })
    expect(confirmation).toBeVisible()
    expect(service.updateTransactionStatus).not.toHaveBeenCalledWith('tx-1', 'cancelled')
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Cancel transaction' }))

    await waitFor(() => expect(service.updateTransactionStatus).toHaveBeenCalledWith('tx-1', 'cancelled'))
  })

  it('keeps an unfinished sale when the discard dialog is dismissed', async () => {
    harness()
    await screen.findByText(transaction.reference_code)
    fireEvent.click(screen.getByRole('button', { name: /Add Transaction/i }))
    await selectItem('product', 'Titanium Stud')
    fireEvent.click(screen.getByRole('button', { name: 'Close record sale' }))

    const confirmation = screen.getByRole('alertdialog', { name: 'Discard this transaction draft?' })
    expect(confirmation).toBeVisible()
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Keep editing' }))

    expect(screen.getByRole('dialog', { name: 'Add Transaction' })).toBeVisible()
    expect(useSaleStore.getState().productIds).toEqual(['product-1'])
  })

  it('completes an existing-client product sale through atomic checkout', async () => {
    harness()
    await screen.findByText(transaction.reference_code)
    fireEvent.click(screen.getByRole('button', { name: /Add Transaction/i }))
    await chooseExistingClient()
    await selectItem('product', 'Titanium Stud')
    fireEvent.click(screen.getByRole('button', { name: 'Create Transaction Preview' }))
    const payment = screen.getByRole('dialog', { name: 'Complete Payment' })
    expect(within(payment).getByText('₱500.00')).toBeVisible()
    fireEvent.click(within(payment).getByRole('button', { name: 'Complete Payment' }))
    await waitFor(() =>
      expect(service.recordProductSale).toHaveBeenCalledWith({
        existingClient: { id: 'client-1', full_name: 'Ana Cruz', email: null, phone: null },
        newClient: { first_name: '', last_name: '', email: '', phone: '' },
        productIds: ['product-1'],
        payment: { method: 'cash', reference: '' },
      }, expect.anything()),
    )
  })

  it('loads the pinned waiver template for a service sale', async () => {
    harness()
    await screen.findByText(transaction.reference_code)
    fireEvent.click(screen.getByRole('button', { name: /Add Transaction/i }))
    await chooseExistingClient()
    await selectItem('service', 'Lobe Piercing')
    await chooseServiceAssignment()
    fireEvent.click(screen.getByRole('button', { name: 'Create Transaction Preview' }))
    const waiver = screen.getByRole('dialog', { name: 'Client Consent & Waiver' })
    expect(await within(waiver).findByText('Approved waiver paragraph one.')).toBeVisible()
    expect(service.prepareWaiverSigning).toHaveBeenCalledWith()
    expect(service.recordProductSale).not.toHaveBeenCalled()
    expect(useSaleStore.getState().serviceIds).toEqual(['service-1'])
    expect(service.acceptNewServiceWaiver).not.toHaveBeenCalled()
  })

  it('preselects an active default station from the assignable piercer', async () => {
    vi.mocked(service.listAssignablePiercers).mockResolvedValue([
      { id: 'piercer-1', name: 'Ana Santos', default_station_id: 'station-1' },
    ])
    harness()
    await screen.findByText(transaction.reference_code)
    fireEvent.click(screen.getByRole('button', { name: /Add Transaction/i }))
    await chooseExistingClient()
    await selectItem('service', 'Lobe Piercing')
    const dialog = screen.getByRole('dialog', { name: 'Add Transaction' })
    const piercer = within(dialog).getByRole('textbox', { name: 'Piercer' })
    fireEvent.focus(piercer)
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Ana Santos' }))
    expect(within(dialog).getByRole('textbox', { name: 'Station' })).toHaveValue('Station 1')
  })

  it('continues a persisted service waiver directly through payment and completion', async () => {
    harness()
    await screen.findByText(transaction.reference_code)
    fireEvent.click(screen.getByRole('button', { name: /Add Transaction/i }))
    await chooseExistingClient()
    await selectItem('service', 'Lobe Piercing')
    await chooseServiceAssignment()
    fireEvent.click(screen.getByRole('button', { name: 'Create Transaction Preview' }))
    const waiver = screen.getByRole('dialog', { name: 'Client Consent & Waiver' })
    await within(waiver).findByText('Approved waiver paragraph one.')
    fireEvent.click(within(waiver).getByRole('button', { name: 'Draw test signature' }))
    fireEvent.click(within(waiver).getByRole('button', { name: 'Accept Waiver & Continue to Payment' }))

    const payment = await screen.findByRole('dialog', { name: 'Complete Payment' })
    expect(waiverPdf.buildWaiverPdf).toHaveBeenCalledWith(expect.objectContaining({
      templateVersion: 1,
      templateBody: 'Approved waiver paragraph one.\n\nApproved waiver paragraph two.',
      signedAt: '2026-09-05T03:01:00Z',
    }))
    expect(within(payment).getByText(/Waiver signed/)).toBeVisible()
    expect(service.acceptNewServiceWaiver).toHaveBeenCalledWith(expect.objectContaining({
      piercerId: 'piercer-1',
      stationId: 'station-1',
    }))
    fireEvent.click(within(payment).getByRole('button', { name: 'Complete Payment' }))
    await waitFor(() => expect(service.finalizeTransaction).toHaveBeenCalledWith({
      transactionId: 'tx-2',
      serviceIds: ['service-1'],
      productIds: [],
      payment: { method: 'cash', reference: '' },
    }, expect.anything()))
    expect(await screen.findByRole('dialog', { name: 'Sale completed' })).toBeVisible()
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

  it('resumes an accepted signing with its uploaded PNG and fixed timestamp', async () => {
    const unsignedService = {
      ...transaction,
      items: [{
        id: 'item-2',
        item_type: 'service' as const,
        product_id: null,
        service_id: 'service-1',
        name: 'Lobe Piercing',
        unit_price: 800,
        quantity: 1,
      }],
      total: 800,
    }
    vi.mocked(service.listTransactions).mockResolvedValue([unsignedService])
    vi.mocked(service.getRecoverableWaiverSigning).mockResolvedValue({
      id: 'tx-1',
      reference_code: transaction.reference_code,
      client_name: 'Ana Cruz',
      created_at: transaction.created_at,
      total: 800,
      event_id: 'event-recovered',
      template_id: 'template-pinned',
      template_version: 1,
      template_body: 'Pinned recovery terms.',
      signed_at: '2026-09-05T03:01:00Z',
    })
    vi.mocked(service.downloadSignaturePng).mockResolvedValue(new Blob(['signature'], { type: 'image/png' }))
    vi.mocked(service.uploadWaiverDocuments).mockResolvedValue({
      signature: 'transactions/tx-1/waivers/event-recovered/signature.png',
      pdf: 'transactions/tx-1/waivers/event-recovered/waiver.pdf',
    })

    harness()
    fireEvent.click(await screen.findByRole('button', { name: /Open transaction/ }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Transaction details' })).getByRole('button', { name: 'Sign Waiver' }))
    const waiver = await screen.findByRole('dialog', { name: 'Client Consent & Waiver' })
    expect(within(waiver).getByText(/uploaded signature and server signing time were recovered/)).toBeVisible()
    expect(within(waiver).getByText(/accepted event does not expire/)).toBeVisible()
    fireEvent.click(within(waiver).getByRole('button', { name: 'Retry waiver persistence' }))

    const payment = await screen.findByRole('dialog', { name: 'Finalize transaction' })
    expect(within(payment).getByRole('heading', { name: 'Complete Payment' })).toBeVisible()
    expect(service.acceptExistingTransactionWaiver).not.toHaveBeenCalled()
    expect(service.finalizeSignedWaiver).toHaveBeenCalledWith({
      eventId: 'event-recovered',
      signaturePath: 'transactions/tx-1/waivers/event-recovered/signature.png',
      pdfPath: 'transactions/tx-1/waivers/event-recovered/waiver.pdf',
    })
  })

  it('checks new-client duplicates before product payment', async () => {
    vi.mocked(clientService.findDuplicates).mockResolvedValue({
      rows: [{ id: 'client-1', full_name: 'Ana Cruz', email: null, phone: null }],
      count: 1,
    })
    harness()
    await screen.findByText(transaction.reference_code)
    fireEvent.click(screen.getByRole('button', { name: /Add Transaction/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Walk-in / New Client' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'first name' }), { target: { value: 'Ana' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'last name' }), { target: { value: 'Cruz' } })
    await selectItem('product', 'Titanium Stud')
    fireEvent.click(screen.getByRole('button', { name: 'Create Transaction Preview' }))
    expect(await screen.findByText('Possible matching clients')).toBeVisible()
    expect(screen.getByRole('button', { name: /Ana Cruz.*Use existing/ })).toBeVisible()
    expect(service.recordProductSale).not.toHaveBeenCalled()
  })

  it('takes a new service client with no matches directly to the waiver', async () => {
    harness()
    await screen.findByText(transaction.reference_code)
    fireEvent.click(screen.getByRole('button', { name: /Add Transaction/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Walk-in / New Client' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'first name' }), { target: { value: 'Bea' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'last name' }), { target: { value: 'Reyes' } })
    await selectItem('service', 'Lobe Piercing')
    await chooseServiceAssignment()
    fireEvent.click(screen.getByRole('button', { name: 'Create Transaction Preview' }))

    expect(await screen.findByRole('dialog', { name: 'Client Consent & Waiver' })).toBeVisible()
    expect(screen.queryByRole('dialog', { name: 'Review Client Match' })).not.toBeInTheDocument()
    expect(clientService.findDuplicates).toHaveBeenCalledWith(
      { full_name: 'Bea Reyes', email: null, phone: null },
      undefined,
      0,
      expect.any(AbortSignal),
    )
  })
})
