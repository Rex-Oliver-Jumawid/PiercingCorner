import { getSupabaseClient } from '../../lib/supabase/client'
import { catalogTable, validateCatalog } from './catalogModel'
import type { CatalogDraft, CatalogEntry, CatalogKind } from './catalogModel'

export async function listCatalog(kind: CatalogKind, signal: AbortSignal) {
  const { data, error } = await getSupabaseClient()
    .from(catalogTable(kind))
    .select('*')
    .order('active', { ascending: false })
    .order('name')
    .order('id')
    .abortSignal(signal)

  if (error) {
    throw new Error(`Unable to load ${kind}s. Please try again.`)
  }
  return (data ?? []) as CatalogEntry[]
}

export async function saveCatalog(
  kind: CatalogKind,
  draft: CatalogDraft,
  id?: string,
) {
  const { value, errors } = validateCatalog(draft)
  if (!value || Object.keys(errors).length) {
    throw new Error('Check the catalog details before saving.')
  }

  const table = getSupabaseClient().from(catalogTable(kind))
  const request = id ? table.update(value).eq('id', id) : table.insert(value)
  const { data, error } = await request.select('*').single()
  if (error) {
    throw new Error(
      `Could not save this ${kind}. Your changes have been kept; please try again.`,
    )
  }
  return data as CatalogEntry
}
