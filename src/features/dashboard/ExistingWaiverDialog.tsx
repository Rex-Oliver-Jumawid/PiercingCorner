import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { SignaturePad, type SignaturePadHandle } from './SignaturePad'
import { abandonWaiverSigning, acceptExistingTransactionWaiver, finalizeSignedWaiver, uploadWaiverDocuments } from './transactionService'
import type { AcceptedWaiverSigning, DashboardTransaction, WaiverPreparation } from './transactionModel'

export function ExistingWaiverDialog({ transaction, preparation, recoveredSigning = null, recoveredSignature = null, onBack, onPersisted }: {
  transaction: DashboardTransaction
  preparation: WaiverPreparation
  recoveredSigning?: AcceptedWaiverSigning | null
  recoveredSignature?: Blob | null
  onBack: () => void
  onPersisted: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const pad = useRef<SignaturePadHandle>(null)
  const cache = useQueryClient()
  const [hasInk, setHasInk] = useState(false)
  const [signature, setSignature] = useState<Blob | null>(recoveredSignature)
  const [accepted, setAccepted] = useState<AcceptedWaiverSigning | null>(recoveredSigning)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { const current = dialog.current; current?.showModal(); return () => current?.close() }, [])

  async function persist() {
    if (!hasInk && !signature) return
    setBusy(true); setError(null)
    try {
      const png = signature ?? await pad.current?.toPngBlob()
      if (!png) throw new Error('Could not export the signature.')
      setSignature(png)
      const signing = accepted ?? await acceptExistingTransactionWaiver(preparation.event_id)
      setAccepted(signing)
      const { buildWaiverPdf } = await import('./waiverPdf')
      const pdf = await buildWaiverPdf({ transactionReference: signing.reference_code, clientName: signing.client_name, templateVersion: signing.template_version, templateBody: signing.template_body, signedAt: signing.signed_at, signaturePng: png })
      const paths = await uploadWaiverDocuments({ transactionId: signing.id, eventId: signing.event_id, signature: png, pdf })
      await finalizeSignedWaiver({ eventId: signing.event_id, signaturePath: paths.signature, pdfPath: paths.pdf })
      await cache.invalidateQueries({ queryKey: ['dashboard'] })
      onPersisted()
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not save the waiver.') }
    finally { setBusy(false) }
  }

  function close() {
    if (busy) return
    if (accepted && !window.confirm('Leave this flow? The accepted transaction remains Pending.')) return
    if (!accepted) void abandonWaiverSigning(preparation.event_id)
    onBack()
  }

  return <dialog ref={dialog} className="transaction-dialog" aria-label="Client Consent & Waiver" onCancel={(event) => { event.preventDefault(); close() }}>
    <header className="transaction-dialog-head"><div><p className="dashboard-eyebrow">PIERCING CORNER</p><h2>Client Consent & Waiver</h2></div><button type="button" aria-label="Close waiver" disabled={busy} onClick={close}>×</button></header>
    <div className="transaction-dialog-body waiver-signing-body">
      <div className="waiver-client-card"><small>Full Name</small><strong>{preparation.client_name || transaction.client_name}</strong></div>
      <section className="waiver-terms" aria-label="Waiver terms">{preparation.template_body.split(/\n\s*\n/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</section>
      {recoveredSignature ? <p className="sale-rule">The uploaded signature and server signing time were recovered. Continue to regenerate and save the PDF.</p> : <section className="signature-section"><h3>Client Signature</h3><p>Use the mouse, touchscreen, or stylus to sign inside the box.</p><SignaturePad ref={pad} disabled={busy || !!accepted} onInkChange={setHasInk} /><button type="button" className="dashboard-button signature-clear" disabled={busy || !!accepted} onClick={() => pad.current?.clear()}>Clear signature</button></section>}
      <p className="waiver-expiry">Template version {preparation.template_version} · {accepted
        ? `Signed at ${new Date(accepted.signed_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}; this accepted event does not expire.`
        : `Unsigned session expires at ${new Date(preparation.expires_at).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' })}.`}</p>
      {accepted ? <p className="sale-rule">The server signing time is fixed. Retrying will only complete document persistence.</p> : null}
      {error ? <p role="alert" className="dashboard-error">{error}</p> : null}
    </div>
    <footer className="transaction-dialog-foot"><button type="button" className="dashboard-button" disabled={busy} onClick={close}>Back</button><button type="button" className="dashboard-button primary" disabled={busy || (!hasInk && !signature)} onClick={() => void persist()}>{busy ? 'Saving waiver…' : accepted ? 'Retry waiver persistence' : 'Accept Waiver & Continue to Payment'}</button></footer>
  </dialog>
}
