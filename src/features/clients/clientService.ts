import { getSupabaseClient } from '../../lib/supabase/client'
import { PAGE_SIZE, validateClient } from './clientModel'
import type { ClientInput, ClientSummary, DuplicateClient } from './clientModel'

export async function listClients(
  search: string,
  page: number,
  signal: AbortSignal,
) {
  const { data, error, count } = await getSupabaseClient()
    .rpc('search_clients', { search_text: search }, { count: 'exact' })
    .order('full_name')
    .order('id')
    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
    .abortSignal(signal)
  if (error) throw new Error('Unable to load clients. Please try again.')
  const rows: ClientSummary[] = (data ?? []).map((row) => {
    if (
      !row.id ||
      !row.full_name ||
      !row.created_by ||
      !row.created_at ||
      !row.updated_at
    ) {
      throw new Error('Unable to read this client record.')
    }
    return {
      ...row,
      id: row.id,
      full_name: row.full_name,
      created_by: row.created_by,
      created_at: row.created_at,
      updated_at: row.updated_at,
      transaction_count: row.transaction_count ?? 0,
    }
  })
  return { rows, count: count ?? 0 }
}

export async function getClient(id: string, signal: AbortSignal) {
  const { data, error } = await getSupabaseClient()
    .from('clients')
    .select('*')
    .eq('id', id)
    .abortSignal(signal)
    .maybeSingle()
  if (error) throw new Error('Unable to load client details. Please try again.')
  return data
}

export async function findDuplicates(
  input: ClientInput,
  excludeId: string | undefined,
  page: number,
  signal: AbortSignal,
): Promise<{ rows: DuplicateClient[]; count: number }> {
  const { data, error, count } = await getSupabaseClient()
    .rpc(
      'find_client_duplicates',
      {
        candidate_name: input.full_name,
        candidate_email: input.email ?? undefined,
        candidate_phone: input.phone ?? undefined,
        exclude_client_id: excludeId,
      },
      { count: 'exact' },
    )
    .order('full_name')
    .order('id')
    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
    .abortSignal(signal)
  if (error) throw new Error('Could not check for matching clients.')
  return { rows: data ?? [], count: count ?? 0 }
}

export async function saveClient(input: ClientInput, id?: string) {
  const { value, errors } = validateClient(input)
  if (Object.keys(errors).length)
    throw new Error('Check the client details before saving.')
  const table = getSupabaseClient().from('clients')
  const request = id ? table.update(value).eq('id', id) : table.insert(value)
  const { data, error } = await request.select('*').single()
  if (error)
    throw new Error(
      'Could not save this client. Your changes have been kept; please try again.',
    )
  return data
}

export async function getHistory(
  clientId: string,
  page: number,
  signal: AbortSignal,
) {
  const { data, error, count } = await getSupabaseClient()
    .from('transactions')
    .select(
      'id, reference_code, status, created_at, transaction_items(item_name_snapshot, item_type)',
      { count: 'exact' },
    )
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
    .abortSignal(signal)
  if (error)
    throw new Error('Unable to load transaction history. Please try again.')
  return { rows: data ?? [], count: count ?? 0 }
}

export async function getTransaction(
  clientId: string,
  id: string,
  signal: AbortSignal,
) {
  const { data, error } = await getSupabaseClient()
    .from('transactions')
    .select(
      'id, reference_code, status, created_at, transaction_items(id, item_name_snapshot, item_type, quantity, unit_price_snapshot), payments(id, amount, payment_method, paid_at, reference_number)',
    )
    .eq('client_id', clientId)
    .eq('id', id)
    .abortSignal(signal)
    .maybeSingle()
  if (error)
    throw new Error('Unable to load transaction details. Please try again.')
  return data
}
