import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/useAuth'
import * as service from './stationService'

function useSettingsScope() {
  const { account } = useAuth()
  return ['settings', account?.id, account?.role] as const
}

export function useStations() {
  const scope = useSettingsScope()
  return useQuery({ queryKey: [...scope, 'stations'], queryFn: ({ signal }) => service.listStations(signal) })
}

export function useSaveStation(onSaved: () => void) {
  const scope = useSettingsScope()
  const cache = useQueryClient()
  return useMutation({ mutationFn: service.saveStation, onSuccess: async () => {
    await Promise.all([
      cache.invalidateQueries({ queryKey: scope }),
      cache.invalidateQueries({ queryKey: ['studio'] }),
      cache.invalidateQueries({ queryKey: ['dashboard'] }),
    ])
    onSaved()
  } })
}

