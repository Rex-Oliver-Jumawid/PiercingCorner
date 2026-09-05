import { useContext, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { validateClient } from './clientModel'
import type { Client, ClientInput } from './clientModel'
import { useSaveClient } from './clientQueries'
import { ClientError } from './ClientDialog'
import { ClientDialogBusyContext } from './clientDialogContext'

export function ClientForm({
  client,
  onSaved,
  onCancel,
}: {
  client?: Client
  onSaved: (client: Client) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState<ClientInput>(() => ({
    full_name: client?.full_name ?? '',
    email: client?.email ?? '',
    phone: client?.phone ?? '',
  }))
  const [errors, setErrors] = useState<
    Partial<Record<keyof ClientInput, string>>
  >({})
  const save = useSaveClient(onSaved)
  const setDialogBusy = useContext(ClientDialogBusyContext)
  useEffect(() => {
    setDialogBusy(save.isPending)
    return () => setDialogBusy(false)
  }, [save.isPending, setDialogBusy])
  function submit(event: FormEvent) {
    event.preventDefault()
    if (save.isPending) return
    const validated = validateClient(draft)
    setErrors(validated.errors)
    if (Object.keys(validated.errors).length) return
    save.reset()
    save.mutate({ input: validated.value, id: client?.id })
  }
  return (
    <form onSubmit={submit} noValidate className="client-form">
      <fieldset disabled={save.isPending}>
        {(['full_name', 'email', 'phone'] as const).map((field) => (
          <label key={field}>
            <span>
              {field === 'full_name'
                ? 'Full name'
                : field === 'email'
                  ? 'Email (optional)'
                  : 'Phone (optional)'}
            </span>
            <input
              name={field}
              type={
                field === 'email' ? 'email' : field === 'phone' ? 'tel' : 'text'
              }
              autoComplete={
                field === 'full_name'
                  ? 'name'
                  : field === 'phone'
                    ? 'tel'
                    : 'email'
              }
              required={field === 'full_name'}
              value={draft[field] ?? ''}
              aria-invalid={!!errors[field]}
              aria-describedby={
                errors[field] ? `client-${field}-error` : undefined
              }
              onChange={(event) =>
                setDraft({ ...draft, [field]: event.target.value })
              }
            />
            {errors[field] ? (
              <span className="client-field-error" id={`client-${field}-error`}>
                {errors[field]}
              </span>
            ) : null}
          </label>
        ))}
      </fieldset>
      {save.isError ? <ClientError message={save.error.message} /> : null}
      <div className="client-actions">
        <button
          className="client-button"
          type="button"
          disabled={save.isPending}
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          className="client-button primary"
          type="submit"
          disabled={save.isPending}
        >
          {save.isPending
            ? client
              ? 'Saving…'
              : 'Adding…'
            : client
              ? 'Save changes'
              : 'Add client'}
        </button>
      </div>
    </form>
  )
}
