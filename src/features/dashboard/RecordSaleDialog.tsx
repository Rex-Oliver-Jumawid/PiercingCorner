import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronDown, Package, Plus, Search } from 'lucide-react'
import { ConfirmationDialog } from '../../components/ui/ConfirmationDialog'
import { useCheckDuplicates } from '../clients/clientQueries'
import { hasSaleDraft, useSaleStore } from './saleStore'
import { SignaturePad, type SignaturePadHandle } from './SignaturePad'
import { useActiveCatalog, useActiveStudioResources, useClientOptions, useDashboardMutation } from './transactionQueries'
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
  StudioResourceOption,
  WaiverPreparation,
} from './transactionModel'

function DialogHeader({ title, onClose, disabled }: { title: string; onClose: () => void; disabled?: boolean }) {
  return <header className="transaction-dialog-head"><div><p className="dashboard-eyebrow">DASHBOARD</p><h2>{title}</h2></div><button type="button" aria-label="Close record sale" disabled={disabled} onClick={onClose}>×</button></header>
}

function ItemSelector({ kind }: { kind: CatalogKind }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [search, setSearch] = useState('')
  const query = useActiveCatalog(kind)
  const selected = useSaleStore((state) => kind === 'service' ? state.serviceIds : state.productIds)
  const toggle = useSaleStore((state) => state.toggleItem)
  const clear = useSaleStore((state) => state.clearItems)
  const setStep = useSaleStore((state) => state.setStep)
  const plural = `${kind}s`
  const visible = (query.data ?? []).filter((item) => item.name.toLocaleLowerCase('en-PH').includes(search.trim().toLocaleLowerCase('en-PH')))
  useEffect(() => { const current = dialog.current; current?.showModal(); return () => current?.close() }, [])
  return <dialog ref={dialog} className="transaction-option-dialog" aria-label={`Select ${kind === 'service' ? 'Services' : 'Products'}`} onCancel={(event) => { event.preventDefault(); setStep('details') }}>
    <header className="transaction-dialog-head"><div><p className="dashboard-eyebrow">{plural}</p><h2>Select {kind === 'service' ? 'Services' : 'Products'}</h2></div><button type="button" aria-label="Close selector" onClick={() => setStep('details')}>×</button></header>
    <div className="transaction-option-body">
      <input aria-label={`Search ${plural}`} autoFocus className="transaction-option-search" type="search" value={search} placeholder={`Search ${plural}...`} onChange={(event) => setSearch(event.target.value)} />
      {query.isPending ? <p role="status">Loading {plural}…</p> : null}
      {query.isError ? <p role="alert" className="dashboard-error">{query.error.message}</p> : null}
      <div className="sale-option-list">{visible.map((item) => <label key={item.id} className="sale-check-option"><input type="checkbox" checked={selected.includes(item.id)} onChange={() => toggle(kind, item.id)} /><strong>{item.name}</strong><span>{formatMoney(item.price)}</span></label>)}{query.data && !visible.length ? <p>No matching {plural}.</p> : null}</div>
    </div>
    <footer className="transaction-option-foot"><button type="button" className="dashboard-button" onClick={() => clear(kind)}>Clear</button><button type="button" className="dashboard-button primary" onClick={() => setStep('details')}>Done</button></footer>
  </dialog>
}

function AssignmentPicker({
  label,
  placeholder,
  options,
  value,
  selected,
  onValueChange,
  onSelect,
}: {
  label: string
  placeholder: string
  options: StudioResourceOption[]
  value: string
  selected: StudioResourceOption | null
  onValueChange: (value: string) => void
  onSelect: (value: StudioResourceOption) => void
}) {
  const [focused, setFocused] = useState(false)
  const visible = options.filter((option) => option.name.toLocaleLowerCase('en-PH').includes(value.trim().toLocaleLowerCase('en-PH')))
  return <div className="artifact-field artifact-autocomplete"><label>{label}</label><div className="artifact-autocomplete-wrap"><input aria-label={label} autoComplete="off" value={value} placeholder={placeholder} onFocus={() => setFocused(true)} onBlur={() => window.setTimeout(() => setFocused(false), 100)} onChange={(event) => onValueChange(event.target.value)} /><ChevronDown aria-hidden="true" /></div>{focused ? <div className="artifact-suggestions" role="listbox" aria-label={`${label} options`}>{visible.map((option) => <button key={option.id} type="button" className={selected?.id === option.id ? 'selected' : ''} onMouseDown={(event) => event.preventDefault()} onClick={() => { onSelect(option); setFocused(false) }}>{option.name}</button>)}{!visible.length ? <p>No matching {label.toLocaleLowerCase('en-PH')}s.</p> : null}</div> : null}</div>
}

export function RecordSaleDialog({ onCompleted }: { onCompleted: (transactionId: string) => void }) {
  const [dialog, setDialog] = useState<HTMLDialogElement | null>(null)
  const signaturePad = useRef<SignaturePadHandle>(null)
  const cache = useQueryClient()
  const store = useSaleStore()
  const [clientSearch, setClientSearch] = useState('')
  const [clientFocused, setClientFocused] = useState(false)
  const [piercerSearch, setPiercerSearch] = useState('')
  const [stationSearch, setStationSearch] = useState('')
  const [piercer, setPiercer] = useState<StudioResourceOption | null>(null)
  const [station, setStation] = useState<StudioResourceOption | null>(null)
  const [clientErrors, setClientErrors] = useState<Partial<Record<keyof NewClientDraft, string>>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [preparation, setPreparation] = useState<WaiverPreparation | null>(null)
  const [accepted, setAccepted] = useState<AcceptedWaiverSigning | null>(null)
  const [signatureBlob, setSignatureBlob] = useState<Blob | null>(null)
  const [hasSignature, setHasSignature] = useState(false)
  const [waiverBusy, setWaiverBusy] = useState(false)
  const [completedId, setCompletedId] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState<'leave-pending' | 'discard-draft' | null>(null)
  const services = useActiveCatalog('service')
  const products = useActiveCatalog('product')
  const piercers = useActiveStudioResources('piercer')
  const stations = useActiveStudioResources('station')
  const clientQuery = clientSearch.trim()
  const selectingItems = store.step === 'services' || store.step === 'products'
  const visibleStep = selectingItems ? 'details' : store.step
  const clientOptions = useClientOptions(clientQuery, store.open && store.clientMode === 'existing' && visibleStep === 'details' && clientFocused)
  const newClient = validateNewClient(store.newClient).value
  const duplicateCheck = useCheckDuplicates()
  const selectedServices = useMemo(() => (services.data ?? []).filter((item) => store.serviceIds.includes(item.id)), [services.data, store.serviceIds])
  const selectedProducts = useMemo(() => (products.data ?? []).filter((item) => store.productIds.includes(item.id)), [products.data, store.productIds])
  const total = accepted?.total ?? [...selectedServices, ...selectedProducts].reduce((sum, item) => sum + item.price, 0)
  const productMutation = useDashboardMutation(recordProductSale, (result) => { setCompletedId(result.id); store.setStep('completed') })
  const servicePaymentMutation = useDashboardMutation(finalizeTransaction, (result) => { setCompletedId(result.id); store.setStep('completed') })
  const busy = productMutation.isPending || servicePaymentMutation.isPending || duplicateCheck.isPending || waiverBusy

  useEffect(() => { dialog?.showModal(); return () => dialog?.close() }, [dialog])

  function chooseExisting(client: ClientOption) { store.setExistingClient(client); setClientSearch(client.full_name) }

  async function beginWaiver() {
    setFormError(null); setPreparation(null); setAccepted(null); setSignatureBlob(null); setHasSignature(false); store.setStep('waiver'); setWaiverBusy(true)
    try { setPreparation(await prepareWaiverSigning()) }
    catch (error) { setFormError(error instanceof Error ? error.message : 'Could not prepare the waiver.') }
    finally { setWaiverBusy(false) }
  }

  async function proceedFromDetails() {
    setFormError(null)
    if (!store.serviceIds.length && !store.productIds.length) { setFormError('Select at least one service or product.'); return }
    if (store.clientMode === 'existing') {
      if (!store.existingClient) { setFormError('Search for and select an existing client.'); return }
      if (store.serviceIds.length) {
        if (!piercer || !station) { setFormError('Choose both a piercer and station for a service transaction.'); return }
        await beginWaiver()
      } else store.setStep('payment')
      return
    }
    const validated = validateNewClient(store.newClient)
    setClientErrors(validated.errors)
    if (Object.keys(validated.errors).length) return
    if (store.serviceIds.length && (!piercer || !station)) {
      setFormError('Choose both a piercer and station for a service transaction.')
      return
    }
    try {
      const matches = await duplicateCheck.mutateAsync(validated.value)
      if (matches.count) {
        store.setStep('duplicate_review')
        return
      }
      if (store.serviceIds.length) await beginWaiver()
      else store.setStep('payment')
    } catch {
      setFormError('Could not check for matching clients. Please try again.')
    }
  }

  function continueNewClient() {
    if (store.serviceIds.length) {
      if (!piercer || !station) { setFormError('Choose both a piercer and station for a service transaction.'); return }
      void beginWaiver()
    } else store.setStep('payment')
  }

  async function persistWaiver() {
    if (!preparation || (!hasSignature && !signatureBlob)) { setFormError('Customer signature is required.'); return }
    setWaiverBusy(true); setFormError(null)
    try {
      const png = signatureBlob ?? await signaturePad.current?.toPngBlob()
      if (!png) throw new Error('Could not export the signature.')
      setSignatureBlob(png)
      if (!piercer || !station) throw new Error('Choose both a piercer and station for a service transaction.')
      const signing = accepted ?? await acceptNewServiceWaiver({ eventId: preparation.event_id, existingClient: store.existingClient, newClient: store.newClient, serviceIds: store.serviceIds, productIds: store.productIds, piercerId: piercer.id, stationId: station.id })
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
      setConfirmation('leave-pending')
      return
    }
    if (preparation) void abandonWaiverSigning(preparation.event_id)
    setPreparation(null); setFormError(null); store.setStep('details')
  }

  function close() {
    if (busy) return
    if (accepted) {
      setConfirmation('leave-pending'); return
    }
    if (hasSaleDraft(store)) { setConfirmation('discard-draft'); return }
    if (preparation) void abandonWaiverSigning(preparation.event_id)
    store.reset()
  }

  function confirmClose() {
    if (confirmation === 'leave-pending') {
      store.reset()
      void cache.invalidateQueries({ queryKey: ['dashboard'] })
    } else if (confirmation === 'discard-draft') {
      if (preparation) void abandonWaiverSigning(preparation.event_id)
      store.reset()
    }
    setConfirmation(null)
  }

  function submitPayment(event: FormEvent) {
    event.preventDefault()
    const error = validatePayment(store.payment); setFormError(error); if (error) return
    if (accepted) servicePaymentMutation.mutate({ transactionId: accepted.id, serviceIds: store.serviceIds, productIds: store.productIds, payment: store.payment })
    else productMutation.mutate({ existingClient: store.existingClient, newClient: store.newClient, productIds: store.productIds, payment: store.payment })
  }

  const title = visibleStep === 'waiver' ? 'Client Consent & Waiver' : visibleStep === 'payment' ? 'Complete Payment' : visibleStep === 'completed' ? 'Sale completed' : visibleStep === 'duplicate_review' ? 'Review Client Match' : 'Add Transaction'

  return <><dialog ref={setDialog} className={`transaction-dialog ${visibleStep === 'details' ? 'add-transaction-dialog' : ''}`} aria-label={title} onCancel={(event) => { event.preventDefault(); close() }}>
    {visibleStep !== 'completed' ? <DialogHeader title={title} onClose={close} disabled={busy} /> : null}
    {visibleStep === 'details' ? <>
      <div className="transaction-dialog-body artifact-modal-body">
        <div className="artifact-client-mode" role="group" aria-label="Client type"><button type="button" className={store.clientMode === 'existing' ? 'active' : ''} onClick={() => store.setClientMode('existing')}>Existing Client</button><button type="button" className={store.clientMode === 'new' ? 'active' : ''} onClick={() => store.setClientMode('new')}>Walk-in / New Client</button></div>
        {store.clientMode === 'existing' ? <section className="artifact-client-section"><div className="artifact-field artifact-autocomplete"><label>Customer</label><div className="artifact-autocomplete-wrap"><input aria-label="Customer" autoComplete="off" value={clientSearch} placeholder="Search customer name..." onFocus={() => setClientFocused(true)} onBlur={() => window.setTimeout(() => setClientFocused(false), 100)} onChange={(event) => { setClientSearch(event.target.value); store.setExistingClient(null) }} /><Search aria-hidden="true" /></div>{clientFocused ? <div className="artifact-suggestions" role="listbox" aria-label="Customer results">{clientOptions.isPending ? <p role="status">Searching clients…</p> : null}{clientOptions.isError ? <p role="alert" className="dashboard-error">{clientOptions.error.message}</p> : null}{clientSearch !== store.existingClient?.full_name && clientOptions.data ? clientOptions.data.map((client) => <button key={client.id} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { chooseExisting(client); setClientFocused(false) }}>{client.full_name}<small>{client.email || client.phone || 'No contact details'}</small></button>) : null}{clientOptions.data && !clientOptions.data.length ? <p>No matching clients.</p> : null}</div> : null}</div></section> : <section className="artifact-client-section"><div className="artifact-walkin-grid">{(['first_name', 'last_name', 'phone', 'email'] as const).map((field) => <label className="artifact-field" key={field}><span>{field.replace('_', ' ')}</span><input placeholder={field === 'phone' ? '09XXXXXXXXX' : field === 'email' ? 'client@example.com' : field.replace('_', ' ')} type={field === 'email' ? 'email' : field === 'phone' ? 'tel' : 'text'} value={store.newClient[field]} aria-invalid={!!clientErrors[field]} onChange={(event) => store.setNewClient({ ...store.newClient, [field]: event.target.value })} />{clientErrors[field] ? <small>{clientErrors[field]}</small> : null}</label>)}</div></section>}
        <div className="artifact-form-grid"><div className="artifact-field"><label>Services</label><button type="button" aria-label="Services" className="artifact-selector-button" onClick={() => store.setStep('services')}><span className="artifact-selector-main"><span className="artifact-selector-icon"><Plus aria-hidden="true" /></span><span className="artifact-selector-copy"><strong>{selectedServices.length ? selectedServices.map((item) => item.name).join(', ') : 'Add services'}</strong><small>{selectedServices.length ? `${selectedServices.length} selected` : 'None selected'}</small></span></span><span aria-hidden="true" className="artifact-selector-chevron">›</span></button></div><div className="artifact-field"><label>Products</label><button type="button" aria-label="Products" className="artifact-selector-button" onClick={() => store.setStep('products')}><span className="artifact-selector-main"><span className="artifact-selector-icon"><Package aria-hidden="true" /></span><span className="artifact-selector-copy"><strong>{selectedProducts.length ? selectedProducts.map((item) => item.name).join(', ') : 'Add products'}</strong><small>{selectedProducts.length ? `${selectedProducts.length} selected` : 'None selected'}</small></span></span><span aria-hidden="true" className="artifact-selector-chevron">›</span></button></div><AssignmentPicker label="Piercer" placeholder="Search or choose piercer..." options={piercers.data ?? []} value={piercerSearch} selected={piercer} onValueChange={(value) => { setPiercerSearch(value); setPiercer(null) }} onSelect={(option) => { setPiercer(option); setPiercerSearch(option.name) }} /><AssignmentPicker label="Station" placeholder="Search or choose station..." options={stations.data ?? []} value={stationSearch} selected={station} onValueChange={(value) => { setStationSearch(value); setStation(null) }} onSelect={(option) => { setStation(option); setStationSearch(option.name) }} /></div>
        <p className="artifact-rule-box">Choose at least one service or product. Service transactions require a client, piercer, station, and signed waiver. Product-only purchases proceed directly to payment.</p>{formError ? <p role="alert" className="dashboard-error">{formError}</p> : null}
        <div className="artifact-action-row"><button type="button" className="artifact-primary-btn" disabled={busy} onClick={() => void proceedFromDetails()}>Create Transaction Preview</button></div>
      </div>
    </> : null}
    {visibleStep === 'duplicate_review' ? <><div className="transaction-dialog-body duplicate-review"><h3>Possible matching clients</h3><p>Use an existing record, or intentionally create a separate client.</p>{duplicateCheck.data?.rows.map((client) => <button type="button" className="duplicate-option" key={client.id} onClick={() => { store.setClientMode('existing'); chooseExisting(client); if (store.serviceIds.length) void beginWaiver(); else store.setStep('payment') }}><strong>{client.full_name}</strong><span>{client.email || client.phone || 'No contact details'}</span><b>Use existing</b></button>)}</div><footer className="transaction-dialog-foot"><button type="button" className="dashboard-button" onClick={() => store.setStep('details')}>Back</button><button type="button" className="dashboard-button primary" onClick={continueNewClient}>Create separate client</button></footer></> : null}
    {visibleStep === 'waiver' ? <><div className="transaction-dialog-body waiver-signing-body"><div className="waiver-client-card"><small>Full Name</small><strong>{store.existingClient?.full_name || newClient.full_name}</strong></div>{waiverBusy && !preparation ? <p role="status">Preparing the current waiver…</p> : null}{preparation ? <><section className="waiver-terms" aria-label="Waiver terms">{preparation.template_body.split(/\n\s*\n/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</section><section className="signature-section"><h3>Client Signature</h3><p>Use the mouse, touchscreen, or stylus to sign inside the box.</p><SignaturePad ref={signaturePad} disabled={waiverBusy || !!accepted} onInkChange={setHasSignature} /><button type="button" className="dashboard-button signature-clear" disabled={waiverBusy || !!accepted} onClick={() => signaturePad.current?.clear()}>Clear signature</button></section><p className="waiver-expiry">Template version {preparation.template_version} · This unsigned session expires at {new Date(preparation.expires_at).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' })}.</p></> : null}{accepted ? <p className="sale-rule">Transaction {accepted.reference_code} is Pending while its signed documents are saved. Retrying preserves the server signing time.</p> : null}{formError ? <p role="alert" className="dashboard-error">{formError}</p> : null}</div><footer className="transaction-dialog-foot"><button type="button" className="dashboard-button" disabled={waiverBusy} onClick={() => void backFromWaiver()}>Back</button><button type="button" className="dashboard-button primary" disabled={waiverBusy || !preparation || (!hasSignature && !signatureBlob)} onClick={() => void persistWaiver()}>{waiverBusy ? 'Saving waiver…' : accepted ? 'Retry waiver persistence' : 'Accept Waiver & Continue to Payment'}</button></footer></> : null}
    {visibleStep === 'payment' ? <form onSubmit={submitPayment}><div className="transaction-dialog-body payment-body"><section className="payment-total"><small>Amount to be paid</small><strong>{formatMoney(total)}</strong></section>{accepted ? <p className="sale-rule">Waiver signed. Complete payment to mark this service sale Completed.</p> : null}<label className="dashboard-field"><span>Payment method</span><select value={store.payment.method} onChange={(event) => store.setPayment({ method: event.target.value as typeof store.payment.method, reference: event.target.value === 'cash' ? '' : store.payment.reference })}><option value="cash">Cash</option><option value="gcash">GCash</option><option value="maya">Maya</option><option value="bank_transfer">Bank transfer</option><option value="card">Card</option><option value="other">Other</option></select></label>{store.payment.method !== 'cash' ? <label className="dashboard-field"><span>Reference number</span><input value={store.payment.reference} onChange={(event) => store.setPayment({ ...store.payment, reference: event.target.value })} /></label> : null}{formError ? <p role="alert" className="dashboard-error">{formError}</p> : null}{productMutation.isError ? <p role="alert" className="dashboard-error">{productMutation.error.message}</p> : null}{servicePaymentMutation.isError ? <p role="alert" className="dashboard-error">{servicePaymentMutation.error.message}</p> : null}</div><footer className="transaction-dialog-foot"><button type="button" className="dashboard-button" disabled={busy} onClick={accepted ? close : () => store.setStep('details')}>{accepted ? 'Leave as Pending' : 'Back'}</button><button type="submit" className="dashboard-button primary" disabled={busy}>{busy ? 'Completing…' : 'Complete Payment'}</button></footer></form> : null}
    {visibleStep === 'completed' ? <div className="completion-screen"><span aria-hidden="true">✓</span><h3>Sale completed</h3><p>{accepted ? 'The waiver and payment were recorded successfully. The service sale is now Completed.' : 'Payment was recorded successfully and the sale is now Completed.'}</p><button type="button" className="dashboard-button primary" onClick={() => { const id = completedId; store.reset(); if (id) onCompleted(id) }}>Done</button></div> : null}
    <ConfirmationDialog
      open={confirmation !== null}
      title={confirmation === 'leave-pending' ? 'Leave this transaction?' : 'Discard this transaction draft?'}
      description={confirmation === 'leave-pending' ? 'The transaction will remain Pending and can be resumed later from the Dashboard.' : 'The selected client, items, piercer, and station will be cleared. This draft cannot be recovered.'}
      confirmLabel={confirmation === 'leave-pending' ? 'Leave as Pending' : 'Discard draft'}
      cancelLabel={confirmation === 'leave-pending' ? 'Continue transaction' : 'Keep editing'}
      destructive={confirmation === 'discard-draft'}
      portalContainer={dialog}
      onOpenChange={(open) => { if (!open) setConfirmation(null) }}
      onConfirm={confirmClose}
    />
  </dialog>{selectingItems ? <ItemSelector kind={store.step === 'services' ? 'service' : 'product'} /> : null}</>
}
