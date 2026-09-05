import { useState } from 'react'
import { dashButton, featureView } from '../../components/ui/dashboard-styles'
import { useAuth } from '../auth/useAuth'
import { BusinessProfileForm } from './BusinessProfileForm'
import { StationEditor } from './StationEditor'
import { useSettingsOverview } from './settingsQueries'
import { useStations } from './stationQueries'
import type { Station } from './stationService'
import { WaiverSettings } from './WaiverSettings'
import './settings.css'

export function SettingsPage() {
  const { account, status } = useAuth()
  if (!account || account.role !== 'owner' || status !== 'authenticated') return null
  return <SettingsWorkspace key={`${account.id}:${account.role}`} />
}

function SettingsWorkspace() {
  const overview = useSettingsOverview()
  const stations = useStations()
  const [stationEditor, setStationEditor] = useState<Station | 'new' | null>(null)

  return <section className={`settings-page ${featureView}`}>
    <div className="settings-intro"><div><p className="settings-eyebrow">OWNER SETTINGS</p><h2>System configuration</h2><p>Manage business details, waiver rules, access visibility, and physical stations. Studio scheduling and catalogs remain under Studio.</p></div><span className="settings-owner-pill">◆ Owner only</span></div>
    {overview.isPending ? <p role="status" className="settings-state">Loading Settings…</p> : null}
    {overview.isError ? <p role="alert" className="settings-state error">{overview.error.message}</p> : null}
    {overview.data ? <div className="settings-stack">
      <BusinessProfileForm profile={overview.data.businessProfile} />
      <WaiverSettings template={overview.data.waiverTemplate} />
      <div className="settings-two">
        <section className="settings-subpanel" aria-labelledby="access-settings-title"><header className="settings-subpanel-head"><div><h3 id="access-settings-title">Staff Accounts &amp; Access</h3><p>Authentication roles are exactly Owner or Staff.</p></div></header><div>{overview.data.accounts.map((account) => <div className="access-row" key={account.id}><span className="access-avatar">{initials(account.display_name)}</span><span className="access-copy"><strong>{account.display_name}</strong><small>{account.role === 'owner' ? 'Owner' : 'Staff'} account · {account.status === 'active' ? 'Active' : 'Inactive'}</small></span><span className={`role-pill role-${account.role}`}>{account.role}</span></div>)}</div><p className="settings-note settings-account-note">Account changes require the secure administration boundary. Piercer profiles are managed separately in Studio.</p></section>
        <section className="settings-subpanel" aria-labelledby="station-settings-title"><header className="settings-subpanel-head"><div><h3 id="station-settings-title">Stations</h3><p>Physical work areas available to service transactions.</p></div><button className={dashButton({ variant: 'secondary' })} type="button" onClick={() => setStationEditor('new')}>+ Add station</button></header>
          {stations.isPending ? <p role="status" className="settings-list-state">Loading stations…</p> : null}
          {stations.isError ? <p role="alert" className="settings-list-state error">{stations.error.message}</p> : null}
          {stations.data?.map((station) => <div className="station-row" key={station.id}><span><strong>{station.name}</strong><small>{station.active ? 'Active station' : 'Inactive station'}</small></span><span className={`settings-active ${station.active ? '' : 'inactive'}`}>{station.active ? 'Active' : 'Inactive'}</span><button className="mini-edit" type="button" onClick={() => setStationEditor(station)}>Edit</button></div>)}
          {stations.data && !stations.data.length ? <p className="settings-list-state">No stations configured.</p> : null}
        </section>
      </div>
    </div> : null}
    {stationEditor ? <StationEditor station={stationEditor === 'new' ? undefined : stationEditor} onClose={() => setStationEditor(null)} /> : null}
  </section>
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).map((word) => word[0]).join('').slice(0, 2).toUpperCase()
}
