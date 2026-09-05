import type { Json } from '../../types/database'
import type { PaymentMethod } from '../dashboard/transactionModel'

export const SALES_PAGE_SIZE = 10
export type SaleTypeFilter = 'all' | 'service' | 'product'

export interface SaleItem {
  id: string
  item_type: 'service' | 'product'
  name: string
  unit_price: number
  quantity: number
}

export interface SalePayment {
  id: string
  amount: number
  method: PaymentMethod
  reference: string | null
  paid_at: string
}

export interface CompletedSale {
  id: string
  reference_code: string
  client_name: string
  recorded_by_name: string
  completed_at: string
  items: SaleItem[]
  total: number
  paid: number
  payment_methods: string[]
  has_service: boolean
  has_product: boolean
  has_waiver: boolean
}

export interface CompletedSaleDetail extends Omit<CompletedSale, 'payment_methods' | 'has_service' | 'has_product'> {
  payments: SalePayment[]
}

export interface SaleFilters {
  search: string
  type: SaleTypeFilter
  paymentMethod: PaymentMethod | 'all'
  fromDate?: string
  toDate?: string
}

export function parseSaleItems(value: Json): SaleItem[] {
  if (!Array.isArray(value)) throw new Error('Unable to read sale items.')
  return value.map((item) => {
    if (!item || Array.isArray(item) || typeof item !== 'object' || typeof item.id !== 'string' ||
      (item.item_type !== 'service' && item.item_type !== 'product') || typeof item.name !== 'string' ||
      typeof item.unit_price !== 'number' || typeof item.quantity !== 'number') {
      throw new Error('Unable to read sale items.')
    }
    return { id: item.id, item_type: item.item_type, name: item.name, unit_price: item.unit_price, quantity: item.quantity }
  })
}

export function parseSalePayments(value: Json): SalePayment[] {
  if (!Array.isArray(value)) throw new Error('Unable to read sale payments.')
  return value.map((payment) => {
    if (!payment || Array.isArray(payment) || typeof payment !== 'object' || typeof payment.id !== 'string' ||
      typeof payment.amount !== 'number' || typeof payment.paid_at !== 'string' ||
      !['cash', 'gcash', 'maya', 'bank_transfer', 'card', 'other'].includes(String(payment.method))) {
      throw new Error('Unable to read sale payments.')
    }
    return { id: payment.id, amount: payment.amount, method: payment.method as PaymentMethod, reference: typeof payment.reference === 'string' ? payment.reference : null, paid_at: payment.paid_at }
  })
}

export function paymentMethodLabel(methods: string[]) {
  const unique = [...new Set(methods)]
  if (unique.length > 1) return 'Mixed'
  const method = unique[0]
  return method ? ({ cash: 'Cash', gcash: 'GCash', maya: 'Maya', bank_transfer: 'Bank transfer', card: 'Card', other: 'Other' }[method] ?? method) : '—'
}

export function manilaDateTime(value: string) {
  return new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}
