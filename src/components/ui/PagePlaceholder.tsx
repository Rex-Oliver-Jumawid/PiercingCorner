interface PagePlaceholderProps {
  title: string
  description?: string
}

export function PagePlaceholder({ title, description }: PagePlaceholderProps) {
  return (
    <section aria-labelledby="page-title" className="max-w-2xl rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-medium text-stone-500">Phase 0A placeholder</p>
      <h1 id="page-title" className="mt-2 text-3xl font-semibold tracking-tight">
        {title}
      </h1>
      <p className="mt-3 text-stone-600">
        {description ?? 'This route is ready for its future feature implementation.'}
      </p>
    </section>
  )
}
