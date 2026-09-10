import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../auth/authContext'
import * as service from './studioService'
import { useConfigureTemporaryPiercerSchedule } from './studioQueries'

vi.mock('./studioService')

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(service.configureTemporaryPiercerSchedule).mockResolvedValue('schedule-1')
})

describe('Studio query mutations', () => {
  it('invalidates the Studio scope and affected operational and Overview queries', async () => {
    const cache = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const invalidate = vi.spyOn(cache, 'invalidateQueries')
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={cache}>
        <AuthContext.Provider value={{
          account: { id: 'owner-1', display_name: 'Owner', role: 'owner', status: 'active' },
          status: 'authenticated', signIn: vi.fn(), signOut: vi.fn(),
        }}>
          {children}
        </AuthContext.Provider>
      </QueryClientProvider>
    )
    const { result } = renderHook(() => useConfigureTemporaryPiercerSchedule(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({
        piercerProfileId: 'piercer-1', startsOn: '2026-09-17', endsOn: '2026-09-20',
        availability: Array.from({ length: 7 }, (_, index) => ({
          weekday: index + 1, is_available: false, mode: null, starts_at: null, ends_at: null,
        })),
      })
    })

    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(4))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['studio', 'owner-1', 'owner'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['dashboard'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['settings'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['overview'] })
  })
})
