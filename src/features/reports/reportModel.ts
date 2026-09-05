import type { CompletedSale } from '../sales/salesModel'

export type ReportPreset = 'today' | 'week' | 'month' | 'last_month' | 'custom'
export interface ReportRange { from: string; to: string }

function dateParts(value: Date) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value)
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ''
  return `${read('year')}-${read('month')}-${read('day')}`
}

function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function reportPresetRange(preset: Exclude<ReportPreset, 'custom'>, now = new Date()): ReportRange {
  const today = dateParts(now)
  if (preset === 'today') return { from: today, to: today }
  if (preset === 'week') {
    const weekday = new Date(`${today}T12:00:00Z`).getUTCDay() || 7
    return { from: shiftDate(today, 1 - weekday), to: today }
  }
  const monthStart = `${today.slice(0, 7)}-01`
  if (preset === 'month') return { from: monthStart, to: today }
  const priorEnd = shiftDate(monthStart, -1)
  return { from: `${priorEnd.slice(0, 7)}-01`, to: priorEnd }
}

export function validateReportRange(range: ReportRange) {
  const valid = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
    const parsed = new Date(`${value}T00:00:00Z`)
    return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value
  }
  if (!valid(range.from) || !valid(range.to)) return 'Choose valid report dates.'
  if (range.from > range.to) return 'The From date must be on or before the To date.'
  return null
}

export function protectSpreadsheetCell(value: string) {
  return /^[\t\r]/.test(value) || /^\s*[=+\-@]/.test(value) ? `'${value}` : value
}

function csvCell(value: string | number) {
  const text = typeof value === 'string' ? protectSpreadsheetCell(value) : String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function buildSalesCsv(rows: CompletedSale[]) {
  const headings = ['Reference', 'Completed at (Asia/Manila)', 'Client', 'Items', 'Total', 'Paid', 'Payment methods', 'Recorded by']
  const lines = rows.map((sale) => [sale.reference_code, new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'short', timeStyle: 'medium' }).format(new Date(sale.completed_at)), sale.client_name, sale.items.map((item) => `${item.name} (${item.item_type}, qty ${item.quantity})`).join(' + '), sale.total.toFixed(2), sale.paid.toFixed(2), sale.payment_methods.join(' + '), sale.recorded_by_name])
  return `\uFEFF${[headings, ...lines].map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`
}

export function peakHourLabel(hour: number | null) {
  if (hour === null) return '—'
  const start = new Date(Date.UTC(2020, 0, 1, hour))
  const end = new Date(Date.UTC(2020, 0, 1, (hour + 1) % 24))
  const formatter = new Intl.DateTimeFormat('en-PH', { hour: 'numeric', timeZone: 'UTC' })
  return `${formatter.format(start)}–${formatter.format(end)}`
}
