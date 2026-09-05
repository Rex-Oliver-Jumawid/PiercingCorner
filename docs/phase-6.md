# Phase 6 — Sales, Owner overview, and reports

**Status: complete.**

Phase 6 turns completed Dashboard transactions into Owner-only financial and
operational views. The operational Dashboard remains available to Owner and
Staff; `/overview`, `/sales`, and `/reports` remain Owner-only through the
canonical route policy and checked database functions.

## Historical sale facts

Transactions now retain an immutable client-name snapshot and `completed_at`.
PostgreSQL stamps the first legitimate completion with `clock_timestamp()` and
preserves that value permanently. Existing completed records are backfilled
best-effort from their latest payment or update timestamp, so those historical
values are approximations rather than newly asserted completion events.

The shared completed-sales query returns only completed transactions and derives
totals, payments, item-type flags, and waiver presence from canonical records.
Sales uses search, item type, payment method, and server pagination without date
controls. Reports reuses the same query with optional inclusive Manila dates.

## Owner pages

- Overview shows today's transaction/open counts, total clients, collected
  payments, a read-only today table, and current catalog/waiver readiness.
- Sales shows net revenue, completed transactions, and refund/void adjustment
  totals. Rows open immutable items, payments, adjustment history, recorder,
  completion time, and private waiver access. Owners can cancel a completed sale
  by recording a full remaining refund or void with a required reason.
- Reports provides Manila-aware presets and custom dates, completed sales,
  revenue and procedure totals, customer/transaction analytics, top services,
  and weekday traffic. Studio-hours analytics remain deferred.

Report CSV export includes every matching row. Textual cells that could be
interpreted as spreadsheet formulas are apostrophe-prefixed before RFC 4180
escaping, and the output includes a UTF-8 BOM for Excel compatibility.

## Boundaries

There is no separate Sale or Draft entity and transaction references remain
canonical. Refunds and voids append immutable adjustment facts; they never edit
the original transaction, line items, or payment. Partial refunds, reversal of
an adjustment, XLSX generation, studio-hours measures, piercer/station reporting,
and editable completed transactions remain deferred.

## Completed-sale cancellation

`cancel_completed_transaction(uuid, transaction_adjustment_type, text)` is an
Owner-only atomic boundary. It locks the completed transaction, derives the full
remaining refundable value from canonical item and payment facts, requires a
non-empty reason, and appends either a `refund` or `void` adjustment. A fully
adjusted or non-completed transaction is rejected. The transaction remains
`completed`, retaining its original history and consent record.

Sales and report projections derive `Refunded` / `Voided`, total adjustments,
and net totals from `transaction_adjustments`. Net revenue subtracts adjustments
while transaction counts continue to represent the original completed records.
