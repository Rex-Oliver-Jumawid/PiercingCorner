import { getSupabaseClient } from '../../lib/supabase/client'
import { parseSaleItems, parseSalePayments, SALES_PAGE_SIZE } from './salesModel'
import type { CompletedSale, CompletedSaleDetail, SaleFilters } from './salesModel'

export async function getSalesMetrics(signal: AbortSignal) {
  const { data, error } = await getSupabaseClient().rpc('get_sales_metrics').abortSignal(signal).single()
  if (error) throw new Error('Unable to load sales metrics. Please try again.')
  return data
}

export async function listCompletedSales(filters: SaleFilters, page: number, signal: AbortSignal, pageSize = SALES_PAGE_SIZE) {
  const { data, error, count } = await getSupabaseClient().rpc('search_completed_sales', {
    search_text: filters.search,
    sale_type: filters.type,
    payment_method_filter: filters.paymentMethod === 'all' ? undefined : filters.paymentMethod,
    from_date: filters.fromDate,
    to_date: filters.toDate,
  }, { count: 'exact' }).range(page * pageSize, (page + 1) * pageSize - 1).abortSignal(signal)
  if (error) throw new Error('Unable to load completed sales. Please try again.')
  return {
    rows: (data ?? []).map((row): CompletedSale => ({ ...row, reference_code: row.reference_code || 'Unreferenced transaction', items: parseSaleItems(row.items) })),
    count: count ?? 0,
  }
}

export async function getCompletedSale(id: string, signal: AbortSignal): Promise<CompletedSaleDetail | null> {
  const { data, error } = await getSupabaseClient().rpc('get_completed_sale', { target_transaction_id: id }).abortSignal(signal).maybeSingle()
  if (error) throw new Error('Unable to load sale details. Please try again.')
  return data ? { ...data, reference_code: data.reference_code || 'Unreferenced transaction', items: parseSaleItems(data.items), payments: parseSalePayments(data.payments) } : null
}

export async function getSaleWaiver(transactionId: string, signal: AbortSignal) {
  const { data, error } = await getSupabaseClient().rpc('get_transaction_waiver', { target_transaction_id: transactionId }).abortSignal(signal).maybeSingle()
  if (error) throw new Error('Unable to load the signed waiver.')
  return data
}

export async function downloadSaleWaiver(path: string) {
  const { data, error } = await getSupabaseClient().storage.from('waiver-documents').download(path)
  if (error) throw new Error('Unable to download the signed waiver PDF.')
  return data
}
