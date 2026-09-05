import { createRef } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SignaturePad, type SignaturePadHandle } from './SignaturePad'

const drawingContext = {
  beginPath: vi.fn(),
  clearRect: vi.fn(),
  drawImage: vi.fn(),
  fillRect: vi.fn(),
  lineTo: vi.fn(),
  moveTo: vi.fn(),
  setTransform: vi.fn(),
  stroke: vi.fn(),
  fillStyle: '',
  lineCap: '',
  lineJoin: '',
  lineWidth: 0,
  strokeStyle: '',
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(drawingContext as unknown as CanvasRenderingContext2D)
})

describe('SignaturePad', () => {
  it('requires an actual pointer movement and can be cleared', () => {
    const handle = createRef<SignaturePadHandle>()
    const onInkChange = vi.fn()
    render(<SignaturePad ref={handle} onInkChange={onInkChange} />)
    const canvas = screen.getByRole('img', { name: 'Signature drawing area' })

    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 5, clientY: 5 })
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 5, clientY: 5 })
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 5, clientY: 5 })
    expect(onInkChange).not.toHaveBeenCalledWith(true)
    expect(screen.getByText('Draw signature here')).toBeVisible()

    fireEvent.pointerDown(canvas, { pointerId: 2, clientX: 5, clientY: 5 })
    fireEvent.pointerMove(canvas, { pointerId: 2, clientX: 25, clientY: 20 })
    expect(onInkChange).toHaveBeenCalledWith(true)
    expect(screen.queryByText('Draw signature here')).not.toBeInTheDocument()

    act(() => handle.current?.clear())
    expect(onInkChange).toHaveBeenLastCalledWith(false)
    expect(screen.getByText('Draw signature here')).toBeVisible()
  })
})
