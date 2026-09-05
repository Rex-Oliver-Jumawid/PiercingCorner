import { useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/useAuth'
import * as service from './clientService'
import type { Client, ClientInput } from './clientModel'

export function useClientScope() {
  const { account } = useAuth()
  return ['clients', account?.id, account?.role] as const
}
export function useClients(search: string, page: number) {
  const scope = useClientScope()
  return useQuery({
    queryKey: [...scope, 'list', search, page],
    queryFn: ({ signal }) => service.listClients(search, page, signal),
  })
}
export function useClient(id: string) {
  const scope = useClientScope()
  return useQuery({
    queryKey: [...scope, 'detail', id],
    queryFn: ({ signal }) => service.getClient(id, signal),
  })
}
export function useHistory(id: string, page: number) {
  const scope = useClientScope()
  return useQuery({
    queryKey: [...scope, 'history', id, page],
    queryFn: ({ signal }) => service.getHistory(id, page, signal),
  })
}
export function useTransaction(clientId: string, id: string) {
  const scope = useClientScope()
  return useQuery({
    queryKey: [...scope, 'transaction', clientId, id],
    queryFn: ({ signal }) => service.getTransaction(clientId, id, signal),
  })
}
export function useTransactionWaiver(id: string, enabled: boolean) {
  const scope = useClientScope()
  return useQuery({
    queryKey: [...scope, 'transaction-waiver', id],
    enabled,
    queryFn: ({ signal }) => service.getTransactionWaiver(id, signal),
  })
}
export function useCheckDuplicates() {
  return useMutation({
    mutationFn: (input: ClientInput) =>
      service.findDuplicates(input, undefined, 0, new AbortController().signal),
  })
}
export function useSaveClient(onSaved: (client: Client) => void) {
  const scope = useClientScope()
  const cache = useQueryClient()
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  return useMutation({
    mutationFn: ({ input, id }: { input: ClientInput; id?: string }) =>
      service.saveClient(input, id),
    onSuccess: async (client) => {
      // Identity/role changes unmount this feature. Late writes must not touch the new cache.
      if (!mounted.current) return
      await cache.invalidateQueries({ queryKey: scope })
      if (mounted.current) onSaved(client)
    },
  })
}
