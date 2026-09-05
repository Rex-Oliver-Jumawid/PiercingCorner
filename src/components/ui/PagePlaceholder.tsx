interface PagePlaceholderProps {
  title: string
  description?: string
}

export function PagePlaceholder({ title, description }: PagePlaceholderProps) {
  return (
    <section aria-labelledby="page-title" className="max-w-2xl rounded-[19px_14px_20px_16px] border-[1.5px] border-[#3b2923] bg-[#fff9eb] p-6 text-[#3b2923] shadow-[4px_4px_0_#3b2923]">
      <p className="m-0 text-[8px] font-black tracking-[1.8px] text-[#a04b2f] uppercase">Workspace</p>
      <h1 id="page-title" className="mt-2 font-[Georgia,'Times_New_Roman',serif] text-3xl font-bold tracking-tight">
        {title}
      </h1>
      <p className="mt-3 text-sm leading-6 text-[#80675e]">
        {description ?? 'This route is ready for its future feature implementation.'}
      </p>
    </section>
  )
}
