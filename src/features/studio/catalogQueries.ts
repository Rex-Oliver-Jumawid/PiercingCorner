import { useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/useAuth'
import * as service from './catalogService'
import type { CatalogDraft, CatalogEntry, CatalogKind } from './catalogModel'

function useCatalogScope() {
  const { account } = useAuth()
  return ['studio', 'catalog', account?.id, account?.role] as const
}

export function useCatalog(kind: CatalogKind) {
  const scope = useCatalogScope()
  return useQuery({
    queryKey: [...scope, kind],
    queryFn: ({ signal }) => service.listCatalog(kind, signal),
  })
}

export function useSaveCatalog(onSaved: (entry: CatalogEntry) => void) {
  const scope = useCatalogScope()
  const cache = useQueryClient()
  const mounted = useRef(false)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  return useMutation({
    mutationFn: ({
      kind,
      draft,
      id,
    }: {
      kind: CatalogKind
      draft: CatalogDraft
      id?: string
    }) => service.saveCatalog(kind, draft, id),
    onSuccess: async (entry) => {
      if (!mounted.current) return
      await cache.invalidateQueries({ queryKey: scope })
      if (mounted.current) onSaved(entry)
    },
  })
}
