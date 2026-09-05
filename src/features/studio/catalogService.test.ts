import { createClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Database } from '../../types/database'
import { getSupabaseClient } from '../../lib/supabase/client'
import { listCatalog, saveCatalog } from './catalogService'

vi.mock('../../lib/supabase/client', () => ({ getSupabaseClient: vi.fn() }))
const fetcher = vi.fn<typeof fetch>()
const testClient = createClient<Database>('https://local.example.test', 'test-key', {
  global: { fetch: fetcher },
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
})

beforeEach(() => {
  fetcher.mockReset()
  vi.mocked(getSupabaseClient).mockReturnValue(testClient)
})

function response(body: unknown, status = 200) {
  fetcher.mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
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

describe('Catalog Supabase service boundary', () => {
  it('loads all owner-visible services in stable active-first order', async () => {
    response([])
    const controller = new AbortController()
    await listCatalog('service', controller.signal)
    const { url, init } = request()
    expect(url.pathname).toBe('/rest/v1/services')
    expect(url.searchParams.get('order')).toBe('active.desc,name.asc,id.asc')
    expect(init?.signal).toBe(controller.signal)
  })

  it('creates a normalized product with an exact two-decimal input', async () => {
    response({ id: 'product-1', name: 'Stud', description: null, price: 500, active: true })
    await saveCatalog('product', {
      name: '  Stud ',
      description: ' ',
      price: '500.00',
      active: true,
    })
    expect(request().url.pathname).toBe('/rest/v1/products')
    expect(request().init?.method).toBe('POST')
    expect(request().body).toEqual({
      name: 'Stud',
      description: null,
      price: 500,
      active: true,
    })
  })

  it('updates only the selected service and preserves deactivation', async () => {
    response({ id: 'service-1', name: 'Lobe', description: null, price: 800, active: false })
    await saveCatalog(
      'service',
      { name: 'Lobe', description: '', price: '800', active: false },
      'service-1',
    )
    expect(request().init?.method).toBe('PATCH')
    expect(request().url.searchParams.get('id')).toBe('eq.service-1')
    expect(request().body.active).toBe(false)
  })

  it('does not send invalid catalog input and hides database details', async () => {
    await expect(
      saveCatalog('service', { name: '', description: '', price: '-1', active: true }),
    ).rejects.toThrow('Check the catalog details')
    expect(fetcher).not.toHaveBeenCalled()

    response({ message: 'SQL policy detail', code: '42501' }, 403)
    await expect(listCatalog('product', new AbortController().signal)).rejects.toThrow(
      'Unable to load products. Please try again.',
    )
  })
})
