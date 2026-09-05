import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../auth/useAuth'
import { listCompletedSales } from '../sales/salesService'
import type { ReportRange } from './reportModel'
import * as service from './reportService'

function useReportScope() {
  const { account } = useAuth()
  return ['reports', account?.id, account?.role] as const
}

export function useReportSummary(range: ReportRange) {
  const scope = useReportScope()
  return useQuery({ queryKey: [...scope, 'summary', range], queryFn: ({ signal }) => service.getReportSummary(range, signal) })
}
export function useReportSales(range: ReportRange, search: string, page: number) {
  const scope = useReportScope()
  return useQuery({ queryKey: [...scope, 'sales', range, search, page], queryFn: ({ signal }) => listCompletedSales({ search, type: 'all', paymentMethod: 'all', fromDate: range.from, toDate: range.to }, page, signal) })
}
export function useTopServices(range: ReportRange) {
  const scope = useReportScope()
  return useQuery({ queryKey: [...scope, 'services', range], queryFn: ({ signal }) => service.getTopServices(range, signal) })
}
export function useWeekdayTraffic(range: ReportRange) {
  const scope = useReportScope()
  return useQuery({ queryKey: [...scope, 'traffic', range], queryFn: ({ signal }) => service.getWeekdayTraffic(range, signal) })
}
