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
| `business_profile` | Singleton studio identity and contact settings; fixed to the Manila timezone and PHP currency. |
| `clients` | Minimal walk-in-friendly client record. |
| `services` / `products` | Deactivatable catalogs with exact `numeric(12,2)` prices. |
| `piercer_profiles` / `stations` | Deactivatable Studio resources assigned to service transactions. |
| `studio_hours` | The seven persistent Recurring Studio Hours windows, one for each Manila weekday. |
| `studio_temporary_schedules` | Date-bounded Temporary Studio Schedule metadata with non-overlapping inclusive date ranges. |
| `studio_temporary_hours` | The seven explicit open or closed weekday rows belonging to each Temporary Studio Schedule. |
| `piercer_service_qualifications` | Services each Studio piercer may be assigned to perform. |
| `piercer_availability` | At most one persistent Recurring Piercer Availability row per piercer and weekday, in `studio` or `custom` mode; absence means unavailable. |
| `piercer_temporary_schedules` | Inclusive date-bounded Temporary Piercer Schedule metadata; ranges may not overlap for the same piercer. |
| `piercer_temporary_availability` | Seven explicit unavailable, `studio`, or `custom` weekday states for each Temporary Piercer Schedule. |
| `studio_exceptions` | One dated Studio Exception per date: an all-day closure or a reduced-hours override of the applicable base window. |
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
| Business profile | Read/update the singleton profile | No access |
| Clients | Read/create/update | Read/create/update |
| Services / products | Read/create/update and deactivate | Read active catalog rows only |
| Piercer profiles / stations | Read/create/update and deactivate | Read active rows for Dashboard assignment |
| Recurring/temporary Studio and Piercer scheduling, qualifications, availability, exceptions | Read; individual recurring updates plus atomic Owner-only recurring and temporary configuration | Read only for checked operational use |
| Transactions | Read/create and edit open operational records | Same, through Dashboard only |
| Transaction items | Read; add/edit/remove on open transactions | Same, through Dashboard only |
| Payments | Read/record on open transactions | Read/record through Dashboard |
| Waiver templates | Read/create version | Read current version only |
| Signed waivers | Read; create only through checked signing RPC | Same, through Dashboard |
| Payment update/delete | Denied | Denied |
| Waiver-template update/delete | Denied | Denied |
| Signed-waiver update/delete | Denied | Denied |

Every application table enables RLS. The `authenticated` PostgreSQL role has
only the table-level statement privileges needed by the corresponding RLS
policies; possessing a table privilege does not bypass their row checks.
Security-definer helper functions only
answer active-account, owner, open-transaction, and current-template questions;
they pin `search_path` and schema-qualify reads. Inactive accounts fail the
active-account test and receive no normal application access. `staff_accounts`
has no normal INSERT/UPDATE/DELETE privilege or policy, so a Staff member cannot promote
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

## Current Studio scheduling

`get_assignable_piercers(uuid[])` returns active profiles qualified for every selected active service when the PostgreSQL server clock falls within Effective Piercer Availability in `Asia/Manila`.
It includes an active default station when one exists and independently requires an active application account.

`piercer_is_assignable(uuid, uuid[], timestamptz)` is the internal security-definer predicate used by that RPC and signed service-transaction acceptance.
It converts the timestamp to a Manila date/time and consumes `get_effective_piercer_availability` rather than interpreting either piercer schedule layer directly.
It preserves active-profile, active-service, qualification, and selected-service checks, with inclusive opening and exclusive closing times.
Direct execution is revoked from PUBLIC, `anon`, and `authenticated`, including Supabase's explicit default role grants.

### Effective Studio Hours resolver contract

`get_base_studio_hours(target_date date)` resolves `Temporary Studio Schedule > Recurring Studio Hours` using the inclusive `daterange` GiST lookup and indexed weekday keys.
`get_effective_studio_hours(target_date date)` applies `Studio Exception > Base Studio Hours` and is the canonical operating-window resolver.
Both are stable security-invoker functions with empty `search_path`, schema-qualified reads, and execution granted to `authenticated` only among browser roles.
Table RLS continues to filter direct reads; checked definer callers use their existing operational authorization boundary.
Neither resolver writes data or performs expiry cleanup.

| Returned field | Contract |
| --- | --- |
| `schedule_date` | Requested finite, non-null date; invalid input raises `22023`. |
| `weekday` | ISO weekday `smallint`, Monday `1` through Sunday `7`. |
| `is_open` | Whether the resolved Studio interval is open. |
| `opens_at`, `closes_at` | `time` values, both null when closed. |
| `source` | Fixed text values `recurring`, `temporary`, or `exception`; base helper returns only the first two. |
| `temporary_schedule_id` | Applicable temporary schedule UUID, nullable, retained beneath an exception. |
| `exception_id`, `exception_type` | Effective resolver only; nullable UUID and existing `studio_exception_type` enum. |

The generated Supabase RPC types do not express nullable table-return fields or narrow the text source union; future UI consumers must handle the documented null values and source contract explicitly.
The date itself is timezone-neutral; timestamp callers must derive it with `Asia/Manila`.
A missing recurring row or selected temporary weekday resolves closed without invented hours, retaining the selected source.
Inactive or missing application accounts see a closed recurring result without identifiers because RLS hides all underlying rows.
A closed exception always resolves closed with source `exception`.
`validate_studio_exception` uses only the base helper to require reduced hours inside an already-open temporary or recurring window, so validation cannot recurse through the exception being saved.
If later base configuration changes invalidate an existing reduced exception, effective resolution fails closed with source `exception` until corrected; it never silently reopens or clamps the interval.

The database table name remains `studio_hours`; it is the persistence boundary for Recurring Studio Hours, not a persisted Effective Studio Hours result.

### Effective Piercer Availability resolver contract

`get_effective_piercer_availability(target_piercer_profile_id uuid, target_date date)` resolves one piercer on one finite Manila business date.
It is the canonical implementation of `Temporary Piercer Schedule > Recurring Piercer Availability`, followed by `Effective Studio Hours INTERSECT selected Piercer Availability`.
It calls `get_effective_studio_hours(target_date)` and does not reproduce Studio exception/temporary/recurring precedence.
It is a stable, security-invoker, read-only function with an empty `search_path` and schema-qualified reads.
Execution is revoked from PUBLIC, `anon`, and `authenticated`; checked browser workflows reach it only through the existing security-definer assignment boundary.

| Returned field | Contract |
| --- | --- |
| `piercer_profile_id` | Requested non-null piercer profile UUID. Active status is deliberately not evaluated here. |
| `availability_date` | Requested finite, non-null date; invalid arguments raise `22023`. |
| `weekday` | ISO weekday `smallint`, Monday `1` through Sunday `7`. |
| `is_available` | Whether a non-empty Studio-intersected interval exists. |
| `mode` | Selected `studio` or `custom` mode; null for unavailable, missing, or malformed selected states. |
| `starts_at`, `ends_at` | Effective `time` interval after Studio intersection; both null when unavailable. |
| `source` | Fixed text value `recurring` or `temporary`. |
| `temporary_schedule_id` | Covering Temporary Piercer Schedule UUID, nullable. It remains populated for a corrupted missing child state. |
| `studio_source` | Effective Studio Hours source: `recurring`, `temporary`, or `exception`. |
| `studio_temporary_schedule_id` | Applicable Temporary Studio Schedule UUID from the Studio resolver, nullable. |
| `studio_exception_id`, `studio_exception_type` | Applicable Studio Exception identity/type, nullable. |

Unavailable, missing recurring rows, closed Effective Studio Hours, malformed selected states, and empty Custom intersections return unavailable with null effective times.
Studio mode dynamically adopts the complete Effective Studio Hours interval.
Custom mode returns `greatest(studio_opens_at, configured_starts_at)` and `least(studio_closes_at, configured_ends_at)` only when start is earlier than end.
Opening remains inclusive and closing exclusive in `piercer_is_assignable`.

Temporary date bounds are inclusive and expired records require no cleanup.
A covering Temporary Piercer Schedule completely replaces recurring selection, including explicit Unavailable.
If its required weekday child is unexpectedly missing, resolution retains source `temporary` and its schedule ID but fails closed; it never exposes a recurring fallback.
Resolution does not write `piercer_availability`, `piercer_temporary_schedules`, or `piercer_temporary_availability`.
Service qualification, selected-service validation, and active-profile rules remain outside this scheduling resolver in `piercer_is_assignable`.

`studio_temporary_schedules` stores independent `starts_on` and `ends_on` metadata for Temporary Studio Schedules.
Its inclusive `daterange` exclusion constraint rejects any calendar date covered by another temporary schedule, including schedules that only touch on one endpoint date.
`starts_on <= ends_on` is enforced, and an index on `(starts_on, ends_on)` supports date-bound lookup in addition to the GiST index created by the exclusion constraint.
`created_by` references the creating `staff_accounts` row with restrictive deletion behavior, while the normal shared timestamp trigger maintains `updated_at`.

`studio_temporary_hours` belongs to its schedule through `schedule_id` and cascades only when that parent temporary schedule is deleted.
Its composite primary key permits exactly one row per ISO weekday (`1` through `7`) for a schedule.
Open rows require non-null times with `opens_at < closes_at`; closed rows require both times to be null.
The atomic configuration RPC requires every weekday exactly once, so persisted configurations created through the application boundary always contain seven explicit rows and can distinguish an intentionally closed day from the absence of a temporary schedule.

`configure_temporary_studio_schedule(date, date, jsonb, uuid default null)` is the only granted temporary-schedule mutation boundary.
It requires an active Owner, validates the date range and complete seven-day JSON payload, creates or replaces the metadata and daily rows, and returns the configured schedule ID.
PostgreSQL executes the function call as one transaction, so a constraint failure rolls back a new schedule or restores all prior metadata and daily rows during replacement.
Authenticated direct inserts, updates, and deletes are not granted, preventing a client from bypassing the complete-schedule invariant with separate weekday requests.
RLS allows active accounts to read both temporary tables and contains Owner-only mutation policies as defense in depth; the RPC independently enforces Owner authorization.

`configure_recurring_studio_hours(jsonb)` is the Owner-only bulk Recurring Studio Hours boundary.
Its `daily_hours` JSON array must contain each ISO weekday `1` through `7` exactly once.
Every entry contains `weekday`, `is_open`, `opens_at`, and `closes_at`; open rows require non-null increasing times, while closed rows require both times to be null.
An all-closed week is valid under the existing business rules.
The function updates all seven existing `studio_hours` rows in one PostgreSQL statement and rejects a corrupted configuration that does not update exactly seven rows.
The existing `studio_hours_prevent_availability_conflicts` trigger runs for each changed weekday, so shortening or closing hours that contain Recurring Piercer Availability is still rejected.
Any invalid weekday or availability conflict rolls back the entire function call.
The RPC does not read or modify `studio_temporary_schedules`, `studio_temporary_hours`, or `studio_exceptions`.
Individual Owner updates to one recurring weekday remain granted for the explicit per-day maintenance UI.

`configure_recurring_piercer_availability(uuid, jsonb)` is the Owner-only bulk Recurring Piercer Availability boundary. Its payload contains each ISO weekday one through seven exactly once and provides `weekday`, `is_available`, `mode`, `starts_at`, and `ends_at`. It validates unavailable/null, Studio/null, and Custom/increasing-time state combinations, then atomically replaces the selected piercer's complete recurring week. Unavailable weekdays delete their `piercer_availability` rows, preserving the existing missing-row representation. Available rows remain subject to the existing Custom Hours versus Recurring Studio Hours trigger. A failed day rolls back the entire replacement. The function never updates Temporary Piercer Schedules, qualifications, profile data, or another piercer, and execution is granted only to `authenticated` after the function independently verifies an active Owner.

`piercer_availability.mode` is constrained text with allowed values `studio` and `custom`.
The migration assigns the default `custom` value to every existing explicit-time row, preserving its times and prior behavior.
Custom rows require non-null `starts_at` and `ends_at` with `starts_at < ends_at`.
Studio rows require both time columns to be null because their interval is derived dynamically from Effective Studio Hours.
A missing piercer/weekday row remains the only recurring unavailable representation.

`validate_piercer_availability` compares only Custom Hours with the open Recurring Studio Hours row for the same weekday.
It rejects a custom interval outside that recurring window; Studio mode has no explicit interval to compare and passes this trigger boundary without fabricated times.
`prevent_conflicting_studio_hours` likewise blocks recurring Studio Hours edits only when they would invalidate saved Custom Hours.
Studio-mode rows neither block nor get rewritten by a recurring Studio change.

`piercer_is_assignable(uuid, uuid[], timestamptz)` now delegates all scheduling-mode and temporary-over-recurring selection to `get_effective_piercer_availability` while retaining the existing Manila-time, active-profile, active-service, selected-service, and qualification checks.
It only tests the returned effective interval at the opening-inclusive, closing-exclusive boundary.

### Temporary Piercer Schedule persistence

`piercer_temporary_schedules` owns one piercer's inclusive `starts_on`/`ends_on` range, with UUID primary key, restrictive foreign keys to `piercer_profiles` and the creating `staff_accounts` row, shared timestamps, and `starts_on <= ends_on` validation.
Its GiST exclusion constraint combines `piercer_profile_id =` with inclusive `daterange(...) &&`, rejecting every same-piercer calendar overlap while permitting identical ranges for different piercers.
The `(piercer_profile_id, starts_on, ends_on)` index supports piercer/date lookup in addition to the exclusion index.

`piercer_temporary_availability` belongs to a schedule through a cascading foreign key and uses `(schedule_id, weekday)` as its primary key, limiting each ISO weekday `1` through `7` to one row.
Its check constraint permits exactly three representations:

| State | Stored representation |
| --- | --- |
| Unavailable | `is_available = false`; mode and both times null. |
| Same as Studio Hours | `is_available = true`, `mode = studio`; both times null. |
| Custom Hours | `is_available = true`, `mode = custom`; non-null `starts_at < ends_at`. |

An available row must have an explicit `studio` or `custom` mode. Phase 11 tightened the table check and atomic RPC validation so a null mode cannot pass through PostgreSQL `CHECK` null semantics.

The Owner-only `configure_temporary_piercer_schedule(uuid, date, date, jsonb, uuid default null)` RPC verifies the piercer, range, and an array containing each weekday exactly once before writing.
Creation inserts parent metadata and all seven states in one transaction.
Replacement locks a target belonging to the supplied piercer, updates its dates, deletes its prior child rows, and inserts the complete replacement set; any error rolls back the whole function call and restores the original data.
It cannot use a target ID to change another piercer's schedule.

Active application accounts have RLS-filtered read access to both tables.
Mutation policies are Owner-only defense in depth, while direct authenticated INSERT, UPDATE, and DELETE privileges are revoked so browser clients must use the complete-schedule RPC.
The RPC independently requires an active Owner and is the only authenticated mutation boundary.

Temporary configuration never reads, updates, or deletes `piercer_availability`.
Expired rows remain stored, and recurring fallback will occur through date evaluation without cleanup or reset jobs.
Phase 6 persistence validates Custom Hours as an increasing interval but deliberately does not reproduce Effective Studio Hours precedence.
The Phase 7 resolver now applies the runtime intersection, so Temporary Piercer schedules affect `piercer_is_assignable`, `get_assignable_piercers`, Dashboard assignment, and new waiver acceptance through the existing backend call chain.

`accept_new_service_waiver(...)` rechecks those rules immediately before creating
the signed Pending service transaction. This check occurs once at creation so a
persisted transaction can finish payment recovery after hours. A transaction-item
trigger checks newly inserted assigned service lines against current qualifications,
while unchanged legacy/open lines remain completable.

Owners manage Studio configuration under RLS and the checked recurring and temporary mutation RPCs.
`validate_piercer_availability` and `prevent_conflicting_studio_hours` enforce Custom Hours recurring-to-recurring relationships, independently of temporary schedules.
Neither `studio_hours` nor `piercer_availability` is rewritten by temporary configuration or resolution.
Dashboard and waiver acceptance now consume Effective Piercer Availability through the predicate; Overview configuration readiness still reads recurring configuration only, while its separate today-state fields use Effective Studio Hours.
The Owner Studio page now exposes the Phase 4 Configure Hours workflow and reads today's resolver result for source presentation.
The Owner Studio page also exposes the complete Configure Piercer Schedule workflow for recurring and temporary Piercer Availability.
Calendar remains a placeholder and transactions remain operational records rather than appointments.
See [Studio scheduling](studio-scheduling.md) for implemented behavior and deferred phases.

Focused scheduling verification uses the existing Studio suite plus deterministic Phase 3 resolver coverage:

```bash
docker exec -i supabase_db_PiercingCorner psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/studio.sql
docker exec -i supabase_db_PiercingCorner psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/effective_studio_hours.sql
docker exec -i supabase_db_PiercingCorner psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/configure_recurring_studio_hours.sql
docker exec -i supabase_db_PiercingCorner psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/recurring_piercer_availability.sql
docker exec -i supabase_db_PiercingCorner psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/temporary_piercer_availability.sql
docker exec -i supabase_db_PiercingCorner psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/effective_piercer_availability.sql
docker exec -i supabase_db_PiercingCorner psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/overview_effective_studio_hours.sql
docker exec -i supabase_db_PiercingCorner psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/waivers.sql
```

All focused suites roll back their fixtures; the canonical `supabase/tests/rls.sql` suite remains required.

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

`get_owner_overview()` also returns recurring Studio configuration counts plus
today's Effective Studio Hours. `studio_days_configured` and
`studio_open_days` are counts from persistent `studio_hours` only: the frontend
treats all seven persisted days with at least one open day as ready,
distinguishes an intentionally all-closed week, and flags missing day records
as incomplete. Temporary schedules and exceptions do not alter those readiness
fields.

The same Owner-only RPC derives its operational fields with
`get_effective_studio_hours((clock_timestamp() at time zone 'Asia/Manila')::date)`.
`studio_is_open_today`, `studio_opens_at_today`, and
`studio_closes_at_today` represent the resolver's effective window; times are
null when closed. `studio_schedule_source_today` is `recurring`, `temporary`,
or `exception`. The RPC does not implement scheduling precedence itself, and
unrelated Overview metric calculations remain unchanged.

Revenue is recorded payments belonging to completed transactions minus their
refund and void adjustments.
Transaction totals remain derived from immutable item snapshots. Report exports
are generated in the browser as UTF-8 BOM CSV after spreadsheet-formula
neutralization and RFC 4180 serialization; no public financial export endpoint
or new financial entity is introduced.
