import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext } from '../auth/authContext'
import { SettingsPage } from './SettingsPage'
import * as settingsService from './settingsService'
import * as service from './stationService'

vi.mock('./stationService')
vi.mock('./settingsService')

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
})

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(service.listStations).mockResolvedValue([{ id: 'station-1', name: 'Station 1', active: true }])
  vi.mocked(service.saveStation).mockResolvedValue({ id: 'station-1', name: 'Station 1', active: true })
  vi.mocked(settingsService.getSettingsOverview).mockResolvedValue({
    businessProfile: { singleton: true, studio_name: 'Piercing Corner', location: 'Parañaque', address: null, email: null, phone: null, instagram_url: null, timezone: 'Asia/Manila', currency: 'PHP', updated_at: '2026-09-05T00:00:00Z' },
    waiverTemplate: { id: 'template-1', version: 1, body: 'Approved waiver terms.', created_at: '2026-09-05T00:00:00Z' },
    accounts: [{ id: 'account-1', display_name: 'Studio Owner', role: 'owner', status: 'active' }],
  })
  vi.mocked(settingsService.saveBusinessProfile).mockImplementation(async (input) => ({ singleton: true, ...input, timezone: 'Asia/Manila', currency: 'PHP', updated_at: '2026-09-05T00:00:00Z' }))
  vi.mocked(settingsService.createWaiverTemplate).mockResolvedValue({ id: 'template-2', version: 2, body: 'New waiver terms.', created_at: '2026-09-05T00:00:00Z' })
})

function renderPage(role: 'owner' | 'staff' = 'owner') {
  return render(<MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><AuthContext.Provider value={{ account: { id: 'account-1', display_name: 'Owner', role, status: 'active' }, status: 'authenticated', signIn: vi.fn(), signOut: vi.fn() }}><SettingsPage /></AuthContext.Provider></QueryClientProvider></MemoryRouter>)
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
    expect(settingsService.getSettingsOverview).not.toHaveBeenCalled()
  })

  it('saves the business profile and keeps fixed locale settings read-only', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Business Profile' })).toBeVisible()
    fireEvent.change(screen.getByLabelText('Studio email'), { target: { value: 'hello@piercingcorner.test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save business profile' }))
    await waitFor(() => expect(settingsService.saveBusinessProfile).toHaveBeenCalledWith(expect.objectContaining({ email: 'hello@piercingcorner.test' }), expect.anything()))
    expect(screen.getByLabelText('Timezone')).toHaveAttribute('readonly')
    expect(screen.getByLabelText('Currency')).toHaveAttribute('readonly')
  })

  it('creates an append-only waiver version from the editor', async () => {
    renderPage()
    expect(await screen.findByText('Approved waiver terms.')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Edit template' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit waiver template' })
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Waiver text' }), { target: { value: 'New waiver terms.' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create new version' }))
    await waitFor(() => expect(settingsService.createWaiverTemplate).toHaveBeenCalledWith('New waiver terms.', expect.anything()))
  })
})
