import { useState } from 'react'
import type { FormEvent } from 'react'
import { dashButton, dashField } from '../../components/ui/dashboard-styles'
import { useSaveBusinessProfile } from './settingsQueries'
import type { BusinessProfile, BusinessProfileInput } from './settingsService'

function fields(profile: BusinessProfile): BusinessProfileInput {
  return {
    studio_name: profile.studio_name,
    location: profile.location,
    address: profile.address,
    email: profile.email,
    phone: profile.phone,
    instagram_url: profile.instagram_url,
  }
}

export function BusinessProfileForm({ profile }: { profile: BusinessProfile }) {
  const [prevProfile, setPrevProfile] = useState(profile)
  const [value, setValue] = useState(() => fields(profile))
  const [validation, setValidation] = useState<string | null>(null)
  const save = useSaveBusinessProfile()

  if (prevProfile !== profile) {
    setPrevProfile(profile)
    setValue(fields(profile))
  }

  function change(name: keyof BusinessProfileInput, next: string) {
    setValue((current) => ({ ...current, [name]: next }))
    save.reset()
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    const error = !value.studio_name.trim() ? 'Enter a studio name.' : !value.location.trim() ? 'Enter a location.' : null
    setValidation(error)
    if (!error) save.mutate(value)
  }

  return <section className="settings-panel" aria-labelledby="business-profile-title">
    <header className="settings-panel-head"><div><h3 id="business-profile-title">Business Profile</h3><p>Identity and contact details used across PiercingCorner.</p></div></header>
    <form onSubmit={submit}>
      <fieldset className="settings-panel-body settings-form-grid" disabled={save.isPending}>
        <label className={dashField}><span>Studio name</span><input value={value.studio_name} onChange={(event) => change('studio_name', event.target.value)} /></label>
        <label className={dashField}><span>Location</span><input value={value.location} onChange={(event) => change('location', event.target.value)} /></label>
        <label className={`${dashField} wide`}><span>Exact address</span><input value={value.address ?? ''} placeholder="Not configured" onChange={(event) => change('address', event.target.value)} /></label>
        <label className={dashField}><span>Studio email</span><input type="email" value={value.email ?? ''} placeholder="studio@example.com" onChange={(event) => change('email', event.target.value)} /></label>
        <label className={dashField}><span>Phone</span><input value={value.phone ?? ''} placeholder="Contact number" onChange={(event) => change('phone', event.target.value)} /></label>
        <label className={`${dashField} wide`}><span>Instagram URL</span><input type="url" value={value.instagram_url ?? ''} placeholder="https://instagram.com/..." onChange={(event) => change('instagram_url', event.target.value)} /></label>
        <label className={dashField}><span>Timezone</span><input className="settings-readonly" value={profile.timezone} readOnly /></label>
        <label className={dashField}><span>Currency</span><input className="settings-readonly" value={`${profile.currency} — Philippine Peso`} readOnly /></label>
        <p className="settings-note wide"><strong>Configuration boundary:</strong> operating hours, catalogs, piercer profiles, qualifications, availability, and closures are configured from Studio.</p>
        {validation || save.isError ? <p role="alert" className="settings-error wide">{validation || save.error?.message}</p> : null}
        {save.isSuccess ? <p role="status" className="settings-success wide">Business profile saved.</p> : null}
      </fieldset>
      <footer className="settings-panel-foot"><button className={dashButton({ variant: 'primary' })} disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save business profile'}</button></footer>
    </form>
  </section>
}
