import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../auth/useAuth'
import { getOwnerOverview } from './overviewService'

export function useOwnerOverview() {
  const { account } = useAuth()
  return useQuery({ queryKey: ['overview', account?.id, account?.role, 'metrics'], queryFn: ({ signal }) => getOwnerOverview(signal) })
}
