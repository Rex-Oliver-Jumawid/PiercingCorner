import { formatMoney } from '../dashboard/transactionModel'
import { manilaDateTime, paymentMethodLabel } from './salesModel'
import type { CompletedSale } from './salesModel'
import { statusClasses } from '../../components/ui/dashboard-styles'

export function SalesTable({
  rows,
  onSelect,
}: {
  rows: CompletedSale[]
  onSelect?: (id: string) => void
}) {
  return (
    <div className="overflow-x-auto">
      <table aria-label="Completed sales" className="w-full min-w-[760px] border-collapse bg-[#fff9eb]">
        <thead>
          <tr>
            <th className="h-[38px] bg-[#f5ddba] px-4 text-left text-[8px] tracking-[.6px] text-[#795346] uppercase">Reference</th>
            <th className="h-[38px] bg-[#f5ddba] px-4 text-left text-[8px] tracking-[.6px] text-[#795346] uppercase">Client</th>
            <th className="h-[38px] bg-[#f5ddba] px-4 text-left text-[8px] tracking-[.6px] text-[#795346] uppercase">Total</th>
            <th className="h-[38px] bg-[#f5ddba] px-4 text-left text-[8px] tracking-[.6px] text-[#795346] uppercase">Paid</th>
            <th className="h-[38px] bg-[#f5ddba] px-4 text-left text-[8px] tracking-[.6px] text-[#795346] uppercase">Method</th>
            <th className="h-[38px] bg-[#f5ddba] px-4 text-left text-[8px] tracking-[.6px] text-[#795346] uppercase">Status</th>
            <th className="h-[38px] bg-[#f5ddba] px-4 text-left text-[8px] tracking-[.6px] text-[#795346] uppercase">Items</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((sale) => (
            <tr
              key={sale.id}
              className={
                onSelect
                  ? 'cursor-pointer hover:bg-[#fff1cf] focus:bg-[#f7dfb3] focus:outline-2 focus:-outline-offset-2 focus:outline-[#d66335]'
                  : undefined
              }
              role={onSelect ? 'button' : undefined}
              tabIndex={onSelect ? 0 : undefined}
              aria-label={onSelect ? `Open sale ${sale.reference_code}` : undefined}
              onClick={() => onSelect?.(sale.id)}
              onKeyDown={(event) => {
                if (onSelect && (event.key === 'Enter' || event.key === ' ')) {
                  event.preventDefault()
                  onSelect(sale.id)
                }
              }}
            >
              <td className="border-t border-dashed border-[#dab08f] px-4 py-3 text-[10px] text-[#695249]">
                <strong className="block text-[#3b2923]">{sale.reference_code}</strong>
                <small className="text-[8px] text-[#84685e]">{manilaDateTime(sale.completed_at)}</small>
              </td>
              <td className="border-t border-dashed border-[#dab08f] px-4 py-3 text-[10px] text-[#3b2923] font-medium">
                {sale.client_name}
              </td>
              <td className="border-t border-dashed border-[#dab08f] px-4 py-3 text-[10px] font-bold text-[#3b2923]">
                {formatMoney(sale.total)}
              </td>
              <td className="border-t border-dashed border-[#dab08f] px-4 py-3 text-[10px] text-[#695249]">
                {formatMoney(sale.paid)}
              </td>
              <td className="border-t border-dashed border-[#dab08f] px-4 py-3 text-[10px] text-[#695249]">
                {paymentMethodLabel(sale.payment_methods)}
              </td>
              <td className="border-t border-dashed border-[#dab08f] px-4 py-3 text-[10px]">
                <span className={statusClasses('completed')}>Completed</span>
              </td>
              <td className="border-t border-dashed border-[#dab08f] px-4 py-3 text-[10px] text-[#84685e] max-w-[200px]">
                <span className="block truncate">
                  {sale.items.map((item) => `${item.name} · ${item.item_type}`).join(' + ')}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
