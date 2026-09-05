import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../auth/authContext'
import { SettingsPage } from './SettingsPage'
import * as service from './stationService'

vi.mock('./stationService')

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
})

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(service.listStations).mockResolvedValue([{ id: 'station-1', name: 'Station 1', active: true }])
  vi.mocked(service.saveStation).mockResolvedValue({ id: 'station-1', name: 'Station 1', active: true })
})

function renderPage(role: 'owner' | 'staff' = 'owner') {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><AuthContext.Provider value={{ account: { id: 'account-1', display_name: 'Owner', role, status: 'active' }, status: 'authenticated', signIn: vi.fn(), signOut: vi.fn() }}><SettingsPage /></AuthContext.Provider></QueryClientProvider>)
}

describe('Settings station administration', () => {
  it('lists and edits deactivatable stations for Owners', async () => {
    renderPage()
    expect(await screen.findByText('Station 1')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit station' })
    fireEvent.change(within(dialog).getByRole('combobox', { name: 'Status' }), { target: { value: 'inactive' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(service.saveStation).toHaveBeenCalledWith({ id: 'station-1', name: 'Station 1', active: false }, expect.anything()))
  })

  it('does not mount station administration for Staff', () => {
    renderPage('staff')
    expect(screen.queryByText('Stations')).not.toBeInTheDocument()
    expect(service.listStations).not.toHaveBeenCalled()
  })
})
