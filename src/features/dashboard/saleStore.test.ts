import { beforeEach, describe, expect, it } from 'vitest'
import { hasSaleDraft, useSaleStore } from './saleStore'

beforeEach(() => useSaleStore.getState().reset())

describe('record sale state machine', () => {
  it('starts clean, selects unique items, and resets completely', () => {
    useSaleStore.getState().start()
    useSaleStore.getState().toggleItem('product', 'product-1')
    useSaleStore.getState().toggleItem('product', 'product-1')
    useSaleStore.getState().toggleItem('service', 'service-1')
    expect(useSaleStore.getState().productIds).toEqual([])
    expect(useSaleStore.getState().serviceIds).toEqual(['service-1'])
    expect(hasSaleDraft(useSaleStore.getState())).toBe(true)
    useSaleStore.getState().reset()
    expect(useSaleStore.getState().open).toBe(false)
    expect(hasSaleDraft(useSaleStore.getState())).toBe(false)
  })

  it('clears an existing selection when client mode changes', () => {
    useSaleStore.getState().start()
    useSaleStore.getState().setExistingClient({
      id: 'client-1',
      full_name: 'Ana',
      email: null,
      phone: null,
    })
    useSaleStore.getState().setClientMode('new')
    expect(useSaleStore.getState().existingClient).toBeNull()
    expect(useSaleStore.getState().step).toBe('details')
  })
})
