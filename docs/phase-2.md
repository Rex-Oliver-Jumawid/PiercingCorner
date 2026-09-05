# Phase 2 — Clients

**Status: complete.**

Phase 2 replaces the Clients placeholder with a working client CRM for active
Owners and Staff. Its presentation translates the approved Clients screen from
`.model/piercingsys-finalmodelfornow.html` into the existing React feature,
TanStack Query, Supabase, and RLS boundaries.

## Client records

- The list searches names, emails, and phone numbers with a 300 ms debounce.
- Results are ordered by name and ID, with 25 server-paginated rows per page.
- Full name is required. Email and phone are optional; blank values save as
  `null`, and supplied emails are validated before any request is sent.
- Owners and Staff can add and edit clients. Client deletion is not exposed.
- New and edited records are submitted once through atomic database functions.
  They check exact normalized name, email, and phone matches and only return a
  duplicate error when another record matches. Names and emails ignore
  surrounding whitespace and case; phone matching ignores formatting
  characters without inferring country-code equivalence. Records are never
  merged automatically.

## Details and transaction history

The accessible client drawer shows contact details and all transaction statuses.
History uses Manila timestamps, newest-first ordering, snapshot item names, and
a read-only transaction dialog. The dialog derives totals from exact centavo
values and displays recorded payment facts. Product-only transactions omit waiver
UI. Service transactions show their historical signed-waiver metadata after the
payments section and allow the existing private PDF to be viewed; an unavailable
record is presented as a non-blocking historical-data state. The dialog deliberately
omits recorder and piercer names, stations, and transaction mutations.

The list's transaction count includes every status. Last activity is the latest
transaction `updated_at`, or “No transactions” when no transaction exists.

## Database and security

Migration `20260905000300_client_reads.sql` adds an invoker-rights client summary
view, literal-search RPC, and duplicate-search RPC. Every interface runs as the
authenticated caller and retains the underlying RLS policies. Anonymous and
inactive callers have no access.

Migration `20260905000800_client_creation.sql` adds the narrow `create_client`
function used by the Clients page. It requires an active account, serializes the
duplicate check with creation, and returns a safe duplicate failure without
exposing elevated credentials to the browser.

Migration `20260905000900_client_updates.sql` applies the same boundary to edits
through `update_client`, excluding only the record being changed from matching.

Query keys include the current account ID and role. Identity changes remount the
Clients workspace, and late mutations cannot populate or invalidate another
identity's cache.

## Verification

- `npm run lint`, `npm run build`, and the frontend test suite pass.
- The focused Clients SQL suite and the existing RLS suite pass against local
  Supabase; both roll back their fixtures.
- Focused client coverage verifies direct creation and editing, backend duplicate
  rejection, identity isolation, and read-only transaction history.

The authenticated application shell remains the existing temporary Phase 1A
shell. Catalog management, sale recording/finalization, waiver files, and client
deletion/merging remain deferred.
