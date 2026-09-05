import { useEffect, useRef, useState } from 'react'
import { formatMoney } from '../dashboard/transactionModel'
import { useCompletedSale, useSaleWaiver } from './salesQueries'
import { downloadSaleWaiver } from './salesService'
import { manilaDateTime, paymentMethodLabel } from './salesModel'

export function SaleDetails({ id, onClose }: { id: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const detail = useCompletedSale(id)
  const waiver = useSaleWaiver(id, detail.data?.has_waiver ?? false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { const current = dialog.current; current?.showModal(); return () => current?.close() }, [])

  async function openPdf(download: boolean) {
    if (!waiver.data) return
    setError(null)
    const target = download ? null : window.open('', '_blank')
    try {
      const blob = await downloadSaleWaiver(waiver.data.pdf_storage_path)
      const url = URL.createObjectURL(blob)
      if (download) {
        const anchor = document.createElement('a'); anchor.href = url; anchor.download = `waiver-${detail.data?.reference_code ?? id}.pdf`; anchor.click()
      } else if (target) target.location.href = url
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (caught) { target?.close(); setError(caught instanceof Error ? caught.message : 'Unable to open the waiver.') }
  }

  return <dialog ref={dialog} className="sale-detail-dialog" aria-label="Completed sale details" onCancel={(event) => { event.preventDefault(); onClose() }}><header><div><p className="sales-eyebrow">OWNER · SALES</p><h2>{detail.data?.reference_code ?? 'Completed sale'}</h2>{detail.data ? <p>{manilaDateTime(detail.data.completed_at)} · {detail.data.client_name}</p> : null}</div><button type="button" aria-label="Close sale details" onClick={onClose}>×</button></header><div className="sale-detail-body">{detail.isPending ? <p role="status">Loading sale details…</p> : null}{detail.isError ? <p role="alert" className="sales-error">{detail.error.message}</p> : null}{detail.data ? <><dl className="sale-facts"><div><dt>Client snapshot</dt><dd>{detail.data.client_name}</dd></div><div><dt>Recorded by</dt><dd>{detail.data.recorded_by_name}</dd></div><div><dt>Completed</dt><dd>{manilaDateTime(detail.data.completed_at)}</dd></div><div><dt>Payment method</dt><dd>{paymentMethodLabel(detail.data.payments.map((payment) => payment.method))}</dd></div></dl><section className="sale-detail-section"><h3>Immutable item snapshots</h3>{detail.data.items.map((item) => <div className="sale-line" key={item.id}><span><b>{item.name}</b><small>{item.item_type} · Qty {item.quantity}</small></span><strong>{formatMoney(item.unit_price * item.quantity)}</strong></div>)}<footer><span>Total</span><strong>{formatMoney(detail.data.total)}</strong></footer></section><section className="sale-detail-section"><h3>Recorded payments</h3>{detail.data.payments.map((payment) => <div className="sale-line" key={payment.id}><span><b>{payment.method.replace('_', ' ')}</b><small>{payment.reference ? `Reference: ${payment.reference} · ` : ''}{manilaDateTime(payment.paid_at)}</small></span><strong>{formatMoney(payment.amount)}</strong></div>)}<footer><span>Paid</span><strong>{formatMoney(detail.data.paid)}</strong></footer></section>{detail.data.has_waiver ? <section className="sale-detail-section"><h3>Signed waiver</h3><p>{waiver.data ? `Template version ${waiver.data.template_version} · ${manilaDateTime(waiver.data.signed_at)}` : 'Loading signed waiver…'}</p><div className="sales-actions"><button type="button" disabled={!waiver.data} onClick={() => void openPdf(false)}>View PDF</button><button type="button" disabled={!waiver.data} onClick={() => void openPdf(true)}>Download PDF</button></div></section> : null}{error ? <p role="alert" className="sales-error">{error}</p> : null}</> : null}</div><footer className="sale-detail-foot"><button type="button" onClick={onClose}>Done</button></footer></dialog>
}
