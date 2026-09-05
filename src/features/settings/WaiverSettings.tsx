import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { dashButton, dashField } from '../../components/ui/dashboard-styles'
import { useCreateWaiverTemplate } from './settingsQueries'
import type { WaiverTemplate } from './settingsService'

export function WaiverSettings({ template }: { template: WaiverTemplate }) {
  const [dialog, setDialog] = useState<'preview' | 'edit' | null>(null)
  return <section className="settings-panel" aria-labelledby="waiver-settings-title">
    <header className="settings-panel-head"><div><h3 id="waiver-settings-title">Waiver &amp; Consent</h3><p>Configure the consent shown before a service transaction enters Pending.</p></div><div className="settings-actions"><button className={dashButton({ variant: 'secondary' })} type="button" onClick={() => setDialog('preview')}>Preview</button><button className={dashButton({ variant: 'primary' })} type="button" onClick={() => setDialog('edit')}>Edit template</button></div></header>
    <div className="settings-panel-body waiver-settings-layout">
      <div className="waiver-meta">
        <div className="waiver-meta-card"><small>Current template</small><strong>Version {template.version}</strong></div>
        <div className="waiver-meta-card"><small>Applies to</small><strong>Service transactions only</strong></div>
        <div className="waiver-meta-card"><small>Signed record</small><strong>Immutable PDF per transaction</strong></div>
        <p className="settings-note">New wording applies only to future unsigned transactions. Existing signed waivers are never replaced.</p>
      </div>
      <div className="waiver-template-preview">{paragraphs(template.body)}</div>
    </div>
    {dialog ? <WaiverDialog mode={dialog} template={template} onClose={() => setDialog(null)} /> : null}
  </section>
}

function paragraphs(body: string) {
  return body.split(/\n\s*\n/).map((paragraph, index) => <p key={index}>{paragraph}</p>)
}

function WaiverDialog({ mode, template, onClose }: { mode: 'preview' | 'edit'; template: WaiverTemplate; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const [body, setBody] = useState(template.body)
  const [validation, setValidation] = useState<string | null>(null)
  const save = useCreateWaiverTemplate(onClose)
  useEffect(() => { const current = ref.current; current?.showModal(); return () => current?.close() }, [])

  function submit(event: FormEvent) {
    event.preventDefault()
    const trimmed = body.trim()
    setValidation(trimmed ? null : 'Waiver text cannot be empty.')
    if (trimmed) save.mutate(trimmed)
  }

  return <dialog ref={ref} className="settings-dialog settings-waiver-dialog" aria-label={mode === 'preview' ? 'Waiver preview' : 'Edit waiver template'} onCancel={(event) => { event.preventDefault(); if (!save.isPending) onClose() }}>
    <header><div><p>WAIVER &amp; CONSENT</p><h2>{mode === 'preview' ? 'Waiver preview' : 'Edit waiver template'}</h2><small>{mode === 'preview' ? `Current template · Version ${template.version}` : 'Changes apply only to future unsigned service transactions.'}</small></div><button type="button" aria-label="Close waiver dialog" disabled={save.isPending} onClick={onClose}>×</button></header>
    {mode === 'preview' ? <div className="settings-dialog-content"><div className="waiver-meta-card"><small>Client full name</small><strong>Shown here during signing</strong></div><div className="waiver-template-preview preview">{paragraphs(template.body)}</div><div className="settings-signature-placeholder"><strong>Customer signature</strong><span>Signature area</span></div></div> : <form onSubmit={submit}><fieldset><label className={dashField}><span>Waiver text</span><textarea autoFocus value={body} onChange={(event) => setBody(event.target.value)} /></label><p className="settings-note"><strong>Immutable record rule:</strong> signed waiver PDFs already associated with transactions remain unchanged.</p></fieldset>{validation || save.isError ? <p role="alert" className="settings-error">{validation || save.error?.message}</p> : null}<footer><button type="button" disabled={save.isPending} onClick={onClose}>Cancel</button><button type="submit" className="primary" disabled={save.isPending}>{save.isPending ? 'Creating version…' : 'Create new version'}</button></footer></form>}
    {mode === 'preview' ? <footer><button type="button" className="primary" onClick={onClose}>Close preview</button></footer> : null}
  </dialog>
}
