import { useEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { CatalogCard } from './CatalogCard'
import { useStudioMutation } from './studioQueries'
import * as service from './studioService'
import {
  formatStudioTime,
  normalizeTime,
  STUDIO_DAYS,
  validateTimeRange,
} from './studioModel'
import type {
  PiercerProfile,
  StudioConfiguration,
  StudioException,
  StudioHour,
} from './studioModel'
import type { CatalogEntry, CatalogKind } from './catalogModel'

export type StudioEditor =
  | { mode: 'catalog'; kind: CatalogKind; entry?: CatalogEntry }
  | { mode: 'hours'; hour: StudioHour }
  | { mode: 'piercer'; profile?: PiercerProfile }
  | { mode: 'qualifications'; profile: PiercerProfile }
  | { mode: 'availability'; profile: PiercerProfile; weekday: number }
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

function HoursEditor({ hour, onClose }: { hour: StudioHour; onClose: () => void }) {
  const [open, setOpen] = useState(hour.is_open)
  const [starts, setStarts] = useState(normalizeTime(hour.opens_at) || '10:00')
  const [ends, setEnds] = useState(normalizeTime(hour.closes_at) || '20:00')
  const [validation, setValidation] = useState<string | null>(null)
  const mutation = useStudioMutation(service.saveStudioHour)
  const day = STUDIO_DAYS.find((item) => item.value === hour.weekday)!
  function submit(event: FormEvent) {
    event.preventDefault(); const error = open ? validateTimeRange(starts, ends) : null; setValidation(error)
    if (!error) mutation.mutate({ weekday: hour.weekday, isOpen: open, opensAt: starts, closesAt: ends }, { onSuccess: onClose })
  }
  return <EditorShell title="Edit Studio Hours" subtitle={day.label} busy={mutation.isPending} error={validation || mutation.error?.message} onClose={onClose} onSubmit={submit}>
    <label className="catalog-field catalog-wide"><span>Day status</span><select aria-label="Day status" value={open ? 'open' : 'closed'} onChange={(event) => setOpen(event.target.value === 'open')}><option value="open">Open</option><option value="closed">Closed</option></select></label>
    <label className="catalog-field"><span>Opens</span><input aria-label="Opens" type="time" value={starts} disabled={!open} onChange={(event) => setStarts(event.target.value)} /></label>
    <label className="catalog-field"><span>Closes</span><input aria-label="Closes" type="time" value={ends} disabled={!open} onChange={(event) => setEnds(event.target.value)} /></label>
    <p className="studio-notice catalog-wide">Studio Hours define the operating window. Conflicting piercer schedules must be changed first.</p>
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
    <label className="catalog-field"><span>Default station</span><select aria-label="Default station" value={stationId} onChange={(event) => setStationId(event.target.value)}><option value="">No default station</option>{configuration.stations.filter((station) => station.active || station.id === profile?.default_station_id).map((station) => <option key={station.id} value={station.id} disabled={!station.active}>{station.name}{station.active ? '' : ' (Inactive)'}</option>)}</select></label>
    <label className="catalog-field"><span>Status</span><select aria-label="Status" value={active ? 'active' : 'inactive'} onChange={(event) => setActive(event.target.value === 'active')}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
  </EditorShell>
}

function QualificationsEditor({ profile, configuration, onClose }: { profile: PiercerProfile; configuration: StudioConfiguration; onClose: () => void }) {
  const initial = configuration.qualifications.filter((item) => item.piercer_profile_id === profile.id).map((item) => item.service_id)
  const [selected, setSelected] = useState(initial)
  const mutation = useStudioMutation((ids: string[]) => service.replaceQualifications(profile.id, ids))
  function submit(event: FormEvent) { event.preventDefault(); mutation.mutate(selected, { onSuccess: onClose }) }
  return <EditorShell title="Services Offered" subtitle={profile.display_name} busy={mutation.isPending} error={mutation.error?.message} onClose={onClose} onSubmit={submit}>
    <p className="studio-notice catalog-wide">Choose every service this piercer may be assigned to perform.</p>
    <div className="studio-check-grid catalog-wide">{configuration.services.map((item) => <label className="studio-check-row" key={item.id}><input type="checkbox" checked={selected.includes(item.id)} onChange={() => setSelected((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])} /><span>{item.name}{item.active ? '' : ' (Inactive)'}</span></label>)}</div>
  </EditorShell>
}

function AvailabilityEditor({ profile, weekday, configuration, onClose }: { profile: PiercerProfile; weekday: number; configuration: StudioConfiguration; onClose: () => void }) {
  const existing = configuration.availability.find((item) => item.piercer_profile_id === profile.id && item.weekday === weekday)
  const hours = configuration.hours.find((item) => item.weekday === weekday)
  const [day, setDay] = useState(weekday)
  const [available, setAvailable] = useState(!!existing)
  const [starts, setStarts] = useState(normalizeTime(existing?.starts_at ?? hours?.opens_at) || '10:00')
  const [ends, setEnds] = useState(normalizeTime(existing?.ends_at ?? hours?.closes_at) || '20:00')
  const [validation, setValidation] = useState<string | null>(null)
  const mutation = useStudioMutation(service.saveAvailability)
  function chooseDay(next: number) {
    setDay(next); const saved = configuration.availability.find((item) => item.piercer_profile_id === profile.id && item.weekday === next); const studioHour = configuration.hours.find((item) => item.weekday === next)
    setAvailable(!!saved); setStarts(normalizeTime(saved?.starts_at ?? studioHour?.opens_at) || '10:00'); setEnds(normalizeTime(saved?.ends_at ?? studioHour?.closes_at) || '20:00')
  }
  function submit(event: FormEvent) {
    event.preventDefault(); const hour = configuration.hours.find((item) => item.weekday === day)
    let error = available ? validateTimeRange(starts, ends) : null
    if (available && !hour?.is_open) error = 'This day is closed in Studio Hours.'
    if (available && hour?.is_open && (starts < normalizeTime(hour.opens_at) || ends > normalizeTime(hour.closes_at))) error = 'Availability must stay within the configured Studio Hours.'
    setValidation(error); if (!error) mutation.mutate({ piercerId: profile.id, weekday: day, available, startsAt: starts, endsAt: ends }, { onSuccess: onClose })
  }
  return <EditorShell title="Edit Piercer Availability" subtitle={profile.display_name} busy={mutation.isPending} error={validation || mutation.error?.message} onClose={onClose} onSubmit={submit}>
    <label className="catalog-field catalog-wide"><span>Day</span><select aria-label="Day" value={day} onChange={(event) => chooseDay(Number(event.target.value))}>{STUDIO_DAYS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
    <label className="catalog-field catalog-wide"><span>Availability</span><select aria-label="Availability" value={available ? 'available' : 'unavailable'} onChange={(event) => setAvailable(event.target.value === 'available')}><option value="available">Available</option><option value="unavailable">Not available</option></select></label>
    <label className="catalog-field"><span>Starts</span><input aria-label="Starts" type="time" disabled={!available} value={starts} onChange={(event) => setStarts(event.target.value)} /></label>
    <label className="catalog-field"><span>Ends</span><input aria-label="Ends" type="time" disabled={!available} value={ends} onChange={(event) => setEnds(event.target.value)} /></label>
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
    <label className="catalog-field"><span>Date</span><input aria-label="Date" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
    <label className="catalog-field"><span>Type</span><select aria-label="Type" value={type} onChange={(event) => setType(event.target.value as typeof type)}><option value="closed">Closed all day</option><option value="reduced_hours">Reduced hours</option></select></label>
    <label className="catalog-field"><span>Start time</span><input aria-label="Start time" type="time" disabled={type === 'closed'} value={starts} onChange={(event) => setStarts(event.target.value)} /></label>
    <label className="catalog-field"><span>End time</span><input aria-label="End time" type="time" disabled={type === 'closed'} value={ends} onChange={(event) => setEnds(event.target.value)} /></label>
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
  return <>
    <section className="studio-panel"><header className="studio-panel-head"><div><h3>Studio Hours</h3><p>Standard opening hours used across daily operations and availability.</p></div></header><div>{configuration.hours.map((hour) => { const day = STUDIO_DAYS.find((item) => item.value === hour.weekday)!; return <div className="studio-hours-row" key={hour.weekday}><strong>{day.short}</strong><span className={hour.is_open ? 'studio-open' : 'studio-closed'}>{hour.is_open ? 'OPEN' : 'CLOSED'}</span><span>{hour.is_open ? `${formatStudioTime(hour.opens_at)} — ${formatStudioTime(hour.closes_at)}` : 'Not accepting studio operations'}</span><button className="studio-row-edit" type="button" onClick={() => setEditor({ mode: 'hours', hour })}>Edit</button></div> })}</div></section>
    <section className="studio-panel"><header className="studio-panel-head"><div><h3>Piercer Profiles</h3><p>Manage Studio profiles and the services each piercer is qualified to offer.</p></div><button className="catalog-button primary" type="button" onClick={() => setEditor({ mode: 'piercer' })}>+ Add piercer</button></header>
      {configuration.profiles.length ? <><div className="studio-tabs">{configuration.profiles.map((item) => <button type="button" className={profile?.id === item.id ? 'active' : ''} key={item.id} onClick={() => setSelectedProfileId(item.id)}>{item.display_name}</button>)}</div>{profile ? <div className="studio-profile-layout"><article className="studio-profile-card"><div className="studio-profile-top"><span>{initials(profile.display_name)}</span><div><strong>{profile.display_name}</strong><small>Piercer profile · {profile.active ? 'Active' : 'Inactive'}</small></div><b className={profile.active ? 'studio-open' : 'studio-closed'}>{profile.active ? 'ACTIVE' : 'INACTIVE'}</b></div><div className="studio-profile-meta"><div><span>Default station</span><strong>{station?.name ?? 'Not assigned'}</strong></div><div><span>Weekly coverage</span><strong>{coverage} {coverage === 1 ? 'day' : 'days'}</strong></div></div><button className="studio-row-edit studio-profile-edit" type="button" onClick={() => setEditor({ mode: 'piercer', profile })}>Edit profile</button></article><article className="studio-profile-services"><div className="studio-services-head"><div><h4>Services offered</h4><p>Only selected services can be assigned to this piercer.</p></div><button className="studio-row-edit" type="button" onClick={() => setEditor({ mode: 'qualifications', profile })}>Edit services</button></div><div className="studio-service-chips">{qualifications.length ? qualifications.map((item) => { const qualified = configuration.services.find((serviceItem) => serviceItem.id === item.service_id); return qualified ? <span key={item.service_id}>{qualified.name}{qualified.active ? '' : ' · Inactive'}</span> : null }) : <p>No services assigned.</p>}</div></article></div> : null}</> : <p className="studio-empty">No piercer profiles yet.</p>}
    </section>
    <section className="studio-panel"><header className="studio-panel-head"><div><h3>Services &amp; Products</h3><p>Manage the catalogs used by transactions, qualifications, sales, and reports.</p></div></header><div className="catalog-grid"><CatalogCard kind="service" onEdit={(kind, entry) => setEditor({ mode: 'catalog', kind, entry })} /><CatalogCard kind="product" onEdit={(kind, entry) => setEditor({ mode: 'catalog', kind, entry })} /></div></section>
    <section className="studio-panel"><header className="studio-panel-head"><div><h3>Piercer Availability</h3><p>Recurring weekly availability within the Studio Hours above.</p></div>{availabilityProfile ? <button className="catalog-button primary" type="button" onClick={() => setEditor({ mode: 'availability', profile: availabilityProfile, weekday: 1 })}>+ Add schedule</button> : null}</header>
      {availabilityProfile ? <><div className="studio-tabs">{configuration.profiles.map((item) => <button type="button" className={availabilityProfile.id === item.id ? 'active' : ''} key={item.id} onClick={() => setSelectedAvailabilityId(item.id)}>{item.display_name}</button>)}</div><p className="studio-selected">Selected: <strong>{availabilityProfile.display_name}</strong></p><div>{STUDIO_DAYS.map((day) => { const row = configuration.availability.find((item) => item.piercer_profile_id === availabilityProfile.id && item.weekday === day.value); return <div className="studio-availability-row" key={day.value}><strong>{day.short}</strong><span>{row ? `${formatStudioTime(row.starts_at)} — ${formatStudioTime(row.ends_at)}` : 'Not available'}</span><button className="studio-row-edit" type="button" onClick={() => setEditor({ mode: 'availability', profile: availabilityProfile, weekday: day.value })}>Edit</button></div> })}</div></> : <p className="studio-empty">Add a piercer profile before configuring availability.</p>}
    </section>
    <section className="studio-panel"><header className="studio-panel-head"><div><h3>Closures &amp; Exceptions</h3><p>Override normal hours for maintenance, private events, holidays, or reduced hours.</p></div><button className="catalog-button primary" type="button" onClick={() => setEditor({ mode: 'exception' })}>+ Add</button></header><div>{configuration.exceptions.length ? configuration.exceptions.map((item) => <div className="studio-exception-row" key={item.id}><strong>{new Intl.DateTimeFormat('en-PH', { month: 'short', day: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${item.exception_date}T00:00:00Z`))}</strong><span>{item.exception_type === 'closed' ? 'Closed all day' : `${formatStudioTime(item.opens_at)} — ${formatStudioTime(item.closes_at)}`}</span><span><strong>{item.reason}</strong><small>{item.exception_type === 'closed' ? 'Studio-wide closure' : 'Reduced operating hours'}</small></span><button className="studio-row-edit" type="button" onClick={() => setEditor({ mode: 'exception', exception: item })}>Edit</button></div>) : <p className="studio-empty">No closures or exceptions configured.</p>}</div></section>
    {editor?.mode === 'hours' ? <HoursEditor hour={editor.hour} onClose={() => setEditor(null)} /> : null}
    {editor?.mode === 'piercer' ? <PiercerEditor profile={editor.profile} configuration={configuration} onClose={() => setEditor(null)} /> : null}
    {editor?.mode === 'qualifications' ? <QualificationsEditor profile={editor.profile} configuration={configuration} onClose={() => setEditor(null)} /> : null}
    {editor?.mode === 'availability' ? <AvailabilityEditor profile={editor.profile} weekday={editor.weekday} configuration={configuration} onClose={() => setEditor(null)} /> : null}
    {editor?.mode === 'exception' ? <ExceptionEditor exception={editor.exception} onClose={() => setEditor(null)} /> : null}
  </>
}
