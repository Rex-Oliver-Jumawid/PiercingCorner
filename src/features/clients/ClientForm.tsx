import { useContext, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { PAGE_SIZE, validateClient } from './clientModel'
import type { Client, ClientInput } from './clientModel'
import { useDuplicates, useSaveClient } from './clientQueries'
import { ClientError, Pagination } from './ClientDialog'
import { ClientDialogBusyContext } from './clientDialogContext'

export function ClientForm({
  client,
  onSaved,
  onUseExisting,
  onCancel,
}: {
  client?: Client
  onSaved: (client: Client) => void
  onUseExisting: (id: string) => void
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
  const [candidate, setCandidate] = useState<ClientInput | null>(null)
  const [page, setPage] = useState(0)
  const matches = useDuplicates(candidate, client?.id, page)
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
    setPage(0)
    setCandidate(validated.value)
  }
  return (
    <form onSubmit={submit} noValidate className="client-form">
      <fieldset disabled={save.isPending || candidate !== null}>
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
      {candidate ? (
        <section
          aria-label="Duplicate check"
          className="client-duplicates"
          aria-live="polite"
        >
          {matches.isPending ? (
            <p role="status">Checking for matching clients…</p>
          ) : null}
          {matches.isError ? (
            <ClientError
              message="Could not check for matching clients. Retry, or save without checking."
              retry={() => void matches.refetch()}
            />
          ) : null}
          {matches.data && !matches.isError ? (
            <>
              <h3>
                {matches.data.count
                  ? 'Possible matching clients'
                  : 'Ready to save'}
              </h3>
              <p>
                {matches.data.count
                  ? 'Use an existing record, or intentionally keep this client separate.'
                  : 'No matching clients found. Confirm to save this record.'}
              </p>
              <ul>
                {matches.data.rows.map((match) => (
                  <li key={match.id}>
                    <div>
                      <strong>{match.full_name}</strong>
                      <p>
                        {match.email || 'No email'} ·{' '}
                        {match.phone || 'No phone'}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="client-button"
                      aria-label={`Use existing client ${match.full_name}`}
                      disabled={save.isPending}
                      onClick={() => onUseExisting(match.id)}
                    >
                      Use existing client
                    </button>
                  </li>
                ))}
              </ul>
              {matches.data.count > PAGE_SIZE ? (
                <Pagination
                  page={page}
                  count={matches.data.count}
                  onChange={setPage}
                  disabled={save.isPending || matches.isFetching}
                />
              ) : null}
            </>
          ) : null}
          <div className="client-actions">
            <button
              type="button"
              className="client-button"
              disabled={save.isPending}
              onClick={() => {
                setCandidate(null)
                save.reset()
              }}
            >
              Back to editing
            </button>
            <button
              type="button"
              className="client-button primary"
              disabled={save.isPending || matches.isFetching}
              onClick={() => save.mutate({ input: candidate, id: client?.id })}
            >
              {save.isPending
                ? 'Saving…'
                : matches.isError
                  ? 'Save without checking'
                  : matches.data?.count
                    ? client
                      ? 'Save anyway'
                      : 'Create separate client'
                    : client
                      ? 'Save changes'
                      : 'Create client'}
            </button>
          </div>
        </section>
      ) : null}
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
        {!candidate ? (
          <button className="client-button primary" type="submit">
            {client ? 'Review changes' : 'Review client'}
          </button>
        ) : null}
      </div>
    </form>
  )
}
