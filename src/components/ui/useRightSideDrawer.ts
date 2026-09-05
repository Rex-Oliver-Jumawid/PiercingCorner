import { useCallback, useEffect, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, SyntheticEvent } from 'react'

const DRAWER_EXIT_MS = 180

export function useRightSideDrawer(onClose: () => void, disabled = false) {
  const [dialog, setDialog] = useState<HTMLDialogElement | null>(null)
  const [closing, setClosing] = useState(false)
  const [closeTimer, setCloseTimer] = useState<number | null>(null)

  useEffect(() => {
    if (!dialog) return
    const previous = document.activeElement
    dialog.showModal()
    return () => {
      dialog.close()
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus()
    }
  }, [dialog])

  useEffect(() => () => {
    if (closeTimer !== null) window.clearTimeout(closeTimer)
  }, [closeTimer])

  const requestClose = useCallback(() => {
    if (disabled || closing) return
    setClosing(true)
    const delay = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      ? 0
      : DRAWER_EXIT_MS
    setCloseTimer(window.setTimeout(onClose, delay))
  }, [closing, disabled, onClose])

  const handleCancel = useCallback((event: SyntheticEvent<HTMLDialogElement>) => {
    event.preventDefault()
    event.stopPropagation()
    requestClose()
  }, [requestClose])

  const handleBackdropPointerDown = useCallback((event: ReactPointerEvent<HTMLDialogElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const outside = event.clientX < bounds.left
      || event.clientX > bounds.right
      || event.clientY < bounds.top
      || event.clientY > bounds.bottom
    if (outside) requestClose()
  }, [requestClose])

  return {
    dialog,
    setDialog,
    closing,
    requestClose,
    handleCancel,
    handleBackdropPointerDown,
  }
}
