import { useEffect, useState } from 'react'
import { MetricCard } from '../../components/ui/MetricCard'
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
  useEffect(() => { const timeout = window.setTimeout(() => { setCommittedSearch(search.trim()); setPage(0) }, 300); return () => window.clearTimeout(timeout) }, [search])

  function choosePreset(value: Exclude<ReportPreset, 'custom'>) { const next = reportPresetRange(value); setPreset(value); setDraft(next); setRange(next); setRangeError(null); setPage(0) }
  function apply() { const error = validateReportRange(draft); setRangeError(error); if (!error) { setRange(draft); setPage(0) } }
  async function exportCsv() {
    setExporting(true); setExportError(null)
    try {
      const blob = new Blob([buildSalesCsv(await getAllReportSales(range, committedSearch))], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `piercingcorner-report-${range.from}-to-${range.to}.csv`; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch { setExportError('Unable to export this report. Please try again.') }
    finally { setExporting(false) }
  }
  const pages = sales.data ? Math.max(1, Math.ceil(sales.data.count / SALES_PAGE_SIZE)) : 1
  const maxTraffic = Math.max(1, ...(traffic.data ?? []).map((row) => row.average_visits))
  const hasError = summary.isError || sales.isError || topServices.isError || traffic.isError

  return <section className="reports-page"><header className="reports-title"><p className="sales-eyebrow">OWNER · BUSINESS INTELLIGENCE</p><h1>Reports</h1><p>Completed transaction performance using Manila calendar dates.</p></header><section className="reports-controls"><div className="report-presets" aria-label="Report period presets">{([['today','Today'],['week','This Week'],['month','This Month'],['last_month','Last Month']] as const).map(([value,label]) => <button key={value} type="button" className={preset === value ? 'active' : ''} onClick={() => choosePreset(value)}>{label}</button>)}<button type="button" className={preset === 'custom' ? 'active' : ''} onClick={() => setPreset('custom')}>Custom Range</button></div><div className="report-range"><label><span>From</span><input type="date" value={draft.from} onChange={(event) => { setPreset('custom'); setDraft({ ...draft, from: event.target.value }) }} /></label><label><span>To</span><input type="date" value={draft.to} onChange={(event) => { setPreset('custom'); setDraft({ ...draft, to: event.target.value }) }} /></label><button type="button" onClick={apply}>Apply</button><button type="button" className="soft" disabled={exporting} onClick={() => void exportCsv()}>{exporting ? 'Exporting…' : '⇩ Export CSV'}</button></div>{rangeError ? <p role="alert" className="sales-error">{rangeError}</p> : null}{exportError ? <p role="alert" className="sales-error">{exportError}</p> : null}</section>{hasError ? <p role="alert" className="reports-message sales-error">Unable to load all report data. Please try again.</p> : null}<div className="reports-metrics">{summary.isPending ? <p role="status">Loading report…</p> : null}{summary.data ? <><MetricCard icon="₱" label="Revenue" value={formatMoney(summary.data.revenue)} detail={`${range.from} to ${range.to}`} /><MetricCard icon="▣" label="Transactions" value={summary.data.completed_transactions} detail="Completed" /><MetricCard icon="◇" label="Procedures" value={summary.data.service_transactions} detail="Completed service transactions" /></> : null}</div><div className="report-main-grid"><section className="report-panel"><header><div><h2>Sales transactions</h2><p>Completed financial records for this report period.</p></div><input type="search" aria-label="Search report sales" value={search} placeholder="Search sales" onChange={(event) => setSearch(event.target.value)} /></header>{sales.isPending ? <p role="status" className="reports-message">Loading report sales…</p> : null}{sales.data ? sales.data.rows.length ? <><SalesTable rows={sales.data.rows} /><nav className="sales-pagination" aria-label="Report sales pages"><button type="button" disabled={page === 0 || sales.isFetching} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page + 1} of {pages}</span><button type="button" disabled={page + 1 >= pages || sales.isFetching} onClick={() => setPage(page + 1)}>Next</button></nav></> : <p className="reports-message">No completed sales in this period.</p> : null}</section><section className="report-panel analytics-panel"><header><div><h2>Business analytics</h2><p>Measures derived from completed transactions.</p></div></header>{summary.data ? <div className="analytics-grid"><article><small>Avg. customers / day</small><strong>{summary.data.average_customer_visits_per_day.toFixed(1)}</strong><p>{summary.data.unique_clients} unique clients</p></article><article><small>Peak customer hour</small><strong>{peakHourLabel(summary.data.peak_hour)}</strong><p>{summary.data.peak_hour_average.toFixed(1)} average visits</p></article><article><small>Avg. transaction value</small><strong>{formatMoney(summary.data.average_transaction_value)}</strong><p>Revenue ÷ completed transactions</p></article><article><small>Repeat client rate</small><strong>{summary.data.repeat_client_rate.toFixed(1)}%</strong><p>{summary.data.repeat_clients} returning clients</p></article><article><small>Product attach rate</small><strong>{summary.data.product_attach_rate.toFixed(1)}%</strong><p>Service sales with a product</p></article></div> : null}</section></div><div className="report-section-grid"><section className="report-panel"><header><div><h2>Top 3 services</h2><p>Ranked by completed service quantity.</p></div></header><div className="top-services">{topServices.data?.length ? topServices.data.map((service,index) => <article key={service.service_id}><span>{index + 1}</span><div><strong>{service.service_name}</strong><small>{service.completed_quantity} completed · {service.service_share.toFixed(1)}%</small></div><div><strong>{formatMoney(service.revenue)}</strong><small>service revenue</small></div></article>) : <p className="reports-message">No completed services in this period.</p>}</div></section><section className="report-panel"><header><div><h2>Customer traffic by day</h2><p>Average distinct daily client visits.</p></div></header><div className="traffic-bars">{traffic.data?.map((row) => <div className="traffic-row" key={row.weekday}><span>{weekdayNames[row.weekday - 1]}</span><div><i style={{ width: `${row.average_visits / maxTraffic * 100}%` }} /></div><strong>{row.average_visits.toFixed(1)}</strong></div>)}</div></section></div></section>
}

export function ReportsPage() {
  const { account, status } = useAuth()
  if (!account || status !== 'authenticated') return null
  return <ReportsWorkspace key={`${account.id}:${account.role}`} />
}
