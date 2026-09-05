import { useEffect, useState } from 'react'
import {
  CircleDollarSign,
  Search,
  ShoppingBag,
  Sparkles,
} from 'lucide-react'
import { MetricCard } from '../../components/ui/MetricCard'
import {
  dashButton,
  dashField,
  emptyState,
  featureView,
  metricGridThree,
  tablePanel,
} from '../../components/ui/dashboard-styles'
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

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setFilters((current) => ({ ...current, search: search.trim() }))
      setPage(0)
    }, 300)
    return () => window.clearTimeout(timeout)
  }, [search])

  const pages = sales.data ? Math.max(1, Math.ceil(sales.data.count / SALES_PAGE_SIZE)) : 1

  return (
    <section className={`sales-page ${featureView}`}>

      <div className="sales-metrics" aria-label="Sales summary">
        {metrics.isPending ? <p role="status" className="text-xs text-studio-muted">Loading sales metrics…</p> : null}
        {metrics.isError ? <p role="alert" className="sales-error">{metrics.error.message}</p> : null}
        {metrics.data ? (
          <div className={metricGridThree}>
            <MetricCard
              icon={<CircleDollarSign />}
              label="Net revenue"
              value={formatMoney(metrics.data.net_revenue)}
              detail="Completed sales after adjustments"
            />
            <MetricCard
              icon={<ShoppingBag />}
              label="Completed transactions"
              value={metrics.data.completed_transactions}
              detail="Completed financial records"
            />
            <MetricCard
              icon={<Sparkles />}
              label="Adjustments"
              value={formatMoney(metrics.data.adjustments)}
              detail="Refunds and voids"
            />
          </div>
        ) : null}
      </div>

      <section className={tablePanel}>
        <div className="flex flex-wrap items-end gap-3 border-b border-dashed border-[#c88f6e] bg-[#f8e8c9] p-3.5">
          <label className={`${dashField} min-w-[240px] flex-1`}>
            <span>Search sales</span>
            <span className="relative block">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#84685e]" />
              <input
                className="!pl-9"
                type="search"
                value={search}
                placeholder="Reference, client, or item"
                onChange={(event) => setSearch(event.target.value)}
              />
            </span>
          </label>
          <label className={`${dashField} w-[180px] max-[640px]:w-full`}>
            <span>Item type</span>
            <select
              value={filters.type}
              onChange={(event) => {
                setFilters({ ...filters, type: event.target.value as SaleTypeFilter })
                setPage(0)
              }}
            >
              <option value="all">All sales</option>
              <option value="service">Contains service</option>
              <option value="product">Contains product</option>
            </select>
          </label>
          <label className={`${dashField} w-[180px] max-[640px]:w-full`}>
            <span>Payment method</span>
            <select
              value={filters.paymentMethod}
              onChange={(event) => {
                setFilters({
                  ...filters,
                  paymentMethod: event.target.value as PaymentMethod | 'all',
                })
                setPage(0)
              }}
            >
              <option value="all">All methods</option>
              <option value="cash">Cash</option>
              <option value="gcash">GCash</option>
              <option value="maya">Maya</option>
              <option value="bank_transfer">Bank transfer</option>
              <option value="card">Card</option>
              <option value="other">Other</option>
            </select>
          </label>
        </div>

        <p className="mx-4 my-2.5 rounded-[10px] border border-dashed border-[#c88f6e] bg-[#fff3d8] p-2.5 text-[10px] text-[#755448]">
          <strong>No Draft sales:</strong> this page contains completed financial records and their appended refund or void adjustments. Unpaid operational transactions remain on Dashboard.
        </p>

        {sales.isPending ? <p role="status" className="sales-message">Loading completed sales…</p> : null}
        {sales.isError ? (
          <div role="alert" className="sales-message sales-error">
            <p>{sales.error.message}</p>
            <button
              type="button"
              className={dashButton({ variant: 'secondary' })}
              onClick={() => void sales.refetch()}
            >
              Try again
            </button>
          </div>
        ) : null}

        {sales.data ? (
          sales.data.rows.length ? (
            <>
              <SalesTable rows={sales.data.rows} onSelect={setSelected} />
              <nav className="flex min-h-14 items-center justify-between gap-3 border-t border-dashed border-[#d6a786] px-4 py-2 text-[10px] text-studio-muted" aria-label="Sales pages">
                <span>
                  Page {page + 1} of {pages} · {sales.data.count} sales
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={dashButton({ variant: 'secondary' })}
                    disabled={page === 0 || sales.isFetching}
                    onClick={() => setPage(page - 1)}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    className={dashButton({ variant: 'secondary' })}
                    disabled={page + 1 >= pages || sales.isFetching}
                    onClick={() => setPage(page + 1)}
                  >
                    Next
                  </button>
                </div>
              </nav>
            </>
          ) : (
            <div className={emptyState}>
              <span><ShoppingBag /></span>
              <h2>
                {filters.search || filters.type !== 'all' || filters.paymentMethod !== 'all'
                  ? 'No matching completed sales'
                  : 'No completed sales yet'}
              </h2>
              <p>
                {filters.search || filters.type !== 'all' || filters.paymentMethod !== 'all'
                  ? 'Try changing the search or filters.'
                  : 'Completed Dashboard transactions will appear here.'}
              </p>
            </div>
          )
        ) : null}
      </section>

      {selected ? <SaleDetails id={selected} onClose={() => setSelected(null)} /> : null}
    </section>
  )
}

export function SalesPage() {
  const { account, status } = useAuth()
  if (!account || status !== 'authenticated') return null
  return <SalesWorkspace key={`${account.id}:${account.role}`} />
}
