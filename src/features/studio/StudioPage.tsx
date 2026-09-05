import { useState } from 'react'
import { useAuth } from '../auth/useAuth'
import { CatalogEditor } from './CatalogEditor'
import { featureView } from '../../components/ui/dashboard-styles'
import { StudioConfigurationView } from './StudioConfiguration'
import type { StudioEditor } from './StudioConfiguration'
import { useStudioConfiguration } from './studioQueries'
import './studio.css'

function StudioWorkspace() {
  const [editor, setEditor] = useState<StudioEditor | null>(null)
  const configuration = useStudioConfiguration()

  return (
    <section className={`studio-page ${featureView}`}>
      <div className="studio-intro"><div><p className="studio-eyebrow">HOURS &amp; SCHEDULING</p><h2>Studio</h2><p>Configure Studio Hours, piercer profiles, catalogs, qualifications, availability, and closures.</p></div><span className="studio-owner-pill">Owner only</span></div>
      {configuration.isPending ? <p role="status" className="studio-empty">Loading Studio configuration…</p> : null}
      {configuration.isError ? <p role="alert" className="catalog-error">{configuration.error.message}</p> : null}
      {configuration.data ? <StudioConfigurationView configuration={configuration.data} editor={editor} setEditor={setEditor} /> : null}
      {editor?.mode === 'catalog' ? (
        <CatalogEditor
          kind={editor.kind}
          entry={editor.entry}
          onClose={() => setEditor(null)}
        />
      ) : null}
    </section>
  )
}

export function StudioPage() {
  const { account, status } = useAuth()
  if (!account || account.role !== 'owner' || status !== 'authenticated') return null
  return <StudioWorkspace key={`${account.id}:${account.role}`} />
}
