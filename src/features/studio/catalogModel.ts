export {
  catalogTable,
  formatCatalogPrice,
} from '../catalog/catalogModel'
export type {
  CatalogEntry,
  CatalogKind,
  CatalogTable,
} from '../catalog/catalogModel'

export interface CatalogDraft {
  name: string
  description: string
  price: string
  active: boolean
}

export interface CatalogInput {
  name: string
  description: string | null
  price: number
  active: boolean
}

export function validateCatalog(draft: CatalogDraft) {
  const errors: Partial<Record<keyof CatalogDraft, string>> = {}
  const name = draft.name.trim()
  const description = draft.description.trim() || null
  const price = draft.price.trim()

  if (!name) errors.name = 'Enter a catalog name.'
  if (!price) {
    errors.price = 'Enter a price.'
  } else if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(price)) {
    errors.price = 'Enter a non-negative price with up to two decimal places.'
  }

  return {
    value: errors.price
      ? null
      : ({ name, description, price: Number(price), active: draft.active } satisfies CatalogInput),
    errors,
  }
}
