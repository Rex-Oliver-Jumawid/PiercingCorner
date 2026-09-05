import * as Popover from '@radix-ui/react-popover'
import * as Select from '@radix-ui/react-select'
import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Clock } from 'lucide-react'
import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { DayPicker } from 'react-day-picker'

import './formControls.css'

export interface SelectOption<T extends string = string> {
  value: T
  label: string
  disabled?: boolean
}

interface SharedFieldProps {
  label: string
  className?: string
  disabled?: boolean
  invalid?: boolean
}

interface SelectFieldProps<T extends string> extends SharedFieldProps {
  value: T
  options: readonly SelectOption<T>[]
  onValueChange: (value: T) => void
  placeholder?: string
  name?: string
}

interface DateFieldProps extends SharedFieldProps {
  value: string
  onValueChange: (value: string) => void
}

interface TimeFieldProps extends SharedFieldProps {
  value: string
  onValueChange: (value: string) => void
}

function useOverlayContainer<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [container, setContainer] = useState<HTMLElement>()

  useLayoutEffect(() => {
    setContainer(ref.current?.closest('dialog') ?? document.body)
  }, [])

  return { ref, container }
}

function fieldClassName(className?: string) {
  return ['pc-field', className].filter(Boolean).join(' ')
}

function encodeSelectValue(value: string) {
  return `value:${value}`
}

function decodeSelectValue(value: string) {
  return value.slice('value:'.length)
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onValueChange,
  placeholder,
  className,
  disabled,
  invalid,
  name,
}: SelectFieldProps<T>) {
  const labelId = useId()
  const { ref, container } = useOverlayContainer<HTMLDivElement>()

  return (
    <div ref={ref} className={fieldClassName(className)}>
      <label id={labelId} className="pc-field-label">{label}</label>
      <Select.Root
        name={name}
        value={encodeSelectValue(value)}
        disabled={disabled}
        onValueChange={(nextValue) => onValueChange(decodeSelectValue(nextValue) as T)}
      >
        <Select.Trigger className="pc-control-trigger pc-select-trigger" aria-labelledby={labelId} aria-invalid={invalid || undefined}>
          <Select.Value placeholder={placeholder} />
          <Select.Icon className="pc-control-icon"><ChevronDown aria-hidden="true" /></Select.Icon>
        </Select.Trigger>
        {container ? (
          <Select.Portal container={container}>
            <Select.Content className="pc-select-content" position="popper" sideOffset={6} collisionPadding={12}>
              <Select.ScrollUpButton className="pc-select-scroll"><ChevronDown className="pc-chevron-up" aria-hidden="true" /></Select.ScrollUpButton>
              <Select.Viewport className="pc-select-viewport">
                {options.map((option) => (
                  <Select.Item
                    className="pc-select-item"
                    disabled={option.disabled}
                    key={option.value}
                    value={encodeSelectValue(option.value)}
                  >
                    <Select.ItemText>{option.label}</Select.ItemText>
                    <Select.ItemIndicator className="pc-select-check"><Check aria-hidden="true" /></Select.ItemIndicator>
                  </Select.Item>
                ))}
              </Select.Viewport>
              <Select.ScrollDownButton className="pc-select-scroll"><ChevronDown aria-hidden="true" /></Select.ScrollDownButton>
            </Select.Content>
          </Select.Portal>
        ) : null}
      </Select.Root>
    </div>
  )
}

function parseDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return undefined
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return Number.isNaN(date.getTime()) ? undefined : date
}

function formatDateValue(value: string) {
  const date = parseDate(value)
  if (!date) return 'Choose a date'
  return new Intl.DateTimeFormat('en-PH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

function toDateValue(date: Date) {
  const year = String(date.getFullYear()).padStart(4, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function DateField({ label, value, onValueChange, className, disabled, invalid }: DateFieldProps) {
  const labelId = useId()
  const { ref, container } = useOverlayContainer<HTMLDivElement>()
  const [open, setOpen] = useState(false)
  const selected = useMemo(() => parseDate(value), [value])

  return (
    <div ref={ref} className={fieldClassName(className)}>
      <label id={labelId} className="pc-field-label">{label}</label>
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button type="button" className="pc-control-trigger" aria-labelledby={labelId} aria-invalid={invalid || undefined} disabled={disabled}>
            <span className={selected ? undefined : 'pc-control-placeholder'}>{formatDateValue(value)}</span>
            <CalendarDays className="pc-control-icon" aria-hidden="true" />
          </button>
        </Popover.Trigger>
        {container ? (
          <Popover.Portal container={container}>
            <Popover.Content className="pc-picker-content pc-date-content" sideOffset={6} collisionPadding={12} align="start">
              <DayPicker
                mode="single"
                selected={selected}
                defaultMonth={selected}
                showOutsideDays
                components={{ Chevron: ({ orientation }) => orientation === 'left' ? <ChevronLeft /> : <ChevronRight /> }}
                onSelect={(date) => {
                  if (!date) return
                  onValueChange(toDateValue(date))
                  setOpen(false)
                }}
              />
            </Popover.Content>
          </Popover.Portal>
        ) : null}
      </Popover.Root>
    </div>
  )
}

type Period = 'AM' | 'PM'

function timeParts(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  const hour24 = match ? Math.min(23, Number(match[1])) : 10
  const minute = match ? Math.min(59, Number(match[2])) : 0
  return {
    hour: String(hour24 % 12 || 12),
    minute: String(minute).padStart(2, '0'),
    period: (hour24 >= 12 ? 'PM' : 'AM') as Period,
  }
}

function formatTimeValue(value: string) {
  const parts = timeParts(value)
  return `${parts.hour}:${parts.minute} ${parts.period}`
}

export function TimeField({ label, value, onValueChange, className, disabled, invalid }: TimeFieldProps) {
  const labelId = useId()
  const hourId = useId()
  const minuteId = useId()
  const { ref, container } = useOverlayContainer<HTMLDivElement>()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(() => timeParts(value))
  const hour = Number(draft.hour)
  const minute = Number(draft.minute)
  const valid = hour >= 1 && hour <= 12 && minute >= 0 && minute <= 59

  function changeOpen(nextOpen: boolean) {
    if (nextOpen) setDraft(timeParts(value))
    setOpen(nextOpen)
  }

  function apply() {
    if (!valid) return
    const hour24 = draft.period === 'AM' ? hour % 12 : (hour % 12) + 12
    onValueChange(`${String(hour24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`)
    setOpen(false)
  }

  return (
    <div ref={ref} className={fieldClassName(className)}>
      <label id={labelId} className="pc-field-label">{label}</label>
      <Popover.Root open={open} onOpenChange={changeOpen}>
        <Popover.Trigger asChild>
          <button type="button" className="pc-control-trigger" aria-labelledby={labelId} aria-invalid={invalid || undefined} disabled={disabled}>
            <span>{formatTimeValue(value)}</span>
            <Clock className="pc-control-icon" aria-hidden="true" />
          </button>
        </Popover.Trigger>
        {container ? (
          <Popover.Portal container={container}>
            <Popover.Content className="pc-picker-content pc-time-content" sideOffset={6} collisionPadding={12} align="start" aria-label={`${label} picker`}>
              <div className="pc-time-grid">
                <label htmlFor={hourId}><span>Hour</span><input id={hourId} type="number" min="1" max="12" inputMode="numeric" value={draft.hour} onChange={(event) => setDraft({ ...draft, hour: event.target.value })} /></label>
                <span className="pc-time-separator" aria-hidden="true">:</span>
                <label htmlFor={minuteId}><span>Minute</span><input id={minuteId} type="number" min="0" max="59" inputMode="numeric" value={draft.minute} onChange={(event) => setDraft({ ...draft, minute: event.target.value })} /></label>
                <div className="pc-period-group" role="radiogroup" aria-label="Period">
                  {(['AM', 'PM'] as const).map((period) => <button key={period} type="button" role="radio" aria-checked={draft.period === period} onClick={() => setDraft({ ...draft, period })}>{period}</button>)}
                </div>
              </div>
              {!valid ? <p className="pc-picker-error" role="alert">Enter an hour from 1–12 and minute from 0–59.</p> : null}
              <footer className="pc-picker-actions">
                <button type="button" onClick={() => setOpen(false)}>Cancel</button>
                <button type="button" className="primary" disabled={!valid} onClick={apply}>Apply</button>
              </footer>
            </Popover.Content>
          </Popover.Portal>
        ) : null}
      </Popover.Root>
    </div>
  )
}
