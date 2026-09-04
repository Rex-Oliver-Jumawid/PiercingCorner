# PiercingCorner

PiercingCorner is a management system for a piercing studio in Parañaque.

## Current implementation status

**Phase 0B — Database contract + RLS foundation**

Implemented: the Phase 0A frontend scaffold plus migration-driven PostgreSQL
schema, generated Supabase database types, and Row Level Security policies for
the closed Owner/Staff access model.

Deliberately not implemented: production login/session handling, route guards,
client/catalog CRUD, transaction workflow/finalization RPC, signatures/PDFs,
Storage uploads, dashboard metrics, reports, final navigation, and final
responsive design.

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

Do not commit `.env` files or real credentials. The Phase 0A placeholders work
without these variables. Future backend-dependent code must access Supabase via
`getSupabaseClient()`, which throws a clear configuration error if either value
is absent.

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
deferred workflow hardening.

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

## Next: proposed Phase 1

Implement Supabase Auth session handling and route authorization, enforcing
Owner access to all approved routes and Staff access to Dashboard and Clients
only. Do not begin catalog CRUD or the transaction workflow until that boundary
is reviewed.
