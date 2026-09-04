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
| `transactions` | Operational Dashboard transaction, not an appointment or draft sale. |
| `transaction_items` | Service/product lines with name and price snapshots. |
| `payments` | Recorded payment facts; never gateway credentials. |
| `waiver_templates` | Append-only numbered consent-template versions. |
| `waivers` | One signed consent record per transaction and future private Storage paths. |

`transactions` belongs to a client and the account that recorded it.
`transaction_items` references exactly one catalog row: service or product, never
both. Payments and waivers belong to a transaction; `waivers.transaction_id` is
unique. Historical FKs use `RESTRICT`; catalogs deactivate and accounts become
inactive instead of being normally deleted.

## Role model, page access, and RLS

Application roles are the closed PostgreSQL enum `owner` and `staff`. A piercer
is not an access role. Future piercer profiles, qualifications, stations,
availability, and assignments belong to the separate Studio domain.

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
| Transactions | Read/create and edit open operational records | Same, through Dashboard only |
| Transaction items | Read; add/edit/remove on open transactions | Same, through Dashboard only |
| Payments | Read/record on open transactions | Read/record through Dashboard |
| Waiver templates | Read/create version | Read current version only |
| Signed waivers | Read/create on open transactions | Read/create through Dashboard |
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
cancel it, but cannot directly set `completed`; a later atomic finalization RPC
will record payments and transition status. Completed and cancelled records are
not normally editable. There is no appointment status, appointment relationship,
or Draft Sale entity.

Totals are derived later from `quantity * unit_price_snapshot`; no redundant
aggregate is persisted. A line must have positive quantity, non-negative exact
price, a non-empty snapshot name, and exactly one catalog FK. Snapshots protect
historical receipts from catalog renames, reprices, and deactivation.

Payments are positive recorded facts with an optional external reference. No
card, GCash, Maya, or banking credentials are stored. Multiple payments are
allowed. Refunds and voids remain deferred and must append adjustments rather
than rewrite original payment rows.

## Waivers and deferred work

`waiver_templates.version` is unique and append-only. The highest version is
current; new wording creates a new row. Staff can read only that current version.
Signed waivers retain their template FK, client-name snapshot, and required
future private signature/PDF paths. RLS gives neither role UPDATE or DELETE on
signed waivers; it similarly prevents ordinary rewrites of payments/templates.

The future transaction RPC will atomically coordinate transaction items,
service-waiver requirements, payment records, and completion. Product-only
transactions have no inherent waiver requirement, and the schema adds no
`awaiting_waiver` status. Storage setup, PDFs, Studio profiles, financial
adjustments, and secure account management are intentionally deferred.
