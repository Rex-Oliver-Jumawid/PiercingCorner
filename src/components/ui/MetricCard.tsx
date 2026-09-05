import type { ReactNode } from 'react'
import { metricCard } from './dashboard-styles'

export function MetricCard({
  icon,
  label,
  value,
  detail,
  note,
}: {
  icon: ReactNode
  label: string
  value: ReactNode
  detail?: string
  note?: string
}) {
  return (
    <article className={metricCard}>
      <span>{icon}</span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        <p>{detail ?? note}</p>
      </div>
    </article>
  )
}