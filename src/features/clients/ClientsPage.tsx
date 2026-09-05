import { useEffect, useState } from 'react'
import { Plus, Search, UsersRound } from 'lucide-react'
import { useAuth } from '../auth/useAuth'
import { useClients } from './clientQueries'
import { dateTime } from './clientModel'
import { ClientDialog, ClientError, Pagination } from './ClientDialog'
import { ClientDetails } from './ClientDetails'
import { ClientForm } from './ClientForm'
import {
  clientTablePanel,
  dashButton,
  dashField,
  emptyState,
  featureView,
} from '../../components/ui/dashboard-styles'
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
    <section className={`clients-page ${featureView}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 max-[640px]:flex-col max-[640px]:items-stretch">
        <label className={`${dashField} min-w-[260px] flex-1`}>
          <span className="sr-only">Search clients</span>
          <span className="relative block">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#84685e]" />
            <input
              className="!pl-9"
              type="search"
              value={search}
              placeholder="Name, email, or phone"
              onChange={(event) => setSearch(event.target.value)}
            />
          </span>
        </label>
        <button
          className={`${dashButton({ variant: 'primary' })} flex items-center gap-1.5`}
          type="button"
          onClick={() => setAdding(true)}
        >
          <Plus className="size-4" />
          <span>Add client</span>
        </button>
      </div>

      {query.isPending ? <p role="status" className="text-xs text-studio-muted">Loading clients…</p> : null}
      {query.isError ? (
        <ClientError
          message={query.error.message}
          retry={() => void query.refetch()}
        />
      ) : null}

      {query.data ? (
        <>
          {query.data.rows.length ? (
            <div className={clientTablePanel}>
              <table aria-label="Studio clients">
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
                      className="client-record cursor-pointer hover:bg-[#fff1cf] focus:bg-[#f7dfb3] focus:outline-2 focus:-outline-offset-2 focus:outline-[#d66335]"
                      role="button"
                      tabIndex={0}
                      aria-label={`Open ${client.full_name} details`}
                      onClick={() => select(client.id)}
                      onKeyDown={(event) => selectFromRow(event, client.id)}
                    >
                      <td>
                        <strong className="client-link block text-[#3b2923]">{client.full_name}</strong>
                        <small className="text-[8px] text-[#84685e]">
                          Client since {dateTime(client.created_at)}
                        </small>
                      </td>
                      <td className="text-[10px] text-[#695249]">{client.email || '—'}</td>
                      <td className="text-[10px] text-[#695249]">{client.phone || '—'}</td>
                      <td>
                        <span className="inline-grid min-h-6 min-w-6 place-items-center rounded-[50%_43%_54%_45%] border border-[#7d5b4d] bg-[#f8d7a5] px-1 text-[10px] font-black text-[#50362e]">
                          {client.transaction_count}
                        </span>
                      </td>
                      <td className="text-[10px] text-[#695249]">
                        {client.last_activity
                          ? dateTime(client.last_activity)
                          : 'No transactions'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination
                page={filter.page}
                count={query.data.count}
                onChange={(page) => setFilter({ ...filter, page })}
                disabled={query.isFetching}
              />
            </div>
          ) : (
            <div className={emptyState}>
              <span><UsersRound /></span>
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
              {!filter.search && (
                <button
                  type="button"
                  className={`${dashButton({ variant: 'primary' })} mt-2`}
                  onClick={() => setAdding(true)}
                >
                  Add client
                </button>
              )}
            </div>
          )}
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