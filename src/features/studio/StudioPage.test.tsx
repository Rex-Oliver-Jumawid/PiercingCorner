import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { AuthContext } from '../auth/authContext'
import type { AppRole } from '../auth/types'
import { StudioPage } from './StudioPage'
import * as service from './catalogService'
import type { CatalogEntry } from './catalogModel'

vi.mock('./catalogService')

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
    expect(screen.getByText('Titanium Stud')).toBeVisible()
  })

  it('validates and creates a product without losing entered form values', async () => {
    harness()
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
    fireEvent.change(within(dialog).getByRole('combobox', { name: 'Status' }), {
      target: { value: 'inactive' },
    })
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
})
