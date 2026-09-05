import { useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/useAuth'
import * as service from './transactionService'
import type { CatalogKind } from './transactionModel'
import type { StudioResourceOption } from './transactionModel'

function useDashboardScope() {
  const { account } = useAuth()
  return ['dashboard', account?.id, account?.role] as const
}

export function useTransactions(search: string) {
  const scope = useDashboardScope()
  return useQuery({
    queryKey: [...scope, 'transactions', search],
    queryFn: ({ signal }) => service.listTransactions(search, signal),
  })
}

export function useClientOptions(search: string, enabled: boolean) {
  const scope = useDashboardScope()
  return useQuery({
    queryKey: [...scope, 'client-options', search],
    enabled,
    queryFn: ({ signal }) => service.searchClients(search, signal),
  })
}

export function useActiveCatalog(kind: CatalogKind) {
  const scope = useDashboardScope()
  return useQuery({
    queryKey: [...scope, 'catalog', kind],
    queryFn: ({ signal }) => service.listActiveCatalog(kind, signal),
  })
}

export function useActiveStudioResources(kind: 'piercer' | 'station') {
  const scope = useDashboardScope()
  return useQuery({
    queryKey: [...scope, 'studio-resources', kind],
    queryFn: ({ signal }): Promise<StudioResourceOption[]> => kind === 'piercer'
      ? service.listActivePiercers(signal)
      : service.listActiveStations(signal),
  })
}

export function useDashboardMutation<TVariables, TResult>(
  mutationFn: (variables: TVariables) => Promise<TResult>,
  onSaved?: (result: TResult) => void,
) {
  const scope = useDashboardScope()
  const { account } = useAuth()
  const cache = useQueryClient()
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  return useMutation({
    mutationFn,
    onSuccess: async (result) => {
      if (!mounted.current) return
      await Promise.all([
        cache.invalidateQueries({ queryKey: scope }),
        cache.invalidateQueries({ queryKey: ['clients', account?.id, account?.role] }),
        cache.invalidateQueries({ queryKey: ['overview', account?.id, account?.role] }),
        cache.invalidateQueries({ queryKey: ['sales', account?.id, account?.role] }),
        cache.invalidateQueries({ queryKey: ['reports', account?.id, account?.role] }),
      ])
      if (mounted.current) onSaved?.(result)
    },
  })
}
