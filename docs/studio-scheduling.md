# Studio scheduling and resource administration

**Scheduling status: current recurring baseline with target temporary-scheduling model documented.**

The Owner-only Studio page currently manages Studio Hours, piercer profiles, service qualifications, recurring Piercer Availability, and dated Studio Exceptions.
Piercer remains a Studio-domain profile and is not an application access role.
Station administration is Owner-only under Settings.

This document is the canonical behavioral source of truth for scheduling.
`docs/database.md` records only the implemented schema, RLS, triggers, and database-function contracts.

## Current implementation

### Recurring Studio Hours

`studio_hours` is the current recurring weekly Studio Hours source of truth.
It contains one persistent row for each ISO weekday from Monday (`1`) through Sunday (`7`).
Each row is either closed or has one opening and closing interval.
These rows repeat indefinitely and do not expire at the end of a week.
The Owner currently edits one weekday at a time from Studio.
There is no bulk recurring-hours editor yet.
At the application boundary, `RecurringStudioHour`, `StudioConfiguration.recurringHours`, and `saveRecurringStudioHour` name this persistent weekly default fallback explicitly. They do not resolve or represent Effective Studio Hours.

### Recurring Piercer Availability

`piercer_availability` is the current recurring weekly Piercer Availability source of truth.
It permits at most one interval for a piercer and weekday, and a missing row means unavailable for that weekday.
The database rejects availability outside that weekday's open recurring Studio Hours.
It also rejects shortening or closing a recurring Studio Hours row while saved recurring availability would conflict.
The Owner currently edits one weekday and piercer at a time from Studio.
No qualifications, recurring availability, or Studio Exceptions are invented for existing data.

### Studio Exceptions

`studio_exceptions` stores at most one dated Studio Exception for a date.
A Studio Exception is either an all-day closure or reduced hours.
A reduced-hours exception must be contained within that date's recurring Studio Hours window.
For the current assignability check, an all-day closure prevents every assignment and reduced hours narrows the usable recurring Studio Hours window.
There is no standalone Effective Studio Hours resolver, source label, or temporary-schedule layer today.

### Current assignment and transaction behavior

`get_assignable_piercers(uuid[])` and `piercer_is_assignable(...)` evaluate the PostgreSQL server clock in `Asia/Manila`.
They require an active piercer profile, open recurring Studio Hours, a matching recurring Piercer Availability interval, no blocking Studio Exception, and a qualification for every selected active service.
`accept_new_service_waiver(...)` repeats this check immediately before it creates a signed Pending service transaction.
The live scheduling check happens when that signed service transaction is established.
Later waiver or payment recovery for the persisted transaction is not blocked after hours.
New service lines on an already assigned open transaction still require a current qualification, while historical and unchanged open lines remain completable.
Product-only transactions do not require a piercer and are unaffected by Studio or piercer availability.

### Permissions, frontend data flow, and readiness

Studio is an Owner-only route, and RLS limits scheduling mutations to Owners.
Active Staff accounts may consume the checked assignable-piercer result in Dashboard but cannot mutate Studio configuration.
`studioService.ts` loads configuration and writes individual recurring hours, availability, and exceptions.
`studioQueries.ts` invalidates the authenticated Studio scope plus Dashboard and Settings queries after a Studio configuration mutation.
`StudioConfiguration.tsx` presents the existing individual editors, and `StudioPage.tsx` composes the Owner-only workspace.
Owner Overview currently treats recurring Studio Hours as ready only when all seven `studio_hours` rows exist and at least one is open.
It separately reports an intentionally all-closed week and does not describe today's operational state.

## Target Scheduling Model

The following is planned behavior, not a claim that the temporary persistence, modes, resolvers, or user interfaces already exist.

### Studio schedule layers

**Recurring Studio Hours** are the permanent weekly default and repeat every week until the Owner changes them.
`studio_hours` is expected to remain their source of truth because its one-row-per-weekday model is compatible with this role.

**Temporary Studio Schedule** is a date-bounded override of Recurring Studio Hours.
It must never overwrite or mutate Recurring Studio Hours.
When its date range ends, Recurring Studio Hours must become effective again through date evaluation rather than destructive cleanup, weekly reset jobs, or cron jobs.

**Studio Exception** is a specific-date override for a closure, maintenance event, holiday, private event, or reduced-hours day.
Effective Studio Hours must ultimately resolve with this precedence:

```text
Studio Exception > Temporary Studio Schedule > Recurring Studio Hours
```

### Piercer schedule layers

**Recurring Piercer Availability** is the piercer's permanent weekly default and repeats until changed.
`piercer_availability` is expected to remain its source of truth because it already stores one interval per piercer and weekday.

**Temporary Piercer Schedule** is a date-bounded override of Recurring Piercer Availability.
It must never overwrite or replace Recurring Piercer Availability.
When its date range ends, Recurring Piercer Availability must resume through date evaluation.

Effective Piercer Availability must ultimately resolve with this precedence:

```text
Temporary Piercer Schedule > Recurring Piercer Availability
```

**Same as Studio Hours** means a piercer dynamically follows Effective Studio Hours.
Later persistence must represent this as a mode rather than permanently copying Studio times into piercer rows.
Changes to Recurring Studio Hours, a Temporary Studio Schedule, or a Studio Exception must therefore be reflected dynamically for this mode.

**Custom Hours** means a piercer has explicitly configured availability times.
Custom Hours remain constrained by Effective Studio Hours when the assignable interval is calculated.

The actual working window must ultimately be derived as:

```text
Effective Studio Hours INTERSECT Effective Piercer Availability
```

A piercer must never be effectively assignable outside Effective Studio Hours.
Qualification is separate from scheduling availability and remains an additional requirement for service assignment.
All scheduling business logic must use `Asia/Manila`.

## Gap analysis

| Target capability | Current classification | Evidence and later work |
| --- | --- | --- |
| Recurring Studio Hours | Already supported | `studio_hours` has one persistent row per weekday and the Owner can edit its weekly windows. |
| Bulk recurring Studio Hours configuration | Not supported | The Studio UI saves one weekday at a time and has no atomic seven-day configuration action. |
| Temporary Studio Schedule | Not supported | There are no date-range schedule tables, mutations, or UI. |
| Studio Exception precedence | Partially supported | Dated closures and reduced hours override recurring-hours assignment checks, but no Temporary Studio Schedule or canonical resolver exists. |
| Effective Studio Hours resolution | Not supported | Assignment contains its own recurring-hours and exception predicates; no resolver returns effective hours or source. |
| Recurring Piercer Availability | Already supported | `piercer_availability` persists one weekly interval per piercer and weekday. |
| Same as Studio Hours piercer mode | Not supported | No availability mode exists, and Studio times are currently stored explicitly in availability rows. |
| Custom Hours piercer mode | Partially supported | Explicit weekly intervals exist, but they are not labeled as a mode and cannot participate in future layered resolution. |
| Temporary Piercer Schedule | Not supported | There are no date-range piercer overrides, mutations, or UI. |
| Effective Piercer Availability resolution | Not supported | No resolver applies temporary-over-recurring precedence or returns effective source and interval. |
| Studio/piercer schedule intersection | Partially supported | `piercer_is_assignable` checks both current intervals at one instant, but it does not calculate a reusable effective intersection. |
| Assignable-piercer integration | Partially supported | Dashboard uses `get_assignable_piercers` and the waiver RPC rechecks it, but both still consume recurring hours and exceptions directly. |
| Overview readiness integration | Partially supported | Overview counts recurring `studio_hours` rows and open days, but cannot distinguish a configured schedule from today's temporary or exception-driven state. |
| Owner permissions | Already supported | The Studio route is Owner-only and scheduling table mutations have Owner-only RLS policies. |
| Staff operational consumption | Already supported | Active Staff can call the checked assignable-piercer RPC for Dashboard without configuration mutation rights. |
| Manila timezone support | Already supported | Database assignment and Overview day boundaries explicitly use `Asia/Manila`. |

## Deferred implementation

Phase 0 deliberately does not add temporary Studio or piercer persistence, availability modes, effective schedule resolvers, Configure Hours or Configure Piercer Schedule user interfaces, Dashboard assignment changes, Overview integration, or end-to-end temporary-schedule lifecycle behavior.
It does not change current assignment, historical transaction recovery, recurring schedule values, RLS, or scheduling mutations.

## Boundary

Calendar intentionally retains the approved artifact's Owner-only placeholder.
Scheduling does not add appointments, public booking, service duration, split shifts, or a calendar grid.
