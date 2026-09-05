import { useEffect, useState } from 'react'
import { useAuth } from '../auth/useAuth'
import { RecordSaleDialog } from './RecordSaleDialog'
import { ExistingWaiverDialog } from './ExistingWaiverDialog'
import { useSaleStore } from './saleStore'
import { FinalizeDialog, TransactionDialog } from './TransactionDialog'
import { useTransactions } from './transactionQueries'
import { formatManilaTime, formatMoney } from './transactionModel'
import type { AcceptedWaiverSigning, DashboardTransaction, WaiverPreparation } from './transactionModel'
import './dashboard.css'

function DashboardWorkspace() {
  const [search, setSearch] = useState('')
  const [committedSearch, setCommittedSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [finalizingId, setFinalizingId] = useState<string | null>(null)
  const [directPayment, setDirectPayment] = useState(false)
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
    <section className="dashboard-page">
      <article className="dashboard-panel">
        <header className="dashboard-panel-head">
          <div>
            <p className="dashboard-eyebrow">DAILY OPERATIONS</p>
            <h1>Today's transactions</h1>
            <p>Operational workspace for Owner and Staff</p>
          </div>
          <div className="dashboard-header-actions">
            <label className="dashboard-search">
              <span>Search transactions</span>
              <b aria-hidden="true">⌕</b>
              <input
                type="search"
                value={search}
                placeholder="Reference, client, item, staff, or status"
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <button type="button" className="dashboard-button primary" onClick={startSale}>+ Add Transaction</button>
          </div>
        </header>

        {query.isPending ? <p role="status" className="dashboard-message">Loading today’s transactions…</p> : null}
        {query.isError ? (
          <div role="alert" className="dashboard-message dashboard-error">
            <p>{query.error.message}</p>
            <button type="button" className="dashboard-button" onClick={() => void query.refetch()}>Try again</button>
          </div>
        ) : null}
        {query.data ? (
          query.data.length ? (
            <div className="dashboard-table-wrap">
              <table aria-label="Today's transactions dashboard">
                <thead><tr><th>Time logged</th><th>Customer</th><th>Recorded by</th><th>Completion status</th></tr></thead>
                <tbody>
                  {query.data.map((transaction) => (
                    <tr
                      key={transaction.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`Open transaction ${transaction.reference_code} for ${transaction.client_name}`}
                      onClick={() => setSelectedId(transaction.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          setSelectedId(transaction.id)
                        }
                      }}
                    >
                      <td><strong>{formatManilaTime(transaction.created_at)}</strong><small>{transaction.reference_code}</small></td>
                      <td><strong>{transaction.client_name}</strong><small>{transaction.items.map((item) => item.name).join(' · ') || 'No items'}</small></td>
                      <td><strong>{transaction.recorded_by_name}</strong><small>{formatMoney(transaction.total)}</small></td>
                      <td><span className={`transaction-status ${transaction.status}`}>{transaction.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="dashboard-empty">
              <h2>{committedSearch ? 'No matching transactions' : 'No transactions logged today'}</h2>
              <p>{committedSearch ? 'Try another reference, client, item, staff name, or status.' : 'Use Add Transaction to begin a product sale or prepare a service draft.'}</p>
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
            setDirectPayment(false)
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
            setDirectPayment(true)
            setFinalizingId(signing.transaction.id)
          }}
        />
      ) : null}
      {finalizing ? (
        <FinalizeDialog
          transaction={finalizing}
          initialStep={directPayment ? 'payment' : 'items'}
          onBack={() => {
            setFinalizingId(null)
            setDirectPayment(false)
            setSelectedId(finalizing.id)
          }}
          onCompleted={() => {
            setFinalizingId(null)
            setDirectPayment(false)
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
