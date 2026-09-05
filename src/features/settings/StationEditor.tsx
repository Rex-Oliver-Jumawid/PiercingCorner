import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useSaveStation } from './stationQueries'
import type { Station } from './stationService'

export function StationEditor({ station, onClose }: { station?: Station; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [name, setName] = useState(station?.name ?? '')
  const [active, setActive] = useState(station?.active ?? true)
  const [validation, setValidation] = useState<string | null>(null)
  const save = useSaveStation(onClose)
  useEffect(() => { const current = dialog.current; current?.showModal(); return () => current?.close() }, [])
  function submit(event: FormEvent) {
    event.preventDefault(); const trimmed = name.trim(); setValidation(trimmed ? null : 'Enter a station name.')
    if (trimmed) save.mutate({ id: station?.id, name: trimmed, active })
  }
  return <dialog ref={dialog} className="settings-dialog" aria-label={station ? 'Edit station' : 'Add station'} onCancel={(event) => { event.preventDefault(); if (!save.isPending) onClose() }}>
    <header><div><p>SETTINGS</p><h2>{station ? 'Edit station' : 'Add station'}</h2><small>Stations are selectable for service transactions.</small></div><button type="button" aria-label="Close station editor" disabled={save.isPending} onClick={onClose}>×</button></header>
    <form onSubmit={submit}><fieldset disabled={save.isPending}><label><span>Station name</span><input autoFocus aria-label="Station name" value={name} onChange={(event) => setName(event.target.value)} /></label><label><span>Status</span><select aria-label="Status" value={active ? 'active' : 'inactive'} onChange={(event) => setActive(event.target.value === 'active')}><option value="active">Active</option><option value="inactive">Inactive</option></select></label></fieldset>{validation || save.isError ? <p role="alert" className="settings-error">{validation || save.error?.message}</p> : null}<footer><button type="button" disabled={save.isPending} onClick={onClose}>Cancel</button><button type="submit" className="primary" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save changes'}</button></footer></form>
  </dialog>
}

