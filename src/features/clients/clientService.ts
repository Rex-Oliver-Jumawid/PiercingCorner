import { getSupabaseClient } from '../../lib/supabase/client'
import { PAGE_SIZE, validateClient } from './clientModel'
import type { ClientInput, ClientSummary, DuplicateClient } from './clientModel'
import type { ClientTransactionWaiver } from './clientModel'

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
  const client = getSupabaseClient()
  const request = id
    ? client.rpc('update_client', {
        target_client_id: id,
        candidate_name: value.full_name,
        candidate_email: value.email ?? undefined,
        candidate_phone: value.phone ?? undefined,
      })
    : client.rpc('create_client', {
        candidate_name: value.full_name,
        candidate_email: value.email ?? undefined,
        candidate_phone: value.phone ?? undefined,
      })
  const { data, error } = await request.select('*').single()
  if (error?.code === '23505') {
    throw new Error(
      'A client with the same name, email, or phone number already exists.',
    )
  }
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

export async function getTransactionWaiver(
  transactionId: string,
  signal: AbortSignal,
): Promise<ClientTransactionWaiver | null> {
  const { data, error } = await getSupabaseClient()
    .rpc('get_transaction_waiver', { target_transaction_id: transactionId })
    .abortSignal(signal)
    .maybeSingle()
  if (error) throw new Error('Could not load this transaction’s waiver.')
  return data
}

export async function downloadWaiverPdf(path: string) {
  const { data, error } = await getSupabaseClient().storage
    .from('waiver-documents')
    .download(path)
  if (error) throw new Error('Could not open the waiver PDF.')
  return data
}
