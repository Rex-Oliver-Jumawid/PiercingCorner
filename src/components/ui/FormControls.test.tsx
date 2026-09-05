import { fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { DateField, SelectField, TimeField } from './FormControls'

describe('PiercingCorner form controls', () => {
  it('selects string and empty values while respecting disabled options', () => {
    function Harness() {
      const [value, setValue] = useState('')
      return <SelectField label="Station" value={value} options={[{ value: '', label: 'No station' }, { value: 'one', label: 'Station 1' }, { value: 'closed', label: 'Closed station', disabled: true }]} onValueChange={setValue} />
    }

    render(<Harness />)
    const trigger = screen.getByRole('combobox', { name: 'Station' })
    expect(trigger).toHaveTextContent('No station')
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    expect(screen.getByRole('option', { name: 'Closed station' })).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(screen.getByRole('option', { name: 'Station 1' }))
    expect(trigger).toHaveTextContent('Station 1')
  })

  it('mounts an open menu inside the nearest native dialog', () => {
    render(<dialog open aria-label="Editor"><SelectField label="Status" value="active" options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} onValueChange={vi.fn()} /></dialog>)
    const dialog = screen.getByRole('dialog', { name: 'Editor' })
    fireEvent.keyDown(within(dialog).getByRole('combobox', { name: 'Status' }), { key: 'ArrowDown' })
    expect(within(dialog).getByRole('option', { name: 'Inactive' })).toBeVisible()
  })

  it('returns calendar selections as date-only ISO values', () => {
    const onValueChange = vi.fn()
    render(<DateField label="Closure date" value="2026-09-05" onValueChange={onValueChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Closure date' }))
    fireEvent.click(screen.getByRole('button', { name: /September 10th, 2026/ }))
    expect(onValueChange).toHaveBeenCalledWith('2026-09-10')
  })

  it('edits exact minutes in 12-hour form and commits a 24-hour value only on Apply', () => {
    const onValueChange = vi.fn()
    render(<TimeField label="Opens" value="00:07" onValueChange={onValueChange} />)
    const trigger = screen.getByRole('button', { name: 'Opens' })
    expect(trigger).toHaveTextContent('12:07 AM')

    fireEvent.click(trigger)
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Hour' }), { target: { value: '12' } })
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Minute' }), { target: { value: '31' } })
    fireEvent.click(screen.getByRole('radio', { name: 'PM' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onValueChange).not.toHaveBeenCalled()

    fireEvent.click(trigger)
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Hour' }), { target: { value: '12' } })
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Minute' }), { target: { value: '31' } })
    fireEvent.click(screen.getByRole('radio', { name: 'PM' }))
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(onValueChange).toHaveBeenCalledWith('12:31')
  })
})
