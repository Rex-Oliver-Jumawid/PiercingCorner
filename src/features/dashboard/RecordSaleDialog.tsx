import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useDuplicates } from '../clients/clientQueries'
import { hasSaleDraft, useSaleStore } from './saleStore'
import { SignaturePad, type SignaturePadHandle } from './SignaturePad'
import { useActiveCatalog, useClientOptions, useDashboardMutation } from './transactionQueries'
import {
  abandonWaiverSigning,
  acceptNewServiceWaiver,
  finalizeSignedWaiver,
  finalizeTransaction,
  prepareWaiverSigning,
  recordProductSale,
  uploadWaiverDocuments,
} from './transactionService'
import { formatMoney, validateNewClient, validatePayment } from './transactionModel'
import type {
  AcceptedWaiverSigning,
  CatalogKind,
  ClientOption,
  NewClientDraft,
  WaiverPreparation,
} from './transactionModel'

function DialogHeader({ title, onClose, disabled }: { title: string; onClose: () => void; disabled?: boolean }) {
  return <header className="transaction-dialog-head"><div><p className="dashboard-eyebrow">DASHBOARD</p><h2>{title}</h2></div><button type="button" aria-label="Close record sale" disabled={disabled} onClick={onClose}>×</button></header>
}

function ItemSelector({ kind }: { kind: CatalogKind }) {
  const [search, setSearch] = useState('')
  const query = useActiveCatalog(kind)
  const selected = useSaleStore((state) => kind === 'service' ? state.serviceIds : state.productIds)
  const toggle = useSaleStore((state) => state.toggleItem)
  const clear = useSaleStore((state) => state.clearItems)
  const setStep = useSaleStore((state) => state.setStep)
  const plural = `${kind}s`
  const visible = (query.data ?? []).filter((item) => item.name.toLocaleLowerCase('en-PH').includes(search.trim().toLocaleLowerCase('en-PH')))
  return <>
    <div className="transaction-dialog-body">
      <label className="dashboard-field"><span>Search {plural}</span><input autoFocus type="search" value={search} placeholder={`Search ${plural}...`} onChange={(event) => setSearch(event.target.value)} /></label>
      {query.isPending ? <p role="status">Loading {plural}…</p> : null}
      {query.isError ? <p role="alert" className="dashboard-error">{query.error.message}</p> : null}
      <div className="sale-option-list">{visible.map((item) => <label key={item.id} className="sale-check-option"><input type="checkbox" checked={selected.includes(item.id)} onChange={() => toggle(kind, item.id)} /><strong>{item.name}</strong><span>{formatMoney(item.price)}</span></label>)}{query.data && !visible.length ? <p>No matching {plural}.</p> : null}</div>
    </div>
    <footer className="transaction-dialog-foot split"><button type="button" className="dashboard-button" onClick={() => clear(kind)}>Clear</button><button type="button" className="dashboard-button primary" onClick={() => setStep('details')}>Done</button></footer>
  </>
}

export function RecordSaleDialog({ onCompleted }: { onCompleted: (transactionId: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const signaturePad = useRef<SignaturePadHandle>(null)
  const cache = useQueryClient()
  const store = useSaleStore()
  const [clientSearch, setClientSearch] = useState('')
  const [clientErrors, setClientErrors] = useState<Partial<Record<keyof NewClientDraft, string>>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [preparation, setPreparation] = useState<WaiverPreparation | null>(null)
  const [accepted, setAccepted] = useState<AcceptedWaiverSigning | null>(null)
  const [signatureBlob, setSignatureBlob] = useState<Blob | null>(null)
  const [hasSignature, setHasSignature] = useState(false)
  const [waiverBusy, setWaiverBusy] = useState(false)
  const [completedId, setCompletedId] = useState<string | null>(null)
  const services = useActiveCatalog('service')
  const products = useActiveCatalog('product')
  const clientOptions = useClientOptions(clientSearch.trim(), store.open && store.clientMode === 'existing' && store.step === 'details')
  const newClient = validateNewClient(store.newClient).value
  const duplicateCandidate = store.step === 'duplicate_review' ? { full_name: newClient.full_name, email: newClient.email, phone: newClient.phone } : null
  const duplicates = useDuplicates(duplicateCandidate, undefined, 0)
  const selectedServices = useMemo(() => (services.data ?? []).filter((item) => store.serviceIds.includes(item.id)), [services.data, store.serviceIds])
  const selectedProducts = useMemo(() => (products.data ?? []).filter((item) => store.productIds.includes(item.id)), [products.data, store.productIds])
  const total = accepted?.total ?? [...selectedServices, ...selectedProducts].reduce((sum, item) => sum + item.price, 0)
  const productMutation = useDashboardMutation(recordProductSale, (result) => { setCompletedId(result.id); store.setStep('completed') })
  const servicePaymentMutation = useDashboardMutation(finalizeTransaction, (result) => { setCompletedId(result.id); store.setStep('completed') })
  const busy = productMutation.isPending || servicePaymentMutation.isPending || waiverBusy

  useEffect(() => { const current = dialog.current; current?.showModal(); return () => current?.close() }, [])

  function chooseExisting(client: ClientOption) { store.setExistingClient(client); setClientSearch(client.full_name) }

  async function beginWaiver() {
    setFormError(null); setPreparation(null); setAccepted(null); setSignatureBlob(null); setHasSignature(false); store.setStep('waiver'); setWaiverBusy(true)
    try { setPreparation(await prepareWaiverSigning()) }
    catch (error) { setFormError(error instanceof Error ? error.message : 'Could not prepare the waiver.') }
    finally { setWaiverBusy(false) }
  }

  function proceedFromDetails() {
    setFormError(null)
    if (!store.serviceIds.length && !store.productIds.length) { setFormError('Select at least one service or product.'); return }
    if (store.clientMode === 'existing') {
      if (!store.existingClient) { setFormError('Search for and select an existing client.'); return }
      if (store.serviceIds.length) void beginWaiver(); else store.setStep('payment')
      return
    }
    const validated = validateNewClient(store.newClient)
    setClientErrors(validated.errors)
    if (!Object.keys(validated.errors).length) store.setStep('duplicate_review')
  }

  function continueNewClient() { if (store.serviceIds.length) void beginWaiver(); else store.setStep('payment') }

  async function persistWaiver() {
    if (!preparation || (!hasSignature && !signatureBlob)) { setFormError('Customer signature is required.'); return }
    setWaiverBusy(true); setFormError(null)
    try {
      const png = signatureBlob ?? await signaturePad.current?.toPngBlob()
      if (!png) throw new Error('Could not export the signature.')
      setSignatureBlob(png)
      const signing = accepted ?? await acceptNewServiceWaiver({ eventId: preparation.event_id, existingClient: store.existingClient, newClient: store.newClient, serviceIds: store.serviceIds, productIds: store.productIds })
      setAccepted(signing)
      const { buildWaiverPdf } = await import('./waiverPdf')
      const pdf = await buildWaiverPdf({ transactionReference: signing.reference_code, clientName: signing.client_name, templateVersion: signing.template_version, templateBody: signing.template_body, signedAt: signing.signed_at, signaturePng: png })
      const paths = await uploadWaiverDocuments({ transactionId: signing.id, eventId: signing.event_id, signature: png, pdf })
      await finalizeSignedWaiver({ eventId: signing.event_id, signaturePath: paths.signature, pdfPath: paths.pdf })
      await cache.invalidateQueries({ queryKey: ['dashboard'] })
      store.setStep('payment')
    } catch (error) { setFormError(error instanceof Error ? error.message : 'Could not save the waiver.') }
    finally { setWaiverBusy(false) }
  }

  async function backFromWaiver() {
    if (accepted) {
      if (window.confirm('Leave this flow? The transaction will remain Pending and can be resumed from the Dashboard.')) { store.reset(); await cache.invalidateQueries({ queryKey: ['dashboard'] }) }
      return
    }
    if (preparation) void abandonWaiverSigning(preparation.event_id)
    setPreparation(null); setFormError(null); store.setStep('details')
  }

  function close() {
    if (busy) return
    if (accepted) {
      if (!window.confirm('Leave this flow? The transaction will remain Pending and can be resumed from the Dashboard.')) return
      store.reset(); void cache.invalidateQueries({ queryKey: ['dashboard'] }); return
    }
    if (hasSaleDraft(store) && !window.confirm('Discard this unfinished sale?')) return
    if (preparation) void abandonWaiverSigning(preparation.event_id)
    store.reset()
  }

  function submitPayment(event: FormEvent) {
    event.preventDefault()
    const error = validatePayment(store.payment); setFormError(error); if (error) return
    if (accepted) servicePaymentMutation.mutate({ transactionId: accepted.id, serviceIds: store.serviceIds, productIds: store.productIds, payment: store.payment })
    else productMutation.mutate({ existingClient: store.existingClient, newClient: store.newClient, productIds: store.productIds, payment: store.payment })
  }

  const title = store.step === 'services' ? 'Select Services' : store.step === 'products' ? 'Select Products' : store.step === 'waiver' ? 'Client Consent & Waiver' : store.step === 'payment' ? 'Complete Payment' : store.step === 'completed' ? 'Sale completed' : store.step === 'duplicate_review' ? 'Review Client Match' : 'Add Transaction'

  return <dialog ref={dialog} className="transaction-dialog" aria-label={title} onCancel={(event) => { event.preventDefault(); close() }}>
    {store.step !== 'completed' ? <DialogHeader title={title} onClose={close} disabled={busy} /> : null}
    {store.step === 'services' || store.step === 'products' ? <ItemSelector kind={store.step === 'services' ? 'service' : 'product'} /> : null}
    {store.step === 'details' ? <>
      <div className="transaction-dialog-body">
        <div className="sale-client-mode" role="group" aria-label="Client type"><button type="button" className={store.clientMode === 'existing' ? 'active' : ''} onClick={() => store.setClientMode('existing')}>Existing Client</button><button type="button" className={store.clientMode === 'new' ? 'active' : ''} onClick={() => store.setClientMode('new')}>Walk-in / New Client</button></div>
        {store.clientMode === 'existing' ? <div className="client-picker"><label className="dashboard-field"><span>Customer</span><input value={clientSearch} placeholder="Search customer name..." onChange={(event) => { setClientSearch(event.target.value); store.setExistingClient(null) }} /></label>{clientOptions.isPending ? <p role="status">Searching clients…</p> : null}{clientOptions.isError ? <p role="alert" className="dashboard-error">{clientOptions.error.message}</p> : null}{clientSearch !== store.existingClient?.full_name && clientOptions.data ? <div className="client-options" role="listbox" aria-label="Customer results">{clientOptions.data.map((client) => <button key={client.id} type="button" onClick={() => chooseExisting(client)}><strong>{client.full_name}</strong><small>{client.email || client.phone || 'No contact details'}</small></button>)}{!clientOptions.data.length ? <p>No matching clients.</p> : null}</div> : null}</div> : <div className="sale-new-client">{(['first_name', 'last_name', 'phone', 'email'] as const).map((field) => <label className="dashboard-field" key={field}><span>{field.replace('_', ' ')}</span><input type={field === 'email' ? 'email' : field === 'phone' ? 'tel' : 'text'} value={store.newClient[field]} aria-invalid={!!clientErrors[field]} onChange={(event) => store.setNewClient({ ...store.newClient, [field]: event.target.value })} />{clientErrors[field] ? <small>{clientErrors[field]}</small> : null}</label>)}</div>}
        <div className="sale-selectors"><button type="button" onClick={() => store.setStep('services')}><strong>Services</strong><span>{selectedServices.length ? `${selectedServices.length} selected` : 'Add services'} ›</span></button><button type="button" onClick={() => store.setStep('products')}><strong>Products</strong><span>{selectedProducts.length ? `${selectedProducts.length} selected` : 'Add products'} ›</span></button></div>
        <p className="sale-rule">Service sales require the customer to sign the waiver before payment. Product-only sales go directly to payment.</p>{formError ? <p role="alert" className="dashboard-error">{formError}</p> : null}
      </div><footer className="transaction-dialog-foot"><button type="button" className="dashboard-button" onClick={close}>Cancel</button><button type="button" className="dashboard-button primary" onClick={proceedFromDetails}>{store.serviceIds.length ? 'Continue to Waiver' : 'Continue to Payment'}</button></footer>
    </> : null}
    {store.step === 'duplicate_review' ? <><div className="transaction-dialog-body duplicate-review">{duplicates.isPending ? <p role="status">Checking for matching clients…</p> : null}{duplicates.isError ? <p role="alert" className="dashboard-error">Could not check for matching clients.</p> : null}{duplicates.data ? <><h3>{duplicates.data.count ? 'Possible matching clients' : 'Ready to continue'}</h3><p>{duplicates.data.count ? 'Use an existing record, or intentionally create a separate client.' : 'No matching clients were found.'}</p>{duplicates.data.rows.map((client) => <button type="button" className="duplicate-option" key={client.id} onClick={() => { store.setClientMode('existing'); chooseExisting(client); if (store.serviceIds.length) void beginWaiver(); else store.setStep('payment') }}><strong>{client.full_name}</strong><span>{client.email || client.phone || 'No contact details'}</span><b>Use existing</b></button>)}</> : null}</div><footer className="transaction-dialog-foot"><button type="button" className="dashboard-button" onClick={() => store.setStep('details')}>Back</button><button type="button" className="dashboard-button primary" disabled={duplicates.isFetching} onClick={continueNewClient}>{duplicates.data?.count ? 'Create separate client' : 'Continue'}</button></footer></> : null}
    {store.step === 'waiver' ? <><div className="transaction-dialog-body waiver-signing-body"><div className="waiver-client-card"><small>Full Name</small><strong>{store.existingClient?.full_name || newClient.full_name}</strong></div>{waiverBusy && !preparation ? <p role="status">Preparing the current waiver…</p> : null}{preparation ? <><section className="waiver-terms" aria-label="Waiver terms">{preparation.template_body.split(/\n\s*\n/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</section><section className="signature-section"><h3>Client Signature</h3><p>Use the mouse, touchscreen, or stylus to sign inside the box.</p><SignaturePad ref={signaturePad} disabled={waiverBusy || !!accepted} onInkChange={setHasSignature} /><button type="button" className="dashboard-button signature-clear" disabled={waiverBusy || !!accepted} onClick={() => signaturePad.current?.clear()}>Clear signature</button></section><p className="waiver-expiry">Template version {preparation.template_version} · This unsigned session expires at {new Date(preparation.expires_at).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' })}.</p></> : null}{accepted ? <p className="sale-rule">Transaction {accepted.reference_code} is Pending while its signed documents are saved. Retrying preserves the server signing time.</p> : null}{formError ? <p role="alert" className="dashboard-error">{formError}</p> : null}</div><footer className="transaction-dialog-foot"><button type="button" className="dashboard-button" disabled={waiverBusy} onClick={() => void backFromWaiver()}>Back</button><button type="button" className="dashboard-button primary" disabled={waiverBusy || !preparation || (!hasSignature && !signatureBlob)} onClick={() => void persistWaiver()}>{waiverBusy ? 'Saving waiver…' : accepted ? 'Retry waiver persistence' : 'Accept Waiver & Continue to Payment'}</button></footer></> : null}
    {store.step === 'payment' ? <form onSubmit={submitPayment}><div className="transaction-dialog-body payment-body"><section className="payment-total"><small>Amount to be paid</small><strong>{formatMoney(total)}</strong></section>{accepted ? <p className="sale-rule">Waiver signed. Complete payment to mark this service sale Completed.</p> : null}<label className="dashboard-field"><span>Payment method</span><select value={store.payment.method} onChange={(event) => store.setPayment({ method: event.target.value as typeof store.payment.method, reference: event.target.value === 'cash' ? '' : store.payment.reference })}><option value="cash">Cash</option><option value="gcash">GCash</option><option value="maya">Maya</option><option value="bank_transfer">Bank transfer</option><option value="card">Card</option><option value="other">Other</option></select></label>{store.payment.method !== 'cash' ? <label className="dashboard-field"><span>Reference number</span><input value={store.payment.reference} onChange={(event) => store.setPayment({ ...store.payment, reference: event.target.value })} /></label> : null}{formError ? <p role="alert" className="dashboard-error">{formError}</p> : null}{productMutation.isError ? <p role="alert" className="dashboard-error">{productMutation.error.message}</p> : null}{servicePaymentMutation.isError ? <p role="alert" className="dashboard-error">{servicePaymentMutation.error.message}</p> : null}</div><footer className="transaction-dialog-foot"><button type="button" className="dashboard-button" disabled={busy} onClick={accepted ? close : () => store.setStep('details')}>{accepted ? 'Leave as Pending' : 'Back'}</button><button type="submit" className="dashboard-button primary" disabled={busy}>{busy ? 'Completing…' : 'Complete Payment'}</button></footer></form> : null}
    {store.step === 'completed' ? <div className="completion-screen"><span aria-hidden="true">✓</span><h3>Sale completed</h3><p>{accepted ? 'The waiver and payment were recorded successfully. The service sale is now Completed.' : 'Payment was recorded successfully and the sale is now Completed.'}</p><button type="button" className="dashboard-button primary" onClick={() => { const id = completedId; store.reset(); if (id) onCompleted(id) }}>Done</button></div> : null}
  </dialog>
}
