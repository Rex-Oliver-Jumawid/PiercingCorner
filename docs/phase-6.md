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
- Sales shows collected revenue, completed transactions, and completed service
  transaction counts. Rows open immutable items, payments, recorder, completion
  time, and private waiver access without mutation controls.
- Reports provides Manila-aware presets and custom dates, completed sales,
  revenue and procedure totals, customer/transaction analytics, top services,
  and weekday traffic. Studio-hours analytics remain deferred.

Report CSV export includes every matching row. Textual cells that could be
interpreted as spreadsheet formulas are apostrophe-prefixed before RFC 4180
escaping, and the output includes a UTF-8 BOM for Excel compatibility.

## Boundaries

There is no separate Sale or Draft entity and transaction references remain
canonical. Refunds, voids, adjustments, XLSX generation, studio-hours measures,
piercer/station reporting, and editable completed transactions remain deferred.
