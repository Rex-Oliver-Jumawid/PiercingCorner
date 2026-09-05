import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useDuplicates } from '../clients/clientQueries'
import { hasSaleDraft, useSaleStore } from './saleStore'
import {
  useActiveCatalog,
  useClientOptions,
  useDashboardMutation,
} from './transactionQueries'
import { recordProductSale } from './transactionService'
import {
  formatMoney,
  validateNewClient,
  validatePayment,
} from './transactionModel'
import type {
  CatalogKind,
  ClientOption,
  NewClientDraft,
} from './transactionModel'

function DialogHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <header className="transaction-dialog-head">
      <div>
        <p className="dashboard-eyebrow">DASHBOARD</p>
        <h2>{title}</h2>
      </div>
      <button type="button" aria-label="Close record sale" onClick={onClose}>×</button>
    </header>
  )
}

function ItemSelector({ kind }: { kind: CatalogKind }) {
  const [search, setSearch] = useState('')
  const query = useActiveCatalog(kind)
  const selected = useSaleStore((state) =>
    kind === 'service' ? state.serviceIds : state.productIds,
  )
  const toggle = useSaleStore((state) => state.toggleItem)
  const clear = useSaleStore((state) => state.clearItems)
  const setStep = useSaleStore((state) => state.setStep)
  const plural = `${kind}s`
  const visible = (query.data ?? []).filter((item) =>
    item.name.toLocaleLowerCase('en-PH').includes(search.trim().toLocaleLowerCase('en-PH')),
  )
  return (
    <>
      <div className="transaction-dialog-body">
        <label className="dashboard-field">
          <span>Search {plural}</span>
          <input
            autoFocus
            type="search"
            value={search}
            placeholder={`Search ${plural}...`}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        {query.isPending ? <p role="status">Loading {plural}…</p> : null}
        {query.isError ? <p role="alert" className="dashboard-error">{query.error.message}</p> : null}
        <div className="sale-option-list">
          {visible.map((item) => (
            <label key={item.id} className="sale-check-option">
              <input
                type="checkbox"
                checked={selected.includes(item.id)}
                onChange={() => toggle(kind, item.id)}
              />
              <strong>{item.name}</strong>
              <span>{formatMoney(item.price)}</span>
            </label>
          ))}
          {query.data && !visible.length ? <p>No matching {plural}.</p> : null}
        </div>
      </div>
      <footer className="transaction-dialog-foot split">
        <button type="button" className="dashboard-button" onClick={() => clear(kind)}>Clear</button>
        <button type="button" className="dashboard-button primary" onClick={() => setStep('details')}>Done</button>
      </footer>
    </>
  )
}

export function RecordSaleDialog({
  onCompleted,
}: {
  onCompleted: (transactionId: string) => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const store = useSaleStore()
  const [clientSearch, setClientSearch] = useState('')
  const [clientErrors, setClientErrors] = useState<
    Partial<Record<keyof NewClientDraft, string>>
  >({})
  const [formError, setFormError] = useState<string | null>(null)
  const services = useActiveCatalog('service')
  const products = useActiveCatalog('product')
  const clientOptions = useClientOptions(
    clientSearch.trim(),
    store.open && store.clientMode === 'existing' && store.step === 'details',
  )
  const newClient = validateNewClient(store.newClient).value
  const duplicateCandidate =
    store.step === 'duplicate_review'
      ? {
          full_name: newClient.full_name,
          email: newClient.email,
          phone: newClient.phone,
        }
      : null
  const duplicates = useDuplicates(duplicateCandidate, undefined, 0)
  const mutation = useDashboardMutation(recordProductSale, (result) => {
    store.reset()
    onCompleted(result.id)
  })

  useEffect(() => {
    const current = dialog.current
    current?.showModal()
    return () => current?.close()
  }, [])

  const selectedServices = useMemo(
    () => (services.data ?? []).filter((item) => store.serviceIds.includes(item.id)),
    [services.data, store.serviceIds],
  )
  const selectedProducts = useMemo(
    () => (products.data ?? []).filter((item) => store.productIds.includes(item.id)),
    [products.data, store.productIds],
  )
  const total = [...selectedServices, ...selectedProducts].reduce(
    (sum, item) => sum + item.price,
    0,
  )

  function close() {
    if (mutation.isPending) return
    if (hasSaleDraft(store) && !window.confirm('Discard this unfinished sale?')) return
    store.reset()
  }

  function chooseExisting(client: ClientOption) {
    store.setExistingClient(client)
    setClientSearch(client.full_name)
  }

  function proceedFromDetails() {
    setFormError(null)
    if (!store.serviceIds.length && !store.productIds.length) {
      setFormError('Select at least one service or product.')
      return
    }
    if (store.clientMode === 'existing') {
      if (!store.existingClient) {
        setFormError('Search for and select an existing client.')
        return
      }
      store.setStep(store.serviceIds.length ? 'waiver' : 'payment')
      return
    }
    const validated = validateNewClient(store.newClient)
    setClientErrors(validated.errors)
    if (Object.keys(validated.errors).length) return
    store.setStep('duplicate_review')
  }

  function continueNewClient() {
    store.setStep(store.serviceIds.length ? 'waiver' : 'payment')
  }

  function submitPayment(event: FormEvent) {
    event.preventDefault()
    const error = validatePayment(store.payment)
    setFormError(error)
    if (error) return
    mutation.mutate({
      existingClient: store.existingClient,
      newClient: store.newClient,
      productIds: store.productIds,
      payment: store.payment,
    })
  }

  const title =
    store.step === 'services'
      ? 'Select Services'
      : store.step === 'products'
        ? 'Select Products'
        : store.step === 'waiver'
          ? 'Client Consent & Waiver'
          : store.step === 'payment'
            ? 'Complete Payment'
            : store.step === 'duplicate_review'
              ? 'Review Client Match'
              : 'Add Transaction'

  return (
    <dialog
      ref={dialog}
      className="transaction-dialog"
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault()
        close()
      }}
    >
      <DialogHeader title={title} onClose={close} />
      {store.step === 'services' || store.step === 'products' ? (
        <ItemSelector kind={store.step === 'services' ? 'service' : 'product'} />
      ) : null}

      {store.step === 'details' ? (
        <>
          <div className="transaction-dialog-body">
            <div className="sale-client-mode" role="group" aria-label="Client type">
              <button
                type="button"
                className={store.clientMode === 'existing' ? 'active' : ''}
                onClick={() => store.setClientMode('existing')}
              >Existing Client</button>
              <button
                type="button"
                className={store.clientMode === 'new' ? 'active' : ''}
                onClick={() => store.setClientMode('new')}
              >Walk-in / New Client</button>
            </div>
            {store.clientMode === 'existing' ? (
              <div className="client-picker">
                <label className="dashboard-field">
                  <span>Customer</span>
                  <input
                    value={clientSearch}
                    placeholder="Search customer name..."
                    onChange={(event) => {
                      setClientSearch(event.target.value)
                      store.setExistingClient(null)
                    }}
                  />
                </label>
                {clientOptions.isPending ? <p role="status">Searching clients…</p> : null}
                {clientOptions.isError ? <p role="alert" className="dashboard-error">{clientOptions.error.message}</p> : null}
                {clientSearch !== store.existingClient?.full_name && clientOptions.data ? (
                  <div className="client-options" role="listbox" aria-label="Customer results">
                    {clientOptions.data.map((client) => (
                      <button key={client.id} type="button" onClick={() => chooseExisting(client)}>
                        <strong>{client.full_name}</strong>
                        <small>{client.email || client.phone || 'No contact details'}</small>
                      </button>
                    ))}
                    {!clientOptions.data.length ? <p>No matching clients.</p> : null}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="sale-new-client">
                {(['first_name', 'last_name', 'phone', 'email'] as const).map((field) => (
                  <label className="dashboard-field" key={field}>
                    <span>{field.replace('_', ' ')}</span>
                    <input
                      type={field === 'email' ? 'email' : field === 'phone' ? 'tel' : 'text'}
                      value={store.newClient[field]}
                      aria-invalid={!!clientErrors[field]}
                      onChange={(event) =>
                        store.setNewClient({ ...store.newClient, [field]: event.target.value })
                      }
                    />
                    {clientErrors[field] ? <small>{clientErrors[field]}</small> : null}
                  </label>
                ))}
              </div>
            )}
            <div className="sale-selectors">
              <button type="button" onClick={() => store.setStep('services')}>
                <strong>Services</strong>
                <span>{selectedServices.length ? `${selectedServices.length} selected` : 'Add services'} ›</span>
              </button>
              <button type="button" onClick={() => store.setStep('products')}>
                <strong>Products</strong>
                <span>{selectedProducts.length ? `${selectedProducts.length} selected` : 'Add products'} ›</span>
              </button>
            </div>
            <p className="sale-rule">Service transactions require a signed waiver. Product-only purchases proceed directly to payment.</p>
            {formError ? <p role="alert" className="dashboard-error">{formError}</p> : null}
          </div>
          <footer className="transaction-dialog-foot">
            <button type="button" className="dashboard-button" onClick={close}>Cancel</button>
            <button type="button" className="dashboard-button primary" onClick={proceedFromDetails}>Continue</button>
          </footer>
        </>
      ) : null}

      {store.step === 'duplicate_review' ? (
        <>
          <div className="transaction-dialog-body duplicate-review">
            {duplicates.isPending ? <p role="status">Checking for matching clients…</p> : null}
            {duplicates.isError ? <p role="alert" className="dashboard-error">Could not check for matching clients.</p> : null}
            {duplicates.data ? (
              <>
                <h3>{duplicates.data.count ? 'Possible matching clients' : 'Ready to continue'}</h3>
                <p>{duplicates.data.count ? 'Use an existing record, or intentionally create a separate client.' : 'No matching clients were found.'}</p>
                {duplicates.data.rows.map((client) => (
                  <button
                    type="button"
                    className="duplicate-option"
                    key={client.id}
                    onClick={() => {
                      store.setClientMode('existing')
                      chooseExisting(client)
                      store.setStep(store.serviceIds.length ? 'waiver' : 'payment')
                    }}
                  >
                    <strong>{client.full_name}</strong>
                    <span>{client.email || client.phone || 'No contact details'}</span>
                    <b>Use existing</b>
                  </button>
                ))}
              </>
            ) : null}
          </div>
          <footer className="transaction-dialog-foot">
            <button type="button" className="dashboard-button" onClick={() => store.setStep('details')}>Back</button>
            <button
              type="button"
              className="dashboard-button primary"
              disabled={duplicates.isFetching}
              onClick={continueNewClient}
            >{duplicates.data?.count ? 'Create separate client' : 'Continue'}</button>
          </footer>
        </>
      ) : null}

      {store.step === 'waiver' ? (
        <>
          <div className="transaction-dialog-body waiver-handoff">
            <div className="waiver-client-card">
              <small>Client</small>
              <strong>{store.existingClient?.full_name || newClient.full_name}</strong>
            </div>
            <h3>Signature required before Pending</h3>
            <p>This service draft is ready for the waiver-signing step. Phase 5 will capture the signature, generate the immutable PDF, and then create the Pending transaction.</p>
            <div className="waiver-summary">
              <span>{selectedServices.length} service{selectedServices.length === 1 ? '' : 's'}</span>
              <span>{selectedProducts.length} product{selectedProducts.length === 1 ? '' : 's'}</span>
              <strong>{formatMoney(total)}</strong>
            </div>
            <p className="sale-rule">Nothing has been written to Supabase. Use Back to revise this in-session draft, or close and confirm discard.</p>
          </div>
          <footer className="transaction-dialog-foot">
            <button type="button" className="dashboard-button" onClick={() => store.setStep('details')}>Back</button>
            <button type="button" className="dashboard-button primary" disabled>Continue to signature in Phase 5</button>
          </footer>
        </>
      ) : null}

      {store.step === 'payment' ? (
        <form onSubmit={submitPayment}>
          <div className="transaction-dialog-body payment-body">
            <section className="payment-total"><small>Amount to be paid</small><strong>{formatMoney(total)}</strong></section>
            <label className="dashboard-field">
              <span>Payment method</span>
              <select
                value={store.payment.method}
                onChange={(event) =>
                  store.setPayment({
                    method: event.target.value as typeof store.payment.method,
                    reference: event.target.value === 'cash' ? '' : store.payment.reference,
                  })
                }
              >
                <option value="cash">Cash</option><option value="gcash">GCash</option>
                <option value="maya">Maya</option><option value="bank_transfer">Bank transfer</option>
                <option value="card">Card</option><option value="other">Other</option>
              </select>
            </label>
            {store.payment.method !== 'cash' ? (
              <label className="dashboard-field">
                <span>Reference number</span>
                <input
                  value={store.payment.reference}
                  onChange={(event) => store.setPayment({ ...store.payment, reference: event.target.value })}
                />
              </label>
            ) : null}
            <p>Confirming payment creates the product transaction and marks it Completed.</p>
            {formError ? <p role="alert" className="dashboard-error">{formError}</p> : null}
            {mutation.isError ? <p role="alert" className="dashboard-error">{mutation.error.message}</p> : null}
          </div>
          <footer className="transaction-dialog-foot">
            <button type="button" className="dashboard-button" disabled={mutation.isPending} onClick={() => store.setStep('details')}>Back</button>
            <button type="submit" className="dashboard-button primary" disabled={mutation.isPending}>{mutation.isPending ? 'Completing…' : 'Confirm payment'}</button>
          </footer>
        </form>
      ) : null}
    </dialog>
  )
}
