import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { AuthContext } from '../auth/authContext'
import type { AppRole } from '../auth/types'
import { ClientsPage } from './ClientsPage'
import { ClientForm } from './ClientForm'
import * as service from './clientService'
import type { Client } from './clientModel'

vi.mock('./clientService')
const client: Client = {
  id: 'client-1',
  full_name: 'Ana Cruz',
  email: 'ana@example.test',
  phone: null,
  created_by: 'owner',
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
}
const summary = { ...client, transaction_count: 0, last_activity: null }

beforeAll(() => {
  // jsdom does not implement the native dialog top layer. Browser checks cover focus trapping.
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open')
  }
})
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(service.listClients).mockResolvedValue({
    rows: [summary],
    count: 1,
  })
  vi.mocked(service.getClient).mockResolvedValue(client)
  vi.mocked(service.getHistory).mockResolvedValue({ rows: [], count: 0 })
  vi.mocked(service.findDuplicates).mockResolvedValue({ rows: [], count: 0 })
  vi.mocked(service.saveClient).mockResolvedValue(client)
})

function harness(
  content: ReactNode = <ClientsPage />,
  role: AppRole = 'staff',
) {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrap = (children: ReactNode, id = 'account-1', currentRole = role) => (
    <QueryClientProvider client={cache}>
      <AuthContext.Provider
        value={{
          account: {
            id,
            display_name: 'Test account',
            role: currentRole,
            status: 'active',
          },
          status: 'authenticated',
          signIn: vi.fn(),
          signOut: vi.fn(),
        }}
      >
        {children}
      </AuthContext.Provider>
    </QueryClientProvider>
  )
  return { ...render(wrap(content)), cache, wrap }
}

async function submitNew(name = 'New Client') {
  fireEvent.click(screen.getByRole('button', { name: /Add client/i }))
  const dialog = screen.getByRole('dialog', { name: 'Add client' })
  fireEvent.change(within(dialog).getByRole('textbox', { name: 'Full name' }), {
    target: { value: name },
  })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Add client' }))
  await waitFor(() =>
    expect(service.saveClient).toHaveBeenCalled(),
  )
}

describe('Clients workflow', () => {
  it.each(['owner', 'staff'] as const)(
    'loads client records for %s',
    async (role) => {
      harness(<ClientsPage />, role)
      expect(await screen.findByText('Ana Cruz')).toBeVisible()
      expect(screen.getByText('No transactions')).toBeVisible()
    },
  )
  it('opens client details when any part of a client row is selected', async () => {
    harness()
    const row = await screen.findByRole('button', {
      name: 'Open Ana Cruz details',
    })
    fireEvent.click(within(row).getByText('ana@example.test'))
    expect(
      await screen.findByRole('dialog', { name: 'Client details' }),
    ).toBeVisible()
  })
  it('opens client details from the keyboard', async () => {
    harness()
    fireEvent.keyDown(
      await screen.findByRole('button', { name: 'Open Ana Cruz details' }),
      { key: 'Enter' },
    )
    expect(
      await screen.findByRole('dialog', { name: 'Client details' }),
    ).toBeVisible()
  })
  it('debounces literal search and resets the page', async () => {
    vi.mocked(service.listClients).mockResolvedValue({
      rows: [summary],
      count: 60,
    })
    harness()
    fireEvent.click(await screen.findByRole('button', { name: 'Next' }))
    await waitFor(() =>
      expect(service.listClients).toHaveBeenCalledWith(
        '',
        1,
        expect.any(AbortSignal),
      ),
    )
    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: '%_(),"' },
    })
    await waitFor(() =>
      expect(service.listClients).toHaveBeenCalledWith(
        '%_(),"',
        0,
        expect.any(AbortSignal),
      ),
    )
  })
  it('shows a retryable list error and a distinct empty state', async () => {
    vi.mocked(service.listClients)
      .mockRejectedValueOnce(new Error('Unable to load clients.'))
      .mockResolvedValue({ rows: [], count: 0 })
    harness()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to load clients.',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(
      await screen.findByText('Your client book starts here'),
    ).toBeVisible()
  })
  it('validates before submitting to the backend', async () => {
    harness()
    fireEvent.click(screen.getByRole('button', { name: /Add client/i }))
    const dialog = screen.getByRole('dialog', { name: 'Add client' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add client' }))
    expect(
      await screen.findByText('Enter the client’s full name.'),
    ).toBeVisible()
    expect(service.saveClient).not.toHaveBeenCalled()
    expect(service.findDuplicates).not.toHaveBeenCalled()
  })
  it('creates a record with blank contacts as null and opens its details', async () => {
    harness()
    await submitNew('  Ana Cruz  ')
    expect(
      await screen.findByRole('dialog', { name: 'Client details' }),
    ).toBeVisible()
    expect(service.saveClient).toHaveBeenCalledWith(
      { full_name: 'Ana Cruz', email: null, phone: null },
      undefined,
    )
    expect(await screen.findByText('No transactions found.')).toBeVisible()
  })
  it('shows the backend duplicate error without a review step', async () => {
    vi.mocked(service.saveClient).mockRejectedValueOnce(
      new Error('A client with the same name, email, or phone number already exists.'),
    )
    harness()
    await submitNew('Ana Cruz')
    expect(
      await screen.findByText(
        'A client with the same name, email, or phone number already exists.',
      ),
    ).toBeVisible()
    expect(screen.queryByText('Possible matching clients')).not.toBeInTheDocument()
    expect(service.findDuplicates).not.toHaveBeenCalled()
    expect(screen.getByRole('textbox', { name: 'Full name' })).toHaveValue(
      'Ana Cruz',
    )
  })
  it('preserves input after a failed backend save', async () => {
    vi.mocked(service.saveClient).mockRejectedValueOnce(
      new Error('Could not save this client.'),
    )
    harness()
    await submitNew('Ana')
    expect(await screen.findByText('Could not save this client.')).toBeVisible()
    expect(screen.getByRole('textbox', { name: 'Full name' })).toHaveValue(
      'Ana',
    )
    expect(screen.getByRole('textbox', { name: 'Full name' })).toBeEnabled()
  })
  it('submits an edit directly to the backend', async () => {
    harness()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Open Ana Cruz details' }),
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Edit client' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Full name' }), {
      target: { value: 'Ana Reyes' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() =>
      expect(service.saveClient).toHaveBeenCalledWith(
        { full_name: 'Ana Reyes', email: client.email, phone: null },
        client.id,
      ),
    )
    expect(service.findDuplicates).not.toHaveBeenCalled()
  })
  it('preserves an edit when the backend reports a duplicate', async () => {
    vi.mocked(service.saveClient).mockRejectedValueOnce(
      new Error('A client with the same name, email, or phone number already exists.'),
    )
    harness()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Open Ana Cruz details' }),
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Edit client' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Full name' }), {
      target: { value: 'Existing Client' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(
      await screen.findByText(
        'A client with the same name, email, or phone number already exists.',
      ),
    ).toBeVisible()
    expect(screen.getByRole('textbox', { name: 'Full name' })).toHaveValue(
      'Existing Client',
    )
  })
  it('renders snapshot transaction details, exact totals, and recorded payments', async () => {
    vi.mocked(service.getHistory).mockResolvedValue({
      rows: [
        {
          id: 'transaction-1',
          reference_code: null,
          status: 'completed',
          created_at: client.created_at,
          transaction_items: [
            { item_name_snapshot: 'Original item', item_type: 'product' },
          ],
        },
      ],
      count: 1,
    })
    vi.mocked(service.getTransaction).mockResolvedValue({
      id: 'transaction-1',
      reference_code: null,
      status: 'completed',
      created_at: client.created_at,
      transaction_items: [
        {
          id: 'item-1',
          item_name_snapshot: 'Original item',
          item_type: 'product',
          quantity: 3,
          unit_price_snapshot: 0.1,
        },
      ],
      payments: [
        {
          id: 'payment-1',
          amount: 0.3,
          payment_method: 'cash',
          paid_at: client.created_at,
          reference_number: null,
        },
      ],
    })
    harness()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Open Ana Cruz details' }),
    )
    fireEvent.click(
      await screen.findByRole('button', { name: 'transaction-1' }),
    )
    const dialog = await screen.findByRole('dialog', {
      name: 'Transaction details',
    })
    expect(await within(dialog).findByText('Original item')).toBeVisible()
    expect(within(dialog).getByText('Total')).toHaveTextContent('₱0.30')
    expect(within(dialog).getByText('cash')).toBeVisible()
    expect(within(dialog).queryByText(/waiver/i)).not.toBeInTheDocument()
    expect(service.getTransactionWaiver).not.toHaveBeenCalled()
  })
  it('shows a read-only historical waiver for a service transaction', async () => {
    vi.mocked(service.getHistory).mockResolvedValue({
      rows: [
        {
          id: 'transaction-1',
          reference_code: 'TXN-260905-000001',
          status: 'completed',
          created_at: client.created_at,
          transaction_items: [
            { item_name_snapshot: 'Lobe Piercing', item_type: 'service' },
          ],
        },
      ],
      count: 1,
    })
    vi.mocked(service.getTransaction).mockResolvedValue({
      id: 'transaction-1',
      reference_code: 'TXN-260905-000001',
      status: 'completed',
      created_at: client.created_at,
      transaction_items: [
        {
          id: 'item-1',
          item_name_snapshot: 'Lobe Piercing',
          item_type: 'service',
          quantity: 1,
          unit_price_snapshot: 500,
        },
      ],
      payments: [],
    })
    vi.mocked(service.getTransactionWaiver).mockResolvedValue({
      id: 'waiver-1',
      signature_storage_path: 'transactions/transaction-1/signature.png',
      pdf_storage_path: 'transactions/transaction-1/waiver.pdf',
      signed_at: '2026-09-05T09:18:00Z',
      template_version: 3,
    })
    harness()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Open Ana Cruz details' }),
    )
    fireEvent.click(
      await screen.findByRole('button', { name: 'TXN-260905-000001' }),
    )
    const dialog = await screen.findByRole('dialog', {
      name: 'Transaction details',
    })
    expect(await within(dialog).findByText('Template version 3')).toBeVisible()
    expect(within(dialog).getByText(/Signed Sep 5, 2026/)).toBeVisible()
    expect(
      within(dialog).getByRole('button', { name: 'View Waiver PDF' }),
    ).toBeEnabled()
    expect(
      within(dialog).queryByRole('button', { name: /sign/i }),
    ).not.toBeInTheDocument()
  })
  it('keeps service transaction details usable when its waiver is unavailable', async () => {
    vi.mocked(service.getHistory).mockResolvedValue({
      rows: [
        {
          id: 'transaction-1',
          reference_code: 'TXN-260905-000001',
          status: 'completed',
          created_at: client.created_at,
          transaction_items: [
            { item_name_snapshot: 'Helix Piercing', item_type: 'service' },
          ],
        },
      ],
      count: 1,
    })
    vi.mocked(service.getTransaction).mockResolvedValue({
      id: 'transaction-1',
      reference_code: 'TXN-260905-000001',
      status: 'completed',
      created_at: client.created_at,
      transaction_items: [
        {
          id: 'item-1',
          item_name_snapshot: 'Helix Piercing',
          item_type: 'service',
          quantity: 1,
          unit_price_snapshot: 700,
        },
      ],
      payments: [],
    })
    vi.mocked(service.getTransactionWaiver).mockRejectedValue(
      new Error('Could not load this transaction’s waiver.'),
    )
    harness()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Open Ana Cruz details' }),
    )
    fireEvent.click(
      await screen.findByRole('button', { name: 'TXN-260905-000001' }),
    )
    const dialog = await screen.findByRole('dialog', {
      name: 'Transaction details',
    })
    expect(
      await within(dialog).findByText('Waiver record unavailable.'),
    ).toBeVisible()
    expect(within(dialog).getByText('Helix Piercing')).toBeVisible()
    expect(
      within(dialog).queryByRole('button', { name: /waiver/i }),
    ).not.toBeInTheDocument()
  })
  it('handles Escape and restores focus to the opener', async () => {
    harness()
    const opener = screen.getByRole('button', { name: /Add client/i })
    opener.focus()
    fireEvent.click(opener)
    fireEvent(
      screen.getByRole('dialog'),
      new Event('cancel', { cancelable: true }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(opener).toHaveFocus()
  })
  it('closes the client drawer when its backdrop is selected', async () => {
    harness()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Open Ana Cruz details' }),
    )
    const dialog = await screen.findByRole('dialog', { name: 'Client details' })
    fireEvent.pointerDown(dialog, { clientX: 1, clientY: 1 })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
  it('prevents repeated saves and closing while a save is pending', async () => {
    let finish!: (value: Client) => void
    vi.mocked(service.saveClient).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    harness()
    await submitNew()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Adding…' })).toBeDisabled(),
    )
    expect(
      screen.getByRole('button', { name: 'Close Add client' }),
    ).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Adding…' }))
    expect(service.saveClient).toHaveBeenCalledTimes(1)
    await act(async () => finish(client))
  })
  it('does not let a late mutation repopulate or invalidate cache after unmount/logout', async () => {
    let finish!: (value: Client) => void
    vi.mocked(service.saveClient).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    const saved = vi.fn()
    const view = harness(
      <ClientForm onSaved={saved} onCancel={vi.fn()} />,
    )
    fireEvent.change(screen.getByRole('textbox', { name: 'Full name' }), {
      target: { value: 'New Client' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add client' }))
    await waitFor(() => expect(service.saveClient).toHaveBeenCalled())
    const invalidate = vi.spyOn(view.cache, 'invalidateQueries')
    view.unmount()
    view.cache.clear()
    await act(async () => finish(client))
    expect(saved).not.toHaveBeenCalled()
    expect(invalidate).not.toHaveBeenCalled()
    expect(view.cache.getQueryCache().getAll()).toHaveLength(0)
  })
  it('drops selected client and form state when identity changes', async () => {
    const view = harness()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Open Ana Cruz details' }),
    )
    expect(await screen.findByRole('dialog')).toBeVisible()
    view.rerender(view.wrap(<ClientsPage />, 'account-2'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() =>
      expect(
        view.cache
          .getQueryCache()
          .find({ queryKey: ['clients', 'account-2', 'staff', 'list', '', 0] }),
      ).toBeDefined(),
    )
  })
})
