import { useEffect, useState } from 'react'
import { MetricCard } from '../../components/ui/MetricCard'
import { useAuth } from '../auth/useAuth'
import { formatMoney } from '../dashboard/transactionModel'
import type { PaymentMethod } from '../dashboard/transactionModel'
import { SaleDetails } from './SaleDetails'
import { SALES_PAGE_SIZE } from './salesModel'
import type { SaleFilters, SaleTypeFilter } from './salesModel'
import { useCompletedSales, useSalesMetrics } from './salesQueries'
import { SalesTable } from './SalesTable'
import './sales.css'

const initialFilters: SaleFilters = { search: '', type: 'all', paymentMethod: 'all' }

function SalesWorkspace() {
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState(initialFilters)
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const metrics = useSalesMetrics()
  const sales = useCompletedSales(filters, page)
  useEffect(() => { const timeout = window.setTimeout(() => { setFilters((current) => ({ ...current, search: search.trim() })); setPage(0) }, 300); return () => window.clearTimeout(timeout) }, [search])
  const pages = sales.data ? Math.max(1, Math.ceil(sales.data.count / SALES_PAGE_SIZE)) : 1

  return <section className="sales-page"><header className="sales-title"><p className="sales-eyebrow">OWNER · FINANCIAL RECORDS</p><h1>Sales</h1><p>Completed service and product transactions. Operational work remains on Dashboard until payment is recorded.</p></header><div className="sales-metrics" aria-label="Sales summary">{metrics.isPending ? <p role="status">Loading sales metrics…</p> : null}{metrics.isError ? <p role="alert" className="sales-error">{metrics.error.message}</p> : null}{metrics.data ? <><MetricCard icon="₱" label="Collected revenue" value={formatMoney(metrics.data.collected)} detail="Payments on completed transactions" /><MetricCard icon="▣" label="Completed transactions" value={metrics.data.completed_transactions} detail="Completed financial records" /><MetricCard icon="◇" label="Service sales" value={metrics.data.service_sales} detail="Completed transactions containing a service" /></> : null}</div><section className="sales-panel"><header className="sales-controls"><label><span>Search sales</span><input type="search" value={search} placeholder="Reference, client, or item" onChange={(event) => setSearch(event.target.value)} /></label><label><span>Item type</span><select value={filters.type} onChange={(event) => { setFilters({ ...filters, type: event.target.value as SaleTypeFilter }); setPage(0) }}><option value="all">All sales</option><option value="service">Contains service</option><option value="product">Contains product</option></select></label><label><span>Payment method</span><select value={filters.paymentMethod} onChange={(event) => { setFilters({ ...filters, paymentMethod: event.target.value as PaymentMethod | 'all' }); setPage(0) }}><option value="all">All methods</option><option value="cash">Cash</option><option value="gcash">GCash</option><option value="maya">Maya</option><option value="bank_transfer">Bank transfer</option><option value="card">Card</option><option value="other">Other</option></select></label></header><p className="sales-notice"><strong>No Draft sales:</strong> this page contains completed financial records only. Refunds and voids remain outside Phase 6.</p>{sales.isPending ? <p role="status" className="sales-message">Loading completed sales…</p> : null}{sales.isError ? <div role="alert" className="sales-message sales-error"><p>{sales.error.message}</p><button type="button" onClick={() => void sales.refetch()}>Try again</button></div> : null}{sales.data ? sales.data.rows.length ? <><SalesTable rows={sales.data.rows} onSelect={setSelected} /><nav className="sales-pagination" aria-label="Sales pages"><button type="button" disabled={page === 0 || sales.isFetching} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page + 1} of {pages} · {sales.data.count} sales</span><button type="button" disabled={page + 1 >= pages || sales.isFetching} onClick={() => setPage(page + 1)}>Next</button></nav></> : <div className="sales-empty"><h2>{filters.search || filters.type !== 'all' || filters.paymentMethod !== 'all' ? 'No matching completed sales' : 'No completed sales yet'}</h2><p>{filters.search || filters.type !== 'all' || filters.paymentMethod !== 'all' ? 'Try changing the search or filters.' : 'Completed Dashboard transactions will appear here.'}</p></div> : null}</section>{selected ? <SaleDetails id={selected} onClose={() => setSelected(null)} /> : null}</section>
}

export function SalesPage() {
  const { account, status } = useAuth()
  if (!account || status !== 'authenticated') return null
  return <SalesWorkspace key={`${account.id}:${account.role}`} />
}
