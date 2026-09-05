import { Sparkles } from 'lucide-react'
import { stateCard } from './dashboard-styles'

interface PagePlaceholderProps {
  title: string
  description?: string
}

export function PagePlaceholder({ title, description }: PagePlaceholderProps) {
  return (
    <section
      aria-labelledby="page-title"
      className={stateCard}
    >
      <Sparkles />
      <h2 id="page-title">{title}</h2>
      <p>
        {description ?? 'This route is ready for its future feature implementation.'}
      </p>
    </section>
  )
}