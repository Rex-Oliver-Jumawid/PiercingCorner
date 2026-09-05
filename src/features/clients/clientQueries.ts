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
export function useDuplicates(
  input: ClientInput | null,
  id: string | undefined,
  page: number,
) {
  const scope = useClientScope()
  return useQuery({
    queryKey: [...scope, 'duplicates', input, id, page],
    enabled: input !== null,
    retry: false,
    queryFn: ({ signal }) => {
      if (!input) throw new Error('Client details are required.')
      return service.findDuplicates(input, id, page, signal)
    },
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
