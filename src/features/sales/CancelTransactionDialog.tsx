import { useState } from 'react'
import { RotateCcw, XCircle } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../components/ui/alert-dialog'
import { dashButton, dashField } from '../../components/ui/dashboard-styles'
import { formatMoney } from '../dashboard/transactionModel'
import { useCancelCompletedTransaction } from './salesQueries'
import type { TransactionAdjustmentType } from './salesModel'

export function CancelTransactionDialog({
  open,
  sale,
  portalContainer,
  onOpenChange,
}: {
  open: boolean
  sale: { id: string; reference_code: string; net_total: number }
  portalContainer: HTMLElement | null
  onOpenChange: (open: boolean) => void
}) {
  const [type, setType] = useState<TransactionAdjustmentType>('refund')
  const [reason, setReason] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)
  const cancellation = useCancelCompletedTransaction()

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmedReason = reason.trim()
    if (!trimmedReason) {
      setValidationError('A reason is required.')
      return
    }
    setValidationError(null)
    try {
      await cancellation.mutateAsync({ id: sale.id, type, reason: trimmedReason })
      onOpenChange(false)
    } catch {
      // The mutation error is rendered below with a safe service-level message.
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(nextOpen) => {
      if (!cancellation.isPending) onOpenChange(nextOpen)
    }}>
      <AlertDialogContent portalContainer={portalContainer} className="w-[min(620px,calc(100%-32px))]">
        <AlertDialogHeader>
          <p className="mb-1 text-[8px] font-black tracking-[1.4px] text-hippy-rust uppercase">Cancel transaction</p>
          <AlertDialogTitle>Refund or void</AlertDialogTitle>
          <p className="mt-1.5 mb-0 text-[10px] text-studio-muted">{sale.reference_code}</p>
        </AlertDialogHeader>

        <form id="cancel-transaction-form" className="flex flex-col gap-3 p-5" onSubmit={(event) => void submit(event)}>
          <p className="m-0 rounded-[10px] border border-dashed border-[#c98965] bg-[#fff3d8] p-3 text-[10px]/[1.5] text-[#755448]">
            Choose how this completed transaction should be cancelled. The original sale remains preserved and the selected action is recorded as an adjustment.
          </p>

          <fieldset className="grid grid-cols-2 gap-2.5 border-0 p-0 max-[520px]:grid-cols-1">
            <legend className="sr-only">Cancellation type</legend>
            {([
              { value: 'refund' as const, icon: <RotateCcw />, title: 'Refund', detail: 'Refund the full remaining refundable amount.' },
              { value: 'void' as const, icon: <XCircle />, title: 'Void', detail: 'Void the remaining transaction value. No void amount is entered.' },
            ]).map((option) => (
              <label
                key={option.value}
                className={`relative cursor-pointer rounded-[14px] border-[1.5px] border-hippy-ink p-3 shadow-[2px_2px_0_#d9a47e] ${type === option.value ? 'bg-[#f8d7a5] outline-2 outline-hippy-orange' : 'bg-[#fff9eb]'}`}
              >
                <input
                  className="sr-only"
                  type="radio"
                  name="adjustment-type"
                  value={option.value}
                  checked={type === option.value}
                  onChange={() => setType(option.value)}
                />
                <strong className="flex items-center gap-2 text-[11px] text-hippy-ink [&_svg]:size-4">{option.icon}{option.title}</strong>
                <span className="mt-1.5 block text-[9px]/[1.4] text-studio-muted">{option.detail}</span>
              </label>
            ))}
          </fieldset>

          {type === 'refund' ? (
            <label className={dashField}>
              <span>Refund amount (PHP)</span>
              <input value={formatMoney(sale.net_total)} readOnly aria-readonly="true" />
            </label>
          ) : null}

          <label className={dashField}>
            <span>Reason</span>
            <textarea
              value={reason}
              placeholder="Required reason for this cancellation"
              disabled={cancellation.isPending}
              onChange={(event) => {
                setReason(event.target.value)
                if (validationError) setValidationError(null)
              }}
            />
          </label>

          {validationError ? <p role="alert" className="sales-error m-0 text-[10px]">{validationError}</p> : null}
          {cancellation.isError ? <p role="alert" className="sales-error m-0 text-[10px]">{cancellation.error.message}</p> : null}
        </form>

        <AlertDialogFooter>
          <AlertDialogCancel className={dashButton({ variant: 'secondary' })} disabled={cancellation.isPending}>Back</AlertDialogCancel>
          <button
            type="submit"
            form="cancel-transaction-form"
            className={dashButton({ variant: 'primary' })}
            disabled={cancellation.isPending}
          >
            {cancellation.isPending ? 'Recording…' : type === 'refund' ? 'Confirm refund' : 'Confirm void'}
          </button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
