# Phase 4 — Dashboard transaction workflow

**Status: complete.**

Phase 4 implements the operational Dashboard and the first committed Record Sale
path from the approved `.model/piercingsys-finalmodelfornow.html`. Both Owner and
Staff use the same Dashboard capability under the canonical route-access policy.

## Dashboard operations

- The Dashboard lists the current Manila calendar day's transactions, newest
  first, with reference, client, item summary, recorder, amount, and status.
- Literal search covers reference, client, item snapshot, recorder, and status.
- Selecting a row opens transaction details. Open records can move between
  `pending` and `ongoing`, be cancelled, or enter finalization when eligible.
- Completed and cancelled transactions remain historical and read-only.

## Record Sale state machine

- The modal flow is held in a feature-scoped Zustand store and is deliberately
  not persisted. Closing a non-empty draft requires confirmation and discards it.
- Staff can choose an existing client or enter a walk-in client. Walk-in details
  use the Phase 2 duplicate check before checkout.
- Active services and products come from the shared catalog representation.
- A product-only sale proceeds to a single full payment and is committed through
  one atomic database function.
- Any new sale containing a service stops at the Phase 5 consent-and-waiver
  handoff. No client, transaction, item, or payment is written at that boundary.

Split/partial payments, refunds, appointments, piercer assignments, and stations
remain outside Phase 4.

## Atomic database boundaries

`record_product_sale(...)` validates the active application account and selected
active products, resolves or creates the client, snapshots server-owned catalog
names and prices, derives the total, records one full payment, and completes the
transaction atomically.

`finalize_transaction(...)` locks an existing open transaction, preserves
historical snapshots, validates newly selected active catalog rows, requires an
existing signed waiver whenever a service remains selected, derives the total,
records one full payment, and completes the transaction atomically. A failure at
any point rolls back the entire operation.

`search_dashboard_transactions(...)` exposes only today's operational projection
to an active Owner or Staff account. All three security-definer functions pin
their search path, qualify database objects, and are executable only by the
authenticated role. RLS continues to protect ordinary table access.

Readable references use `TXN-YYMMDD-NNNNNN`. The sequence is server-controlled;
the date is evaluated in `Asia/Manila`.

## Deferred Phase 5 boundary

Phase 4 can finalize a service transaction only when a signed waiver already
exists. Capturing a signature, creating the initial service transaction, storing
private signature/PDF artifacts, and continuing the in-session service draft are
Phase 5 work. No `awaiting_waiver` status or browser-only fake transaction is
introduced.
