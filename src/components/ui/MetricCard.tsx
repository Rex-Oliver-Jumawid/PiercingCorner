import type { ReactNode } from 'react'

export function MetricCard({ icon, label, value, detail }: {
  icon: ReactNode
  label: string
  value: ReactNode
  detail: string
}) {
  return <article className="metric-card"><span className="metric-card-icon" aria-hidden="true">{icon}</span><div><small>{label}</small><strong>{value}</strong><p>{detail}</p></div></article>
}
