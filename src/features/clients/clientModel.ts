import type { Database } from '../../types/database'

export type Client = Database['public']['Tables']['clients']['Row']
export type ClientInput = Pick<Client, 'full_name' | 'email' | 'phone'>
export type ClientSummary = Client & {
  transaction_count: number
  last_activity: string | null
}
export type DuplicateClient = Pick<
  Client,
  'id' | 'full_name' | 'email' | 'phone'
>
export type ClientTransactionWaiver =
  Database['public']['Functions']['get_transaction_waiver']['Returns'][number]
export const PAGE_SIZE = 25

export function validateClient(input: ClientInput) {
  const value: ClientInput = {
    full_name: input.full_name.trim(),
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
  }
  const errors: Partial<Record<keyof ClientInput, string>> = {}
  if (!value.full_name) errors.full_name = 'Enter the client’s full name.'
  if (value.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)) {
    errors.email = 'Enter a valid email address.'
  }
  return { value, errors }
}

export function cents(value: number | string): bigint {
  const text = String(value)
  if (!/^\d+(\.\d{1,2})?$/.test(text))
    throw new Error('Invalid monetary amount')
  const [whole, fraction = ''] = text.split('.')
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))
}

export function money(value: bigint) {
  return `₱${(value / 100n).toLocaleString('en-PH')}.${(value % 100n).toString().padStart(2, '0')}`
}

export function dateTime(value: string, withTime = false) {
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...(withTime ? ({ hour: 'numeric', minute: '2-digit' } as const) : {}),
  }).format(new Date(value))
}
