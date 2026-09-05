import { useState } from 'react'
import { dashButton, featureView, panel, panelHead } from '../../components/ui/dashboard-styles'
import { useAuth } from '../auth/useAuth'
import { StationEditor } from './StationEditor'
import { useStations } from './stationQueries'
import type { Station } from './stationService'
import './settings.css'

export function SettingsPage() {
  const { account, status } = useAuth()
  if (!account || account.role !== 'owner' || status !== 'authenticated') return null
  return <SettingsWorkspace key={`${account.id}:${account.role}`} />
}

function SettingsWorkspace() {
  const stations = useStations()
  const [editor, setEditor] = useState<Station | 'new' | null>(null)
  return <section className={featureView}><section className={`${panel} settings-stations`}><header className={panelHead}><div><h2>Stations</h2><p>Physical work areas available to service transactions and piercer defaults.</p></div><button type="button" className={dashButton({ variant: 'primary' })} onClick={() => setEditor('new')}>+ Add station</button></header>
    {stations.isPending ? <p role="status" className="p-4 text-xs">Loading stations…</p> : null}
    {stations.isError ? <p role="alert" className="p-4 text-xs text-red-800">{stations.error.message}</p> : null}
    {stations.data?.map((station) => <div className="settings-station-row" key={station.id}><span><strong>{station.name}</strong><small>{station.active ? 'Active station' : 'Inactive station'}</small></span><span className={`settings-status ${station.active ? 'active' : 'inactive'}`}>{station.active ? 'Active' : 'Inactive'}</span><button type="button" onClick={() => setEditor(station)}>Edit</button></div>)}
    {stations.data && !stations.data.length ? <p className="p-4 text-xs">No stations configured.</p> : null}
  </section>{editor ? <StationEditor station={editor === 'new' ? undefined : editor} onClose={() => setEditor(null)} /> : null}</section>
}
