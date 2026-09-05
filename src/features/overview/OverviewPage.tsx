import { useEffect, useState } from 'react'
import { MetricCard } from '../../components/ui/MetricCard'
import { useAuth } from '../auth/useAuth'
import { useTransactions } from '../dashboard/transactionQueries'
import { formatManilaTime, formatMoney } from '../dashboard/transactionModel'
import { useOwnerOverview } from './overviewQueries'
import '../sales/sales.css'
import './overview.css'

function OverviewWorkspace() {
  const [search, setSearch] = useState('')
  const [committedSearch, setCommittedSearch] = useState('')
  const overview = useOwnerOverview()
  const transactions = useTransactions(committedSearch)
  useEffect(() => { const timeout = window.setTimeout(() => setCommittedSearch(search.trim()), 300); return () => window.clearTimeout(timeout) }, [search])
  return <section className="overview-page"><header className="overview-title"><p className="sales-eyebrow">PIERCING CORNER · OWNER</p><h1>Overview</h1><p>Today’s studio activity and operational readiness in Parañaque.</p></header>{overview.isPending ? <p role="status">Loading overview…</p> : null}{overview.isError ? <p role="alert" className="sales-error">{overview.error.message}</p> : null}{overview.data ? <><section className="overview-metrics" aria-label="Today's transaction summary"><MetricCard icon="▦" label="Today's transactions" value={overview.data.today_transactions} detail="Today in Parañaque" /><MetricCard icon="◷" label="Ongoing / Pending" value={overview.data.open_transactions} detail="Still in progress" /><MetricCard icon="♙" label="Clients" value={overview.data.clients} detail="Stored records" /><MetricCard icon="₱" label="Collected" value={formatMoney(overview.data.collected)} detail="Today's completed payments" /></section><section className="overview-grid"><article className="overview-panel"><header><div><h2>Today's transactions</h2><p>View-only records from today’s studio activity</p></div><label><span className="sr-only">Search transactions</span><input type="search" value={search} placeholder="Search transactions..." onChange={(event) => setSearch(event.target.value)} /></label></header>{transactions.isPending ? <p role="status" className="overview-message">Loading today’s transactions…</p> : null}{transactions.isError ? <p role="alert" className="overview-message sales-error">{transactions.error.message}</p> : null}{transactions.data ? transactions.data.length ? <div className="overview-table"><table aria-label="Today's transactions overview"><thead><tr><th>Time logged</th><th>Customer</th><th>Recorded by</th><th>Status</th></tr></thead><tbody>{transactions.data.map((transaction) => <tr key={transaction.id}><td><strong>{formatManilaTime(transaction.created_at)}</strong><small>{transaction.reference_code}</small></td><td><strong>{transaction.client_name}</strong><small>{transaction.items.map((item) => item.name).join(' · ') || 'No items'}</small></td><td>{transaction.recorded_by_name}</td><td><span className={`overview-status ${transaction.status}`}>{transaction.status}</span></td></tr>)}</tbody></table></div> : <p className="overview-message">{committedSearch ? 'No transactions match the current search.' : 'No transactions logged today.'}</p> : null}</article><aside className="overview-panel readiness"><header><div><h2>Studio readiness</h2><p>Items affecting daily operations</p></div></header><div><article><span>○</span><div><strong>Business hours</strong><small>Studio scheduling is not configured</small></div><b>Unavailable</b></article><article><span>✓</span><div><strong>Active services</strong><small>{overview.data.active_services} available</small></div><b>{overview.data.active_services ? 'Ready' : 'Review'}</b></article><article><span>✓</span><div><strong>Active products</strong><small>{overview.data.active_products} available</small></div><b>{overview.data.active_products ? 'Ready' : 'Review'}</b></article><article><span>✓</span><div><strong>Waiver</strong><small>{overview.data.waiver_template_version ? `Template version ${overview.data.waiver_template_version}` : 'No template available'}</small></div><b>{overview.data.waiver_template_version ? 'Ready' : 'Review'}</b></article></div></aside></section></> : null}</section>
}

export function OverviewPage() {
  const { account, status } = useAuth()
  if (!account || status !== 'authenticated') return null
  return <OverviewWorkspace key={`${account.id}:${account.role}`} />
}
