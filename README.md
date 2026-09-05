# PiercingCorner

PiercingCorner is a management system for a piercing studio in Parañaque.

## Current implementation status

**Phase 1A — COMPLETE (implementation); live Supabase walkthrough pending**

Implemented: the Phase 0A frontend scaffold, migration-driven PostgreSQL schema,
generated Supabase database types, Row Level Security policies, email/password
staff Login, active-account resolution, authenticated session restoration, and
Owner/Staff route guards for the closed access model. Root, Login, and unknown
routes use the approved Owner `/overview` and Staff `/dashboard` landing rules.
Auth events synchronize application accounts while logout and genuine identity
changes clear identity-sensitive TanStack Query state.

Deliberately not implemented: Google OAuth, public booking, client/catalog CRUD,
transaction workflow/finalization RPC, signatures/PDFs, Storage uploads,
dashboard metrics, reports, and the final application-shell design.

## Stack

- React, Vite, TypeScript, and Tailwind CSS
- React Router
- TanStack Query
- Zustand
- Supabase (PostgreSQL, Auth, Storage, and Row Level Security)
- `pdf-lib` in a later waiver/PDF phase

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

See [the database contract](docs/database.md) for the schema, RLS matrix, and
deferred workflow hardening. See [Phase 1A](docs/phase-1a.md) for the Login and
route-authorization acceptance checklist.

## Architecture

- `src/app`: application composition, providers, and route declarations.
- `src/features`: feature-local pages, components, hooks, and types. Current
  placeholders establish the future Dashboard, Clients, Sales, Reports, Studio,
  Settings, and Auth boundaries.
- `src/components`: shared presentation primitives and the temporary app shell.
- `src/lib`: shared infrastructure, currently the Query client and Supabase
  browser-client boundary.
- `supabase/migrations`: canonical Phase 0B schema and RLS migrations.
- `src/types/database.ts`: generated representation of the public database
  schema; `AppRole` derives from its PostgreSQL enum.

Access roles are intentionally limited to `owner` and `staff`. Piercer is not an
access role; it will be modeled separately as a studio/service qualification.

## Next

Run the pending Phase 1A Owner/Staff/inactive-account walkthrough when safe local
Supabase test identities are available. Phase 1B has not been started.
