import { getSupabaseClient } from '../../lib/supabase/client'
import type { Database, Json } from '../../types/database'
import { parseTransactionItems } from './transactionModel'
import type {
  CatalogKind,
  CatalogOption,
  ClientOption,
  DashboardTransaction,
  NewClientDraft,
  PaymentDraft,
  TransactionStatus,
} from './transactionModel'

export async function listTransactions(search: string, signal: AbortSignal) {
  const { data, error } = await getSupabaseClient()
    .rpc('search_dashboard_transactions', { search_text: search })
    .abortSignal(signal)
  if (error) throw new Error('Unable to load today’s transactions. Please try again.')
  return (data ?? []).map((row): DashboardTransaction => ({
    ...row,
    items: parseTransactionItems(row.items),
  }))
}

export async function searchClients(search: string, signal: AbortSignal) {
  const { data, error } = await getSupabaseClient()
    .rpc('search_clients', { search_text: search })
    .order('full_name')
    .order('id')
    .limit(6)
    .abortSignal(signal)
  if (error) throw new Error('Unable to search clients. Please try again.')
  return (data ?? []).flatMap((row): ClientOption[] =>
    row.id && row.full_name
      ? [{ id: row.id, full_name: row.full_name, email: row.email, phone: row.phone }]
      : [],
  )
}

export async function listActiveCatalog(
  kind: CatalogKind,
  signal: AbortSignal,
): Promise<CatalogOption[]> {
  const table = kind === 'service' ? 'services' : 'products'
  const { data, error } = await getSupabaseClient()
    .from(table)
    .select('id, name, price, active')
    .eq('active', true)
    .order('name')
    .order('id')
    .abortSignal(signal)
  if (error) throw new Error(`Unable to load ${kind}s. Please try again.`)
  return data ?? []
}

export async function updateTransactionStatus(
  id: string,
  status: Exclude<TransactionStatus, 'completed'>,
) {
  const { data, error } = await getSupabaseClient()
    .from('transactions')
    .update({ status })
    .eq('id', id)
    .in('status', ['pending', 'ongoing'])
    .select('id')
    .maybeSingle()
  if (error || !data) throw new Error('Could not update this transaction. Refresh and try again.')
  return data
}

export async function recordProductSale(input: {
  existingClient: ClientOption | null
  newClient: NewClientDraft
  productIds: string[]
  payment: PaymentDraft
}) {
  const clientDetails: Json = input.existingClient
    ? { existing_client_id: input.existingClient.id }
    : {
        full_name: `${input.newClient.first_name.trim()} ${input.newClient.last_name.trim()}`,
        email: input.newClient.email.trim() || null,
        phone: input.newClient.phone.trim() || null,
      }
  const { data, error } = await getSupabaseClient().rpc('record_product_sale', {
    client_details: clientDetails,
    selected_product_ids: input.productIds,
    selected_payment_method: input.payment.method,
    payment_reference: input.payment.reference.trim(),
  })
  if (error || !data?.[0]) {
    throw new Error('Could not complete this sale. Your draft has been kept; please try again.')
  }
  return data[0]
}

export async function finalizeTransaction(input: {
  transactionId: string
  serviceIds: string[]
  productIds: string[]
  payment: PaymentDraft
}) {
  const { data, error } = await getSupabaseClient().rpc('finalize_transaction', {
    target_transaction_id: input.transactionId,
    selected_service_ids: input.serviceIds,
    selected_product_ids: input.productIds,
    selected_payment_method: input.payment.method,
    payment_reference: input.payment.reference.trim(),
  })
  if (error || !data?.[0]) {
    throw new Error('Could not finalize this transaction. Review it and try again.')
  }
  return data[0]
}

export type PaymentMethod = Database['public']['Enums']['payment_method']
