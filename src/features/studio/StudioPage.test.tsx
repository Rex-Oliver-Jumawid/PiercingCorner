import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { AuthContext } from '../auth/authContext'
import type { AppRole } from '../auth/types'
import { StudioPage } from './StudioPage'
import * as service from './catalogService'
import * as studioService from './studioService'
import type { CatalogEntry } from './catalogModel'

vi.mock('./catalogService')
vi.mock('./studioService')

const serviceEntry: CatalogEntry = {
  id: 'service-1',
  name: 'Lobe Piercing',
  description: 'Ear piercing',
  price: 800,
  active: true,
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
}
const productEntry: CatalogEntry = {
  ...serviceEntry,
  id: 'product-1',
  name: 'Titanium Stud',
  description: 'Jewelry',
  price: 500,
  active: false,
}

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open')
  }
})

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(service.listCatalog).mockImplementation(async (kind) =>
    kind === 'service' ? [serviceEntry] : [productEntry],
  )
  vi.mocked(service.saveCatalog).mockImplementation(async (kind) =>
    kind === 'service' ? serviceEntry : productEntry,
  )
  vi.mocked(studioService.getStudioConfiguration).mockResolvedValue({
    hours: [
      { weekday: 1, is_open: true, opens_at: '10:00:00', closes_at: '20:00:00' },
      { weekday: 7, is_open: false, opens_at: null, closes_at: null },
    ],
    profiles: [{ id: 'piercer-1', display_name: 'Ana Santos', active: true, default_station_id: 'station-1' }],
    qualifications: [{ piercer_profile_id: 'piercer-1', service_id: 'service-1' }],
    availability: [{ piercer_profile_id: 'piercer-1', weekday: 1, starts_at: '10:00:00', ends_at: '18:00:00' }],
    exceptions: [],
    services: [{ id: 'service-1', name: 'Lobe Piercing', active: true }, { id: 'service-2', name: 'Navel Piercing', active: true }],
    stations: [{ id: 'station-1', name: 'Station 1', active: true }],
  })
  vi.mocked(studioService.saveStudioHour).mockResolvedValue({ weekday: 1, is_open: true, opens_at: '11:00:00', closes_at: '20:00:00' })
  vi.mocked(studioService.savePiercer).mockResolvedValue({ id: 'piercer-1', display_name: 'Ana Santos', active: true, default_station_id: 'station-1' })
  vi.mocked(studioService.replaceQualifications).mockResolvedValue()
  vi.mocked(studioService.saveAvailability).mockResolvedValue()
  vi.mocked(studioService.saveStudioException).mockResolvedValue({ id: 'exception-1', exception_date: '2026-09-08', exception_type: 'closed', opens_at: null, closes_at: null, reason: 'Maintenance', created_at: '', updated_at: '' })
  vi.mocked(studioService.deleteStudioException).mockResolvedValue()
})

function harness(role: AppRole = 'owner', content: ReactNode = <StudioPage />) {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={cache}>
      <AuthContext.Provider
        value={{
          account: { id: 'account-1', display_name: 'Owner', role, status: 'active' },
          status: 'authenticated',
          signIn: vi.fn(),
          signOut: vi.fn(),
        }}
      >
        {content}
      </AuthContext.Provider>
    </QueryClientProvider>,
  )
}

describe('Studio catalog workflow', () => {
  it('shows active and inactive owner catalog rows with exact prices', async () => {
    harness()
    expect(await screen.findByText('Lobe Piercing')).toBeVisible()
    expect(await screen.findByText('Titanium Stud')).toBeVisible()
    expect(screen.getByText('₱800.00')).toBeVisible()
    expect(screen.getByText('Inactive')).toBeVisible()
  })

  it('searches services and products independently', async () => {
    harness()
    await screen.findByText('Lobe Piercing')
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search services' }), {
      target: { value: 'missing' },
    })
    expect(screen.getByText('No services match this search.')).toBeVisible()
    expect(await screen.findByText('Titanium Stud')).toBeVisible()
  })

  it('validates and creates a product without losing entered form values', async () => {
    harness()
    await screen.findByText('Titanium Stud')
    fireEvent.click(screen.getByRole('button', { name: '+ Add product' }))
    const dialog = screen.getByRole('dialog', { name: 'Add product' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }))
    expect(await within(dialog).findByText('Enter a catalog name.')).toBeVisible()
    expect(service.saveCatalog).not.toHaveBeenCalled()

    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Product name' }), {
      target: { value: 'Aftercare Spray' },
    })
    fireEvent.change(within(dialog).getByRole('spinbutton', { name: 'Price (PHP)' }), {
      target: { value: '350.25' },
    })
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Description (optional)' }), {
      target: { value: 'Aftercare' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    await waitFor(() =>
      expect(service.saveCatalog).toHaveBeenCalledWith(
        'product',
        {
          name: 'Aftercare Spray',
          description: 'Aftercare',
          price: '350.25',
          active: true,
        },
        undefined,
      ),
    )
  })

  it('edits and deactivates only the selected service', async () => {
    harness()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Edit service Lobe Piercing' }),
    )
    const dialog = screen.getByRole('dialog', { name: 'Edit service' })
    fireEvent.keyDown(within(dialog).getByRole('combobox', { name: 'Status' }), { key: 'ArrowDown' })
    fireEvent.click(within(dialog).getByRole('option', { name: 'Inactive' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }))
    await waitFor(() =>
      expect(service.saveCatalog).toHaveBeenCalledWith(
        'service',
        expect.objectContaining({ active: false }),
        'service-1',
      ),
    )
  })

  it('does not mount owner catalog actions for Staff', () => {
    harness('staff')
    expect(screen.queryByText('Services & Products')).not.toBeInTheDocument()
    expect(service.listCatalog).not.toHaveBeenCalled()
  })

  it('shows persisted hours, profile qualifications, and availability', async () => {
    harness()
    expect(await screen.findByText('Studio Hours')).toBeVisible()
    expect(screen.getAllByText('Ana Santos').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Station 1').length).toBeGreaterThan(0)
    expect(screen.getAllByText('10:00 AM — 6:00 PM').length).toBeGreaterThan(0)
  })

  it('saves a Studio Hours edit through the scheduling boundary', async () => {
    harness()
    await screen.findByText('Studio Hours')
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0])
    const dialog = screen.getByRole('dialog', { name: 'Edit Studio Hours' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Opens' }))
    fireEvent.change(within(dialog).getByRole('spinbutton', { name: 'Hour' }), { target: { value: '11' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Apply' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(studioService.saveStudioHour).toHaveBeenCalledWith({ weekday: 1, isOpen: true, opensAt: '11:00', closesAt: '20:00' }, expect.anything()))
  })

  it('replaces a profile qualification set atomically', async () => {
    harness()
    await screen.findAllByText('Ana Santos')
    fireEvent.click(screen.getByRole('button', { name: 'Edit services' }))
    const dialog = screen.getByRole('dialog', { name: 'Services Offered' })
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Lobe Piercing' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(studioService.replaceQualifications).toHaveBeenCalledWith('piercer-1', []))
  })

  it('filters a piercer service list without losing selections', async () => {
    harness()
    await screen.findAllByText('Ana Santos')
    fireEvent.click(screen.getByRole('button', { name: 'Edit services' }))
    const dialog = screen.getByRole('dialog', { name: 'Services Offered' })
    fireEvent.change(within(dialog).getByRole('searchbox', { name: 'Search services' }), { target: { value: 'navel' } })
    expect(within(dialog).getByRole('checkbox', { name: 'Navel Piercing' })).toBeVisible()
    expect(within(dialog).queryByRole('checkbox', { name: 'Lobe Piercing' })).not.toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Navel Piercing' }))
    fireEvent.change(within(dialog).getByRole('searchbox', { name: 'Search services' }), { target: { value: 'missing' } })
    expect(within(dialog).getByText('No services match “missing”.')).toBeVisible()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(studioService.replaceQualifications).toHaveBeenCalledWith('piercer-1', ['service-1', 'service-2']))
  })
})
