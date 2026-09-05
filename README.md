# PiercingCorner

PiercingCorner is a management system for a piercing studio in Parañaque.

## Current implementation status

**Phase 6 — COMPLETE**

Implemented: the Phase 0A frontend scaffold, migration-driven PostgreSQL schema,
generated Supabase database types, Row Level Security policies, email/password
staff Login, active-account resolution, authenticated session restoration, and
Owner/Staff route guards for the closed access model. Root, Login, and unknown
routes use the approved Owner `/overview` and Staff `/dashboard` landing rules.
Auth events synchronize application accounts while logout and genuine identity
changes clear identity-sensitive TanStack Query state. The Clients feature now
provides server-paginated search, client registration/editing with non-blocking
duplicate warnings, and read-only transaction/payment history for both roles.
The Owner-only Studio page now provides the service and product catalogs used by
future transaction workflows, including search, create, edit, pricing, optional
descriptions, and reversible active/inactive status management.
Studio also persists standard hours, piercer profiles, service qualifications,
weekly availability, and dated closures or reduced-hours exceptions. Settings
provides station administration, and new service transactions accept only a
currently available piercer qualified for every selected service.
The Owner/Staff Dashboard now lists and searches today's Manila transactions,
supports open-status operations, and provides a Zustand-driven Record Sale flow.
Product-only sales and eligible existing-transaction finalization use atomic
database functions with server-derived snapshots, totals, payment facts, and
completion. Service sales now pin versioned consent, capture a drawn signature,
generate an A4 PDF with the server signing time, persist both private artifacts,
and continue directly to full payment. Pending transactions provide recovery
when signing persistence or payment is interrupted. Owner Overview, Sales, and
Reports now derive completion metrics, immutable completed-sale history, and
Manila-range analytics from PostgreSQL. Reports can export formula-safe CSV.
Owners can cancel completed Sales transactions through immutable full refund or
void adjustments with required reasons; financial summaries report net revenue
without rewriting payments.

Deliberately not implemented: Google OAuth, public booking, public waiver links,
guardian/minor consent, partial refunds/adjustment reversals, XLSX export,
studio-hours analytics, appointments, and a Calendar scheduling view. The authenticated shell now
uses the approved responsive application design.

## Stack

- React, Vite, TypeScript, and Tailwind CSS
- React Router
- TanStack Query
- Zustand
- Supabase (PostgreSQL, Auth, Storage, and Row Level Security)
- `pdf-lib` for waiver PDF generation

## Local development

```bash
npm install
npm run dev
```

Run checks before a change is handed off:

```bash
npm run lint
npm run build
npm test
```

The build command includes TypeScript project verification (`tsc -b`). To preview
a production build locally, run `npm run preview` after `npm run build`.

## Environment variables

Copy `.env.example` to `.env` and provide the connection values when a feature
needs Supabase:

```text
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Do not commit `.env` files or real credentials. The Login page renders without
these variables and presents a safe user-facing error if sign-in is attempted.
Backend-dependent code accesses Supabase through `getSupabaseClient()`, which
throws a clear development error if either value is absent.

## Local database

With Docker and the Supabase CLI installed, initialize the local services and
recreate the database from migrations:

```bash
supabase start
supabase db reset
```

Regenerate public-schema TypeScript types after a migration change:

```bash
supabase gen types typescript --local
```

To seed local test identities and starter fixtures for UI walkthroughs:

```bash
npm run db:seed
```

Seeded test accounts:
- Owner: `owner@piercingcorner.test` (password: `password123`)
- Staff: `staff@piercingcorner.test` (password: `password123`)
- Inactive: `inactive@piercingcorner.test` (password: `password123`)

See [the database contract](docs/database.md) for the schema, RLS matrix, and
transaction boundaries. See [Phase 1A](docs/phase-1a.md) for the Login and
route-authorization acceptance checklist, [Phase 2](docs/phase-2.md) for the
Clients contract, [Phase 3](docs/phase-3.md) for catalog management, and
[Phase 4](docs/phase-4.md) for the Dashboard transaction workflow, and
[Phase 5](docs/phase-5.md) for durable consent and private PDF storage, and
[Phase 6](docs/phase-6.md) for completed Sales, Owner Overview, and Reports.
See [Studio scheduling](docs/studio-scheduling.md) for hours, qualifications,
availability, exceptions, and station administration.

## Architecture

- `src/app`: application composition, providers, and route declarations.
- `src/features`: feature-local pages, components, hooks, and types. Current
  boundaries implement Dashboard, Clients, Sales, Reports, Overview, Studio,
  Settings, and Auth capabilities.
- `src/components`: shared presentation primitives and the responsive authenticated
  application shell.
- `src/lib`: shared infrastructure, currently the Query client and Supabase
  browser-client boundary.
- `supabase/migrations`: canonical Phase 0B schema and RLS migrations.
- `src/types/database.ts`: generated representation of the public database
  schema; `AppRole` derives from its PostgreSQL enum.

Access roles are intentionally limited to `owner` and `staff`. Piercer is not an
access role; it will be modeled separately as a studio/service qualification.

## Next

Phase 7 will complete the responsive polish, deployment preparation, and the
end-to-end production walkthrough.
