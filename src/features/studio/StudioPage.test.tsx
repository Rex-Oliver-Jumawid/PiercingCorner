import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext } from '../auth/authContext'
import type { AppRole } from '../auth/types'
import { StudioPage } from './StudioPage'
import * as service from './catalogService'
import * as studioService from './studioService'
import type { CatalogEntry } from './catalogModel'
import type { StudioConfiguration } from './studioModel'

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

function studioConfiguration(overrides: Partial<StudioConfiguration> = {}): StudioConfiguration {
  return {
    recurringHours: [
      { weekday: 1, is_open: true, opens_at: '10:00:00', closes_at: '20:00:00' },
      { weekday: 7, is_open: false, opens_at: null, closes_at: null },
    ],
    temporarySchedules: [],
    temporaryPiercerSchedules: [],
    effectiveToday: {
      schedule_date: '2026-09-10', weekday: 4, is_open: true,
      opens_at: '10:00:00', closes_at: '20:00:00', source: 'recurring',
      temporary_schedule_id: null, exception_id: null, exception_type: null,
    },
    profiles: [{ id: 'piercer-1', display_name: 'Ana Santos', active: true, default_station_id: 'station-1' }],
    qualifications: [{ piercer_profile_id: 'piercer-1', service_id: 'service-1' }],
    availability: [{ piercer_profile_id: 'piercer-1', weekday: 1, mode: 'custom', starts_at: '10:00:00', ends_at: '18:00:00' }],
    exceptions: [],
    services: [{ id: 'service-1', name: 'Lobe Piercing', active: true }, { id: 'service-2', name: 'Navel Piercing', active: true }],
    stations: [{ id: 'station-1', name: 'Station 1', active: true }],
    ...overrides,
  }
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
  vi.mocked(studioService.getStudioConfiguration).mockResolvedValue(studioConfiguration())
  vi.mocked(studioService.saveRecurringStudioHour).mockResolvedValue({ weekday: 1, is_open: true, opens_at: '11:00:00', closes_at: '20:00:00' })
  vi.mocked(studioService.configureRecurringStudioHours).mockResolvedValue(undefined)
  vi.mocked(studioService.configureTemporaryStudioSchedule).mockResolvedValue('schedule-1')
  vi.mocked(studioService.savePiercer).mockResolvedValue({ id: 'piercer-1', display_name: 'Ana Santos', active: true, default_station_id: 'station-1' })
  vi.mocked(studioService.replaceQualifications).mockResolvedValue()
  vi.mocked(studioService.saveAvailability).mockResolvedValue()
  vi.mocked(studioService.saveStudioException).mockResolvedValue({ id: 'exception-1', exception_date: '2026-09-08', exception_type: 'closed', opens_at: null, closes_at: null, reason: 'Maintenance', created_at: '', updated_at: '' })
  vi.mocked(studioService.deleteStudioException).mockResolvedValue()
})

function harness(role: AppRole = 'owner', content: ReactNode = <StudioPage />, initialEntry = '/studio') {
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
        <MemoryRouter initialEntries={[initialEntry]}>{content}</MemoryRouter>
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

  it('edits recurring availability as Custom Hours', async () => {
    harness()
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Monday availability' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit Piercer Availability' })
    expect(within(dialog).getByRole('combobox', { name: 'Hours source' })).toHaveTextContent('Custom Hours')
    expect(within(dialog).getByRole('button', { name: 'Starts' })).toBeVisible()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(studioService.saveAvailability).toHaveBeenCalledWith({
      piercerId: 'piercer-1', weekday: 1, available: true, mode: 'custom',
      startsAt: '10:00', endsAt: '18:00',
    }, expect.anything()))
  })

  it('persists Same as Studio Hours with null explicit times', async () => {
    harness()
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Monday availability' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit Piercer Availability' })
    fireEvent.keyDown(within(dialog).getByRole('combobox', { name: 'Hours source' }), { key: 'ArrowDown' })
    fireEvent.click(within(dialog).getByRole('option', { name: 'Same as Studio Hours' }))
    expect(within(dialog).queryByRole('button', { name: 'Starts' })).not.toBeInTheDocument()
    expect(within(dialog).getByText(/dynamically follows Effective Studio Hours/)).toBeVisible()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(studioService.saveAvailability).toHaveBeenCalledWith({
      piercerId: 'piercer-1', weekday: 1, available: true, mode: 'studio',
      startsAt: null, endsAt: null,
    }, expect.anything()))
  })

  it('keeps an unavailable weekday represented by deleting its row', async () => {
    harness()
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Monday availability' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit Piercer Availability' })
    fireEvent.keyDown(within(dialog).getByRole('combobox', { name: 'Availability' }), { key: 'ArrowDown' })
    fireEvent.click(within(dialog).getByRole('option', { name: 'Not available' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(studioService.saveAvailability).toHaveBeenCalledWith({
      piercerId: 'piercer-1', weekday: 1, available: false, mode: 'custom',
      startsAt: null, endsAt: null,
    }, expect.anything()))
  })

  it('renders Studio-mode availability without fabricated times', async () => {
    vi.mocked(studioService.getStudioConfiguration).mockResolvedValue(studioConfiguration({
      availability: [{ piercer_profile_id: 'piercer-1', weekday: 1, mode: 'studio', starts_at: null, ends_at: null }],
    }))
    harness()

    expect((await screen.findAllByText('Same as Studio Hours')).length).toBeGreaterThan(0)
  })

  it('focuses a linked catalog section after asynchronous configuration loads', async () => {
    const scrollIntoView = vi.fn()
    HTMLElement.prototype.scrollIntoView = scrollIntoView
    harness('owner', <StudioPage />, '/studio#service-catalog')

    await screen.findByRole('heading', { name: 'Services & pricing' })
    await waitFor(() => expect(document.getElementById('service-catalog')).toHaveFocus())
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
  })

  it('saves a Studio Hours edit through the scheduling boundary', async () => {
    harness()
    await screen.findByText('Studio Hours')
    fireEvent.click(screen.getByRole('button', { name: 'Edit recurring Monday hours' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit Studio Hours' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Opens' }))
    fireEvent.change(within(dialog).getByRole('spinbutton', { name: 'Hour' }), { target: { value: '11' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Apply' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(studioService.saveRecurringStudioHour).toHaveBeenCalledWith({ weekday: 1, isOpen: true, opensAt: '11:00', closesAt: '20:00' }, expect.anything()))
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

describe('Configure Studio Hours workflow', () => {
  it('opens with clear recurring and temporary choices and toggles date fields', async () => {
    harness()
    fireEvent.click(await screen.findByRole('button', { name: 'Configure hours' }))
    const dialog = screen.getByRole('dialog', { name: 'Configure Studio Hours' })

    expect(within(dialog).getByText('Repeats every week until changed.')).toBeVisible()
    expect(within(dialog).getByText('Overrides recurring Studio Hours only for the selected dates.')).toBeVisible()
    expect(within(dialog).queryByRole('button', { name: 'Start date' })).not.toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('radio', { name: /Temporary/ }))
    expect(within(dialog).getByRole('button', { name: 'Start date' })).toBeVisible()
    expect(within(dialog).getByRole('button', { name: 'End date' })).toBeVisible()
  })

  it('submits all seven recurring weekdays atomically with unselected days closed', async () => {
    harness()
    fireEvent.click(await screen.findByRole('button', { name: 'Configure hours' }))
    const dialog = screen.getByRole('dialog', { name: 'Configure Studio Hours' })
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Tue' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save schedule' }))

    await waitFor(() => expect(studioService.configureRecurringStudioHours).toHaveBeenCalledTimes(1))
    const input = vi.mocked(studioService.configureRecurringStudioHours).mock.calls[0][0]
    expect(input.hours).toHaveLength(7)
    expect(input.hours[0]).toEqual({ weekday: 1, is_open: true, opens_at: '10:00', closes_at: '20:00' })
    expect(input.hours[1]).toEqual({ weekday: 2, is_open: true, opens_at: '10:00', closes_at: '20:00' })
    expect(input.hours[6]).toEqual({ weekday: 7, is_open: false, opens_at: null, closes_at: null })
  })

  it('rejects missing temporary dates without calling the backend', async () => {
    harness()
    fireEvent.click(await screen.findByRole('button', { name: 'Configure hours' }))
    const dialog = screen.getByRole('dialog', { name: 'Configure Studio Hours' })
    fireEvent.click(within(dialog).getByRole('radio', { name: /Temporary/ }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save schedule' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Choose a start date.')
    expect(studioService.configureTemporaryStudioSchedule).not.toHaveBeenCalled()
  })

  it('rejects a temporary start date after its end date', async () => {
    vi.mocked(studioService.getStudioConfiguration).mockResolvedValue(studioConfiguration({
      temporarySchedules: [{
        id: 'schedule-1', starts_on: '2026-09-20', ends_on: '2026-09-10', created_by: 'account-1',
        created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z', hours: [],
      }],
    }))
    harness()
    fireEvent.click(await screen.findByRole('button', { name: 'Edit temporary schedule' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit Temporary Studio Hours' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save temporary schedule' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('start date must be on or before the end date')
    expect(studioService.configureTemporaryStudioSchedule).not.toHaveBeenCalled()
  })

  it('rejects an invalid open-day time range', async () => {
    harness()
    fireEvent.click(await screen.findByRole('button', { name: 'Configure hours' }))
    const dialog = screen.getByRole('dialog', { name: 'Configure Studio Hours' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Opening time' }))
    fireEvent.change(within(dialog).getByRole('spinbutton', { name: 'Hour' }), { target: { value: '8' } })
    fireEvent.click(within(dialog).getByRole('radio', { name: 'PM' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Apply' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save schedule' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('start time must be before')
    expect(studioService.configureRecurringStudioHours).not.toHaveBeenCalled()
  })

  it('edits a persisted temporary schedule through the existing atomic RPC', async () => {
    vi.mocked(studioService.getStudioConfiguration).mockResolvedValue(studioConfiguration({
      temporarySchedules: [{
        id: 'schedule-1', starts_on: '2026-09-10', ends_on: '2026-09-20', created_by: 'account-1',
        created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z',
        hours: Array.from({ length: 7 }, (_, index) => ({ schedule_id: 'schedule-1', weekday: index + 1, is_open: index < 5, opens_at: index < 5 ? '12:00:00' : null, closes_at: index < 5 ? '18:00:00' : null })),
      }],
      effectiveToday: { schedule_date: '2026-09-10', weekday: 4, is_open: true, opens_at: '12:00:00', closes_at: '18:00:00', source: 'temporary', temporary_schedule_id: 'schedule-1', exception_id: null, exception_type: null },
    }))
    harness()
    fireEvent.click(await screen.findByRole('button', { name: 'Edit temporary schedule' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit Temporary Studio Hours' })
    expect(within(dialog).getByRole('radio', { name: /Recurring/ })).toBeDisabled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save temporary schedule' }))

    await waitFor(() => expect(studioService.configureTemporaryStudioSchedule).toHaveBeenCalledWith(expect.objectContaining({
      id: 'schedule-1', startsOn: '2026-09-10', endsOn: '2026-09-20',
    }), expect.anything()))
    const input = vi.mocked(studioService.configureTemporaryStudioSchedule).mock.calls[0][0]
    expect(input.hours).toHaveLength(7)
    expect(input.hours[6]).toEqual({ weekday: 7, is_open: false, opens_at: null, closes_at: null })
    expect(studioService.configureRecurringStudioHours).not.toHaveBeenCalled()
  })

  it('prevents duplicate submits and reports backend validation failures', async () => {
    let rejectMutation!: (reason: Error) => void
    vi.mocked(studioService.configureRecurringStudioHours).mockImplementation(() => new Promise((_, reject) => { rejectMutation = reject }))
    harness()
    fireEvent.click(await screen.findByRole('button', { name: 'Configure hours' }))
    const dialog = screen.getByRole('dialog', { name: 'Configure Studio Hours' })
    const save = within(dialog).getByRole('button', { name: 'Save schedule' })
    fireEvent.click(save)
    expect(await within(dialog).findByRole('button', { name: 'Saving…' })).toBeDisabled()
    expect(studioService.configureRecurringStudioHours).toHaveBeenCalledTimes(1)

    rejectMutation(new Error('These Studio Hours conflict with existing Piercer Availability.'))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('conflict with existing Piercer Availability')
  })

  it('renders persisted active, upcoming, expired, resume, and exception state correctly', async () => {
    const schedule = (id: string, starts_on: string, ends_on: string) => ({
      id, starts_on, ends_on, created_by: 'account-1', created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z', hours: [],
    })
    vi.mocked(studioService.getStudioConfiguration).mockResolvedValue(studioConfiguration({
      temporarySchedules: [schedule('expired', '2026-09-01', '2026-09-05'), schedule('active', '2026-09-10', '2026-09-20'), schedule('upcoming', '2026-10-01', '2026-10-03')],
      effectiveToday: { schedule_date: '2026-09-10', weekday: 4, is_open: false, opens_at: null, closes_at: null, source: 'exception', temporary_schedule_id: 'active', exception_id: 'exception-1', exception_type: 'closed' },
    }))
    harness()

    expect(await screen.findByText('A Studio Exception controls today’s hours.')).toBeVisible()
    expect(screen.getByText('Recurring schedule resumes Sep 21.')).toBeVisible()
    expect(screen.getByText('Upcoming temporary schedules')).toBeVisible()
    expect(screen.getByText('Oct 1, 2026 – Oct 3, 2026')).toBeVisible()
    expect(screen.queryByText('Sep 1, 2026 – Sep 5, 2026')).not.toBeInTheDocument()
  })

  it('refreshes the displayed recurring schedule after a successful save', async () => {
    vi.mocked(studioService.getStudioConfiguration)
      .mockResolvedValueOnce(studioConfiguration())
      .mockResolvedValue(studioConfiguration({ recurringHours: [
        { weekday: 1, is_open: true, opens_at: '11:00:00', closes_at: '19:00:00' },
        ...Array.from({ length: 6 }, (_, index) => ({ weekday: index + 2, is_open: false, opens_at: null, closes_at: null })),
      ] }))
    harness()
    fireEvent.click(await screen.findByRole('button', { name: 'Configure hours' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Configure Studio Hours' })).getByRole('button', { name: 'Save schedule' }))

    expect(await screen.findByText('11:00 AM — 7:00 PM')).toBeVisible()
    expect(screen.queryByRole('dialog', { name: 'Configure Studio Hours' })).not.toBeInTheDocument()
  })

  it('refreshes the displayed temporary schedule after a successful save', async () => {
    const existing = {
      id: 'schedule-1', starts_on: '2026-09-10', ends_on: '2026-09-20', created_by: 'account-1',
      created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z', hours: [],
    }
    vi.mocked(studioService.getStudioConfiguration)
      .mockResolvedValueOnce(studioConfiguration({ temporarySchedules: [existing] }))
      .mockResolvedValue(studioConfiguration({
        temporarySchedules: [{ ...existing, ends_on: '2026-09-22' }],
        effectiveToday: {
          schedule_date: '2026-09-10', weekday: 4, is_open: true,
          opens_at: '12:00:00', closes_at: '18:00:00', source: 'temporary',
          temporary_schedule_id: 'schedule-1', exception_id: null, exception_type: null,
        },
      }))
    harness()
    fireEvent.click(await screen.findByRole('button', { name: 'Edit temporary schedule' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Edit Temporary Studio Hours' })).getByRole('button', { name: 'Save temporary schedule' }))

    expect(await screen.findByText('Sep 10, 2026 – Sep 22, 2026')).toBeVisible()
    expect(screen.getByText('Recurring schedule resumes Sep 23.')).toBeVisible()
    expect(screen.queryByRole('dialog', { name: 'Edit Temporary Studio Hours' })).not.toBeInTheDocument()
  })
})
