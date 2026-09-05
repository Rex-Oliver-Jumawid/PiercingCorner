import { useEffect, useState } from 'react'
import {
  CalendarDays,
  CircleDollarSign,
  Download,
  Search,
  ShoppingBag,
} from 'lucide-react'
import { MetricCard } from '../../components/ui/MetricCard'
import {
  dashButton,
  dashField,
  featureView,
  metricGridThree,
  panel,
  panelHead,
  tablePanel,
} from '../../components/ui/dashboard-styles'
import { useAuth } from '../auth/useAuth'
import { formatMoney } from '../dashboard/transactionModel'
import { SALES_PAGE_SIZE } from '../sales/salesModel'
import { SalesTable } from '../sales/SalesTable'
import { buildSalesCsv, peakHourLabel, reportPresetRange, validateReportRange } from './reportModel'
import type { ReportPreset, ReportRange } from './reportModel'
import { getAllReportSales } from './reportService'
import { useReportSales, useReportSummary, useTopServices, useWeekdayTraffic } from './reportQueries'
import '../sales/sales.css'
import './reports.css'

const weekdayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

function ReportsWorkspace() {
  const initial = reportPresetRange('month')
  const [preset, setPreset] = useState<ReportPreset>('month')
  const [draft, setDraft] = useState<ReportRange>(initial)
  const [range, setRange] = useState<ReportRange>(initial)
  const [rangeError, setRangeError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [committedSearch, setCommittedSearch] = useState('')
  const [page, setPage] = useState(0)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const summary = useReportSummary(range)
  const sales = useReportSales(range, committedSearch, page)
  const topServices = useTopServices(range)
  const traffic = useWeekdayTraffic(range)

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setCommittedSearch(search.trim())
      setPage(0)
    }, 300)
    return () => window.clearTimeout(timeout)
  }, [search])

  function choosePreset(value: Exclude<ReportPreset, 'custom'>) {
    const next = reportPresetRange(value)
    setPreset(value)
    setDraft(next)
    setRange(next)
    setRangeError(null)
    setPage(0)
  }

  function apply() {
    const error = validateReportRange(draft)
    setRangeError(error)
    if (!error) {
      setRange(draft)
      setPage(0)
    }
  }

  async function exportCsv() {
    setExporting(true)
    setExportError(null)
    try {
      const blob = new Blob([buildSalesCsv(await getAllReportSales(range, committedSearch))], {
        type: 'text/csv;charset=utf-8',
      })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `piercingcorner-report-${range.from}-to-${range.to}.csv`
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch {
      setExportError('Unable to export this report. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  const pages = sales.data ? Math.max(1, Math.ceil(sales.data.count / SALES_PAGE_SIZE)) : 1
  const maxTraffic = Math.max(1, ...(traffic.data ?? []).map((row) => row.average_visits))
  const hasError = summary.isError || sales.isError || topServices.isError || traffic.isError

  return (
    <section className={`reports-page ${featureView}`}>

      <section className={`${panel} flex flex-col gap-3 p-4`}>
        <div className="flex flex-wrap items-center justify-between gap-3" aria-label="Report period presets">
          <div className="flex flex-wrap items-center gap-2">
            {([
              ['today', 'Today'],
              ['week', 'This Week'],
              ['month', 'This Month'],
              ['last_month', 'Last Month'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={dashButton({ variant: preset === value ? 'primary' : 'secondary' })}
                onClick={() => choosePreset(value)}
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              className={dashButton({ variant: preset === 'custom' ? 'primary' : 'secondary' })}
              onClick={() => setPreset('custom')}
            >
              Custom Range
            </button>
          </div>

          <button
            type="button"
            className={`${dashButton({ variant: 'secondary' })} flex items-center gap-1.5`}
            disabled={exporting}
            onClick={() => void exportCsv()}
          >
            <Download className="size-3.5" />
            <span>{exporting ? 'Exporting…' : 'Export CSV'}</span>
          </button>
        </div>

        <div className="flex flex-wrap items-end gap-3 border-t border-dashed border-[#dab08f] pt-3">
          <label className={`${dashField} w-[160px]`}>
            <span>From</span>
            <input
              type="date"
              value={draft.from}
              onChange={(event) => {
                setPreset('custom')
                setDraft({ ...draft, from: event.target.value })
              }}
            />
          </label>
          <label className={`${dashField} w-[160px]`}>
            <span>To</span>
            <input
              type="date"
              value={draft.to}
              onChange={(event) => {
                setPreset('custom')
                setDraft({ ...draft, to: event.target.value })
              }}
            />
          </label>
          <button
            type="button"
            className={dashButton({ variant: 'primary' })}
            onClick={apply}
          >
            Apply
          </button>
        </div>

        {rangeError ? <p role="alert" className="sales-error m-0 text-xs">{rangeError}</p> : null}
        {exportError ? <p role="alert" className="sales-error m-0 text-xs">{exportError}</p> : null}
      </section>

      {hasError ? <p role="alert" className="reports-message sales-error">Unable to load all report data. Please try again.</p> : null}

      <div className="reports-metrics">
        {summary.isPending ? <p role="status" className="text-xs text-studio-muted">Loading report…</p> : null}
        {summary.data ? (
          <div className={metricGridThree}>
            <MetricCard
              icon={<CircleDollarSign />}
              label="Revenue"
              value={formatMoney(summary.data.revenue)}
              detail={`${range.from} to ${range.to}`}
            />
            <MetricCard
              icon={<ShoppingBag />}
              label="Transactions"
              value={summary.data.completed_transactions}
              detail="Completed"
            />
            <MetricCard
              icon={<CalendarDays />}
              label="Procedures"
              value={summary.data.service_transactions}
              detail="Completed service transactions"
            />
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(280px,.6fr)] gap-5 max-[1100px]:grid-cols-1">
        <section className={tablePanel}>
          <div className={panelHead}>
            <div>
              <h2>Sales transactions</h2>
              <p>Completed financial records for this report period.</p>
            </div>
          </div>
          <div className="border-b border-dashed border-[#dab08f] bg-[#fffaf0] p-3">
            <label className={`${dashField} w-full`}>
              <span className="sr-only">Search sales</span>
              <span className="relative block">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#84685e]" />
                <input
                  className="!pl-9"
                  type="search"
                  aria-label="Search report sales"
                  value={search}
                  placeholder="Search sales"
                  onChange={(event) => setSearch(event.target.value)}
                />
              </span>
            </label>
          </div>

          {sales.isPending ? <p role="status" className="reports-message">Loading report sales…</p> : null}
          {sales.data ? (
            sales.data.rows.length ? (
              <>
                <SalesTable rows={sales.data.rows} />
                <nav className="flex min-h-14 items-center justify-between gap-3 border-t border-dashed border-[#d6a786] px-4 py-2 text-[10px] text-studio-muted" aria-label="Report sales pages">
                  <span>Page {page + 1} of {pages}</span>
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
              <p className="reports-message">No completed sales in this period.</p>
            )
          ) : null}
        </section>

        <section className={panel}>
          <div className={panelHead}>
            <div>
              <h2>Business analytics</h2>
              <p>Measures derived from completed transactions.</p>
            </div>
          </div>
          {summary.data ? (
            <div className="grid grid-cols-2 gap-3 p-4 max-[640px]:grid-cols-1">
              <article className="rounded-[13px_10px_12px_11px] border-[1.5px] border-hippy-ink bg-[#fff9eb] p-3 shadow-[2px_2px_0_#3b2923]">
                <small className="block text-[8px] font-bold tracking-[.6px] text-[#a04b2f] uppercase">Avg. customers / day</small>
                <strong className="my-1 block font-display text-xl font-bold text-hippy-ink">{summary.data.average_customer_visits_per_day.toFixed(1)}</strong>
                <p className="m-0 text-[8px] text-studio-muted">{summary.data.unique_clients} unique clients</p>
              </article>
              <article className="rounded-[13px_10px_12px_11px] border-[1.5px] border-hippy-ink bg-[#fff9eb] p-3 shadow-[2px_2px_0_#3b2923]">
                <small className="block text-[8px] font-bold tracking-[.6px] text-[#a04b2f] uppercase">Peak customer hour</small>
                <strong className="my-1 block font-display text-xl font-bold text-hippy-ink">{peakHourLabel(summary.data.peak_hour)}</strong>
                <p className="m-0 text-[8px] text-studio-muted">{summary.data.peak_hour_average.toFixed(1)} average visits</p>
              </article>
              <article className="rounded-[13px_10px_12px_11px] border-[1.5px] border-hippy-ink bg-[#fff9eb] p-3 shadow-[2px_2px_0_#3b2923]">
                <small className="block text-[8px] font-bold tracking-[.6px] text-[#a04b2f] uppercase">Avg. transaction value</small>
                <strong className="my-1 block font-display text-xl font-bold text-hippy-ink">{formatMoney(summary.data.average_transaction_value)}</strong>
                <p className="m-0 text-[8px] text-studio-muted">Revenue ÷ completed transactions</p>
              </article>
              <article className="rounded-[13px_10px_12px_11px] border-[1.5px] border-hippy-ink bg-[#fff9eb] p-3 shadow-[2px_2px_0_#3b2923]">
                <small className="block text-[8px] font-bold tracking-[.6px] text-[#a04b2f] uppercase">Repeat client rate</small>
                <strong className="my-1 block font-display text-xl font-bold text-hippy-ink">{summary.data.repeat_client_rate.toFixed(1)}%</strong>
                <p className="m-0 text-[8px] text-studio-muted">{summary.data.repeat_clients} returning clients</p>
              </article>
              <article className="col-span-2 rounded-[13px_10px_12px_11px] border-[1.5px] border-hippy-ink bg-[#fff9eb] p-3 shadow-[2px_2px_0_#3b2923] max-[640px]:col-span-1">
                <small className="block text-[8px] font-bold tracking-[.6px] text-[#a04b2f] uppercase">Product attach rate</small>
                <strong className="my-1 block font-display text-xl font-bold text-hippy-ink">{summary.data.product_attach_rate.toFixed(1)}%</strong>
                <p className="m-0 text-[8px] text-studio-muted">Service sales with a product</p>
              </article>
            </div>
          ) : null}
        </section>
      </div>

      <div className="grid grid-cols-2 gap-5 max-[1100px]:grid-cols-1">
        <section className={panel}>
          <div className={panelHead}>
            <div>
              <h2>Top 3 services</h2>
              <p>Ranked by completed service quantity.</p>
            </div>
          </div>
          <div className="flex flex-col p-4">
            {topServices.data?.length ? (
              topServices.data.map((service, index) => (
                <article
                  key={service.service_id}
                  className="flex items-center justify-between gap-3 border-b border-dashed border-[#dab08f] py-3 first:pt-0 last:border-b-0"
                >
                  <div className="flex items-center gap-3">
                    <span className="grid size-7 shrink-0 place-items-center rounded-full border border-hippy-ink bg-hippy-gold text-xs font-black text-hippy-ink shadow-[1px_1px_0_#3b2923]">
                      {index + 1}
                    </span>
                    <div>
                      <strong className="block text-xs font-bold text-[#3b2923]">{service.service_name}</strong>
                      <small className="text-[8px] text-studio-muted">
                        {service.completed_quantity} completed · {service.service_share.toFixed(1)}%
                      </small>
                    </div>
                  </div>
                  <div className="text-right">
                    <strong className="block font-display text-sm font-bold text-hippy-ink">{formatMoney(service.revenue)}</strong>
                    <small className="text-[8px] text-studio-muted">service revenue</small>
                  </div>
                </article>
              ))
            ) : (
              <p className="reports-message">No completed services in this period.</p>
            )}
          </div>
        </section>

        <section className={panel}>
          <div className={panelHead}>
            <div>
              <h2>Customer traffic by day</h2>
              <p>Average distinct daily client visits.</p>
            </div>
          </div>
          <div className="flex flex-col gap-2.5 p-4">
            {traffic.data?.map((row) => (
              <div className="flex items-center gap-3 text-xs" key={row.weekday}>
                <span className="w-24 shrink-0 text-[10px] font-bold text-[#795346]">{weekdayNames[row.weekday - 1]}</span>
                <div className="h-3.5 flex-1 rounded-full border border-hippy-ink bg-[#fffaf0] p-0.5 shadow-[1px_1px_0_#d9a47e]">
                  <div
                    className="h-full rounded-full bg-hippy-orange transition-all duration-300"
                    style={{ width: `${Math.max(4, (row.average_visits / maxTraffic) * 100)}%` }}
                  />
                </div>
                <strong className="w-8 text-right font-display text-xs font-bold text-hippy-ink">
                  {row.average_visits.toFixed(1)}
                </strong>
              </div>
            ))}
          </div>
        </section>
      </div>

      <p className="text-[8px] text-[#8a6254]">
        Operational reporting only; this is not a tax invoice or official accounting ledger.
      </p>
    </section>
  )
}

export function ReportsPage() {
  const { account, status } = useAuth()
  if (!account || status !== 'authenticated') return null
  return <ReportsWorkspace key={`${account.id}:${account.role}`} />
}