import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/useAuth'
import * as service from './settingsService'

function useSettingsScope() {
  const { account } = useAuth()
  return ['settings', account?.id, account?.role] as const
}

export function useSettingsOverview() {
  const scope = useSettingsScope()
  return useQuery({ queryKey: [...scope, 'overview'], queryFn: ({ signal }) => service.getSettingsOverview(signal) })
}

export function useSaveBusinessProfile() {
  const scope = useSettingsScope()
  const cache = useQueryClient()
  return useMutation({ mutationFn: service.saveBusinessProfile, onSuccess: async () => {
    await cache.invalidateQueries({ queryKey: scope })
  } })
}

export function useCreateWaiverTemplate(onSaved: () => void) {
  const scope = useSettingsScope()
  const cache = useQueryClient()
  return useMutation({ mutationFn: service.createWaiverTemplate, onSuccess: async () => {
    await Promise.all([
      cache.invalidateQueries({ queryKey: scope }),
      cache.invalidateQueries({ queryKey: ['dashboard'] }),
    ])
    onSaved()
  } })
}
