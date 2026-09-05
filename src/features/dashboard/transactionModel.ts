import type { Database, Json } from '../../types/database'
import type { CatalogKind } from '../catalog/catalogModel'

export type { CatalogKind, CatalogOption } from '../catalog/catalogModel'

export type TransactionStatus = Database['public']['Enums']['transaction_status']
export type PaymentMethod = Database['public']['Enums']['payment_method']

export interface TransactionItem {
  id: string
  item_type: CatalogKind
  service_id: string | null
  product_id: string | null
  name: string
  unit_price: number
  quantity: number
}

export interface DashboardTransaction {
  id: string
  reference_code: string
  status: TransactionStatus
  client_id: string
  client_name: string
  recorded_by_name: string
  created_at: string
  updated_at: string
  items: TransactionItem[]
  total: number
  has_waiver: boolean
  payment_count: number
}

export interface ClientOption {
  id: string
  full_name: string
  email: string | null
  phone: string | null
}

export interface StudioResourceOption {
  id: string
  name: string
  default_station_id?: string | null
}

export interface NewClientDraft {
  first_name: string
  last_name: string
  email: string
  phone: string
}

export interface PaymentDraft {
  method: PaymentMethod
  reference: string
}

export interface WaiverPreparation {
  event_id: string
  transaction_id: string | null
  template_id: string
  template_version: number
  template_body: string
  client_name: string | null
  expires_at: string
}

export interface AcceptedWaiverSigning {
  id: string
  reference_code: string
  client_name: string
  created_at: string
  total: number
  event_id: string
  template_id: string
  template_version: number
  template_body: string
  signed_at: string
}

export interface TransactionWaiver {
  id: string
  signature_storage_path: string
  pdf_storage_path: string
  signed_at: string
  template_version: number
}

export function parseTransactionItems(value: Json): TransactionItem[] {
  if (!Array.isArray(value)) throw new Error('Unable to read transaction items.')
  return value.map((item) => {
    if (
      !item ||
      Array.isArray(item) ||
      typeof item !== 'object' ||
      typeof item.id !== 'string' ||
      (item.item_type !== 'service' && item.item_type !== 'product') ||
      typeof item.name !== 'string' ||
      typeof item.unit_price !== 'number' ||
      typeof item.quantity !== 'number'
    ) {
      throw new Error('Unable to read transaction items.')
    }
    return {
      id: item.id,
      item_type: item.item_type,
      service_id: typeof item.service_id === 'string' ? item.service_id : null,
      product_id: typeof item.product_id === 'string' ? item.product_id : null,
      name: item.name,
      unit_price: item.unit_price,
      quantity: item.quantity,
    }
  })
}

export function validateNewClient(client: NewClientDraft) {
  const firstName = client.first_name.trim()
  const lastName = client.last_name.trim()
  const email = client.email.trim()
  const phone = client.phone.trim()
  const errors: Partial<Record<keyof NewClientDraft, string>> = {}
  if (!firstName) errors.first_name = 'Enter the first name.'
  if (!lastName) errors.last_name = 'Enter the last name.'
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = 'Enter a valid email address.'
  }
  return {
    value: {
      full_name: `${firstName} ${lastName}`.trim(),
      email: email || null,
      phone: phone || null,
    },
    errors,
  }
}

export function validatePayment(payment: PaymentDraft) {
  if (payment.method !== 'cash' && !payment.reference.trim()) {
    return 'Enter the payment reference number.'
  }
  return null
}

export function formatMoney(value: number) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  }).format(value)
}

export function formatManilaTime(value: string) {
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}
