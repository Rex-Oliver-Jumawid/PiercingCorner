import { createClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSupabaseClient } from '../../lib/supabase/client'
import type { Database } from '../../types/database'
import {
  finalizeTransaction,
  listTransactions,
  recordProductSale,
  updateTransactionStatus,
} from './transactionService'

vi.mock('../../lib/supabase/client', () => ({ getSupabaseClient: vi.fn() }))
const fetcher = vi.fn<typeof fetch>()
const client = createClient<Database>('https://local.example.test', 'key', {
  global: { fetch: fetcher },
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})

beforeEach(() => {
  fetcher.mockReset()
  vi.mocked(getSupabaseClient).mockReturnValue(client)
})

function response(body: unknown, status = 200) {
  fetcher.mockResolvedValueOnce(new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  }))
}

function request() {
  const [input, init] = fetcher.mock.calls[0]
  return {
    url: new URL(String(input)),
    init,
    body: JSON.parse(String(init?.body ?? '{}')),
  }
}

describe('transaction Supabase service boundary', () => {
  it('passes literal dashboard search and cancellation to its RPC', async () => {
    response([])
    const controller = new AbortController()
    await listTransactions('%_(),"', controller.signal)
    expect(request().url.pathname).toBe('/rest/v1/rpc/search_dashboard_transactions')
    expect(request().body).toEqual({ search_text: '%_(),"' })
    expect(request().init?.signal).toBe(controller.signal)
  })

  it('sends only client choice, product IDs, and payment facts to atomic checkout', async () => {
    response([{ id: 'tx-1', reference_code: 'TXN-1' }])
    await recordProductSale({
      existingClient: { id: 'client-1', full_name: 'Ana', email: null, phone: null },
      newClient: { first_name: '', last_name: '', email: '', phone: '' },
      productIds: ['product-1'],
      payment: { method: 'cash', reference: 'ignored' },
    })
    expect(request().url.pathname).toBe('/rest/v1/rpc/record_product_sale')
    expect(request().body).toEqual({
      client_details: { existing_client_id: 'client-1' },
      selected_product_ids: ['product-1'],
      selected_payment_method: 'cash',
      payment_reference: 'ignored',
    })
  })

  it('sends selected catalog IDs to atomic finalization without prices or totals', async () => {
    response([{ id: 'tx-1', reference_code: 'TXN-1' }])
    await finalizeTransaction({
      transactionId: 'tx-1',
      serviceIds: ['service-1'],
      productIds: ['product-1'],
      payment: { method: 'gcash', reference: ' REF ' },
    })
    expect(request().body).toEqual({
      target_transaction_id: 'tx-1',
      selected_service_ids: ['service-1'],
      selected_product_ids: ['product-1'],
      selected_payment_method: 'gcash',
      payment_reference: 'REF',
    })
  })

  it('updates only open transactions and replaces backend errors', async () => {
    response([{ id: 'tx-1' }])
    await updateTransactionStatus('tx-1', 'cancelled')
    expect(request().url.searchParams.get('id')).toBe('eq.tx-1')
    expect(request().url.searchParams.get('status')).toBe('in.(pending,ongoing)')

    fetcher.mockReset()
    response({ message: 'SQL internals', code: '42501' }, 403)
    await expect(listTransactions('', new AbortController().signal)).rejects.toThrow(
      'Unable to load today’s transactions. Please try again.',
    )
  })
})
