import { useState } from 'react'
import { ClientDialog, ClientError, Pagination } from './ClientDialog'
import { ClientForm } from './ClientForm'
import { useClient, useHistory, useTransaction } from './clientQueries'
import { cents, dateTime, money } from './clientModel'

function TransactionDetails({
  clientId,
  transactionId,
  onClose,
}: {
  clientId: string
  transactionId: string
  onClose: () => void
}) {
  const query = useTransaction(clientId, transactionId)
  const transaction = query.data
  const items = transaction?.transaction_items ?? []
  const total = items.reduce(
    (sum, item) =>
      sum + cents(item.unit_price_snapshot) * BigInt(item.quantity),
    0n,
  )
  return (
    <ClientDialog
      title={
        transaction?.reference_code ?? transaction?.id ?? 'Transaction details'
      }
      ariaLabel="Transaction details"
      eyebrow="TRANSACTION DETAILS"
      subtitle={
        transaction
          ? `${dateTime(transaction.created_at, true)} · Manila time`
          : undefined
      }
      onClose={onClose}
    >
      {query.isPending ? <p role="status">Loading transaction…</p> : null}
      {query.isError ? (
        <ClientError
          message={query.error.message}
          retry={() => void query.refetch()}
        />
      ) : null}
      {query.isSuccess && !transaction ? (
        <p>Transaction not found or no longer available.</p>
      ) : null}
      {transaction ? (
        <>
          <div className="client-transaction-summary">
            <span>Completion status</span>
            <span className={`client-status ${transaction.status}`}>
              {transaction.status}
            </span>
          </div>
          <h3>Items</h3>
          {items.length ? (
            <ul className="client-item-list">
              {items.map((item) => (
                <li key={item.id}>
                  <div>
                    <strong>{item.item_name_snapshot}</strong>
                    <p>
                      {item.item_type} · {item.quantity} ×{' '}
                      {money(cents(item.unit_price_snapshot))}
                    </p>
                  </div>
                  <strong>
                    {money(
                      cents(item.unit_price_snapshot) * BigInt(item.quantity),
                    )}
                  </strong>
                </li>
              ))}
            </ul>
          ) : (
            <p>No items recorded.</p>
          )}
          <p className="client-total">
            Total <strong>{money(total)}</strong>
          </p>
          <h3>Recorded payments</h3>
          {transaction.payments.length ? (
            <ul className="client-item-list">
              {[...transaction.payments]
                .sort(
                  (a, b) =>
                    a.paid_at.localeCompare(b.paid_at) ||
                    a.id.localeCompare(b.id),
                )
                .map((payment) => (
                  <li key={payment.id}>
                    <div>
                      <strong>{payment.payment_method}</strong>
                      <p>{dateTime(payment.paid_at, true)}</p>
                      {payment.reference_number ? (
                        <p>{payment.reference_number}</p>
                      ) : null}
                    </div>
                    <strong>{money(cents(payment.amount))}</strong>
                  </li>
                ))}
            </ul>
          ) : (
            <p>No payments recorded.</p>
          )}
        </>
      ) : null}
    </ClientDialog>
  )
}

function ClientHistory({ clientId }: { clientId: string }) {
  const [page, setPage] = useState(0)
  const [transactionId, setTransactionId] = useState<string | null>(null)
  const history = useHistory(clientId, page)
  return (
    <section>
      <div className="client-section-heading">
        <h3>Transaction history</h3>
        <span>Manila time</span>
      </div>
      {history.isPending ? <p role="status">Loading history…</p> : null}
      {history.isError ? (
        <ClientError
          message={history.error.message}
          retry={() => void history.refetch()}
        />
      ) : null}
      {history.data ? (
        <>
          {history.data.rows.length ? (
            <div className="client-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Timestamp / Reference</th>
                    <th>Items</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {history.data.rows.map((transaction) => (
                    <tr key={transaction.id}>
                      <td>
                        <button
                          type="button"
                          className="client-link"
                          onClick={() => setTransactionId(transaction.id)}
                        >
                          {transaction.reference_code ?? transaction.id}
                        </button>
                        <small>{dateTime(transaction.created_at, true)}</small>
                      </td>
                      <td>
                        {transaction.transaction_items
                          .map(
                            (item) =>
                              `${item.item_name_snapshot} (${item.item_type})`,
                          )
                          .join(', ') || 'No items recorded'}
                      </td>
                      <td>
                        <span className={`client-status ${transaction.status}`}>
                          {transaction.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>No transactions found.</p>
          )}
          <Pagination
            page={page}
            count={history.data.count}
            onChange={setPage}
            disabled={history.isFetching}
          />
        </>
      ) : null}
      {transactionId ? (
        <TransactionDetails
          clientId={clientId}
          transactionId={transactionId}
          onClose={() => setTransactionId(null)}
        />
      ) : null}
    </section>
  )
}

export function ClientDetails({
  id,
  onClose,
  onSelect,
}: {
  id: string
  onClose: () => void
  onSelect: (id: string) => void
}) {
  const query = useClient(id)
  const [editing, setEditing] = useState(false)
  const [saved, setSaved] = useState(false)
  return (
    <ClientDialog
      title={query.data?.full_name ?? 'Client details'}
      ariaLabel="Client details"
      eyebrow="CLIENT DETAILS"
      subtitle={
        query.data
          ? `Client since ${dateTime(query.data.created_at)}`
          : undefined
      }
      drawer
      action={
        query.data && !editing ? (
          <button
            className="client-button soft"
            type="button"
            aria-label="Edit client"
            onClick={() => {
              setEditing(true)
              setSaved(false)
            }}
          >
            ✎ Edit client
          </button>
        ) : null
      }
      onClose={onClose}
    >
      {query.isPending ? <p role="status">Loading client…</p> : null}
      {query.isError ? (
        <ClientError
          message={query.error.message}
          retry={() => void query.refetch()}
        />
      ) : null}
      {query.isSuccess && !query.data ? (
        <p>Client not found or no longer available.</p>
      ) : null}
      {query.data ? (
        <>
          {saved ? <p role="status">Client details saved.</p> : null}
          {editing ? (
            <ClientForm
              client={query.data}
              onSaved={() => {
                setEditing(false)
                setSaved(true)
              }}
              onUseExisting={onSelect}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <>
              <dl className="client-contact">
                <div>
                  <dt>Email</dt>
                  <dd>{query.data.email || 'Not provided'}</dd>
                </div>
                <div>
                  <dt>Contact number</dt>
                  <dd>{query.data.phone || 'Not provided'}</dd>
                </div>
              </dl>
            </>
          )}
          <ClientHistory clientId={id} />
        </>
      ) : null}
    </ClientDialog>
  )
}
