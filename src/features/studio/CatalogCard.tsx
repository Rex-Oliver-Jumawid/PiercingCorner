import { useMemo, useState } from 'react'
import { useCatalog } from './catalogQueries'
import { formatCatalogPrice } from './catalogModel'
import type { CatalogEntry, CatalogKind } from './catalogModel'

export function CatalogCard({
  kind,
  onEdit,
}: {
  kind: CatalogKind
  onEdit: (kind: CatalogKind, entry?: CatalogEntry) => void
}) {
  const [search, setSearch] = useState('')
  const query = useCatalog(kind)
  const plural = kind === 'service' ? 'services' : 'products'
  const title = kind === 'service' ? 'Services & pricing' : 'Product catalog'
  const subtitle =
    kind === 'service'
      ? 'Active services become available to studio workflows.'
      : 'Products can be sold alone or alongside a service.'
  const visible = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('en-PH')
    if (!term) return query.data ?? []
    return (query.data ?? []).filter((entry) =>
      `${entry.name} ${entry.description ?? ''}`.toLocaleLowerCase('en-PH').includes(term),
    )
  }, [query.data, search])

  return (
    <article id={`${kind}-catalog`} tabIndex={-1} className="catalog-card">
      <header className="catalog-card-head">
        <div>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>
        <button type="button" className="catalog-button" onClick={() => onEdit(kind)}>
          + Add {kind}
        </button>
      </header>
      <label className="catalog-search-wrap">
        <span className="catalog-search-label">Search {plural}</span>
        <span aria-hidden="true" className="catalog-search-icon">⌕</span>
        <input
          type="search"
          value={search}
          placeholder={`Search ${plural}...`}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>
      <div className="catalog-list" aria-live="polite">
        {query.isPending ? <p role="status" className="catalog-message">Loading {plural}…</p> : null}
        {query.isError ? (
          <div role="alert" className="catalog-message catalog-error">
            <p>{query.error.message}</p>
            <button type="button" className="catalog-button" onClick={() => void query.refetch()}>
              Try again
            </button>
          </div>
        ) : null}
        {query.data && !visible.length ? (
          <p className="catalog-message">
            {search.trim() ? `No ${plural} match this search.` : `No ${plural} yet.`}
          </p>
        ) : null}
        {visible.map((entry) => (
          <div className="catalog-row" key={entry.id}>
            <div className="catalog-row-copy">
              <strong>{entry.name}</strong>
              <small>{entry.description || `No ${kind} description`}</small>
              <span className={entry.active ? 'catalog-status active' : 'catalog-status inactive'}>
                {entry.active ? 'Active' : 'Inactive'}
              </span>
            </div>
            <span className="catalog-price">{formatCatalogPrice(entry.price)}</span>
            <button
              type="button"
              className="catalog-edit"
              aria-label={`Edit ${kind} ${entry.name}`}
              onClick={() => onEdit(kind, entry)}
            >
              Edit
            </button>
          </div>
        ))}
      </div>
    </article>
  )
}
