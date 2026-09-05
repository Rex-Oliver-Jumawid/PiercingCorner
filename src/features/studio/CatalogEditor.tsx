import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { SelectField } from '../../components/ui/FormControls'
import { useSaveCatalog } from './catalogQueries'
import { validateCatalog } from './catalogModel'
import type { CatalogDraft, CatalogEntry, CatalogKind } from './catalogModel'

export function CatalogEditor({
  kind,
  entry,
  onClose,
}: {
  kind: CatalogKind
  entry?: CatalogEntry
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const nameId = `${titleId}-name`
  const priceId = `${titleId}-price`
  const descriptionId = `${titleId}-description`
  const [draft, setDraft] = useState<CatalogDraft>({
    name: entry?.name ?? '',
    description: entry?.description ?? '',
    price: entry ? String(entry.price) : '',
    active: entry?.active ?? true,
  })
  const [errors, setErrors] = useState<
    Partial<Record<keyof CatalogDraft, string>>
  >({})
  const save = useSaveCatalog(onClose)
  const label = kind === 'service' ? 'service' : 'product'

  useEffect(() => {
    const previous = document.activeElement
    const current = dialog.current
    current?.showModal()
    return () => {
      current?.close()
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus()
    }
  }, [])

  function submit(event: FormEvent) {
    event.preventDefault()
    if (save.isPending) return
    const validated = validateCatalog(draft)
    setErrors(validated.errors)
    if (!validated.value || Object.keys(validated.errors).length) return
    save.mutate({ kind, draft, id: entry?.id })
  }

  function close() {
    if (!save.isPending) onClose()
  }

  return (
    <dialog
      ref={dialog}
      className="catalog-dialog"
      aria-labelledby={titleId}
      aria-modal="true"
      onCancel={(event) => {
        event.preventDefault()
        close()
      }}
    >
      <header className="catalog-dialog-head">
        <div>
          <p className="studio-eyebrow">STUDIO CATALOG</p>
          <h2 id={titleId}>{entry ? `Edit ${label}` : `Add ${label}`}</h2>
          <p>Configure the {label} used in transactions and reports.</p>
        </div>
        <button
          type="button"
          className="catalog-close"
          aria-label={`Close ${label} editor`}
          disabled={save.isPending}
          onClick={close}
        >
          ×
        </button>
      </header>
      <form onSubmit={submit} noValidate>
        <fieldset disabled={save.isPending} className="catalog-form">
          <div className="catalog-field catalog-wide">
            <label htmlFor={nameId}>{kind === 'service' ? 'Service name' : 'Product name'}</label>
            <input
              id={nameId}
              autoFocus
              value={draft.name}
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? `${nameId}-error` : undefined}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
            {errors.name ? <small id={`${nameId}-error`}>{errors.name}</small> : null}
          </div>
          <div className="catalog-field">
            <label htmlFor={priceId}>Price (PHP)</label>
            <input
              id={priceId}
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={draft.price}
              aria-invalid={!!errors.price}
              aria-describedby={errors.price ? `${priceId}-error` : undefined}
              onChange={(event) => setDraft({ ...draft, price: event.target.value })}
            />
            {errors.price ? <small id={`${priceId}-error`}>{errors.price}</small> : null}
          </div>
          <SelectField
            className="catalog-field"
            label="Status"
            value={draft.active ? 'active' : 'inactive'}
            options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]}
            onValueChange={(value) => setDraft({ ...draft, active: value === 'active' })}
          />
          <div className="catalog-field catalog-wide">
            <label htmlFor={descriptionId}>Description (optional)</label>
            <textarea
              id={descriptionId}
              rows={4}
              value={draft.description}
              onChange={(event) =>
                setDraft({ ...draft, description: event.target.value })
              }
            />
          </div>
        </fieldset>
        {save.isError ? <p role="alert" className="catalog-error">{save.error.message}</p> : null}
        <footer className="catalog-dialog-foot">
          <button type="button" className="catalog-button" disabled={save.isPending} onClick={close}>
            Cancel
          </button>
          <button type="submit" className="catalog-button primary" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save changes'}
          </button>
        </footer>
      </form>
    </dialog>
  )
}
