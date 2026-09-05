# Phase 1A — Authentication and route authorization

**Status: implementation complete; live Supabase Owner/Staff walkthrough pending.**

Phase 1A connects the approved staff Login to Supabase Auth and requires a
matching active `staff_accounts` record before the application is entered.
Application navigation and route guards enforce the closed Owner/Staff page
model. PostgreSQL Row Level Security remains an independent, final data-access
boundary.

## Canonical access and landing policy

`src/features/auth/routeAccess.ts` is the canonical application access policy.
It defines route paths, labels, allowed roles, authenticated/Owner role groups,
and the helpers used by Login redirects, root/fallback redirects, navigation,
and route guards.

```text
Owner: Overview, Dashboard, Clients, Sales, Reports, Studio, Settings, Calendar
Staff: Dashboard, Clients

Owner landing: /overview
Staff landing: /dashboard
```

An authorized remembered destination takes precedence. An unauthorized or
unknown remembered destination is replaced by the role default. Staff requests
for Owner-only routes always resolve to `/dashboard` without rendering Owner
content.

Authenticated `/` and unknown paths use the same role default. Unauthenticated
protected and unknown paths resolve to `/login`; protected routes retain the
requested pathname so Login can restore it only after authorization.

## Authentication lifecycle and cache isolation

The provider explicitly restores the persisted session and handles Supabase
`INITIAL_SESSION`, `SIGNED_IN`, `SIGNED_OUT`, `TOKEN_REFRESHED`, and
`USER_UPDATED` events:

- `SIGNED_IN` and `USER_UPDATED` resolve role and active status from
  `public.staff_accounts`; user metadata is never an authorization source.
- `SIGNED_OUT` immediately removes local account access and clears the TanStack
  Query cache.
- A genuine user-ID change clears the previous identity's cache and hides the
  previous account while the new staff record is resolved.
- A role change for the same identity also clears cached data that may no longer
  be authorized.
- A routine same-user `TOKEN_REFRESHED` event preserves account and Query state.
- Generation and current-user checks discard late restoration or account lookup
  results after sign-out or a newer identity event.
- Direct Login submission owns its matching account lookup, avoiding duplicate
  work from the corresponding `SIGNED_IN` event.

If a Supabase Auth user has no usable active staff row, the auth service signs
the session out and the provider denies access and clears private cache. The UI
uses the safe combined unavailable/inactive message; RLS is not weakened to
distinguish those states.

## Automated verification

Vitest, React Testing Library, and jsdom cover the canonical policy, real router
configuration, provider event behavior, cache isolation, and stale async-result
protection. Run all required checks with:

```bash
npm run lint
npm run build
npm test
git diff --check
```

The live Supabase walkthrough was not executed because this workspace has no
`.env`, configured Supabase credentials, or supplied local test identities. No
success was simulated. The existing Phase 0B migrations and RLS tests were not
changed, so a schema reset was not required for this frontend-only pass.

## Final acceptance checklist

### Auth

- [x] One stable Supabase browser client is used.
- [x] Email/password Login works structurally through the auth service boundary.
- [x] Persisted session restoration is implemented and covered by a provider test.
- [x] Authenticated users resolve to `staff_accounts`.
- [x] Application role comes from `staff_accounts.role`.
- [x] Inactive/unavailable accounts are denied and signed out.
- [x] Relevant auth lifecycle events are handled.
- [x] Stale account lookups cannot restore an old user.
- [x] Logout removes local access.
- [x] Auth-sensitive Query cache clears on logout and `SIGNED_OUT`.
- [x] Genuine identity changes clear stale private cache.
- [x] Routine same-user token refresh does not wipe application state.

### Routing and access

- [x] Owner `/` and default Login destination resolve to `/overview`.
- [x] Staff `/` and default Login destination resolve to `/dashboard`.
- [x] Authorized remembered destinations work.
- [x] Unauthorized remembered destinations are rejected.
- [x] Unknown Owner routes resolve to `/overview`.
- [x] Unknown Staff routes resolve to `/dashboard`.
- [x] Unauthenticated protected/unknown routes resolve to `/login` without loops.
- [x] Authenticated Owner `/login` resolves to `/overview` by default.
- [x] Authenticated Staff `/login` resolves to `/dashboard` by default.
- [x] Owner can access all eight approved application routes.
- [x] Staff can access Dashboard and Clients.
- [x] Staff cannot access Overview, Sales, Reports, Studio, Settings, or Calendar.
- [x] Direct URLs cannot bypass authorization.

### Architecture and Login

- [x] Route/access matrix has one canonical source.
- [x] Navigation and router boundaries consume the canonical access configuration.
- [x] Router retains nested authenticated and Owner-only boundaries.
- [x] `AppRole` remains derived from generated database types.
- [x] Phase 0B RLS and migrations are unchanged.
- [x] Approved Login design and local logo remain intact.
- [x] Google OAuth remains unimplemented and its displayed button remains disabled.
- [x] No public registration or booking route exists.
- [x] Transaction-oriented Login copy remains unchanged.

### Testing and files

- [x] Frontend Vitest/React Testing Library/jsdom setup exists.
- [x] Access-policy, default/remembered destination, and route-guard tests pass.
- [x] Query-cache, auth-event, restoration, and stale-result tests pass.
- [x] `npm run lint` passes.
- [x] `npm run build` passes.
- [x] `npm test` passes.
- [x] `git diff --check` passes.
- [x] `.context/PiercingCorner.md` is unchanged.
- [x] `.model/piercingsys-finalmodelfornow.html` is unchanged.
- [x] `.model/loginpage.html` is unchanged.

### Live Supabase walkthrough

- [ ] Live active Owner Login/navigation/logout walkthrough performed.
- [ ] Live active Staff Login/access-denial/logout walkthrough performed.
- [ ] Live unusable/inactive application-account denial walkthrough performed.

These live items remain pending only because local credentials/test identities
were unavailable. They do not replace the automated Phase 1A authorization and
auth-lifecycle coverage above.
