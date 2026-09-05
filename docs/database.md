# Phase 0B database and RLS contract

## Local workflow

The migrations in `supabase/migrations` are the canonical Phase 0B schema. With
Docker and the Supabase CLI available, run:

```bash
supabase start
supabase db reset
supabase gen types typescript --local
```

Regenerate `src/types/database.ts` from the final command after every public
schema change. These commands operate locally; Phase 0B does not link or deploy
a remote project.

Run the focused local RLS suite after `supabase start`:

```bash
docker exec -i supabase_db_PiercingCorner \
  psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/rls.sql
```

It uses fixed test IDs only inside one transaction and ends with `ROLLBACK`, so
it leaves no sample accounts or business records in the local database.

## Tables and relationships

| Table | Responsibility |
| --- | --- |
| `staff_accounts` | One-to-one application-account metadata for `auth.users`; display name, `owner`/`staff`, and active/inactive status only. |
| `clients` | Minimal walk-in-friendly client record. |
| `services` / `products` | Deactivatable catalogs with exact `numeric(12,2)` prices. |
| `piercer_profiles` / `stations` | Deactivatable Studio resources assigned to service transactions. |
| `studio_hours` | The seven recurring Manila operating-day windows. |
| `piercer_service_qualifications` | Services each Studio piercer may be assigned to perform. |
| `piercer_availability` | One recurring availability interval per piercer and weekday. |
| `studio_exceptions` | Dated all-day closures or reduced-hours overrides. |
| `transactions` | Operational Dashboard transaction with immutable client snapshot and first completion timestamp; not an appointment or draft sale. |
| `transaction_items` | Service/product lines with name and price snapshots. |
| `payments` | Recorded payment facts; never gateway credentials. |
| `transaction_adjustments` | Immutable Owner-recorded full refund or void facts for completed transactions. |
| `waiver_templates` | Append-only numbered consent-template versions. |
| `waivers` | One immutable signed consent record per transaction with private Storage paths. |

`transactions` belongs to a client and the account that recorded it. Service transactions also retain their selected piercer profile and station.
`transaction_items` references exactly one catalog row: service or product, never
both. Payments and waivers belong to a transaction; `waivers.transaction_id` is
unique. Historical FKs use `RESTRICT`; catalogs deactivate and accounts become
inactive instead of being normally deleted.

## Role model, page access, and RLS

Application roles are the closed PostgreSQL enum `owner` and `staff`. A piercer
is not an access role. Piercer profiles, qualifications, stations, availability,
and assignments belong to the separate Studio domain.

Page access is not table access. Future authorization is navigation visibility →
route authorization → application-action authorization → RLS. Route guards must
enforce this even for manually entered URLs:

```text
owner: Overview, Dashboard, Clients, Sales, Reports, Studio, Settings, Calendar
staff: Dashboard, Clients
```

Staff receives only the table operations required to run Dashboard and Clients;
those data permissions do not authorize Sales, Reports, Studio, Settings,
Calendar, or Overview pages.

| Resource | Active Owner | Active Staff |
| --- | --- | --- |
| Staff accounts | Read metadata; mutation deferred to secure account management | Read own metadata only |
| Clients | Read/create/update | Read/create/update |
| Services / products | Read/create/update and deactivate | Read active catalog rows only |
| Piercer profiles / stations | Read/create/update and deactivate | Read active rows for Dashboard assignment |
| Studio hours, qualifications, availability, exceptions | Read/create/update as applicable | Read only for checked Dashboard assignment |
| Transactions | Read/create and edit open operational records | Same, through Dashboard only |
| Transaction items | Read; add/edit/remove on open transactions | Same, through Dashboard only |
| Payments | Read/record on open transactions | Read/record through Dashboard |
| Waiver templates | Read/create version | Read current version only |
| Signed waivers | Read; create only through checked signing RPC | Same, through Dashboard |
| Payment update/delete | Denied | Denied |
| Waiver-template update/delete | Denied | Denied |
| Signed-waiver update/delete | Denied | Denied |

Every application table enables RLS. Security-definer helper functions only
answer active-account, owner, open-transaction, and current-template questions;
they pin `search_path` and schema-qualify reads. Inactive accounts fail the
active-account test and receive no normal application access. `staff_accounts`
has no normal INSERT/UPDATE/DELETE policy, so a Staff member cannot promote
themselves or anyone else. Future account management requires a reviewed
server-side/Admin API boundary.

## Operational integrity

Transactions use `pending`, `ongoing`, `completed`, and `cancelled`. Pending and
ongoing are open operational states. Normal roles can create an open record and
cancel it, but cannot directly set `completed`; the Phase 4 atomic transaction
functions record payment and transition status. Completed and cancelled records are
not normally editable. There is no appointment status, appointment relationship,
or Draft Sale entity.

Totals are derived later from `quantity * unit_price_snapshot`; no redundant
aggregate is persisted. A line must have positive quantity, non-negative exact
price, a non-empty snapshot name, and exactly one catalog FK. Snapshots protect
historical receipts from catalog renames, reprices, and deactivation.

Payments are positive recorded facts with an optional external reference. No
card, GCash, Maya, or banking credentials are stored. Multiple payments are
allowed. Refunds and voids append immutable `transaction_adjustments` rather
than rewriting original payment rows. The current cancellation workflow records
the full remaining refundable value and requires an Owner-supplied reason;
partial adjustments and adjustment reversals remain deferred.

## Phase 4 transaction interfaces

`search_dashboard_transactions(text)` returns the current Manila calendar day's
transaction projection for an active application account. It includes client and
recorder display names, immutable item snapshots, a derived total, waiver presence,
and payment count. Search treats all input as literal text.

`record_product_sale(jsonb, uuid[], payment_method, text)` is the only Phase 4
new-sale commit path. It accepts either an existing client ID or new walk-in details,
requires unique active products, obtains names and prices from the database, creates
the client when needed, writes the transaction and item snapshots, derives the exact
total, records one full payment, and marks the transaction completed in one database
transaction.

`finalize_transaction(uuid, uuid[], uuid[], payment_method, text)` locks an existing
open transaction, retains selected historical snapshots even after catalog changes,
adds only active catalog rows, removes deselected rows, derives the total, records one
full payment, and completes atomically. It rejects a service selection without an
existing signed waiver and rejects transactions with existing payments.

These security-definer functions require an active application account, pin an empty
`search_path`, schema-qualify access, and grant execution only to `authenticated`.
They do not expose administrative credentials to the browser. Phase 4 deliberately
supports one full payment; the table's broader multiple-payment domain remains for a
later reviewed workflow.

## Studio scheduling

`get_assignable_piercers(uuid[])` returns active profiles qualified for every
selected active service only when the PostgreSQL server clock falls within the
Manila Studio Hours, the profile's recurring availability, and any applicable
dated exception. It includes an active default station when one exists.

`accept_new_service_waiver(...)` rechecks those rules immediately before creating
the signed Pending service transaction. This check occurs once at creation so a
persisted transaction can finish payment recovery after hours. A transaction-item
trigger checks newly inserted assigned service lines against current qualifications,
while unchanged legacy/open lines remain completable.

Owners manage all Studio configuration under RLS. Availability must fit within
open Studio Hours, conflicting hour reductions are rejected, and reduced-hours
exceptions must narrow the normal window. Calendar remains a retained placeholder;
transactions are still operational records rather than appointments.

## Phase 2 client read interfaces

`client_summaries` is a security-invoker view over clients and their transaction
counts/latest activity. `search_clients(text)` performs literal substring search
without constructing PostgREST filter expressions from user input.
`find_client_duplicates(text, text, text, uuid)` checks exact normalized name,
email, and phone matches while optionally excluding an edited client. These
interfaces execute with the caller's permissions, so existing Clients and
Transactions RLS continues to govern every row.

`create_client(text, text, text)` is the Clients-page registration boundary. It
requires an active account and atomically checks normalized name, email, and
phone values before inserting. `update_client(uuid, text, text, text)` applies
the same check while excluding the target record. A matching record raises a
duplicate error. Both functions expose only the operations already allowed to
active Owner and Staff accounts.

## Phase 5 waiver signing and private documents

`waiver_templates.version` is unique and append-only. Version 1 contains the
approved v5 wording and is system-provisioned; new wording creates a new row.
Staff can read only the current version through ordinary table access.

`private.waiver_signing_events` is accessible only through narrow
security-definer functions. A prepared event pins the exact template presented
to the client and expires after a fixed 30 minutes. Acceptance creates or binds
the Pending transaction and stamps `signed_at` with PostgreSQL
`clock_timestamp()`. Accepted events never expire and do not change when a newer
template becomes current.

`prepare_waiver_signing`, `accept_new_service_waiver`, and
`accept_existing_transaction_waiver` establish those states. Browser-generated
documents are uploaded under deterministic transaction/event paths in the
private `waiver-documents` bucket. `finalize_signed_waiver` verifies object
existence, MIME type, uploader and path before creating the immutable waiver.
Direct ordinary waiver inserts are denied. `get_recoverable_waiver_signing`
allows the original recorder to resume an accepted event when its PNG exists.

All active accounts can read finalized waiver artifacts. Updates are denied;
referenced PNG/PDF objects cannot be deleted while uploaders can clean their own
unreferenced artifacts. Signed waivers retain the pinned template, client-name
snapshot, server signing time and private paths permanently.

The Phase 4 finalization function continues to coordinate transaction items,
service-waiver requirements, payment records, and completion. The Phase 5 happy
path opens payment immediately after waiver persistence, while interrupted work
remains Pending for Dashboard recovery. Product-only transactions have no waiver
requirement and the schema adds no `awaiting_waiver` status. Studio profiles,
financial adjustments, legal template administration, and secure account
management remain deferred.

## Phase 6 completed sales and reporting

`transactions.client_name_snapshot` is established on insertion and cannot be
rewritten. `completed_at` is stamped by PostgreSQL on the first transition to
`completed` and remains write-once. Migration backfill uses the latest payment
or transaction update time as a best-effort approximation for older completed
records only.

Owner-only reporting RPCs provide Overview metrics, all-time Sales metrics,
completed-sale search/details, report summaries, top services, and weekday
traffic. Each is `security definer`, uses an empty `search_path`, and independently
requires `is_owner()`. Sales never passes date filters; Reports passes inclusive
Manila dates to the shared completed-sales projection.

Revenue is recorded payments belonging to completed transactions minus their
refund and void adjustments.
Transaction totals remain derived from immutable item snapshots. Report exports
are generated in the browser as UTF-8 BOM CSV after spreadsheet-formula
neutralization and RFC 4180 serialization; no public financial export endpoint
or new financial entity is introduced.
