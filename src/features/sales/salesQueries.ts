import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../auth/useAuth'
import * as service from './salesService'
import type { SaleFilters } from './salesModel'

function useSalesScope() {
  const { account } = useAuth()
  return ['sales', account?.id, account?.role] as const
}

export function useSalesMetrics() {
  const scope = useSalesScope()
  return useQuery({ queryKey: [...scope, 'metrics'], queryFn: ({ signal }) => service.getSalesMetrics(signal) })
}

export function useCompletedSales(filters: SaleFilters, page: number) {
  const scope = useSalesScope()
  return useQuery({ queryKey: [...scope, 'list', filters, page], queryFn: ({ signal }) => service.listCompletedSales(filters, page, signal) })
}

export function useCompletedSale(id: string) {
  const scope = useSalesScope()
  return useQuery({ queryKey: [...scope, 'detail', id], queryFn: ({ signal }) => service.getCompletedSale(id, signal) })
}

export function useSaleWaiver(id: string, enabled: boolean) {
  const scope = useSalesScope()
  return useQuery({ queryKey: [...scope, 'waiver', id], enabled, queryFn: ({ signal }) => service.getSaleWaiver(id, signal) })
}
