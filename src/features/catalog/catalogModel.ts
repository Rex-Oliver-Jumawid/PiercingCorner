import type { Database } from '../../types/database'

export type CatalogKind = 'service' | 'product'
export type CatalogTable = 'services' | 'products'
export type CatalogEntry = Database['public']['Tables']['services']['Row']

export interface CatalogOption {
  id: string
  name: string
  price: number
  active: boolean
}

export function catalogTable(kind: CatalogKind): CatalogTable {
  return kind === 'service' ? 'services' : 'products'
}

export function formatCatalogPrice(value: number) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  }).format(value)
}
