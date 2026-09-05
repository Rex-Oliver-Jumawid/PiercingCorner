import { useEffect, useState } from 'react'
import { useAuth } from '../auth/useAuth'
import { useClients } from './clientQueries'
import { dateTime } from './clientModel'
import { ClientDialog, ClientError, Pagination } from './ClientDialog'
import { ClientDetails } from './ClientDetails'
import { ClientForm } from './ClientForm'
import './clients.css'

function ClientsWorkspace() {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState({ search: '', page: 0 })
  const [selected, setSelected] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const query = useClients(filter.search, filter.page)
  useEffect(() => {
    const timeout = setTimeout(
      () => setFilter({ search: search.trim(), page: 0 }),
      300,
    )
    return () => clearTimeout(timeout)
  }, [search])
  function select(id: string) {
    setAdding(false)
    setSelected(id)
  }
  function selectFromRow(event: React.KeyboardEvent<HTMLTableRowElement>, id: string) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      select(id)
    }
  }
  return (
    <section className="clients-page">
      <header>
        <p className="client-eyebrow">THE STUDIO ADDRESS BOOK</p>
        <h1>Clients</h1>
        <p>Find a familiar face, or welcome someone new.</p>
      </header>
      <div className="clients-toolbar">
        <label>
          <span>Search clients</span>
          <span className="client-search-wrap">
            <span aria-hidden="true" className="client-search-icon">
              ⌕
            </span>
            <input
              type="search"
              value={search}
              placeholder="Name, email, or phone"
              onChange={(event) => setSearch(event.target.value)}
            />
          </span>
        </label>
        <button
          className="client-button primary"
          type="button"
          onClick={() => setAdding(true)}
        >
          + Add client
        </button>
      </div>
      {query.isPending ? <p role="status">Loading clients…</p> : null}
      {query.isError ? (
        <ClientError
          message={query.error.message}
          retry={() => void query.refetch()}
        />
      ) : null}
      {query.data ? (
        <>
          {query.data.rows.length ? (
            <div className="client-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Email</th>
                    <th>Contact number</th>
                    <th>Transactions</th>
                    <th>Last activity</th>
                  </tr>
                </thead>
                <tbody>
                  {query.data.rows.map((client) => (
                    <tr
                      key={client.id}
                      className="client-record"
                      role="button"
                      tabIndex={0}
                      aria-label={`Open ${client.full_name} details`}
                      onClick={() => select(client.id)}
                      onKeyDown={(event) => selectFromRow(event, client.id)}
                    >
                      <td>
                        <strong className="client-link">{client.full_name}</strong>
                        <small>
                          Client since {dateTime(client.created_at)}
                        </small>
                      </td>
                      <td>{client.email || '—'}</td>
                      <td>{client.phone || '—'}</td>
                      <td>
                        <span className="client-count-pill">
                          {client.transaction_count}
                        </span>
                      </td>
                      <td>
                        {client.last_activity
                          ? dateTime(client.last_activity)
                          : 'No transactions'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="client-empty">
              <h2>
                {filter.search
                  ? 'No matching clients'
                  : 'Your client book starts here'}
              </h2>
              <p>
                {filter.search
                  ? 'Try another name, email, or phone number.'
                  : 'Add your first client to keep their details and transaction history together.'}
              </p>
            </div>
          )}
          <Pagination
            page={filter.page}
            count={query.data.count}
            onChange={(page) => setFilter({ ...filter, page })}
            disabled={query.isFetching}
          />
        </>
      ) : null}
      {adding ? (
        <ClientDialog
          title="Add client"
          eyebrow="CLIENT RECORD"
          subtitle="Add the details you have. Only the full name is required."
          onClose={() => setAdding(false)}
        >
          <ClientForm
            onSaved={(client) => select(client.id)}
            onUseExisting={select}
            onCancel={() => setAdding(false)}
          />
        </ClientDialog>
      ) : null}
      {selected ? (
        <ClientDetails
          key={selected}
          id={selected}
          onClose={() => setSelected(null)}
          onSelect={select}
        />
      ) : null}
    </section>
  )
}

export function ClientsPage() {
  const { account, status } = useAuth()
  if (!account || status !== 'authenticated') return null
  return <ClientsWorkspace key={`${account.id}:${account.role}`} />
}
