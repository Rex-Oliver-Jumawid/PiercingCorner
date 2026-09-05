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
- New and edited records are checked for exact normalized matches. Names and
  emails ignore surrounding whitespace and case; phone matching ignores
  formatting characters without inferring country-code equivalence.
- A match never blocks registration. Staff can use the existing client or
  explicitly create/save a separate record. Records are never merged and the
  database does not add uniqueness constraints to identity or contact fields.

## Details and transaction history

The accessible client drawer shows contact details and all transaction statuses.
History uses Manila timestamps, newest-first ordering, snapshot item names, and
a read-only transaction dialog. The dialog derives totals from exact centavo
values and displays recorded payment facts. It deliberately omits recorder and
piercer names, stations, waiver PDFs, and transaction mutations.

The list's transaction count includes every status. Last activity is the latest
transaction `updated_at`, or “No transactions” when no transaction exists.

## Database and security

Migration `20260905000300_client_reads.sql` adds an invoker-rights client summary
view, literal-search RPC, and duplicate-search RPC. Every interface runs as the
authenticated caller and retains the underlying RLS policies. Anonymous and
inactive callers have no access.

Query keys include the current account ID and role. Identity changes remount the
Clients workspace, and late mutations cannot populate or invalidate another
identity's cache.

## Verification

- `npm run lint`, `npm run build`, and all 75 frontend tests pass.
- The focused Clients SQL suite and the existing RLS suite pass against local
  Supabase; both roll back their fixtures.
- Local Owner walkthrough passed: create, duplicate warning, select existing,
  edit, reload persistence, and client details/history empty state.
- Local Staff walkthrough passed with only Dashboard and Clients navigation.
- Local inactive-account walkthrough passed and remained on Login with the safe
  unavailable/inactive message.
- Browser inspection found no runtime errors. The local walkthrough client was
  removed after verification.

The authenticated application shell remains the existing temporary Phase 1A
shell. Catalog management, sale recording/finalization, waiver files, and client
deletion/merging remain deferred.
