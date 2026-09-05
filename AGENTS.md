# AGENTS.md

# PiercingCorner agent instructions

This file defines the working contract for coding agents operating in this repository.
Follow the existing repository architecture, domain rules, security model, and phase
contracts before applying generic framework conventions.

When these instructions conflict with a task request, preserve security, data integrity,
and established project contracts first. Do not silently redesign the system.

## Project identity

PiercingCorner is a management system for a piercing studio in Parañaque.

The application is currently a modular React SPA backed by Supabase. It is not a
Next.js application and does not use React Server Components or Server Actions.

Current stack:

- React 19
- Vite
- TypeScript
- Tailwind CSS
- React Router
- TanStack Query
- Zustand
- Supabase PostgreSQL
- Supabase Auth
- Supabase Storage when later phases require it
- Supabase Row Level Security
- Vitest
- React Testing Library
- jsdom

Package manager and scripts are npm-based. Do not convert the repository to pnpm,
Yarn, Bun, Next.js, or another application framework unless the task explicitly
requires and justifies a repository-wide migration.

## Current implementation boundary

Before implementing a feature, read the relevant files under `docs/` and inspect the
current code. Treat documented phase status and deferred work as product constraints.

At the time this file was written:

Implemented:

- Phase 0A frontend scaffold
- migration-driven PostgreSQL schema
- generated Supabase database types
- Row Level Security policies
- email/password staff login
- active application-account resolution
- authenticated session restoration
- Owner/Staff route authorization
- canonical Owner and Staff landing behavior
- auth-sensitive TanStack Query cache isolation

Intentionally deferred unless a task explicitly advances the corresponding phase:

- Google OAuth
- public registration
- public booking
- client/catalog CRUD beyond the currently implemented phase
- transaction finalization RPC
- signatures and generated PDFs
- Storage uploads
- dashboard metrics
- reports
- final application-shell design
- secure staff account administration
- refunds/voids/financial adjustments
- Studio piercer profiles, qualifications, stations, availability, and assignments

Do not implement deferred features opportunistically as part of unrelated work.

## Repository structure

Use the existing modular-monolith structure.

- `src/app`
  - application composition
  - providers
  - route declarations
  - top-level application wiring

- `src/features/<feature>`
  - feature-local pages
  - components
  - hooks
  - services/data access
  - feature-specific types
  - feature-specific tests

- `src/components`
  - shared presentation primitives
  - application-shell/shared UI that genuinely crosses feature boundaries

- `src/lib`
  - cross-cutting infrastructure
  - Supabase browser-client boundary
  - Query client
  - utilities that are genuinely shared

- `src/styles`
  - global styles and application-wide styling foundations

- `src/types`
  - generated/shared TypeScript types
  - database-derived types

- `src/test`
  - shared test setup/helpers

- `supabase/migrations`
  - canonical database schema and security history

- `supabase/tests`
  - database/RLS tests

- `docs`
  - product, phase, database, access, and implementation contracts

Keep the application a modular monolith. Do not introduce microservices, backend
services, queues, or new architectural boundaries without a measured need.

## Feature boundaries

Put product capabilities under `src/features/<feature>`.

Current feature boundaries include:

- `auth`
- `calendar`
- `clients`
- `dashboard`
- `overview`
- `reports`
- `sales`
- `settings`
- `studio`

Prefer extending an existing feature over creating a new top-level directory.

Routes should stay focused on routing and composition. Keep domain rules, database
interaction, authorization decisions, and reusable state logic out of large page
components.

Before creating a new shared abstraction, search the repository and reuse existing
feature or shared primitives where appropriate.

Do not move feature-local code into `src/components` or `src/lib` merely because it
is used by two files inside the same feature.

## React and component conventions

This project is a client-rendered Vite React application.

- Do not add `"use client"` directives.
- Do not use Next.js-only APIs.
- Do not use Server Components.
- Do not use Server Actions.
- Do not introduce server-only assumptions into browser code.
- Keep components focused on rendering and interaction.
- Extract non-trivial domain logic into feature hooks/services/helpers.
- Avoid effect-driven state when values can be derived during render.
- Avoid duplicating remote server state in Zustand.
- Prefer controlled, explicit data flow over hidden global mutable state.
- Preserve accessibility semantics, keyboard interaction, labels, and focus behavior.
- Do not replace working accessible HTML with visually equivalent but semantically weaker markup.

Keep TypeScript strict. Avoid `any`, unchecked assertions, and broad casts unless the
runtime invariant is proven and documented.

## Routing and access control

`src/features/auth/routeAccess.ts` is the canonical application page-access policy.

Do not duplicate the access matrix in another file.

The closed application roles are:

```text
owner
staff
```

A piercer is not an application access role.

Canonical page access:

```text
Owner:
- Overview
- Dashboard
- Clients
- Sales
- Reports
- Studio
- Settings
- Calendar

Staff:
- Dashboard
- Clients
```

Canonical landing routes:

```text
Owner -> /overview
Staff -> /dashboard
```

Required behavior:

- Directly entered URLs must not bypass route authorization.
- An authenticated user requesting an unauthorized route must be redirected using
  the canonical access helpers.
- Staff must never render Owner-only content before redirecting.
- Unknown authenticated routes resolve to the role-default landing route.
- Unknown unauthenticated/protected routes resolve to `/login`.
- Authorized remembered destinations may be restored after login.
- Unauthorized remembered destinations must be discarded in favor of the user's
  allowed default route.
- Navigation visibility must consume the same canonical policy used by route guards.

Do not infer authorization from whether a navigation item is visible.

## Authentication contract

Supabase Auth establishes identity. `public.staff_accounts` establishes application
access, role, display metadata, and active/inactive status.

Never use user-editable auth metadata as the source of application authorization.

A usable authenticated application identity requires:

1. a valid Supabase Auth user
2. a matching `staff_accounts` row
3. an active account
4. a role allowed by the closed application role model

Preserve the established auth lifecycle behavior:

- restore persisted sessions
- resolve `staff_accounts` for signed-in identities
- handle `INITIAL_SESSION`
- handle `SIGNED_IN`
- handle `SIGNED_OUT`
- handle `TOKEN_REFRESHED`
- handle `USER_UPDATED`
- clear private Query state on logout
- clear identity-sensitive Query state on genuine user-ID changes
- clear now-unauthorized cached data after role changes
- do not wipe application state on routine same-user token refresh
- reject stale async account lookups after logout or identity replacement

If a Supabase identity has no usable active application account, deny application
access and sign the session out rather than weakening RLS or route rules.

## Authorization layers

Treat these as separate layers:

```text
navigation visibility
-> route authorization
-> application-action authorization
-> PostgreSQL Row Level Security
```

Passing one layer never substitutes for the next.

Frontend guards improve UX and stop unauthorized route rendering, but RLS remains the
final database-access boundary.

For any future privileged operation that cannot safely be performed through normal
client credentials and RLS, create a reviewed server-side/Admin API boundary rather
than exposing elevated credentials to the browser.

## Supabase client

Use the repository's existing Supabase browser-client boundary.

Do not create ad-hoc Supabase clients throughout features.

Backend-dependent browser code should obtain the client through the established
`getSupabaseClient()` path or its current repository equivalent.

Environment variables currently use:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

Never commit `.env` files or real credentials.

Never expose:

- service-role keys
- database passwords
- signing secrets
- private API secrets
- privileged Admin credentials

The anon/publishable browser key is not an authorization mechanism. RLS and server-side
boundaries provide authorization.

## Database and migration rules

Every database change must be represented by a checked-in Supabase migration.

This includes:

- tables
- columns
- enums
- constraints
- indexes
- functions
- triggers
- grants
- RLS enablement
- RLS policies
- security-definer helpers

Do not make dashboard-only/manual database edits that are absent from migrations.

`supabase/migrations` is the canonical schema history.

After every public-schema change, regenerate:

```text
src/types/database.ts
```

using the local Supabase schema.

Do not hand-edit generated database types to simulate a schema change.

Typical local workflow:

```bash
supabase start
supabase db reset
supabase gen types typescript --local
```

When changing RLS, also run the repository's focused database/RLS tests.

## Row Level Security

Every application table exposed through Supabase must have RLS enabled.

RLS policies must enforce the documented Owner/Staff data model independently of
frontend routing.

When writing security-definer database functions:

- pin `search_path`
- schema-qualify reads
- keep the helper narrowly scoped
- return only what the policy needs
- do not turn helpers into broad privilege escalation mechanisms

Add indexes for columns that are repeatedly used by RLS filters or important query
paths when appropriate.

Never weaken RLS merely to make frontend development easier.

## Current database domain contract

The current schema includes the following responsibilities:

- `staff_accounts`
  - one-to-one application account metadata for `auth.users`
  - display name
  - `owner` / `staff` role
  - active/inactive state

- `clients`
  - minimal walk-in-friendly client record

- `services`
  - deactivatable service catalog
  - exact monetary price

- `products`
  - deactivatable product catalog
  - exact monetary price

- `transactions`
  - operational Dashboard transaction
  - not an appointment
  - not a draft sale

- `transaction_items`
  - service/product lines
  - immutable historical name and price snapshots

- `payments`
  - recorded payment facts
  - never payment-provider credentials

- `waiver_templates`
  - append-only numbered consent-template versions

- `waivers`
  - one signed consent record per transaction
  - future private signature/PDF storage paths

Do not reinterpret these entities without updating the documented database contract.

## Transaction rules

Transaction statuses are:

```text
pending
ongoing
completed
cancelled
```

`pending` and `ongoing` are open operational states.

Preserve these rules unless a task explicitly changes the domain contract:

- normal roles may create open transactions
- normal roles may cancel permitted transactions
- completed/cancelled records are not normally editable
- normal client operations must not directly force `completed`
- transaction completion is intended to be coordinated by a later atomic
  finalization RPC
- do not invent an `awaiting_waiver` status
- do not treat transactions as appointments
- do not introduce a Draft Sale entity unless the product contract changes

Transaction totals should be derived from line items instead of maintaining a redundant
persisted total unless a later documented migration intentionally changes that rule.

A transaction item must preserve:

- positive quantity
- non-negative exact price
- non-empty snapshot name
- exactly one referenced catalog item: service or product, never both

Historical snapshot values exist so old transactions remain accurate after catalog
rename, repricing, or deactivation.

## Payment rules

Payments are recorded facts.

- amount must be positive
- multiple payments may exist for a transaction
- external references may be stored when appropriate
- never store card credentials
- never store GCash credentials
- never store Maya credentials
- never store banking credentials

Ordinary application roles must not update or delete historical payments.

Future refunds/voids should append adjustment records or follow the documented future
financial model instead of rewriting original payment facts.

## Waiver rules

`waiver_templates` are versioned and append-only.

- a wording change creates a new version
- the highest version is current
- historical signed waivers retain their template reference
- signed waivers retain client-name snapshots
- signed waivers are not normally updated/deleted by application roles
- future signature/PDF paths must use private Storage

Do not overwrite previous consent wording in place.

Product-only transactions do not inherently require a waiver.

## Staff-account rules

`staff_accounts` is security-sensitive.

A Staff user must never be able to promote themselves or another user.

Do not casually add ordinary INSERT/UPDATE/DELETE policies for staff account
administration.

Secure account management is intentionally deferred and requires a reviewed privileged
boundary.

## Piercer and Studio modeling

Do not add `piercer` to the `AppRole` enum.

Piercer capability belongs to the Studio domain and should eventually be modeled
through concepts such as:

- piercer profiles
- qualifications
- service eligibility
- stations
- schedules/availability
- assignments

Application access remains `owner | staff` unless the product's role contract is
explicitly redesigned.

## Data fetching and cache rules

Use TanStack Query for remote/server state.

Use stable query keys with feature ownership.

Do not put fetched Supabase rows into Zustand just to make them globally accessible.

Invalidate or update every affected query after successful mutations.

Treat identity-sensitive cached data carefully:

- clear on sign-out
- clear on genuine identity replacement
- clear when a role change may make previously cached data unauthorized
- preserve cache on routine same-user token refresh unless the data itself changed

Avoid rendering data from a previous authenticated identity while the new account is
being resolved.

## Zustand rules

Use Zustand for truly client-side application state that benefits from shared access.

Good candidates may include:

- temporary UI state
- cross-route local interaction state
- non-server-derived preferences

Bad candidates include:

- canonical database rows
- permissions copied from the canonical route policy
- duplicated TanStack Query data
- credentials
- security decisions

Keep stores small and feature-scoped when possible.

## Validation and input handling

Validate untrusted data at the appropriate boundary.

This includes:

- form input
- URL/search parameters
- file input
- external API data
- values crossing a privileged boundary

Do not rely on TypeScript types as runtime validation.

The repository currently does not depend on Zod. Do not add Zod or another validation
library solely because another project uses it. If a feature genuinely needs a runtime
schema library, justify the dependency and apply it consistently.

Database constraints and RLS remain necessary even when frontend validation exists.

## Styling and design

Use the existing Tailwind/Vite styling approach and current application primitives.

- preserve established spacing, typography, radii, and interaction patterns
- reuse existing components before introducing another design-system layer
- do not replace the approved Login design during unrelated work
- keep responsive behavior intentional
- avoid arbitrary one-off styling that creates a second visual language

When a task is specifically a redesign, preserve application behavior, authorization,
and accessibility while changing presentation.

## Error handling

Expose safe, actionable user-facing errors.

Do not leak:

- raw database credentials
- auth tokens
- SQL internals
- service-role information
- stack traces containing secrets

Log enough context for development/debugging without logging secrets.

Distinguish expected business errors from programming errors where the existing
architecture supports it.

Never report a live integration as working if it was not actually tested.

## Testing

Tests are required for important behavior changes.

Prioritize coverage for:

- access matrices
- route guards
- login redirect behavior
- remembered destinations
- auth lifecycle
- Query cache isolation
- stale async auth results
- validation
- important domain rules
- data transformations
- RLS changes

Use the repository's existing Vitest, React Testing Library, and jsdom setup.

For database/RLS changes, add or update SQL tests under `supabase/tests` as appropriate.

Do not delete tests merely to make a change pass.

## Required verification before completion

For ordinary frontend/application changes, run:

```bash
npm run lint
npm run build
npm test
git diff --check
```

`npm run build` already performs TypeScript project verification through `tsc -b`
before the Vite production build.

For database/schema/RLS changes, also run the relevant local Supabase workflow:

```bash
supabase start
supabase db reset
supabase gen types typescript --local
```

and run the repository's database/RLS test command documented in `docs/database.md`.

If a required command cannot be run because the environment lacks Docker, Supabase
credentials, local test identities, or another dependency, say exactly which
verification was not run. Never claim success by simulation.

## Documentation contracts

Read the relevant `docs/*.md` files before altering behavior they describe.

Update documentation when the implementation intentionally changes a documented
contract.

Do not leave code and docs disagreeing about:

- roles
- routes
- landing behavior
- RLS
- schema
- transaction semantics
- deferred work
- phase status

Treat explicit acceptance checklists as part of the feature definition.

## Protected/reference files

If the repository contains project reference/model/context files used as approved
design or implementation references, do not modify them during unrelated work.

In particular, phase documentation has treated these as intentionally unchanged
reference files:

```text
.context/PiercingCorner.md
.model/piercingsys-finalmodelfornow.html
.model/loginpage.html
```

Inspect before changing any of them and only modify them when the task explicitly
targets those reference artifacts.

## Dependency discipline

Prefer the existing stack.

Before adding a dependency:

1. search for an existing solution in the repository
2. determine whether the platform or existing dependency already provides it
3. verify the package solves a real repeated need
4. consider bundle size and maintenance cost
5. avoid overlapping state, validation, routing, or UI libraries

Do not introduce:

- another router beside React Router
- another server-state library beside TanStack Query
- another global-state library beside Zustand
- an ORM that bypasses the established Supabase/migration workflow
- a new CSS framework beside the existing Tailwind setup

without an explicit architecture decision.

## Implementation workflow for agents

Before editing:

1. read this file
2. inspect `README.md`
3. read the relevant `docs/` contract
4. inspect the target feature and adjacent established patterns
5. inspect related tests
6. inspect database migrations/RLS when data access is involved
7. identify whether the task touches a deferred feature or security boundary

While editing:

1. make the smallest coherent change
2. preserve feature boundaries
3. reuse canonical policy and existing primitives
4. keep security decisions out of presentation-only code
5. add or update tests with behavior changes
6. update docs when a documented contract changes
7. avoid unrelated refactors

Before completion:

1. review the diff for accidental scope expansion
2. confirm no secret or `.env` value was added
3. confirm authorization still uses canonical role/access sources
4. confirm schema changes are migration-backed
5. regenerate database types after schema changes
6. run required verification
7. report what changed
8. report tests/checks actually run
9. explicitly identify any checks that could not be run

## Change-scope rules

Do not mix unrelated cleanup into feature work.

Avoid:

- broad renames during a focused bug fix
- formatting entire directories without need
- replacing stable libraries because of preference
- moving files solely to match another project's structure
- speculative abstractions for future phases
- implementing future roadmap items without acceptance criteria

A useful change should be easy to review and trace to the requested behavior.

## Security checklist

Before completing any auth/data feature, verify:

- no secret/service-role key is present in browser code
- auth metadata is not used as the application role authority
- route visibility is not treated as authorization
- direct URLs cannot bypass route guards
- RLS protects exposed tables
- inactive accounts fail normal access
- Staff cannot self-promote
- identity-sensitive cache does not leak across users
- privileged operations do not rely on the anon key alone
- sensitive historical facts are not casually rewritten/deleted

## Definition of done

A task is complete only when the implementation:

- matches the requested behavior
- follows the existing PiercingCorner architecture
- preserves the documented role/security model
- respects current phase boundaries
- includes appropriate tests
- keeps docs synchronized when contracts change
- passes required checks that can be run in the environment
- does not introduce secrets
- does not weaken RLS or authorization
- does not silently invent product behavior

When uncertain, prefer the repository's existing documented pattern over a generic
best practice from another stack.
