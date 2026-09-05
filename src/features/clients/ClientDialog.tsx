import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { PAGE_SIZE } from './clientModel'
import { ClientDialogBusyContext } from './clientDialogContext'

export function ClientDialog({
  title,
  ariaLabel = title,
  eyebrow,
  subtitle,
  action,
  children,
  onClose,
  drawer = false,
}: {
  title: string
  ariaLabel?: string
  eyebrow?: string
  subtitle?: string
  action?: ReactNode
  children: ReactNode
  onClose: () => void
  drawer?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const previous = document.activeElement
    const dialog = ref.current
    dialog?.showModal()
    return () => {
      dialog?.close()
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus()
    }
  }, [])
  return (
    <dialog
      ref={ref}
      className={`client-dialog ${drawer ? 'client-drawer' : ''}`}
      aria-label={ariaLabel}
      aria-modal="true"
      onCancel={(event) => {
        event.preventDefault()
        event.stopPropagation()
        if (!busy) onClose()
      }}
    >
      <header className="client-dialog-head">
        <div className="client-dialog-title">
          {eyebrow ? <p className="client-eyebrow">{eyebrow}</p> : null}
          <h2 id={titleId}>{title}</h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        <div className="client-dialog-tools">
          {action}
          <button
            type="button"
            className="client-close"
            aria-label={`Close ${ariaLabel}`}
            disabled={busy}
            onClick={onClose}
          >
            ×
          </button>
        </div>
      </header>
      <div className="client-dialog-body">
        <ClientDialogBusyContext.Provider value={setBusy}>
          {children}
        </ClientDialogBusyContext.Provider>
      </div>
    </dialog>
  )
}
export function ClientError({
  message,
  retry,
}: {
  message: string
  retry?: () => void
}) {
  return (
    <div role="alert" className="client-error">
      {message}
      {retry ? (
        <button type="button" className="client-button" onClick={retry}>
          Try again
        </button>
      ) : null}
    </div>
  )
}
export function Pagination({
  page,
  count,
  onChange,
  disabled = false,
}: {
  page: number
  count: number
  onChange: (page: number) => void
  disabled?: boolean
}) {
  return (
    <nav className="client-pagination" aria-label="Pagination">
      <span>
        {count} {count === 1 ? 'record' : 'records'} · Page {page + 1} of{' '}
        {Math.max(1, Math.ceil(count / PAGE_SIZE))}
      </span>
      <button
        className="client-button"
        type="button"
        disabled={disabled || page === 0}
        onClick={() => onChange(page - 1)}
      >
        Previous
      </button>
      <button
        className="client-button"
        type="button"
        disabled={disabled || (page + 1) * PAGE_SIZE >= count}
        onClick={() => onChange(page + 1)}
      >
        Next
      </button>
    </nav>
  )
}
