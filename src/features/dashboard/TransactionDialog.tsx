import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ConfirmationDialog } from '../../components/ui/ConfirmationDialog'
import { SelectField } from '../../components/ui/FormControls'
import { useRightSideDrawer } from '../../components/ui/useRightSideDrawer'
import {
  useActiveCatalog,
  useDashboardMutation,
} from './transactionQueries'
import {
  downloadWaiverPdf,
  downloadSignaturePng,
  finalizeTransaction,
  getTransactionWaiver,
  getRecoverableWaiverSigning,
  prepareWaiverSigning,
  updateTransactionStatus,
} from './transactionService'
import {
  formatManilaTime,
  formatMoney,
  validatePayment,
} from './transactionModel'
import type {
  CatalogKind,
  DashboardTransaction,
  PaymentDraft,
  TransactionStatus,
  WaiverPreparation,
} from './transactionModel'

function useModal() {
  const [dialog, setDialog] = useState<HTMLDialogElement | null>(null)
  useEffect(() => {
    dialog?.showModal()
    return () => dialog?.close()
  }, [dialog])
  return { dialog, setDialog }
}

export function TransactionDialog({
  transaction,
  onClose,
  onFinalize,
  onSignWaiver,
}: {
  transaction: DashboardTransaction
  onClose: () => void
  onFinalize: () => void
  onSignWaiver: (input: {
    preparation: WaiverPreparation
    recoveredSigning?: Awaited<ReturnType<typeof getRecoverableWaiverSigning>>
    recoveredSignature?: Blob | null
  }) => void
}) {
  const mutation = useDashboardMutation(
    ({ status }: { status: Exclude<TransactionStatus, 'completed'> }) =>
      updateTransactionStatus(transaction.id, status),
  )
  const open = transaction.status === 'pending' || transaction.status === 'ongoing'
  const hasServices = transaction.items.some((item) => item.item_type === 'service')
  const [waiverActionError, setWaiverActionError] = useState<string | null>(null)
  const [preparingWaiver, setPreparingWaiver] = useState(false)
  const [confirmingCancellation, setConfirmingCancellation] = useState(false)
  const {
    dialog,
    setDialog,
    closing,
    requestClose,
    handleCancel,
    handleBackdropPointerDown,
  } = useRightSideDrawer(onClose, mutation.isPending || preparingWaiver)
  const waiver = useQuery({
    queryKey: ['dashboard', 'transaction-waiver', transaction.id],
    enabled: transaction.has_waiver,
    queryFn: ({ signal }) => getTransactionWaiver(transaction.id, signal),
  })

  async function signWaiver() {
    setPreparingWaiver(true)
    setWaiverActionError(null)
    try {
      const recoveredSigning = await getRecoverableWaiverSigning(transaction.id)
      if (recoveredSigning) {
        const recoveredSignature = await downloadSignaturePng(transaction.id, recoveredSigning.event_id)
        if (recoveredSignature) {
          onSignWaiver({
            preparation: {
              event_id: recoveredSigning.event_id,
              transaction_id: recoveredSigning.id,
              template_id: recoveredSigning.template_id,
              template_version: recoveredSigning.template_version,
              template_body: recoveredSigning.template_body,
              client_name: recoveredSigning.client_name,
              expires_at: recoveredSigning.signed_at,
            },
            recoveredSigning,
            recoveredSignature,
          })
          return
        }
      }
      onSignWaiver({ preparation: await prepareWaiverSigning(transaction.id) })
    } catch (error) {
      setWaiverActionError(error instanceof Error ? error.message : 'Could not prepare the waiver.')
    } finally {
      setPreparingWaiver(false)
    }
  }

  async function openPdf(download: boolean) {
    if (!waiver.data) return
    setWaiverActionError(null)
    const target = download ? null : window.open('', '_blank')
    try {
      const blob = await downloadWaiverPdf(waiver.data.pdf_storage_path)
      const url = URL.createObjectURL(blob)
      if (download) {
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = `waiver-${transaction.reference_code}.pdf`
        anchor.click()
      } else if (target) {
        target.location.href = url
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (error) {
      target?.close()
      setWaiverActionError(error instanceof Error ? error.message : 'Could not open the waiver PDF.')
    }
  }

  return (
    <dialog
      ref={setDialog}
      className={`transaction-dialog right-side-drawer${closing ? ' is-closing' : ''}`}
      aria-label="Transaction details"
      onCancel={handleCancel}
      onPointerDown={handleBackdropPointerDown}
    >
      <header className="transaction-dialog-head">
        <div>
          <p className="dashboard-eyebrow">TRANSACTION DETAILS</p>
          <h2>{transaction.reference_code}</h2>
          <p>{formatManilaTime(transaction.created_at)} · Manila time</p>
        </div>
        <button type="button" aria-label="Close transaction details" disabled={mutation.isPending || preparingWaiver} onClick={requestClose}>×</button>
      </header>
      <div className="transaction-dialog-body">
        <dl className="transaction-detail-grid">
          <div><dt>Client</dt><dd>{transaction.client_name}</dd></div>
          <div><dt>Recorded by</dt><dd>{transaction.recorded_by_name}</dd></div>
          <div><dt>Status</dt><dd><span className={`transaction-status ${transaction.status}`}>{transaction.status}</span></dd></div>
          <div><dt>Waiver</dt><dd>{hasServices ? (transaction.has_waiver ? 'Signed' : 'Required') : 'Not required'}</dd></div>
        </dl>
        <section className="transaction-items-card">
          <h3>Items</h3>
          {transaction.items.map((item) => (
            <div key={item.id}>
              <span><strong>{item.name}</strong><small>{item.item_type} · Qty {item.quantity}</small></span>
              <strong>{formatMoney(item.unit_price * item.quantity)}</strong>
            </div>
          ))}
          <footer><span>Total</span><strong>{formatMoney(transaction.total)}</strong></footer>
        </section>
        {transaction.has_waiver ? (
          <section className="transaction-actions-card">
            <h3>Signed waiver</h3>
            <p>{waiver.data ? `Template version ${waiver.data.template_version} · ${new Date(waiver.data.signed_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}` : 'Loading signed waiver…'}</p>
            <div className="transaction-action-row">
              <button type="button" className="dashboard-button" disabled={!waiver.data} onClick={() => void openPdf(false)}>View Waiver PDF</button>
              <button type="button" className="dashboard-button" disabled={!waiver.data} onClick={() => void openPdf(true)}>Download Waiver PDF</button>
            </div>
          </section>
        ) : null}
        {open ? (
          <section className="transaction-actions-card">
            <h3>Transaction actions</h3>
            <SelectField
              className="dashboard-field"
              label="Completion status"
              value={transaction.status as 'pending' | 'ongoing'}
              disabled={mutation.isPending}
              options={[{ value: 'pending', label: 'Pending' }, { value: 'ongoing', label: 'Ongoing' }]}
              onValueChange={(status) => mutation.mutate({ status })}
            />
            <div className="transaction-action-row">
              <button
                type="button"
                className="dashboard-button primary"
                disabled={mutation.isPending || transaction.payment_count > 0 || (hasServices && !transaction.has_waiver)}
                onClick={onFinalize}
              >Finalize</button>
              {hasServices && !transaction.has_waiver ? (
                <button type="button" className="dashboard-button primary" disabled={preparingWaiver} onClick={() => void signWaiver()}>{preparingWaiver ? 'Preparing…' : 'Sign Waiver'}</button>
              ) : null}
              <button
                type="button"
                className="dashboard-button danger"
                disabled={mutation.isPending}
                onClick={() => setConfirmingCancellation(true)}
              >Cancel</button>
            </div>
            {hasServices && !transaction.has_waiver ? <p>A signed waiver is required before this transaction can be finalized.</p> : null}
            {transaction.payment_count ? <p>Transactions with existing payments cannot use the Phase 4 full-payment flow.</p> : null}
            {mutation.isError ? <p role="alert" className="dashboard-error">{mutation.error.message}</p> : null}
            {waiverActionError ? <p role="alert" className="dashboard-error">{waiverActionError}</p> : null}
          </section>
        ) : <p className="sale-rule">This transaction is {transaction.status} and has no further actions.</p>}
      </div>
      <ConfirmationDialog
        open={confirmingCancellation}
        title="Cancel this transaction?"
        description="This transaction will be marked Cancelled and kept in the historical record. This action cannot be undone from the Dashboard."
        confirmLabel="Cancel transaction"
        cancelLabel="Keep transaction"
        destructive
        portalContainer={dialog}
        onOpenChange={setConfirmingCancellation}
        onConfirm={() => mutation.mutate({ status: 'cancelled' })}
      />
    </dialog>
  )
}

function combinedOptions(
  kind: CatalogKind,
  transaction: DashboardTransaction,
  active: Array<{ id: string; name: string; price: number; active: boolean }>,
) {
  const existing = transaction.items.flatMap((item) => {
    const id = kind === 'service' ? item.service_id : item.product_id
    return item.item_type === kind && id
      ? [{ id, name: item.name, price: item.unit_price * item.quantity, active: true, existing: true, kind }]
      : []
  })
  return [
    ...existing,
    ...active
      .filter((item) => !existing.some((current) => current.id === item.id))
      .map((item) => ({ ...item, existing: false, kind })),
  ]
}

export function FinalizeDialog({
  transaction,
  onBack,
  onCompleted,
  initialStep = 'items',
}: {
  transaction: DashboardTransaction
  onBack: () => void
  onCompleted: () => void
  initialStep?: 'items' | 'payment'
}) {
  const { setDialog } = useModal()
  const services = useActiveCatalog('service')
  const products = useActiveCatalog('product')
  const [serviceIds, setServiceIds] = useState(() =>
    transaction.items.flatMap((item) => item.service_id ?? []),
  )
  const [productIds, setProductIds] = useState(() =>
    transaction.items.flatMap((item) => item.product_id ?? []),
  )
  const [serviceSearch, setServiceSearch] = useState('')
  const [productSearch, setProductSearch] = useState('')
  const [payment, setPayment] = useState<PaymentDraft>({ method: 'cash', reference: '' })
  const [step, setStep] = useState<'items' | 'payment'>(initialStep)
  const [error, setError] = useState<string | null>(null)
  const serviceOptions = useMemo(
    () => combinedOptions('service', transaction, services.data ?? []),
    [services.data, transaction],
  )
  const productOptions = useMemo(
    () => combinedOptions('product', transaction, products.data ?? []),
    [products.data, transaction],
  )
  const visibleServiceOptions = useMemo(() => {
    const query = serviceSearch.trim().toLocaleLowerCase()
    return query
      ? serviceOptions.filter((item) => item.name.toLocaleLowerCase().includes(query))
      : serviceOptions
  }, [serviceOptions, serviceSearch])
  const visibleProductOptions = useMemo(() => {
    const query = productSearch.trim().toLocaleLowerCase()
    return query
      ? productOptions.filter((item) => item.name.toLocaleLowerCase().includes(query))
      : productOptions
  }, [productOptions, productSearch])
  const mutation = useDashboardMutation(finalizeTransaction, onCompleted)
  const total = [...serviceOptions, ...productOptions].reduce(
    (sum, item) =>
      sum +
        ((item.kind === 'service'
          ? serviceIds.includes(item.id)
          : productIds.includes(item.id))
          ? item.price
          : 0),
    0,
  )

  function toggle(kind: CatalogKind, id: string) {
    const selected = kind === 'service' ? serviceIds : productIds
    const setSelected = kind === 'service' ? setServiceIds : setProductIds
    setSelected(selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id])
  }

  function continueToPayment() {
    if (!serviceIds.length && !productIds.length) {
      setError('A transaction must contain at least one item.')
      return
    }
    if (serviceIds.length && !transaction.has_waiver) {
      setError('A signed waiver is required for service items.')
      return
    }
    setError(null)
    setStep('payment')
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    const paymentError = validatePayment(payment)
    setError(paymentError)
    if (paymentError) return
    mutation.mutate({
      transactionId: transaction.id,
      serviceIds,
      productIds,
      payment,
    })
  }

  return (
    <dialog
      ref={setDialog}
      className={`transaction-dialog finalize-dialog${step === 'payment' ? ' payment-step' : ''}`}
      aria-label="Finalize transaction"
      onCancel={(event) => {
        event.preventDefault()
        if (!mutation.isPending) onBack()
      }}
    >
      <header className="transaction-dialog-head">
        <div><p className="dashboard-eyebrow">{step === 'items' ? 'FINALIZE TRANSACTION' : 'PAYMENT'}</p><h2>{step === 'items' ? 'Review & Add Items' : 'Complete Payment'}</h2></div>
        <button type="button" aria-label="Close finalize transaction" disabled={mutation.isPending} onClick={onBack}>×</button>
      </header>
      {step === 'items' ? (
        <>
          <div className="transaction-dialog-body finalize-layout">
            <section className="finalize-left">
              <h3 className="finalize-section-title">Add more items</h3>
              <p className="finalize-section-sub">Select any additional services or products before payment.</p>
              <div className="finalize-picker-group">
                {([
                  ['service', visibleServiceOptions, serviceIds, serviceSearch, setServiceSearch, services],
                  ['product', visibleProductOptions, productIds, productSearch, setProductSearch, products],
                ] as const).map(([kind, options, selected, search, setSearch, query]) => (
                  <section className="finalize-picker" key={kind}>
                    <div className="finalize-picker-head">
                      <strong>{kind === 'service' ? 'Services' : 'Products'}</strong>
                      <span>Check to add / uncheck to remove</span>
                    </div>
                    <input
                      type="search"
                      aria-label={`Search ${kind === 'service' ? 'services' : 'products'}`}
                      autoComplete="off"
                      placeholder={`Search ${kind === 'service' ? 'services' : 'products'}...`}
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                    />
                    <div className="finalize-options">
                      {options.map((item) => (
                        <label className="finalize-option" key={item.id}>
                          <input
                            type="checkbox"
                            checked={selected.includes(item.id)}
                            disabled={kind === 'service' && !transaction.has_waiver && !item.existing}
                            onChange={() => toggle(kind, item.id)}
                          />
                          <span>{item.name}{item.existing ? <small>Original snapshot</small> : null}</span>
                          <strong>{formatMoney(item.price)}</strong>
                        </label>
                      ))}
                      {!options.length ? (
                        <p className="finalize-empty" aria-live="polite">
                          {query.isPending ? 'Loading items…' : query.isError ? 'Could not load items.' : 'No matching items.'}
                        </p>
                      ) : null}
                    </div>
                  </section>
                ))}
              </div>
              {error ? <p role="alert" className="dashboard-error finalize-error">{error}</p> : null}
            </section>
            <aside className="finalize-right">
              <h3 className="finalize-section-title">Transaction Summary</h3>
              <p className="finalize-section-sub">Updates immediately as items are selected.</p>
              <section className="finalize-summary-card">
                <header className="finalize-summary-head">
                  <h3>{transaction.client_name}</h3>
                  <p>{transaction.reference_code}</p>
                </header>
                <div className="finalize-summary-items">
                  {([
                    ['Services', serviceOptions.filter((item) => serviceIds.includes(item.id))],
                    ['Products', productOptions.filter((item) => productIds.includes(item.id))],
                  ] as const).map(([label, items]) => (
                    <section className="finalize-summary-group" key={label}>
                      <h4>{label}</h4>
                      {items.map((item) => (
                        <div className="finalize-summary-line" key={item.id}>
                          <span>{item.name}</span><strong>{formatMoney(item.price)}</strong>
                        </div>
                      ))}
                      {!items.length ? <p className="finalize-summary-empty">None selected</p> : null}
                    </section>
                  ))}
                </div>
                <footer className="finalize-summary-total"><span>Total amount</span><strong>{formatMoney(total)}</strong></footer>
              </section>
            </aside>
          </div>
          <footer className="transaction-dialog-foot finalize-footer">
            <button type="button" className="dashboard-button" onClick={onBack}>Back</button>
            <button type="button" className="dashboard-button primary" onClick={continueToPayment}>Proceed to payment</button>
          </footer>
        </>
      ) : (
        <form onSubmit={submit}>
          <div className="transaction-dialog-body payment-body">
            <section className="payment-total"><small>Amount to be paid</small><strong>{formatMoney(total)}</strong></section>
            <SelectField className="dashboard-field" label="Payment method" value={payment.method} options={[{ value: 'cash', label: 'Cash' }, { value: 'gcash', label: 'GCash' }, { value: 'maya', label: 'Maya' }, { value: 'bank_transfer', label: 'Bank transfer' }, { value: 'card', label: 'Card' }, { value: 'other', label: 'Other' }]} onValueChange={(method) => setPayment({ method, reference: method === 'cash' ? '' : payment.reference })} />
            {payment.method !== 'cash' ? <label className="dashboard-field"><span>Reference number</span><input value={payment.reference} onChange={(event) => setPayment({ ...payment, reference: event.target.value })} /></label> : null}
            {error ? <p role="alert" className="dashboard-error">{error}</p> : null}
            {mutation.isError ? <p role="alert" className="dashboard-error">{mutation.error.message}</p> : null}
          </div>
          <footer className="transaction-dialog-foot">
            <button type="button" className="dashboard-button" disabled={mutation.isPending} onClick={() => setStep('items')}>Back</button>
            <button type="submit" className="dashboard-button primary" disabled={mutation.isPending}>{mutation.isPending ? 'Finalizing…' : 'Confirm payment'}</button>
          </footer>
        </form>
      )}
    </dialog>
  )
}
