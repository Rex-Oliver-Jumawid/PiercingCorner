import { useState } from 'react'
import { X } from 'lucide-react'
import { formatMoney } from '../dashboard/transactionModel'
import { useCompletedSale, useSaleWaiver } from './salesQueries'
import { downloadSaleWaiver } from './salesService'
import { financialStatusLabel, manilaDateTime, paymentMethodLabel } from './salesModel'
import { CancelTransactionDialog } from './CancelTransactionDialog'
import { useRightSideDrawer } from '../../components/ui/useRightSideDrawer'
import { eyebrow } from '../../components/ui/studio-styles'
import {
  dashButton,
  operationDialog,
  statusClasses,
} from '../../components/ui/dashboard-styles'

export function SaleDetails({ id, onClose }: { id: string; onClose: () => void }) {
  const detail = useCompletedSale(id)
  const waiver = useSaleWaiver(id, detail.data?.has_waiver ?? false)
  const [error, setError] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const {
    dialog,
    setDialog,
    closing,
    requestClose,
    handleCancel,
    handleBackdropPointerDown,
  } = useRightSideDrawer(onClose)

  async function openPdf(download: boolean) {
    if (!waiver.data) return
    setError(null)
    const target = download ? null : window.open('', '_blank')
    try {
      const blob = await downloadSaleWaiver(waiver.data.pdf_storage_path)
      const url = URL.createObjectURL(blob)
      if (download) {
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = `waiver-${detail.data?.reference_code ?? id}.pdf`
        anchor.click()
      } else if (target) {
        target.location.href = url
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (caught) {
      target?.close()
      setError(caught instanceof Error ? caught.message : 'Unable to open the waiver.')
    }
  }

  return (
    <dialog
      ref={setDialog}
      className={`sale-detail-dialog right-side-drawer${closing ? ' is-closing' : ''} ${operationDialog} w-[min(640px,100%)] p-0`}
      aria-label="Completed sale details"
      onCancel={handleCancel}
      onPointerDown={(event) => {
        if (!cancelling) handleBackdropPointerDown(event)
      }}
    >
      <header className="sticky top-0 z-10 flex items-start justify-between border-b border-dashed border-[#c88f6e] bg-[#fff5df] px-[21px] py-[19px]">
        <div>
          <p className={`${eyebrow} mb-1 text-[8px] text-hippy-rust`}>OWNER · SALES</p>
          <h2 className="m-0 font-display text-[23px] font-bold text-hippy-ink">
            {detail.data?.reference_code ?? 'Completed sale'}
          </h2>
          {detail.data ? (
            <p className="mt-[5px] mb-0 text-[11px] text-[#785d53]">
              {manilaDateTime(detail.data.completed_at)} · {detail.data.client_name}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          className="grid size-[34px] shrink-0 cursor-pointer place-items-center rounded-[10px] border-[1.5px] border-hippy-ink bg-[#efc6a4] p-0 text-hippy-ink hover:bg-[#e8b58f]"
          aria-label="Close sale details"
          onClick={requestClose}
        >
          <X className="size-4" />
        </button>
      </header>

      <div className="flex flex-col gap-[16px] p-[21px] max-[700px]:p-4 overflow-y-auto">
        {detail.isPending ? <p role="status" className="text-xs text-studio-muted">Loading sale details…</p> : null}
        {detail.isError ? <p role="alert" className="sales-error">{detail.error.message}</p> : null}

        {detail.data ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <span className={statusClasses(detail.data.financial_status === 'completed' ? 'completed' : detail.data.financial_status === 'refund' ? 'confirmed' : 'cancelled')}>
                {financialStatusLabel(detail.data.financial_status)}
              </span>
              <span className="text-[10px] font-extrabold text-studio-muted">
                {paymentMethodLabel(detail.data.payments.map((p) => p.method))}
              </span>
            </div>

            <dl className="sale-facts m-0 grid grid-cols-2 gap-px overflow-hidden rounded-[14px] border-[1.5px] border-hippy-ink bg-hippy-ink [&>div]:bg-[#fff9eb] [&>div]:p-3 [&_dt]:mb-[5px] [&_dt]:text-[8px] [&_dt]:font-black [&_dt]:tracking-[.8px] [&_dt]:text-[#a34d30] [&_dt]:uppercase [&_dd]:m-0 [&_dd]:text-[11px] [&_dd]:font-bold [&_dd]:text-hippy-ink">
              <div>
                <dt>Client snapshot</dt>
                <dd>{detail.data.client_name}</dd>
              </div>
              <div>
                <dt>Recorded by</dt>
                <dd>{detail.data.recorded_by_name}</dd>
              </div>
              <div>
                <dt>Completed</dt>
                <dd>{manilaDateTime(detail.data.completed_at)}</dd>
              </div>
              <div>
                <dt>Payment method</dt>
                <dd>{paymentMethodLabel(detail.data.payments.map((payment) => payment.method))}</dd>
              </div>
            </dl>

            <section className="rounded-[14px] border-[1.5px] border-hippy-ink bg-[#fff9eb] p-3.5 shadow-[2px_2px_0_#3b2923]">
              <h3 className="m-0 mb-2 font-display text-[15px] font-bold text-hippy-ink">Immutable item snapshots</h3>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {detail.data.items.map((item) => (
                  <li
                    className="flex items-center justify-between gap-3 rounded-[10px] border border-dashed border-[#c88f6e] bg-[#fffdf7] px-3 py-2 text-[10px]"
                    key={item.id}
                  >
                    <span>
                      <strong className="block text-[#3b2923]">{item.name}</strong>
                      <small className="text-[8px] text-studio-muted">{item.item_type} · Qty {item.quantity}</small>
                    </span>
                    <strong className="text-hippy-ink">{formatMoney(item.unit_price * item.quantity)}</strong>
                  </li>
                ))}
              </ul>
              <footer className="mt-2.5 flex items-center justify-between border-t border-dashed border-[#c88f6e] pt-2 text-[11px] font-bold">
                <span>Total</span>
                <span className="font-display text-sm text-hippy-ink">{formatMoney(detail.data.total)}</span>
              </footer>
            </section>

            <section className="rounded-[14px] border-[1.5px] border-hippy-ink bg-[#fff9eb] p-3.5 shadow-[2px_2px_0_#3b2923]">
              <h3 className="m-0 mb-2 font-display text-[15px] font-bold text-hippy-ink">Sale summary</h3>
              <dl className="sale-adjustment-summary m-0 grid grid-cols-4 gap-px overflow-hidden rounded-[12px] border border-hippy-ink bg-hippy-ink max-[520px]:grid-cols-2 [&>div]:bg-[#fffdf7] [&>div]:p-2.5 [&_dt]:text-[8px] [&_dt]:font-black [&_dt]:text-[#a34d30] [&_dt]:uppercase [&_dd]:m-0 [&_dd]:mt-1 [&_dd]:text-[11px] [&_dd]:font-bold">
                <div><dt>Total</dt><dd>{formatMoney(detail.data.total)}</dd></div>
                <div><dt>Paid</dt><dd>{formatMoney(detail.data.paid)}</dd></div>
                <div><dt>Adjustments</dt><dd>{formatMoney(detail.data.adjustments)}</dd></div>
                <div><dt>Net total</dt><dd>{formatMoney(detail.data.net_total)}</dd></div>
              </dl>

              {detail.data.adjustment_history.length ? (
                <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0" aria-label="Adjustment history">
                  {detail.data.adjustment_history.map((adjustment) => (
                    <li key={adjustment.id} className="rounded-[10px] border border-dashed border-[#c88f6e] bg-[#fffdf7] p-2.5 text-[10px]">
                      <div className="flex justify-between gap-3">
                        <strong className="capitalize text-hippy-ink">{adjustment.type}</strong>
                        <strong className="text-hippy-ink">{formatMoney(adjustment.amount)}</strong>
                      </div>
                      <p className="my-1 text-[#695249]">{adjustment.reason}</p>
                      <small className="text-[8px] text-studio-muted">{adjustment.recorded_by_name} · {manilaDateTime(adjustment.created_at)}</small>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>

            <section className="rounded-[14px] border-[1.5px] border-hippy-ink bg-[#fff9eb] p-3.5 shadow-[2px_2px_0_#3b2923]">
              <h3 className="m-0 mb-2 font-display text-[15px] font-bold text-hippy-ink">Recorded payments</h3>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {detail.data.payments.map((payment) => (
                  <li
                    className="flex items-center justify-between gap-3 rounded-[10px] border border-dashed border-[#c88f6e] bg-[#fffdf7] px-3 py-2 text-[10px]"
                    key={payment.id}
                  >
                    <span>
                      <strong className="block capitalize text-[#3b2923]">{payment.method.replace('_', ' ')}</strong>
                      <small className="text-[8px] text-studio-muted">
                        {payment.reference ? `Reference: ${payment.reference} · ` : ''}
                        {manilaDateTime(payment.paid_at)}
                      </small>
                    </span>
                    <strong className="text-hippy-ink">{formatMoney(payment.amount)}</strong>
                  </li>
                ))}
              </ul>
              <footer className="mt-2.5 flex items-center justify-between border-t border-dashed border-[#c88f6e] pt-2 text-[11px] font-bold">
                <span>Paid</span>
                <span className="font-display text-sm text-hippy-ink">{formatMoney(detail.data.paid)}</span>
              </footer>
            </section>

            {detail.data.has_waiver ? (
              <section className="rounded-[14px] border-[1.5px] border-hippy-ink bg-[#fff9eb] p-3.5 shadow-[2px_2px_0_#3b2923]">
                <h3 className="m-0 mb-1.5 font-display text-[15px] font-bold text-hippy-ink">Signed waiver</h3>
                <p className="mt-0 mb-2.5 text-[10px] text-studio-muted">
                  {waiver.data
                    ? `Template version ${waiver.data.template_version} · ${manilaDateTime(waiver.data.signed_at)}`
                    : 'Loading signed waiver…'}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={dashButton({ variant: 'secondary' })}
                    disabled={!waiver.data}
                    onClick={() => void openPdf(false)}
                  >
                    View PDF
                  </button>
                  <button
                    type="button"
                    className={dashButton({ variant: 'primary' })}
                    disabled={!waiver.data}
                    onClick={() => void openPdf(true)}
                  >
                    Download PDF
                  </button>
                </div>
              </section>
            ) : null}

            {error ? <p role="alert" className="sales-error">{error}</p> : null}

            {detail.data.net_total > 0 ? (
              <section className="border-t border-dashed border-[#c88f6e] pt-3">
                <button
                  type="button"
                  className={`${dashButton({ variant: 'secondary' })} !bg-[#f0c0ad] !text-[#743b2d]`}
                  onClick={() => setCancelling(true)}
                >
                  Cancel Transaction
                </button>
              </section>
            ) : (
              <p className="m-0 text-[10px] text-studio-muted">
                {detail.data.financial_status === 'void'
                  ? 'This transaction has been voided.'
                  : 'This transaction has been fully refunded.'}
              </p>
            )}
          </>
        ) : null}
      </div>

      <footer className="flex justify-end border-t border-dashed border-[#c88f6e] bg-[#fff5df] px-[21px] py-3.5">
        <button
          type="button"
          className={dashButton({ variant: 'primary' })}
          onClick={requestClose}
        >
          Done
        </button>
      </footer>

      {detail.data && cancelling ? (
        <CancelTransactionDialog
          open
          sale={detail.data}
          portalContainer={dialog}
          onOpenChange={setCancelling}
        />
      ) : null}
    </dialog>
  )
}
