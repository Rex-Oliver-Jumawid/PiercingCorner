import { createClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Database } from '../../types/database'
import { getSupabaseClient } from '../../lib/supabase/client'
import {
  findDuplicates,
  getHistory,
  getTransaction,
  listClients,
  saveClient,
} from './clientService'

vi.mock('../../lib/supabase/client', () => ({ getSupabaseClient: vi.fn() }))
const fetcher = vi.fn<typeof fetch>()
const testClient = createClient<Database>(
  'https://local.example.test',
  'test-key',
  {
    global: { fetch: fetcher },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  },
)
beforeEach(() => {
  fetcher.mockReset()
  vi.mocked(getSupabaseClient).mockReturnValue(testClient)
})
function response(body: unknown, status = 200) {
  fetcher.mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: {
        'Content-Type': 'application/json',
        'Content-Range': '25-49/60',
      },
    }),
  )
}
function request() {
  const [input, init] = fetcher.mock.calls[0]
  return {
    url: new URL(String(input)),
    init,
    body: JSON.parse(String(init?.body ?? '{}')),
  }
}
describe('Clients Supabase service boundary', () => {
  it('passes literal search as an RPC argument, paginates server-side, and forwards cancellation', async () => {
    response([])
    const controller = new AbortController()
    expect(await listClients('%_*(),"', 1, controller.signal)).toEqual({
      rows: [],
      count: 60,
    })
    const { url, body, init } = request()
    expect(url.pathname).toBe('/rest/v1/rpc/search_clients')
    expect(body).toEqual({ search_text: '%_*(),"' })
    expect(url.searchParams.get('offset')).toBe('25')
    expect(url.searchParams.get('limit')).toBe('25')
    expect(url.searchParams.get('order')).toBe('full_name.asc,id.asc')
    expect(init?.signal).toBe(controller.signal)
  })
  it('passes duplicate exclusion and page range without filtering out null contacts', async () => {
    response([{ id: 'match', full_name: 'Ana', email: null, phone: null }])
    const result = await findDuplicates(
      { full_name: 'Ana', email: null, phone: null },
      'current',
      1,
      new AbortController().signal,
    )
    expect(result.rows[0].phone).toBeNull()
    expect(request().body).toEqual({
      candidate_name: 'Ana',
      exclude_client_id: 'current',
    })
    expect(request().url.searchParams.get('offset')).toBe('25')
  })
  it('updates through the atomic backend duplicate boundary', async () => {
    response({ id: 'current', full_name: 'Ana', email: null, phone: null })
    await saveClient({ full_name: ' Ana ', email: ' ', phone: null }, 'current')
    expect(request().url.pathname).toBe('/rest/v1/rpc/update_client')
    expect(request().body).toEqual({
      target_client_id: 'current',
      candidate_name: 'Ana',
    })
  })
  it('creates clients through the atomic backend duplicate boundary', async () => {
    response({ id: 'new', full_name: 'Ana', email: null, phone: '0917' })
    await saveClient({ full_name: ' Ana ', email: ' ', phone: ' 0917 ' })
    expect(request().url.pathname).toBe('/rest/v1/rpc/create_client')
    expect(request().body).toEqual({
      candidate_name: 'Ana',
      candidate_phone: '0917',
    })
  })
  it('maps only a backend duplicate result to the duplicate message', async () => {
    response({ message: 'duplicate_client', code: '23505' }, 409)
    await expect(
      saveClient({ full_name: 'Ana', email: null, phone: null }),
    ).rejects.toThrow(
      'A client with the same name, email, or phone number already exists.',
    )
  })
  it('does not send invalid registration input to the database', async () => {
    await expect(
      saveClient({ full_name: ' ', email: null, phone: null }),
    ).rejects.toThrow('Check the client details')
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('scopes history to the client and orders newest-first with a stable tie-breaker', async () => {
    response([])
    await getHistory('client-1', 2, new AbortController().signal)
    expect(request().url.searchParams.get('client_id')).toBe('eq.client-1')
    expect(request().url.searchParams.get('order')).toBe(
      'created_at.desc,id.desc',
    )
    expect(request().url.searchParams.get('offset')).toBe('50')
  })
  it('requires both client and transaction IDs for transaction details', async () => {
    response(null)
    await getTransaction(
      'client-1',
      'transaction-1',
      new AbortController().signal,
    )
    expect(request().url.searchParams.get('client_id')).toBe('eq.client-1')
    expect(request().url.searchParams.get('id')).toBe('eq.transaction-1')
  })
  it('replaces database errors with safe, actionable messages', async () => {
    response({ message: 'SQL internal detail', code: '42501' }, 403)
    await expect(
      listClients('', 0, new AbortController().signal),
    ).rejects.toThrow('Unable to load clients. Please try again.')
  })
})
