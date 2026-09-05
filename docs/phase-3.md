# Phase 3 — Service and product catalogs

**Status: complete.**

Phase 3 completes the catalog half of the development plan's “Catalog + client
CRM” milestone. The Clients CRM shipped in Phase 2. Catalog presentation follows
the latest approved `.model/piercingsys-finalmodelfornow.html`, which places
Services & Products in the Owner-only Studio page rather than the older plan's
Settings location.

## Catalog management

- Owners can view active and inactive services and products, ordered with active
  entries first and then by name.
- Services and products have independent, immediate name/description search.
- Owners can create and edit catalog name, optional description, exact PHP price,
  and active/inactive status.
- Deactivation is reversible and replaces deletion so historical transaction
  item references and snapshots remain intact.
- Names are required. Prices must be non-negative, fit the database's
  `numeric(12,2)` precision, and contain at most two decimal places.
- Forms preserve entered values after a failed request and expose safe,
  actionable errors without leaking database details.

The approved prototype also visualizes future service duration/category and
product category fields. Those controls are not persisted by the current
canonical schema, so this phase does not simulate them in browser-only state or
silently expand the database contract.

## Access and data boundaries

Studio remains Owner-only through the canonical route-access policy. The page
also requires an authenticated Owner before mounting catalog queries or actions.
Supabase Row Level Security remains the final boundary: Owners may read/create/
update all catalog rows, while Staff can only read active rows for future
Dashboard workflows and cannot mutate them.

Catalog queries are owned by the Studio feature and include account ID and role
in their TanStack Query keys. Identity or role changes remount the workspace, and
late mutations cannot invalidate another identity's cache.

No schema or RLS migration was needed because the existing `services` and
`products` tables and policies already represent the Phase 3 operations.

## Verification

- Targeted Studio model, service-boundary, and component tests pass.
- `npm run lint`, `npm run build`, `npm test`, and `git diff --check` pass.

Service qualifications, availability, and Studio resource administration remain
deferred. Active piercer profiles and stations are now modeled for Dashboard
service assignments.
