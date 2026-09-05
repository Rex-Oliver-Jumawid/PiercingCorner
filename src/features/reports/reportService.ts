import { getSupabaseClient } from '../../lib/supabase/client'
import { listCompletedSales } from '../sales/salesService'
import type { CompletedSale } from '../sales/salesModel'
import type { ReportRange } from './reportModel'

export async function getReportSummary(range: ReportRange, signal: AbortSignal) {
  const { data, error } = await getSupabaseClient().rpc('get_report_summary', { from_date: range.from, to_date: range.to }).abortSignal(signal).single()
  if (error) throw new Error('Unable to load the report summary. Please try again.')
  return data
}

export async function getTopServices(range: ReportRange, signal: AbortSignal) {
  const { data, error } = await getSupabaseClient().rpc('get_report_top_services', { from_date: range.from, to_date: range.to }).abortSignal(signal)
  if (error) throw new Error('Unable to load top services. Please try again.')
  return data ?? []
}

export async function getWeekdayTraffic(range: ReportRange, signal: AbortSignal) {
  const { data, error } = await getSupabaseClient().rpc('get_report_weekday_traffic', { from_date: range.from, to_date: range.to }).abortSignal(signal)
  if (error) throw new Error('Unable to load customer traffic. Please try again.')
  return data ?? []
}

export async function getAllReportSales(range: ReportRange, search: string): Promise<CompletedSale[]> {
  const rows: CompletedSale[] = []
  const pageSize = 1000
  for (let page = 0; ; page += 1) {
    const result = await listCompletedSales({ search, type: 'all', paymentMethod: 'all', fromDate: range.from, toDate: range.to }, page, new AbortController().signal, pageSize)
    rows.push(...result.rows)
    if (rows.length >= result.count || result.rows.length < pageSize) return rows
  }
}
