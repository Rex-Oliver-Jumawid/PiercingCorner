import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
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
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const current = ref.current
    current?.showModal()
    return () => current?.close()
  }, [])
  return ref
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
  const dialog = useModal()
  const mutation = useDashboardMutation(
    ({ status }: { status: Exclude<TransactionStatus, 'completed'> }) =>
      updateTransactionStatus(transaction.id, status),
    onClose,
  )
  const open = transaction.status === 'pending' || transaction.status === 'ongoing'
  const hasServices = transaction.items.some((item) => item.item_type === 'service')
  const [waiverActionError, setWaiverActionError] = useState<string | null>(null)
  const [preparingWaiver, setPreparingWaiver] = useState(false)
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
    <dialog ref={dialog} className="transaction-dialog transaction-drawer" aria-label="Transaction details">
      <header className="transaction-dialog-head">
        <div>
          <p className="dashboard-eyebrow">TRANSACTION DETAILS</p>
          <h2>{transaction.reference_code}</h2>
          <p>{formatManilaTime(transaction.created_at)} · Manila time</p>
        </div>
        <button type="button" aria-label="Close transaction details" disabled={mutation.isPending} onClick={onClose}>×</button>
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
            <label className="dashboard-field">
              <span>Completion status</span>
              <select
                value={transaction.status}
                disabled={mutation.isPending}
                onChange={(event) =>
                  mutation.mutate({ status: event.target.value as 'pending' | 'ongoing' })
                }
              >
                <option value="pending">Pending</option>
                <option value="ongoing">Ongoing</option>
              </select>
            </label>
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
                onClick={() => {
                  if (window.confirm('Cancel this transaction?')) mutation.mutate({ status: 'cancelled' })
                }}
              >Cancel</button>
            </div>
            {hasServices && !transaction.has_waiver ? <p>A signed waiver is required before this transaction can be finalized.</p> : null}
            {transaction.payment_count ? <p>Transactions with existing payments cannot use the Phase 4 full-payment flow.</p> : null}
            {mutation.isError ? <p role="alert" className="dashboard-error">{mutation.error.message}</p> : null}
            {waiverActionError ? <p role="alert" className="dashboard-error">{waiverActionError}</p> : null}
          </section>
        ) : <p className="sale-rule">This transaction is {transaction.status} and has no further actions.</p>}
      </div>
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
  const dialog = useModal()
  const services = useActiveCatalog('service')
  const products = useActiveCatalog('product')
  const [serviceIds, setServiceIds] = useState(() =>
    transaction.items.flatMap((item) => item.service_id ?? []),
  )
  const [productIds, setProductIds] = useState(() =>
    transaction.items.flatMap((item) => item.product_id ?? []),
  )
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
    <dialog ref={dialog} className="transaction-dialog finalize-dialog" aria-label="Finalize transaction">
      <header className="transaction-dialog-head">
        <div><p className="dashboard-eyebrow">FINALIZE TRANSACTION</p><h2>{step === 'items' ? 'Review & Add Items' : 'Complete Payment'}</h2></div>
        <button type="button" aria-label="Close finalize transaction" disabled={mutation.isPending} onClick={onBack}>×</button>
      </header>
      {step === 'items' ? (
        <>
          <div className="transaction-dialog-body finalize-layout">
            <div className="finalize-pickers">
              {([
                ['service', serviceOptions, serviceIds],
                ['product', productOptions, productIds],
              ] as const).map(([kind, options, selected]) => (
                <section className="finalize-picker" key={kind}>
                  <h3>{kind === 'service' ? 'Services' : 'Products'}</h3>
                  {options.map((item) => (
                    <label key={item.id}>
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
                </section>
              ))}
            </div>
            <aside className="finalize-summary">
              <h3>Transaction Summary</h3>
              <p>{transaction.client_name} · {transaction.reference_code}</p>
              {[...serviceOptions, ...productOptions]
                .filter((item) =>
                  item.kind === 'service'
                    ? serviceIds.includes(item.id)
                    : productIds.includes(item.id),
                )
                .map((item) => <div key={item.id}><span>{item.name}</span><strong>{formatMoney(item.price)}</strong></div>)}
              <footer><span>Total amount</span><strong>{formatMoney(total)}</strong></footer>
            </aside>
            {error ? <p role="alert" className="dashboard-error">{error}</p> : null}
          </div>
          <footer className="transaction-dialog-foot">
            <button type="button" className="dashboard-button" onClick={onBack}>Back</button>
            <button type="button" className="dashboard-button primary" onClick={continueToPayment}>Proceed to payment</button>
          </footer>
        </>
      ) : (
        <form onSubmit={submit}>
          <div className="transaction-dialog-body payment-body">
            <section className="payment-total"><small>Amount to be paid</small><strong>{formatMoney(total)}</strong></section>
            <label className="dashboard-field"><span>Payment method</span>
              <select value={payment.method} onChange={(event) => setPayment({ method: event.target.value as PaymentDraft['method'], reference: event.target.value === 'cash' ? '' : payment.reference })}>
                <option value="cash">Cash</option><option value="gcash">GCash</option><option value="maya">Maya</option><option value="bank_transfer">Bank transfer</option><option value="card">Card</option><option value="other">Other</option>
              </select>
            </label>
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
