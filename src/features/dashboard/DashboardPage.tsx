import { useEffect, useState } from 'react'
import { CalendarDays, Plus, Search } from 'lucide-react'
import { useAuth } from '../auth/useAuth'
import { RecordSaleDialog } from './RecordSaleDialog'
import { ExistingWaiverDialog } from './ExistingWaiverDialog'
import { useSaleStore } from './saleStore'
import { FinalizeDialog, TransactionDialog } from './TransactionDialog'
import { useTransactions } from './transactionQueries'
import { formatManilaTime, formatMoney } from './transactionModel'
import type { AcceptedWaiverSigning, DashboardTransaction, WaiverPreparation } from './transactionModel'
import {
  dashButton,
  dashField,
  emptyState,
  featureView,
  statusClasses,
  tablePanel,
} from '../../components/ui/dashboard-styles'
import './dashboard.css'

function DashboardWorkspace() {
  const [search, setSearch] = useState('')
  const [committedSearch, setCommittedSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [finalizingId, setFinalizingId] = useState<string | null>(null)
  const [signing, setSigning] = useState<{
    transaction: DashboardTransaction
    preparation: WaiverPreparation
    recoveredSigning?: AcceptedWaiverSigning | null
    recoveredSignature?: Blob | null
  } | null>(null)
  const saleOpen = useSaleStore((state) => state.open)
  const startSale = useSaleStore((state) => state.start)
  const resetSale = useSaleStore((state) => state.reset)
  const query = useTransactions(committedSearch)

  useEffect(() => {
    const timeout = setTimeout(() => setCommittedSearch(search.trim()), 300)
    return () => clearTimeout(timeout)
  }, [search])

  useEffect(() => () => resetSale(), [resetSale])

  const selected = query.data?.find((transaction) => transaction.id === selectedId)
  const finalizing = query.data?.find((transaction) => transaction.id === finalizingId)

  return (
    <section className={`dashboard-page ${featureView}`}>
      <article className={`${tablePanel} dashboard-transaction-panel`}>
        <header className="dashboard-transaction-head">
          <div>
            <h2>Today&apos;s transactions</h2>
            <p>Operational workspace for Owner and Staff</p>
          </div>
          <div className="dashboard-transaction-actions">
            <label className={`${dashField} dashboard-transaction-search`}>
              <span className="sr-only">Search transactions</span>
              <span className="relative block">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#84685e]" />
                <input
                  className="!pl-9"
                  type="search"
                  value={search}
                  placeholder="Search transactions..."
                  onChange={(event) => setSearch(event.target.value)}
                />
              </span>
            </label>
            <button
              type="button"
              className={`${dashButton({ variant: 'primary' })} dashboard-add-transaction`}
              onClick={startSale}
            >
              <Plus aria-hidden="true" className="size-4" />
              <span>Add Transaction</span>
            </button>
          </div>
        </header>

        {query.isPending ? <p role="status" className="dashboard-message">Loading today’s transactions…</p> : null}
        {query.isError ? (
          <div role="alert" className="dashboard-message dashboard-error">
            <p>{query.error.message}</p>
            <button type="button" className={dashButton({ variant: 'secondary' })} onClick={() => void query.refetch()}>
              Try again
            </button>
          </div>
        ) : null}

        {query.data ? (
          query.data.length ? (
            <div className="dashboard-transaction-table">
              <table aria-label="Today's transactions dashboard">
                <thead>
                  <tr>
                    <th>Time logged</th>
                    <th>Customer</th>
                    <th>Recorded by</th>
                    <th>Completion status</th>
                  </tr>
                </thead>
                <tbody>
                  {query.data.map((transaction) => (
                    <tr
                      key={transaction.id}
                      role="button"
                      tabIndex={0}
                      className="dashboard-transaction-row"
                      aria-label={`Open transaction ${transaction.reference_code} for ${transaction.client_name}`}
                      onClick={() => setSelectedId(transaction.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          setSelectedId(transaction.id)
                        }
                      }}
                    >
                      <td>
                        <strong className="dashboard-cell-main">{formatManilaTime(transaction.created_at)}</strong>
                        <small className="dashboard-cell-sub">{transaction.reference_code}</small>
                      </td>
                      <td>
                        <div className="dashboard-customer-cell">
                          <span aria-hidden="true" className="dashboard-avatar">{transaction.client_name.slice(0, 1)}</span>
                          <span className="min-w-0">
                            <strong className="dashboard-cell-main">{transaction.client_name}</strong>
                            <small className="dashboard-cell-sub">
                              {transaction.items.map((item) => item.name).join(' · ') || 'No items'}
                            </small>
                          </span>
                        </div>
                      </td>
                      <td>
                        <strong className="dashboard-cell-main">{transaction.recorded_by_name}</strong>
                        <small className="dashboard-cell-sub">{formatMoney(transaction.total)}</small>
                      </td>
                      <td>
                        <span className={statusClasses(transaction.status)}>
                          {transaction.status.replace('_', ' ')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className={emptyState}>
              <span><CalendarDays /></span>
              <h2>{committedSearch ? 'No matching transactions' : 'No transactions today'}</h2>
              <p>
                {committedSearch
                  ? 'Try a different search query.'
                  : 'Use Add Transaction to record your first studio sale or procedure today.'}
              </p>
              {!committedSearch && (
                <button
                  type="button"
                  className={`${dashButton({ variant: 'primary' })} mt-2`}
                  onClick={startSale}
                >
                  Add Transaction
                </button>
              )}
            </div>
          )
        ) : null}
      </article>

      {saleOpen ? (
        <RecordSaleDialog
          onCompleted={(id) => {
            setSelectedId(id)
          }}
        />
      ) : null}
      {selected ? (
        <TransactionDialog
          transaction={selected}
          onClose={() => setSelectedId(null)}
          onFinalize={() => {
            setSelectedId(null)
            setFinalizingId(selected.id)
          }}
          onSignWaiver={(input) => {
            setSelectedId(null)
            setSigning({ transaction: selected, ...input })
          }}
        />
      ) : null}
      {signing ? (
        <ExistingWaiverDialog
          transaction={signing.transaction}
          preparation={signing.preparation}
          recoveredSigning={signing.recoveredSigning}
          recoveredSignature={signing.recoveredSignature}
          onBack={() => {
            setSigning(null)
            setSelectedId(signing.transaction.id)
          }}
          onPersisted={() => {
            setSigning(null)
            setFinalizingId(signing.transaction.id)
          }}
        />
      ) : null}
      {finalizing ? (
        <FinalizeDialog
          transaction={finalizing}
          onBack={() => {
            setFinalizingId(null)
            setSelectedId(finalizing.id)
          }}
          onCompleted={() => {
            setFinalizingId(null)
            setSelectedId(finalizing.id)
          }}
        />
      ) : null}
    </section>
  )
}

export function DashboardPage() {
  const { account, status } = useAuth()
  if (!account || status !== 'authenticated') return null
  return <DashboardWorkspace key={`${account.id}:${account.role}`} />
}
