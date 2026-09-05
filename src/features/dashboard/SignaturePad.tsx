import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

export interface SignaturePadHandle {
  clear: () => void
  toPngBlob: () => Promise<Blob>
}

export const SignaturePad = forwardRef<SignaturePadHandle, {
  disabled?: boolean
  onInkChange: (hasInk: boolean) => void
}>(function SignaturePad({ disabled = false, onInkChange }, forwardedRef) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const lastPoint = useRef<{ x: number; y: number } | null>(null)
  const hasInkRef = useRef(false)
  const [hasInk, setHasInk] = useState(false)

  function context() {
    return canvas.current?.getContext('2d') ?? null
  }

  const clear = useCallback(() => {
    const element = canvas.current
    const drawingContext = context()
    if (element && drawingContext) drawingContext.clearRect(0, 0, element.width, element.height)
    setHasInk(false)
    hasInkRef.current = false
    onInkChange(false)
  }, [onInkChange])

  useImperativeHandle(forwardedRef, () => ({
    clear,
    toPngBlob: async () => {
      const source = canvas.current
      if (!source || !hasInk) throw new Error('A client signature is required.')
      const output = document.createElement('canvas')
      output.width = source.width
      output.height = source.height
      const outputContext = output.getContext('2d')
      if (!outputContext) throw new Error('Signature export is unavailable in this browser.')
      outputContext.fillStyle = '#ffffff'
      outputContext.fillRect(0, 0, output.width, output.height)
      outputContext.drawImage(source, 0, 0)
      return new Promise<Blob>((resolve, reject) => output.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error('Could not export the signature.')),
        'image/png',
      ))
    },
  }), [clear, hasInk])

  useEffect(() => {
    const element = canvas.current
    if (!element) return
    const signatureCanvas = element
    function resize() {
      const bounds = signatureCanvas.getBoundingClientRect()
      const ratio = Math.max(1, window.devicePixelRatio || 1)
      const previous = hasInkRef.current ? signatureCanvas.toDataURL('image/png') : null
      signatureCanvas.width = Math.max(1, Math.round(bounds.width * ratio))
      signatureCanvas.height = Math.max(1, Math.round(bounds.height * ratio))
      const drawingContext = signatureCanvas.getContext('2d')
      if (!drawingContext) return
      drawingContext.setTransform(ratio, 0, 0, ratio, 0, 0)
      drawingContext.lineWidth = 2.2
      drawingContext.lineCap = 'round'
      drawingContext.lineJoin = 'round'
      drawingContext.strokeStyle = '#3b2923'
      if (previous) {
        const image = new Image()
        image.onload = () => drawingContext.drawImage(image, 0, 0, bounds.width, bounds.height)
        image.src = previous
      }
    }
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  function point(event: ReactPointerEvent<HTMLCanvasElement>) {
    const bounds = event.currentTarget.getBoundingClientRect()
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
  }

  function begin(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (disabled) return
    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    drawing.current = true
    lastPoint.current = point(event)
  }

  function draw(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || disabled || !lastPoint.current) return
    event.preventDefault()
    const next = point(event)
    if (Math.hypot(next.x - lastPoint.current.x, next.y - lastPoint.current.y) < 0.5) return
    const drawingContext = context()
    if (!drawingContext) return
    drawingContext.beginPath()
    drawingContext.moveTo(lastPoint.current.x, lastPoint.current.y)
    drawingContext.lineTo(next.x, next.y)
    drawingContext.stroke()
    lastPoint.current = next
    if (!hasInk) {
      setHasInk(true)
      hasInkRef.current = true
      onInkChange(true)
    }
  }

  function end(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return
    drawing.current = false
    lastPoint.current = null
    event.currentTarget.releasePointerCapture?.(event.pointerId)
  }

  return (
    <div className="signature-pad-wrap">
      <canvas
        ref={canvas}
        role="img"
        aria-label="Signature drawing area"
        className="signature-canvas"
        onPointerDown={begin}
        onPointerMove={draw}
        onPointerUp={end}
        onPointerCancel={end}
      />
      {!hasInk ? <span className="signature-placeholder">Draw signature here</span> : null}
      <span className="signature-line" aria-hidden="true" />
      <span className="signature-label" aria-hidden="true">Sign above the line</span>
    </div>
  )
})
