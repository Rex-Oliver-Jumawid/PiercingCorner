import { useEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Search } from 'lucide-react'
import { DateField, SelectField, TimeField } from '../../components/ui/FormControls'
import { CatalogCard } from './CatalogCard'
import {
  useConfigureRecurringStudioHours,
  useConfigureRecurringPiercerAvailability,
  useConfigureTemporaryPiercerSchedule,
  useConfigureTemporaryStudioSchedule,
  useStudioMutation,
} from './studioQueries'
import * as service from './studioService'
import {
  addCalendarDays,
  formatStudioTime,
  formatStudioDate,
  getManilaDate,
  getRelevantTemporarySchedules,
  getRelevantTemporaryPiercerSchedules,
  normalizeTime,
  STUDIO_DAYS,
  validateTimeRange,
} from './studioModel'
import type {
  PiercerProfile,
  RecurringStudioHour,
  StudioConfiguration,
  StudioException,
  TemporaryStudioSchedule,
  TemporaryPiercerSchedule,
} from './studioModel'
import type { CatalogEntry, CatalogKind } from './catalogModel'

export type StudioEditor =
  | { mode: 'catalog'; kind: CatalogKind; entry?: CatalogEntry }
  | { mode: 'configure-hours'; schedule?: TemporaryStudioSchedule }
  | { mode: 'hours'; hour: RecurringStudioHour }
  | { mode: 'piercer'; profile?: PiercerProfile }
  | { mode: 'qualifications'; profile: PiercerProfile }
  | { mode: 'availability'; profile: PiercerProfile; weekday: number }
  | { mode: 'configure-piercer-schedule'; schedule?: TemporaryPiercerSchedule }
  | { mode: 'exception'; exception?: StudioException }

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase()
}

function EditorShell({ title, subtitle, busy, error, onClose, onSubmit, submitLabel = 'Save changes', children, danger }: {
  title: string; subtitle: string; busy: boolean; error?: string | null; onClose: () => void
  onSubmit: (event: FormEvent) => void; submitLabel?: string; children: ReactNode; danger?: ReactNode
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => { const current = dialog.current; current?.showModal(); return () => current?.close() }, [])
  return <dialog ref={dialog} className="catalog-dialog studio-editor" aria-label={title} onCancel={(event) => { event.preventDefault(); if (!busy) onClose() }}>
    <header className="catalog-dialog-head"><div><p className="studio-eyebrow">STUDIO</p><h2>{title}</h2><p>{subtitle}</p></div><button type="button" className="catalog-close" aria-label={`Close ${title}`} disabled={busy} onClick={onClose}>×</button></header>
    <form onSubmit={onSubmit} noValidate><fieldset disabled={busy} className="catalog-form">{children}</fieldset>
      {error ? <p role="alert" className="catalog-error studio-editor-error">{error}</p> : null}
      <footer className="catalog-dialog-foot">{danger}<button type="button" className="catalog-button" disabled={busy} onClick={onClose}>Cancel</button><button type="submit" className="catalog-button primary" disabled={busy}>{busy ? 'Saving…' : submitLabel}</button></footer>
    </form>
  </dialog>
}

function HoursEditor({ hour, onClose }: { hour: RecurringStudioHour; onClose: () => void }) {
  const [open, setOpen] = useState(hour.is_open)
  const [starts, setStarts] = useState(normalizeTime(hour.opens_at) || '10:00')
  const [ends, setEnds] = useState(normalizeTime(hour.closes_at) || '20:00')
  const [validation, setValidation] = useState<string | null>(null)
  const mutation = useStudioMutation(service.saveRecurringStudioHour)
  const day = STUDIO_DAYS.find((item) => item.value === hour.weekday)!
  function submit(event: FormEvent) {
    event.preventDefault(); const error = open ? validateTimeRange(starts, ends) : null; setValidation(error)
    if (!error) mutation.mutate({ weekday: hour.weekday, isOpen: open, opensAt: starts, closesAt: ends }, { onSuccess: onClose })
  }
  return <EditorShell title="Edit Studio Hours" subtitle={day.label} busy={mutation.isPending} error={validation || mutation.error?.message} onClose={onClose} onSubmit={submit}>
    <SelectField className="catalog-field catalog-wide" label="Day status" value={open ? 'open' : 'closed'} options={[{ value: 'open', label: 'Open' }, { value: 'closed', label: 'Closed' }]} onValueChange={(value) => setOpen(value === 'open')} />
    <TimeField className="catalog-field" label="Opens" value={starts} disabled={!open} onValueChange={setStarts} />
    <TimeField className="catalog-field" label="Closes" value={ends} disabled={!open} onValueChange={setEnds} />
    <p className="studio-notice catalog-wide">Studio Hours define the operating window. Conflicting piercer schedules must be changed first.</p>
  </EditorShell>
}

function selectedWeekdays(hours: RecurringStudioHour[]) {
  return hours.filter((hour) => hour.is_open).map((hour) => hour.weekday)
}

function firstOpenTimes(hours: RecurringStudioHour[]) {
  const first = hours.find((hour) => hour.is_open)
  return {
    opens: normalizeTime(first?.opens_at) || '10:00',
    closes: normalizeTime(first?.closes_at) || '20:00',
  }
}

function ConfigureHoursEditor({ configuration, schedule, onClose }: {
  configuration: StudioConfiguration
  schedule?: TemporaryStudioSchedule
  onClose: () => void
}) {
  const initialHours = schedule?.hours ?? configuration.recurringHours
  const initialTimes = firstOpenTimes(initialHours)
  const [mode, setMode] = useState<'recurring' | 'temporary'>(schedule ? 'temporary' : 'recurring')
  const [startsOn, setStartsOn] = useState(schedule?.starts_on ?? '')
  const [endsOn, setEndsOn] = useState(schedule?.ends_on ?? '')
  const [days, setDays] = useState<number[]>(selectedWeekdays(initialHours))
  const [opens, setOpens] = useState(initialTimes.opens)
  const [closes, setCloses] = useState(initialTimes.closes)
  const [validation, setValidation] = useState<string | null>(null)
  const recurring = useConfigureRecurringStudioHours()
  const temporary = useConfigureTemporaryStudioSchedule()
  const busy = recurring.isPending || temporary.isPending
  const mutationError = recurring.error?.message || temporary.error?.message

  function chooseMode(next: 'recurring' | 'temporary') {
    if (schedule) return
    recurring.reset()
    temporary.reset()
    setMode(next)
    setValidation(null)
  }

  function toggleDay(weekday: number) {
    setDays((current) => current.includes(weekday)
      ? current.filter((day) => day !== weekday)
      : [...current, weekday].sort())
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    let error: string | null = null
    if (mode === 'temporary') {
      if (!startsOn) error = 'Choose a start date.'
      else if (!endsOn) error = 'Choose an end date.'
      else if (startsOn > endsOn) error = 'The start date must be on or before the end date.'
    }
    if (!error && days.length) error = validateTimeRange(opens, closes)
    setValidation(error)
    if (error) return

    const hours = STUDIO_DAYS.map((day) => ({
      weekday: day.value,
      is_open: days.includes(day.value),
      opens_at: days.includes(day.value) ? opens : null,
      closes_at: days.includes(day.value) ? closes : null,
    }))
    if (mode === 'recurring') {
      recurring.mutate({ hours }, { onSuccess: onClose })
    } else {
      temporary.mutate({ id: schedule?.id, startsOn, endsOn, hours }, { onSuccess: onClose })
    }
  }

  return <EditorShell
    title={schedule ? 'Edit Temporary Studio Hours' : 'Configure Studio Hours'}
    subtitle={schedule ? 'Update this date-bounded override.' : 'Set the recurring week or a date-bounded override.'}
    busy={busy}
    error={validation || mutationError}
    onClose={onClose}
    onSubmit={submit}
    submitLabel={schedule ? 'Save temporary schedule' : 'Save schedule'}
  >
    <fieldset className="studio-schedule-type catalog-wide">
      <legend>Schedule type</legend>
      <div className="studio-schedule-options">
        <label className={mode === 'recurring' ? 'selected' : ''}>
          <input type="radio" name="schedule-type" value="recurring" checked={mode === 'recurring'} disabled={Boolean(schedule)} onChange={() => chooseMode('recurring')} />
          <span><strong>Recurring</strong><small>Repeats every week until changed.</small></span>
        </label>
        <label className={mode === 'temporary' ? 'selected' : ''}>
          <input type="radio" name="schedule-type" value="temporary" checked={mode === 'temporary'} onChange={() => chooseMode('temporary')} />
          <span><strong>Temporary</strong><small>Overrides recurring Studio Hours only for the selected dates.</small></span>
        </label>
      </div>
    </fieldset>
    {mode === 'temporary' ? <>
      <DateField className="catalog-field" label="Start date" value={startsOn} invalid={Boolean(validation && !startsOn)} onValueChange={setStartsOn} />
      <DateField className="catalog-field" label="End date" value={endsOn} invalid={Boolean(validation && (!endsOn || startsOn > endsOn))} onValueChange={setEndsOn} />
      <p className="studio-notice catalog-wide">The date range is inclusive.{endsOn ? ` Recurring Studio Hours resume ${formatStudioDate(addCalendarDays(endsOn, 1), false)}.` : ''}</p>
    </> : null}
    <fieldset className="studio-working-days catalog-wide">
      <legend>Working days</legend>
      <div className="studio-day-choice-grid">{STUDIO_DAYS.map((day) => <label key={day.value} className={days.includes(day.value) ? 'selected' : ''}><input type="checkbox" checked={days.includes(day.value)} onChange={() => toggleDay(day.value)} /><span>{day.short}</span></label>)}</div>
    </fieldset>
    <TimeField className="catalog-field" label="Opening time" value={opens} disabled={!days.length} invalid={Boolean(validation && days.length)} onValueChange={setOpens} />
    <TimeField className="catalog-field" label="Closing time" value={closes} disabled={!days.length} invalid={Boolean(validation && days.length)} onValueChange={setCloses} />
    <p className="studio-schedule-note catalog-wide">Selected days are open with these hours. Unselected days are saved as closed.</p>
  </EditorShell>
}

function PiercerEditor({ profile, configuration, onClose }: { profile?: PiercerProfile; configuration: StudioConfiguration; onClose: () => void }) {
  const [name, setName] = useState(profile?.display_name ?? '')
  const [active, setActive] = useState(profile?.active ?? true)
  const [stationId, setStationId] = useState(profile?.default_station_id ?? '')
  const [validation, setValidation] = useState<string | null>(null)
  const mutation = useStudioMutation(service.savePiercer)
  function submit(event: FormEvent) {
    event.preventDefault(); const trimmed = name.trim(); setValidation(trimmed ? null : 'Enter a piercer name.')
    if (trimmed) mutation.mutate({ id: profile?.id, displayName: trimmed, active, defaultStationId: stationId || null }, { onSuccess: onClose })
  }
  return <EditorShell title={profile ? 'Edit Piercer Profile' : 'Add Piercer Profile'} subtitle="Piercers are Studio profiles, not application accounts." busy={mutation.isPending} error={validation || mutation.error?.message} onClose={onClose} onSubmit={submit} submitLabel={profile ? 'Save changes' : 'Add piercer'}>
    <label className="catalog-field catalog-wide"><span>Piercer name</span><input aria-label="Piercer name" autoFocus value={name} onChange={(event) => setName(event.target.value)} /></label>
    <SelectField className="catalog-field" label="Default station" value={stationId} options={[{ value: '', label: 'No default station' }, ...configuration.stations.filter((station) => station.active || station.id === profile?.default_station_id).map((station) => ({ value: station.id, label: `${station.name}${station.active ? '' : ' (Inactive)'}`, disabled: !station.active }))]} onValueChange={setStationId} />
    <SelectField className="catalog-field" label="Status" value={active ? 'active' : 'inactive'} options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} onValueChange={(value) => setActive(value === 'active')} />
  </EditorShell>
}

function QualificationsEditor({ profile, configuration, onClose }: { profile: PiercerProfile; configuration: StudioConfiguration; onClose: () => void }) {
  const initial = configuration.qualifications.filter((item) => item.piercer_profile_id === profile.id).map((item) => item.service_id)
  const [selected, setSelected] = useState(initial)
  const [search, setSearch] = useState('')
  const mutation = useStudioMutation((ids: string[]) => service.replaceQualifications(profile.id, ids))
  const normalizedSearch = search.trim().toLocaleLowerCase('en-PH')
  const visibleServices = normalizedSearch
    ? configuration.services.filter((item) => item.name.toLocaleLowerCase('en-PH').includes(normalizedSearch))
    : configuration.services
  function submit(event: FormEvent) { event.preventDefault(); mutation.mutate(selected, { onSuccess: onClose }) }
  return <EditorShell title="Services Offered" subtitle={profile.display_name} busy={mutation.isPending} error={mutation.error?.message} onClose={onClose} onSubmit={submit}>
    <p className="studio-notice catalog-wide">Choose every service this piercer may be assigned to perform.</p>
    <label className="studio-service-search catalog-wide"><span>Search services</span><div><Search aria-hidden="true" /><input type="search" value={search} placeholder="Search by service name…" onChange={(event) => setSearch(event.target.value)} /></div></label>
    {visibleServices.length ? <div className="studio-check-grid studio-qualification-grid catalog-wide">{visibleServices.map((item) => <label className="studio-check-row" key={item.id}><input type="checkbox" checked={selected.includes(item.id)} onChange={() => setSelected((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])} /><span>{item.name}{item.active ? '' : ' (Inactive)'}</span></label>)}</div> : <p className="studio-service-search-empty catalog-wide">No services match “{search.trim()}”.</p>}
  </EditorShell>
}

function AvailabilityEditor({ profile, weekday, configuration, onClose }: { profile: PiercerProfile; weekday: number; configuration: StudioConfiguration; onClose: () => void }) {
  const existing = configuration.availability.find((item) => item.piercer_profile_id === profile.id && item.weekday === weekday)
  const hours = configuration.recurringHours.find((item) => item.weekday === weekday)
  const [day, setDay] = useState(weekday)
  const [available, setAvailable] = useState(!!existing)
  const [mode, setMode] = useState<'studio' | 'custom'>(existing?.mode ?? 'studio')
  const [starts, setStarts] = useState(normalizeTime(existing?.starts_at ?? hours?.opens_at) || '10:00')
  const [ends, setEnds] = useState(normalizeTime(existing?.ends_at ?? hours?.closes_at) || '20:00')
  const [validation, setValidation] = useState<string | null>(null)
  const mutation = useStudioMutation(service.saveAvailability)
  function chooseDay(next: number) {
    setDay(next); const saved = configuration.availability.find((item) => item.piercer_profile_id === profile.id && item.weekday === next); const studioHour = configuration.recurringHours.find((item) => item.weekday === next)
    setAvailable(!!saved); setMode(saved?.mode ?? 'studio'); setStarts(normalizeTime(saved?.starts_at ?? studioHour?.opens_at) || '10:00'); setEnds(normalizeTime(saved?.ends_at ?? studioHour?.closes_at) || '20:00')
  }
  function submit(event: FormEvent) {
    event.preventDefault(); const hour = configuration.recurringHours.find((item) => item.weekday === day)
    let error = available && mode === 'custom' ? validateTimeRange(starts, ends) : null
    if (available && mode === 'custom' && !hour?.is_open) error = 'This day is closed in recurring Studio Hours.'
    if (available && mode === 'custom' && hour?.is_open && (starts < normalizeTime(hour.opens_at) || ends > normalizeTime(hour.closes_at))) error = 'Custom availability must stay within the configured recurring Studio Hours.'
    setValidation(error); if (!error) mutation.mutate({
      piercerId: profile.id,
      weekday: day,
      available,
      mode,
      startsAt: available && mode === 'custom' ? starts : null,
      endsAt: available && mode === 'custom' ? ends : null,
    }, { onSuccess: onClose })
  }
  return <EditorShell title="Edit Piercer Availability" subtitle={`${profile.display_name} · Recurring weekday maintenance`} busy={mutation.isPending} error={validation || mutation.error?.message} onClose={onClose} onSubmit={submit}>
    <SelectField className="catalog-field catalog-wide" label="Day" value={String(day)} options={STUDIO_DAYS.map((item) => ({ value: String(item.value), label: item.label }))} onValueChange={(value) => chooseDay(Number(value))} />
    <SelectField className="catalog-field catalog-wide" label="Availability" value={available ? 'available' : 'unavailable'} options={[{ value: 'available', label: 'Available' }, { value: 'unavailable', label: 'Not available' }]} onValueChange={(value) => setAvailable(value === 'available')} />
    <SelectField className="catalog-field catalog-wide" label="Hours source" disabled={!available} value={mode} options={[{ value: 'studio', label: 'Same as Studio Hours' }, { value: 'custom', label: 'Custom Hours' }]} onValueChange={setMode} />
    {available && mode === 'custom' ? <>
      <TimeField className="catalog-field" label="Starts" value={starts} onValueChange={setStarts} />
      <TimeField className="catalog-field" label="Ends" value={ends} onValueChange={setEnds} />
    </> : null}
    {available && mode === 'studio' ? <p className="studio-notice catalog-wide">This piercer dynamically follows Effective Studio Hours for this weekday.</p> : null}
  </EditorShell>
}

function ConfigurePiercerScheduleEditor({ configuration, schedule, onClose }: { configuration: StudioConfiguration; schedule?: TemporaryPiercerSchedule; onClose: () => void }) {
  const [piercerId, setPiercerId] = useState(schedule?.piercer_profile_id ?? configuration.profiles[0]?.id ?? '')
  const [kind, setKind] = useState<'recurring' | 'temporary'>(schedule ? 'temporary' : 'recurring')
  const recurringRows = configuration.availability.filter((row) => row.piercer_profile_id === piercerId)
  const sourceRows = schedule?.availability ?? recurringRows
  const initialDays = schedule ? schedule.availability.filter((row) => row.is_available).map((row) => row.weekday) : recurringRows.map((row) => row.weekday)
  const firstCustom = sourceRows.find((row) => row.mode === 'custom')
  const [days, setDays] = useState<number[]>(initialDays)
  const [hourMode, setHourMode] = useState<'studio' | 'custom'>(firstCustom ? 'custom' : 'studio')
  const [starts, setStarts] = useState(normalizeTime(firstCustom?.starts_at) || '10:00')
  const [ends, setEnds] = useState(normalizeTime(firstCustom?.ends_at) || '20:00')
  const [startsOn, setStartsOn] = useState(schedule?.starts_on ?? '')
  const [endsOn, setEndsOn] = useState(schedule?.ends_on ?? '')
  const [validation, setValidation] = useState<string | null>(null)
  const recurring = useConfigureRecurringPiercerAvailability()
  const temporary = useConfigureTemporaryPiercerSchedule()
  const busy = recurring.isPending || temporary.isPending
  function toggleDay(day: number) { setDays((current) => current.includes(day) ? current.filter((item) => item !== day) : [...current, day].sort()) }
  function selectPiercer(next: string) {
    setPiercerId(next); const saved = configuration.availability.filter((row) => row.piercer_profile_id === next)
    setDays(saved.map((row) => row.weekday)); const custom = saved.find((row) => row.mode === 'custom')
    setHourMode(custom ? 'custom' : 'studio'); setStarts(normalizeTime(custom?.starts_at) || '10:00'); setEnds(normalizeTime(custom?.ends_at) || '20:00')
  }
  function submit(event: FormEvent) {
    event.preventDefault()
    let error: string | null = !piercerId ? 'Choose a piercer.' : null
    if (!error && kind === 'temporary') error = !startsOn ? 'Choose a start date.' : !endsOn ? 'Choose an end date.' : startsOn > endsOn ? 'The start date must be on or before the end date.' : null
    if (!error && days.length && hourMode === 'custom') error = validateTimeRange(starts, ends)
    setValidation(error); if (error) return
    const availability = STUDIO_DAYS.map((day) => ({ weekday: day.value, is_available: days.includes(day.value), mode: days.includes(day.value) ? hourMode : null, starts_at: days.includes(day.value) && hourMode === 'custom' ? starts : null, ends_at: days.includes(day.value) && hourMode === 'custom' ? ends : null }))
    if (kind === 'recurring') recurring.mutate({ piercerProfileId: piercerId, availability }, { onSuccess: onClose })
    else temporary.mutate({ id: schedule?.id, piercerProfileId: piercerId, startsOn, endsOn, availability }, { onSuccess: onClose })
  }
  return <EditorShell title={schedule ? 'Edit Temporary Piercer Schedule' : 'Configure Piercer Schedule'} subtitle={schedule ? 'Update this date-bounded override only.' : 'Configure a recurring week or a date-bounded override.'} busy={busy} error={validation || recurring.error?.message || temporary.error?.message} onClose={onClose} onSubmit={submit} submitLabel={schedule ? 'Save temporary schedule' : 'Save schedule'}>
    <SelectField className="catalog-field catalog-wide" label="Piercer" value={piercerId} disabled={Boolean(schedule)} options={configuration.profiles.map((profile) => ({ value: profile.id, label: `${profile.display_name}${profile.active ? '' : ' (Inactive)'}` }))} onValueChange={selectPiercer} />
    <fieldset className="studio-schedule-type catalog-wide"><legend>Schedule type</legend><div className="studio-schedule-options">
      <label className={kind === 'recurring' ? 'selected' : ''}><input type="radio" name="piercer-schedule-type" checked={kind === 'recurring'} disabled={Boolean(schedule)} onChange={() => setKind('recurring')} /><span><strong>Recurring</strong><small>Repeats every week until changed.</small></span></label>
      <label className={kind === 'temporary' ? 'selected' : ''}><input type="radio" name="piercer-schedule-type" checked={kind === 'temporary'} onChange={() => setKind('temporary')} /><span><strong>Temporary</strong><small>Overrides recurring availability only for the selected dates.</small></span></label>
    </div></fieldset>
    {kind === 'temporary' ? <><DateField className="catalog-field" label="Start date" value={startsOn} onValueChange={setStartsOn} /><DateField className="catalog-field" label="End date" value={endsOn} onValueChange={setEndsOn} /><p className="studio-notice catalog-wide">The date range is inclusive.{endsOn ? ` Recurring schedule resumes ${formatStudioDate(addCalendarDays(endsOn, 1), false)}.` : ''}</p></> : null}
    <fieldset className="studio-working-days catalog-wide"><legend>Available weekdays</legend><div className="studio-day-choice-grid">{STUDIO_DAYS.map((day) => <label key={day.value} className={days.includes(day.value) ? 'selected' : ''}><input type="checkbox" checked={days.includes(day.value)} onChange={() => toggleDay(day.value)} /><span>{day.short}</span></label>)}</div></fieldset>
    <SelectField className="catalog-field catalog-wide" label="Hours" disabled={!days.length} value={hourMode} options={[{ value: 'studio', label: 'Same as Studio Hours' }, { value: 'custom', label: 'Custom Hours' }]} onValueChange={setHourMode} />
    {days.length && hourMode === 'studio' ? <p className="studio-notice catalog-wide">Available whenever the Studio is open.</p> : null}
    {days.length && hourMode === 'custom' ? <><TimeField className="catalog-field" label="Starts" value={starts} onValueChange={setStarts} /><TimeField className="catalog-field" label="Ends" value={ends} onValueChange={setEnds} /></> : null}
    <p className="studio-schedule-note catalog-wide">Unchecked recurring weekdays are unavailable. Temporary schedules explicitly save every unchecked weekday as unavailable.</p>
  </EditorShell>
}

function ExceptionEditor({ exception, onClose }: { exception?: StudioException; onClose: () => void }) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const [date, setDate] = useState(exception?.exception_date ?? today)
  const [type, setType] = useState<'closed' | 'reduced_hours'>(exception?.exception_type ?? 'closed')
  const [starts, setStarts] = useState(normalizeTime(exception?.opens_at) || '10:00')
  const [ends, setEnds] = useState(normalizeTime(exception?.closes_at) || '16:00')
  const [reason, setReason] = useState(exception?.reason ?? '')
  const [validation, setValidation] = useState<string | null>(null)
  const save = useStudioMutation(service.saveStudioException)
  const remove = useStudioMutation(service.deleteStudioException)
  function submit(event: FormEvent) {
    event.preventDefault(); let error = !date ? 'Choose a date.' : !reason.trim() ? 'Enter a reason.' : null
    if (!error && type === 'reduced_hours') error = validateTimeRange(starts, ends)
    setValidation(error); if (!error) save.mutate({ id: exception?.id, exception_date: date, exception_type: type, opens_at: starts, closes_at: ends, reason }, { onSuccess: onClose })
  }
  return <EditorShell title={exception ? 'Edit Closure or Exception' : 'Add Closure or Exception'} subtitle="Studio-wide Manila schedule override" busy={save.isPending || remove.isPending} error={validation || save.error?.message || remove.error?.message} onClose={onClose} onSubmit={submit} danger={exception ? <button type="button" className="catalog-button danger studio-delete" onClick={() => remove.mutate(exception.id, { onSuccess: onClose })}>Remove</button> : null}>
    <DateField className="catalog-field" label="Date" value={date} onValueChange={setDate} />
    <SelectField className="catalog-field" label="Type" value={type} options={[{ value: 'closed', label: 'Closed all day' }, { value: 'reduced_hours', label: 'Reduced hours' }]} onValueChange={setType} />
    <TimeField className="catalog-field" label="Start time" disabled={type === 'closed'} value={starts} onValueChange={setStarts} />
    <TimeField className="catalog-field" label="End time" disabled={type === 'closed'} value={ends} onValueChange={setEnds} />
    <label className="catalog-field catalog-wide"><span>Reason</span><input aria-label="Reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Maintenance, private event, holiday…" /></label>
  </EditorShell>
}

export function StudioConfigurationView({ configuration, editor, setEditor }: { configuration: StudioConfiguration; editor: StudioEditor | null; setEditor: (value: StudioEditor | null) => void }) {
  const [selectedProfileId, setSelectedProfileId] = useState(configuration.profiles[0]?.id ?? '')
  const [selectedAvailabilityId, setSelectedAvailabilityId] = useState(configuration.profiles[0]?.id ?? '')
  const profile = configuration.profiles.find((item) => item.id === selectedProfileId) ?? configuration.profiles[0]
  const availabilityProfile = configuration.profiles.find((item) => item.id === selectedAvailabilityId) ?? configuration.profiles[0]
  const qualifications = profile ? configuration.qualifications.filter((item) => item.piercer_profile_id === profile.id) : []
  const coverage = profile ? configuration.availability.filter((item) => item.piercer_profile_id === profile.id).length : 0
  const station = configuration.stations.find((item) => item.id === profile?.default_station_id)
  const today = configuration.effectiveToday?.schedule_date ?? getManilaDate()
  const temporarySchedules = getRelevantTemporarySchedules(configuration.temporarySchedules, today)
  const piercerTemporarySchedules = availabilityProfile ? getRelevantTemporaryPiercerSchedules(configuration.temporaryPiercerSchedules, availabilityProfile.id, today) : { active: null, upcoming: [] }
  const visibleTemporarySchedules = [temporarySchedules.active, ...temporarySchedules.upcoming].filter((item): item is TemporaryStudioSchedule => Boolean(item))
  const effective = configuration.effectiveToday
  return <>
    <section id="studio-hours" tabIndex={-1} className="studio-panel">
      <header className="studio-panel-head"><div><h3>Studio Hours</h3><p>Recurring weekly hours with date-bounded temporary overrides.</p></div><button className="catalog-button primary" type="button" onClick={() => setEditor({ mode: 'configure-hours' })}>Configure hours</button></header>
      <div className="studio-schedule-summary">
        <div><span className={`studio-source-badge ${effective?.source ?? 'recurring'}`}>{effective?.source ?? 'Recurring'}</span><strong>Today · {effective?.is_open ? `${formatStudioTime(effective.opens_at)} — ${formatStudioTime(effective.closes_at)}` : 'Closed'}</strong><small>{effective?.source === 'exception' ? 'A Studio Exception controls today’s hours.' : effective?.source === 'temporary' ? 'A Temporary schedule controls today’s hours.' : 'The Recurring schedule controls today’s hours.'}</small></div>
        <div><strong>{configuration.recurringHours.length === 7 ? 'Recurring schedule configured' : 'Recurring schedule incomplete'}</strong><small>Repeats every week until changed.</small></div>
      </div>
      {temporarySchedules.active ? <div className="studio-active-temporary"><div><span className="studio-source-badge temporary">Temporary</span><strong>{formatStudioDate(temporarySchedules.active.starts_on)} – {formatStudioDate(temporarySchedules.active.ends_on)}</strong><small>Recurring schedule resumes {formatStudioDate(addCalendarDays(temporarySchedules.active.ends_on, 1), false)}.</small></div><button className="studio-row-edit" type="button" onClick={() => setEditor({ mode: 'configure-hours', schedule: temporarySchedules.active! })}>Edit temporary schedule</button></div> : null}
      {visibleTemporarySchedules.filter((schedule) => schedule.id !== temporarySchedules.active?.id).length ? <div className="studio-temporary-list"><p>Upcoming temporary schedules</p>{visibleTemporarySchedules.filter((schedule) => schedule.id !== temporarySchedules.active?.id).map((schedule) => <div className="studio-temporary-row" key={schedule.id}><div><strong>{formatStudioDate(schedule.starts_on)} – {formatStudioDate(schedule.ends_on)}</strong><small>Recurring schedule resumes {formatStudioDate(addCalendarDays(schedule.ends_on, 1), false)}.</small></div><button className="studio-row-edit" type="button" onClick={() => setEditor({ mode: 'configure-hours', schedule })}>Edit temporary schedule</button></div>)}</div> : null}
      <div className="studio-recurring-label"><span className="studio-source-badge recurring">Recurring</span><span>Individual edits below always change the recurring weekday.</span></div>
      <div>{configuration.recurringHours.map((hour) => { const day = STUDIO_DAYS.find((item) => item.value === hour.weekday)!; return <div className="studio-hours-row" key={hour.weekday}><strong>{day.short}</strong><span className={hour.is_open ? 'studio-open' : 'studio-closed'}>{hour.is_open ? 'OPEN' : 'CLOSED'}</span><span>{hour.is_open ? `${formatStudioTime(hour.opens_at)} — ${formatStudioTime(hour.closes_at)}` : 'Not accepting studio operations'}</span><button className="studio-row-edit" type="button" aria-label={`Edit recurring ${day.label} hours`} onClick={() => setEditor({ mode: 'hours', hour })}>Edit recurring</button></div> })}</div>
    </section>
    <section className="studio-panel"><header className="studio-panel-head"><div><h3>Piercer Profiles</h3><p>Manage Studio profiles and the services each piercer is qualified to offer.</p></div><button className="catalog-button primary" type="button" onClick={() => setEditor({ mode: 'piercer' })}>+ Add piercer</button></header>
      {configuration.profiles.length ? <><div className="studio-tabs">{configuration.profiles.map((item) => <button type="button" className={profile?.id === item.id ? 'active' : ''} key={item.id} onClick={() => setSelectedProfileId(item.id)}>{item.display_name}</button>)}</div>{profile ? <div className="studio-profile-layout"><article className="studio-profile-card"><div className="studio-profile-top"><span>{initials(profile.display_name)}</span><div><strong>{profile.display_name}</strong><small>Piercer profile · {profile.active ? 'Active' : 'Inactive'}</small></div><b className={profile.active ? 'studio-open' : 'studio-closed'}>{profile.active ? 'ACTIVE' : 'INACTIVE'}</b></div><div className="studio-profile-meta"><div><span>Default station</span><strong>{station?.name ?? 'Not assigned'}</strong></div><div><span>Weekly coverage</span><strong>{coverage} {coverage === 1 ? 'day' : 'days'}</strong></div></div><button className="studio-row-edit studio-profile-edit" type="button" onClick={() => setEditor({ mode: 'piercer', profile })}>Edit profile</button></article><article className="studio-profile-services"><div className="studio-services-head"><div><h4>Services offered</h4><p>Only selected services can be assigned to this piercer.</p></div><button className="studio-row-edit" type="button" onClick={() => setEditor({ mode: 'qualifications', profile })}>Edit services</button></div><div className="studio-service-chips">{qualifications.length ? qualifications.map((item) => { const qualified = configuration.services.find((serviceItem) => serviceItem.id === item.service_id); return qualified ? <span key={item.service_id}>{qualified.name}{qualified.active ? '' : ' · Inactive'}</span> : null }) : <p>No services assigned.</p>}</div></article></div> : null}</> : <p className="studio-empty">No piercer profiles yet.</p>}
    </section>
    <section className="studio-panel"><header className="studio-panel-head"><div><h3>Services &amp; Products</h3><p>Manage the catalogs used by transactions, qualifications, sales, and reports.</p></div></header><div className="catalog-grid"><CatalogCard kind="service" onEdit={(kind, entry) => setEditor({ mode: 'catalog', kind, entry })} /><CatalogCard kind="product" onEdit={(kind, entry) => setEditor({ mode: 'catalog', kind, entry })} /></div></section>
    <section className="studio-panel"><header className="studio-panel-head"><div><h3>Piercer Availability</h3><p>Recurring weekly availability with date-bounded overrides.</p></div>{availabilityProfile ? <button className="catalog-button primary" type="button" onClick={() => setEditor({ mode: 'configure-piercer-schedule' })}>Configure schedule</button> : null}</header>
      {availabilityProfile ? <><div className="studio-tabs">{configuration.profiles.map((item) => <button type="button" className={availabilityProfile.id === item.id ? 'active' : ''} key={item.id} onClick={() => setSelectedAvailabilityId(item.id)}>{item.display_name}{item.active ? '' : ' · Inactive'}</button>)}</div><p className="studio-selected">Selected: <strong>{availabilityProfile.display_name}</strong>{availabilityProfile.active ? '' : ' · Inactive profile'}</p>
        {piercerTemporarySchedules.active ? <div className="studio-active-temporary"><div><span className="studio-source-badge temporary">Temporary</span><strong>{formatStudioDate(piercerTemporarySchedules.active.starts_on)} – {formatStudioDate(piercerTemporarySchedules.active.ends_on)}</strong><small>Recurring schedule resumes {formatStudioDate(addCalendarDays(piercerTemporarySchedules.active.ends_on, 1), false)}.</small></div><button className="studio-row-edit" type="button" onClick={() => setEditor({ mode: 'configure-piercer-schedule', schedule: piercerTemporarySchedules.active! })}>Edit temporary schedule</button></div> : null}
        {piercerTemporarySchedules.upcoming.length ? <div className="studio-temporary-list"><p>Upcoming temporary schedules</p>{piercerTemporarySchedules.upcoming.map((schedule) => <div className="studio-temporary-row" key={schedule.id}><div><strong>{formatStudioDate(schedule.starts_on)} – {formatStudioDate(schedule.ends_on)}</strong><small>Recurring schedule resumes {formatStudioDate(addCalendarDays(schedule.ends_on, 1), false)}.</small></div><button className="studio-row-edit" type="button" onClick={() => setEditor({ mode: 'configure-piercer-schedule', schedule })}>Edit temporary schedule</button></div>)}</div> : null}
        <div className="studio-recurring-label"><span className="studio-source-badge recurring">Recurring</span><span>Individual edits below only change the recurring weekday.</span><button className="studio-row-edit" type="button" onClick={() => setEditor({ mode: 'configure-piercer-schedule' })}>Edit recurring schedule</button></div>
        <div>{STUDIO_DAYS.map((day) => { const row = configuration.availability.find((item) => item.piercer_profile_id === availabilityProfile.id && item.weekday === day.value); return <div className="studio-availability-row" key={day.value}><strong>{day.short}</strong><span>{row ? row.mode === 'studio' ? 'Same as Studio Hours' : `${formatStudioTime(row.starts_at)} — ${formatStudioTime(row.ends_at)}` : 'Not available'}</span><button className="studio-row-edit" type="button" aria-label={`Edit ${day.label} availability`} onClick={() => setEditor({ mode: 'availability', profile: availabilityProfile, weekday: day.value })}>Edit recurring</button></div> })}</div></> : <p className="studio-empty">Add a piercer profile before configuring availability.</p>}
    </section>
    <section className="studio-panel"><header className="studio-panel-head"><div><h3>Closures &amp; Exceptions</h3><p>Override normal hours for maintenance, private events, holidays, or reduced hours.</p></div><button className="catalog-button primary" type="button" onClick={() => setEditor({ mode: 'exception' })}>+ Add</button></header><div>{configuration.exceptions.length ? configuration.exceptions.map((item) => <div className="studio-exception-row" key={item.id}><strong>{new Intl.DateTimeFormat('en-PH', { month: 'short', day: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${item.exception_date}T00:00:00Z`))}</strong><span>{item.exception_type === 'closed' ? 'Closed all day' : `${formatStudioTime(item.opens_at)} — ${formatStudioTime(item.closes_at)}`}</span><span><strong>{item.reason}</strong><small>{item.exception_type === 'closed' ? 'Studio-wide closure' : 'Reduced operating hours'}</small></span><button className="studio-row-edit" type="button" onClick={() => setEditor({ mode: 'exception', exception: item })}>Edit</button></div>) : <p className="studio-empty">No closures or exceptions configured.</p>}</div></section>
    {editor?.mode === 'hours' ? <HoursEditor hour={editor.hour} onClose={() => setEditor(null)} /> : null}
    {editor?.mode === 'configure-hours' ? <ConfigureHoursEditor configuration={configuration} schedule={editor.schedule} onClose={() => setEditor(null)} /> : null}
    {editor?.mode === 'piercer' ? <PiercerEditor profile={editor.profile} configuration={configuration} onClose={() => setEditor(null)} /> : null}
    {editor?.mode === 'qualifications' ? <QualificationsEditor profile={editor.profile} configuration={configuration} onClose={() => setEditor(null)} /> : null}
    {editor?.mode === 'availability' ? <AvailabilityEditor profile={editor.profile} weekday={editor.weekday} configuration={configuration} onClose={() => setEditor(null)} /> : null}
    {editor?.mode === 'configure-piercer-schedule' ? <ConfigurePiercerScheduleEditor configuration={configuration} schedule={editor.schedule} onClose={() => setEditor(null)} /> : null}
    {editor?.mode === 'exception' ? <ExceptionEditor exception={editor.exception} onClose={() => setEditor(null)} /> : null}
  </>
}
