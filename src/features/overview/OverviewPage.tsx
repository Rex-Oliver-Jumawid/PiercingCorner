import { useEffect, useState } from 'react'
import {
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Search,
  UsersRound,
} from 'lucide-react'
import { MetricCard } from '../../components/ui/MetricCard'
import {
  dashField,
  emptyState,
  featureView,
  metricGrid,
  panel,
  panelHead,
  statusClasses,
  tablePanel,
  twoPanel,
} from '../../components/ui/dashboard-styles'
import { useAuth } from '../auth/useAuth'
import { formatManilaTime, formatMoney } from '../dashboard/transactionModel'
import { useTransactions } from '../dashboard/transactionQueries'
import { useOwnerOverview } from './overviewQueries'
import './overview.css'

function OverviewWorkspace() {
  const [search, setSearch] = useState('')
  const [committedSearch, setCommittedSearch] = useState('')
  const overview = useOwnerOverview()
  const transactions = useTransactions(committedSearch)

  useEffect(() => {
    const timeout = window.setTimeout(() => setCommittedSearch(search.trim()), 300)
    return () => window.clearTimeout(timeout)
  }, [search])

  return (
    <section className={`overview-page ${featureView}`}>
      {overview.isPending ? <p role="status">Loading overview…</p> : null}
      {overview.isError ? (
        <p role="alert" className="sales-error">{overview.error.message}</p>
      ) : null}

      {overview.data ? (
        <>
          <section className={metricGrid} aria-label="Today's transaction summary">
            <MetricCard
              icon={<CalendarDays />}
              label="Today's transactions"
              value={overview.data.today_transactions}
              detail="Today in Parañaque"
            />
            <MetricCard
              icon={<Clock3 />}
              label="Ongoing / Pending"
              value={overview.data.open_transactions}
              detail="Still in progress"
            />
            <MetricCard
              icon={<UsersRound />}
              label="Clients"
              value={overview.data.clients}
              detail="Stored records"
            />
            <MetricCard
              icon={<CircleDollarSign />}
              label="Collected"
              value={formatMoney(overview.data.collected)}
              detail="Today's completed payments"
            />
          </section>

          <div className={twoPanel}>
            <article className={tablePanel}>
              <div className={`${panelHead} gap-3 max-[700px]:items-stretch max-[700px]:flex-col`}>
                <div className="min-w-0">
                  <h2>Today's transactions</h2>
                  <p>View-only records from today’s studio activity</p>
                </div>
                <label className={`${dashField} min-w-[240px] max-w-[320px] flex-1 max-[700px]:w-full`}>
                  <span className="sr-only">Search transactions</span>
                  <span className="relative block">
                    <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#84685e]" />
                    <input
                      className="!pl-9"
                      type="search"
                      value={search}
                      placeholder="Search today's transactions…"
                      onChange={(event) => setSearch(event.target.value)}
                    />
                  </span>
                </label>
              </div>

              {transactions.isPending ? (
                <p role="status" className="overview-message">Loading today’s transactions…</p>
              ) : null}
              {transactions.isError ? (
                <p role="alert" className="overview-message sales-error">{transactions.error.message}</p>
              ) : null}

              {transactions.data ? (
                transactions.data.length ? (
                  <div className="overflow-x-auto">
                    <table aria-label="Today's transactions overview">
                      <thead>
                        <tr>
                          <th>Time logged</th>
                          <th>Customer</th>
                          <th>Recorded by</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {transactions.data.map((transaction) => (
                          <tr key={transaction.id}>
                            <td>
                              <strong className="block text-[#3b2923]">{formatManilaTime(transaction.created_at)}</strong>
                              <small className="text-[#84685e]">{transaction.reference_code}</small>
                            </td>
                            <td>
                              <strong className="block text-[#3b2923]">{transaction.client_name}</strong>
                              <small className="text-[#84685e]">
                                {transaction.items.map((item) => item.name).join(' · ') || 'No items'}
                              </small>
                            </td>
                            <td className="text-[#695249]">{transaction.recorded_by_name}</td>
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
                    <strong>{committedSearch ? 'No transactions match' : 'No transactions logged'}</strong>
                    <p>{committedSearch ? 'Try a different search query.' : 'Transactions created today will appear here.'}</p>
                  </div>
                )
              ) : null}
            </article>

            <aside className={`${panel} readiness`}>
              <div className={panelHead}>
                <div>
                  <h3>Studio readiness</h3>
                  <p>Items affecting daily operations</p>
                </div>
              </div>
              <div className="flex flex-col [&>article:last-child]:border-b-0 [&_strong]:text-[10px] [&_small]:text-[8px] [&_small]:text-studio-muted">
                <article className="group grid min-h-[61px] grid-cols-[26px_minmax(0,1fr)_auto_14px] items-center gap-x-[9px] border-b border-dashed border-[#d5a684] px-[17px] py-2.5 text-left transition-[background,transform] hover:translate-x-px hover:bg-[#fff1cf]">
                  <span className="row-span-2 grid size-6 place-items-center rounded-full border border-hippy-ink bg-hippy-gold text-[10px] font-black text-[#664219] shadow-[1px_1px_0_#3b2923]">
                    !
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <strong className="overflow-hidden text-ellipsis whitespace-nowrap text-[#3b2923]">Business hours</strong>
                    <small>Studio scheduling is not configured</small>
                  </span>
                  <small className="justify-self-end text-[8px] font-black tracking-[.4px] text-[#7b574b] uppercase">Unavailable</small>
                  <ChevronRight className="w-3.5 text-[#6f5148]" aria-hidden="true" />
                </article>

                <article className="group grid min-h-[61px] grid-cols-[26px_minmax(0,1fr)_auto_14px] items-center gap-x-[9px] border-b border-dashed border-[#d5a684] px-[17px] py-2.5 text-left transition-[background,transform] hover:translate-x-px hover:bg-[#fff1cf]">
                  <span className={`row-span-2 grid size-6 place-items-center rounded-full border border-hippy-ink ${overview.data.active_services ? 'bg-hippy-sage text-[#274c3c]' : 'bg-hippy-gold text-[#664219]'} text-[10px] font-black shadow-[1px_1px_0_#3b2923]`}>
                    {overview.data.active_services ? '✓' : '!'}
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <strong className="overflow-hidden text-ellipsis whitespace-nowrap text-[#3b2923]">Active services</strong>
                    <small>{overview.data.active_services} available</small>
                  </span>
                  <small className="justify-self-end text-[8px] font-black tracking-[.4px] text-[#7b574b] uppercase">{overview.data.active_services ? 'Ready' : 'Review'}</small>
                  <ChevronRight className="w-3.5 text-[#6f5148]" aria-hidden="true" />
                </article>

                <article className="group grid min-h-[61px] grid-cols-[26px_minmax(0,1fr)_auto_14px] items-center gap-x-[9px] border-b border-dashed border-[#d5a684] px-[17px] py-2.5 text-left transition-[background,transform] hover:translate-x-px hover:bg-[#fff1cf]">
                  <span className={`row-span-2 grid size-6 place-items-center rounded-full border border-hippy-ink ${overview.data.active_products ? 'bg-hippy-sage text-[#274c3c]' : 'bg-hippy-gold text-[#664219]'} text-[10px] font-black shadow-[1px_1px_0_#3b2923]`}>
                    {overview.data.active_products ? '✓' : '!'}
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <strong className="overflow-hidden text-ellipsis whitespace-nowrap text-[#3b2923]">Active products</strong>
                    <small>{overview.data.active_products} available</small>
                  </span>
                  <small className="justify-self-end text-[8px] font-black tracking-[.4px] text-[#7b574b] uppercase">{overview.data.active_products ? 'Ready' : 'Review'}</small>
                  <ChevronRight className="w-3.5 text-[#6f5148]" aria-hidden="true" />
                </article>

                <article className="group grid min-h-[61px] grid-cols-[26px_minmax(0,1fr)_auto_14px] items-center gap-x-[9px] border-b border-dashed border-[#d5a684] px-[17px] py-2.5 text-left transition-[background,transform] hover:translate-x-px hover:bg-[#fff1cf]">
                  <span className={`row-span-2 grid size-6 place-items-center rounded-full border border-hippy-ink ${overview.data.waiver_template_version ? 'bg-hippy-sage text-[#274c3c]' : 'bg-hippy-gold text-[#664219]'} text-[10px] font-black shadow-[1px_1px_0_#3b2923]`}>
                    {overview.data.waiver_template_version ? '✓' : '!'}
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <strong className="overflow-hidden text-ellipsis whitespace-nowrap text-[#3b2923]">Waiver</strong>
                    <small>{overview.data.waiver_template_version ? `Template version ${overview.data.waiver_template_version}` : 'No template available'}</small>
                  </span>
                  <small className="justify-self-end text-[8px] font-black tracking-[.4px] text-[#7b574b] uppercase">{overview.data.waiver_template_version ? 'Ready' : 'Review'}</small>
                  <ChevronRight className="w-3.5 text-[#6f5148]" aria-hidden="true" />
                </article>
              </div>
            </aside>
          </div>
        </>
      ) : null}
    </section>
  )
}

export function OverviewPage() {
  const { account, status } = useAuth()
  if (!account || status !== 'authenticated') return null
  return <OverviewWorkspace key={`${account.id}:${account.role}`} />
}
