import { formatMoney } from '../dashboard/transactionModel'
import { manilaDateTime, paymentMethodLabel } from './salesModel'
import type { CompletedSale } from './salesModel'

export function SalesTable({ rows, onSelect }: { rows: CompletedSale[]; onSelect?: (id: string) => void }) {
  return <div className="sales-table-wrap"><table aria-label="Completed sales"><thead><tr><th>Reference</th><th>Client</th><th>Total</th><th>Paid</th><th>Method</th><th>Status</th><th>Items</th></tr></thead><tbody>{rows.map((sale) => <tr key={sale.id} className={onSelect ? 'selectable' : undefined} role={onSelect ? 'button' : undefined} tabIndex={onSelect ? 0 : undefined} aria-label={onSelect ? `Open sale ${sale.reference_code}` : undefined} onClick={() => onSelect?.(sale.id)} onKeyDown={(event) => { if (onSelect && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onSelect(sale.id) } }}><td><strong>{sale.reference_code}</strong><small>{manilaDateTime(sale.completed_at)}</small></td><td>{sale.client_name}</td><td>{formatMoney(sale.total)}</td><td>{formatMoney(sale.paid)}</td><td>{paymentMethodLabel(sale.payment_methods)}</td><td><span className="sales-status">Completed</span></td><td><span className="sales-items">{sale.items.map((item) => `${item.name} · ${item.item_type}`).join(' + ')}</span></td></tr>)}</tbody></table></div>
}
