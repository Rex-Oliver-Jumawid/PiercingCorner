import { useState } from 'react'
import { useAuth } from '../auth/useAuth'
import { CatalogCard } from './CatalogCard'
import { CatalogEditor } from './CatalogEditor'
import type { CatalogEntry, CatalogKind } from './catalogModel'
import { featureView, panel, panelHead } from '../../components/ui/dashboard-styles'
import './studio.css'

interface EditorState {
  kind: CatalogKind
  entry?: CatalogEntry
}

function StudioWorkspace() {
  const [editor, setEditor] = useState<EditorState | null>(null)

  return (
    <section className={featureView}>
      <div className="flex items-center justify-between gap-3">
        <span className="studio-owner-pill">? Owner only</span>
      </div>
      <section className={panel} aria-labelledby="catalog-title">
        <header className={panelHead}>
          <div>
            <h3 id="catalog-title">Services &amp; Products</h3>
            <p>Manage pricing and availability without changing historical transaction snapshots.</p>
          </div>
        </header>
        <div className="catalog-grid">
          <CatalogCard kind="service" onEdit={(kind, entry) => setEditor({ kind, entry })} />
          <CatalogCard kind="product" onEdit={(kind, entry) => setEditor({ kind, entry })} />
        </div>
      </section>
      {editor ? (
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