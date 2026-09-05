import { useState } from 'react'
import { useAuth } from '../auth/useAuth'
import { CatalogCard } from './CatalogCard'
import { CatalogEditor } from './CatalogEditor'
import type { CatalogEntry, CatalogKind } from './catalogModel'
import './studio.css'

interface EditorState {
  kind: CatalogKind
  entry?: CatalogEntry
}

function StudioWorkspace() {
  const [editor, setEditor] = useState<EditorState | null>(null)

  return (
    <section className="studio-page">
      <header className="studio-intro">
        <div>
          <p className="studio-eyebrow">STUDIO CATALOG</p>
          <h1>Studio</h1>
          <p>Manage the services and products used by transactions and sales.</p>
        </div>
        <span className="studio-owner-pill">◆ Owner only</span>
      </header>
      <section className="studio-panel" aria-labelledby="catalog-title">
        <header className="studio-panel-head">
          <div>
            <h2 id="catalog-title">Services &amp; Products</h2>
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
