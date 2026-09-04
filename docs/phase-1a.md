# Phase 1A — Authentication and route authorization

Phase 1A connects the approved staff Login experience to Supabase Auth and
requires a matching active `staff_accounts` record before the application is
entered. Owner and Staff access is enforced in navigation and at the route
boundary; PostgreSQL RLS remains the final data-access boundary.

## Access matrix

```text
owner: Overview, Dashboard, Clients, Sales, Reports, Studio, Settings, Calendar
staff: Dashboard, Clients
```

## Acceptance checklist

- [ ] A password-authenticated user must also resolve to an active `staff_accounts` row.
- [ ] Owner and Staff land on an authorized destination after sign-in.
- [ ] Protected routes redirect signed-out users to Login and retain an authorized requested destination.
- [ ] Staff cannot enter Owner-only routes through a manually entered URL.
- [ ] An unavailable or inactive account is signed out and denied application access.
- [ ] Login page closely matches `.model/loginpage.html`.
- [ ] Production Login is implemented in React/TypeScript, not copied standalone HTML.
- [ ] Local repository `logo.png` is used.
- [ ] Old remote PiercingSys logo URL is not used.
- [ ] Email/password fields match approved design.
- [ ] Sign in loading state matches approved interaction.
- [ ] Functional errors use the approved inline-error presentation.
- [ ] Prototype authentication simulation is removed.
- [ ] Google OAuth is not implemented.
- [ ] Disabled Google UI, if retained, remains non-functional and clearly disabled.
- [ ] No public-booking route is invented.
- [ ] Artifact review note is not included.
- [ ] Outdated appointment-centric Login copy is not reintroduced.
- [ ] Desktop and mobile layouts preserve the approved visual composition.
- [ ] `.model/loginpage.html` remains unchanged.

The protected files in `.context` and `.model` remain design and product
references only. Production behavior must not be added to those artifacts.
