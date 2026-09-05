import { create } from 'zustand'
import type {
  CatalogKind,
  ClientOption,
  NewClientDraft,
  PaymentDraft,
} from './transactionModel'

export type SaleStep =
  | 'details'
  | 'services'
  | 'products'
  | 'duplicate_review'
  | 'waiver'
  | 'payment'
  | 'completed'

interface SaleState {
  open: boolean
  step: SaleStep
  clientMode: 'existing' | 'new'
  existingClient: ClientOption | null
  newClient: NewClientDraft
  serviceIds: string[]
  productIds: string[]
  payment: PaymentDraft
  start: () => void
  reset: () => void
  setStep: (step: SaleStep) => void
  setClientMode: (mode: 'existing' | 'new') => void
  setExistingClient: (client: ClientOption | null) => void
  setNewClient: (client: NewClientDraft) => void
  toggleItem: (kind: CatalogKind, id: string) => void
  clearItems: (kind: CatalogKind) => void
  setPayment: (payment: PaymentDraft) => void
}

const initial = {
  open: false,
  step: 'details' as const,
  clientMode: 'existing' as const,
  existingClient: null,
  newClient: { first_name: '', last_name: '', email: '', phone: '' },
  serviceIds: [] as string[],
  productIds: [] as string[],
  payment: { method: 'cash' as const, reference: '' },
}

export const useSaleStore = create<SaleState>((set) => ({
  ...initial,
  start: () => set({ ...initial, open: true }),
  reset: () => set(initial),
  setStep: (step) => set({ step }),
  setClientMode: (clientMode) =>
    set({ clientMode, existingClient: null, step: 'details' }),
  setExistingClient: (existingClient) => set({ existingClient }),
  setNewClient: (newClient) => set({ newClient }),
  toggleItem: (kind, id) =>
    set((state) => {
      const key = kind === 'service' ? 'serviceIds' : 'productIds'
      const selected = state[key]
      return {
        [key]: selected.includes(id)
          ? selected.filter((selectedId) => selectedId !== id)
          : [...selected, id],
      }
    }),
  clearItems: (kind) =>
    set(kind === 'service' ? { serviceIds: [] } : { productIds: [] }),
  setPayment: (payment) => set({ payment }),
}))

export function hasSaleDraft(state: Pick<
  SaleState,
  'existingClient' | 'newClient' | 'serviceIds' | 'productIds'
>) {
  return Boolean(
    state.existingClient ||
      state.newClient.first_name.trim() ||
      state.newClient.last_name.trim() ||
      state.newClient.email.trim() ||
      state.newClient.phone.trim() ||
      state.serviceIds.length ||
      state.productIds.length,
  )
}
