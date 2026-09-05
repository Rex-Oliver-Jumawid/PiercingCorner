import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/useAuth'
import * as service from './studioService'

function useStudioScope() {
  const { account } = useAuth()
  return ['studio', account?.id, account?.role] as const
}

export function useStudioConfiguration() {
  const scope = useStudioScope()
  return useQuery({ queryKey: [...scope, 'configuration'], queryFn: ({ signal }) => service.getStudioConfiguration(signal) })
}

export function useStudioMutation<T>(mutationFn: (input: T) => Promise<unknown>) {
  const scope = useStudioScope()
  const cache = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: async () => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: scope }),
        cache.invalidateQueries({ queryKey: ['dashboard'] }),
        cache.invalidateQueries({ queryKey: ['settings'] }),
      ])
    },
  })
}

