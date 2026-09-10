# Studio scheduling and resource administration

**Scheduling status: Phase 3 Effective Studio Hours resolver and operational assignment integration implemented.**

The Owner-only Studio page currently manages Studio Hours, piercer profiles, service qualifications, recurring Piercer Availability, and dated Studio Exceptions.
Piercer remains a Studio-domain profile and is not an application access role.
Station administration is Owner-only under Settings.

The authoritative phased behavioral plan is `.plan/configurehoursplan.md`.
This document records verified current scheduling behavior.
`docs/database.md` records only the implemented schema, RLS, triggers, and database-function contracts.

## Current implementation

### Recurring Studio Hours

`studio_hours` is the current recurring weekly Studio Hours source of truth.
It contains one persistent row for each ISO weekday from Monday (`1`) through Sunday (`7`).
Each row is either closed or has one opening and closing interval.
These rows repeat indefinitely and do not expire at the end of a week.
The Owner currently edits one weekday at a time from Studio.
There is no bulk recurring-hours editor yet.
At the application boundary, `RecurringStudioHour`, `StudioConfiguration.recurringHours`, and `saveRecurringStudioHour` name this persistent weekly default fallback explicitly.
They do not resolve or represent Effective Studio Hours.

### Temporary Studio Schedule

`studio_temporary_schedules` now stores independent inclusive start and end dates for date-bounded Temporary Studio Schedules.
`studio_temporary_hours` stores exactly seven explicit ISO weekday rows for every schedule configured through the atomic RPC.
Each row is either open with one valid interval or intentionally closed with null times.
The database rejects invalid date ranges, invalid daily windows, incomplete or duplicate weekday payloads, and any date overlap with another Temporary Studio Schedule.
Creating or replacing a Temporary Studio Schedule never updates or deletes Recurring Studio Hours in `studio_hours`.
Expired records remain stored and become irrelevant through date evaluation; there is no reset, cron, or destructive expiry job.

The frontend domain now exposes `TemporaryStudioSchedule`, `TemporaryStudioHour`, and `StudioConfiguration.temporarySchedules`.
`getStudioConfiguration` loads this persistence separately from `recurringHours`, and `configureTemporaryStudioSchedule` sends the complete seven-day configuration to one Owner-only database RPC.
The production Studio UI does not expose this mutation yet.

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
A reduced-hours exception must fit within that date's base Studio Hours: Temporary Studio Schedule when present, otherwise Recurring Studio Hours.
`validate_studio_exception` calls `get_base_studio_hours(date)` without reading the exception being validated, avoiding recursion.
Reduced hours cannot reopen a closed base day.
An all-day closure overrides every other Studio schedule.

### Effective Studio Hours

`get_effective_studio_hours(target_date date)` is the canonical database resolver for `Studio Exception > Temporary Studio Schedule > Recurring Studio Hours`.
Its base helper centralizes `Temporary > Recurring` for both resolution and exception validation.
It returns the requested date, ISO weekday, open state, nullable opening and closing times, source (`recurring`, `temporary`, or `exception`), and applicable temporary schedule and exception identifiers/type.
No effective rows are persisted and no React precedence logic is required.
The date must be finite and non-null; callers converting timestamps must use `Asia/Manila`.

For recurring Thursday 10:00–20:00 and a September 17–20 temporary schedule of 12:00–18:00, September 17 resolves to 12:00–18:00 with source `temporary`.
Both September 17 and September 20 belong to the inclusive temporary range; September 21 resumes its recurring row without cleanup.
A 13:00–17:00 reduced exception narrows that temporary window, while 10:00–19:00 is rejected.
A closed exception instead returns closed with null times and source `exception`.
Temporary hours may open a recurring closed day, but cannot create missing recurring Piercer Availability.

A missing selected weekday fails closed with null times and retains the selected source; a missing temporary weekday never falls back to recurring hours.
If a later configuration edit invalidates a previously saved reduced exception, the resolver fails closed with source `exception` until the Owner fixes the configuration or exception.
It does not silently clamp, reopen, delete, or rewrite that exception.
Direct authenticated resolver calls obey table RLS; inactive or missing accounts see no schedule data and receive the closed recurring fallback without identifiers.
Anonymous execution is denied.

### Current assignment and transaction behavior

`get_assignable_piercers(uuid[])` and `piercer_is_assignable(...)` evaluate the PostgreSQL server clock in `Asia/Manila`.
The checked RPC delegates to `piercer_is_assignable`, which now consumes `get_effective_studio_hours` for the Manila date.
They require an active piercer profile, open Effective Studio Hours, a matching recurring Piercer Availability interval, and a qualification for every selected active service.
Both time intervals include opening and exclude closing.
The runtime window is therefore `Effective Studio Hours INTERSECT Recurring Piercer Availability`; temporary Studio hours never rewrite stored piercer intervals.
The underlying security-definer predicate is not directly executable by browser roles.
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

Successful temporary-schedule mutations use the existing authenticated Studio configuration query scope, which invalidates Studio configuration plus the existing Dashboard and Settings dependent scopes.
Dashboard assignment and waiver acceptance respect temporary hours through the canonical backend call chain; no Dashboard, waiver, or Settings presentation changed.

## Target Scheduling Model

Studio precedence below is implemented in Phase 3.
Piercer modes, temporary Piercer schedules, their resolver, and the new user interfaces remain planned.

### Studio schedule layers

**Recurring Studio Hours** are the permanent weekly default and repeat every week until the Owner changes them.
`studio_hours` is expected to remain their source of truth because its one-row-per-weekday model is compatible with this role.

**Temporary Studio Schedule** is a persisted, operationally effective date-bounded override of Recurring Studio Hours.
It must never overwrite or mutate Recurring Studio Hours.
When its date range ends, Recurring Studio Hours must become effective again through date evaluation rather than destructive cleanup, weekly reset jobs, or cron jobs.

**Studio Exception** is a specific-date override for a closure, maintenance event, holiday, private event, or reduced-hours day.
Effective Studio Hours now resolve with this precedence:

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
| Temporary Studio Schedule | Backend supported | Independent date ranges, seven weekday rows, atomic Owner-only mutation, and effective resolution exist; production configuration UI remains deferred. |
| Studio Exception precedence | Supported | Exceptions override temporary and recurring hours; reduced exceptions validate against the base resolver. |
| Effective Studio Hours resolution | Supported | `get_effective_studio_hours` returns the canonical interval and source and is consumed by assignment. |
| Recurring Piercer Availability | Already supported | `piercer_availability` persists one weekly interval per piercer and weekday. |
| Same as Studio Hours piercer mode | Not supported | No availability mode exists, and Studio times are currently stored explicitly in availability rows. |
| Custom Hours piercer mode | Partially supported | Explicit weekly intervals exist, but they are not labeled as a mode and cannot participate in future layered resolution. |
| Temporary Piercer Schedule | Not supported | There are no date-range piercer overrides, mutations, or UI. |
| Effective Piercer Availability resolution | Not supported | No resolver applies temporary-over-recurring precedence or returns effective source and interval. |
| Studio/piercer schedule intersection | Partially supported | `piercer_is_assignable` checks both current intervals at one instant, but it does not calculate a reusable effective intersection. |
| Assignable-piercer integration | Studio integration supported | Dashboard and waiver acceptance reach the Effective Studio Hours resolver through `piercer_is_assignable`; Piercer Availability remains recurring-only. |
| Overview readiness integration | Partially supported | Overview counts recurring `studio_hours` rows and open days, but cannot distinguish a configured schedule from today's temporary or exception-driven state. |
| Owner permissions | Already supported | The Studio route is Owner-only and scheduling table mutations have Owner-only RLS policies. |
| Staff operational consumption | Already supported | Active Staff can call the checked assignable-piercer RPC for Dashboard without configuration mutation rights. |
| Manila timezone support | Already supported | Database assignment and Overview day boundaries explicitly use `Asia/Manila`. |

## Deferred implementation

Phase 3 does not add Configure Hours UI, Piercer availability modes, Temporary Piercer schedules, Effective Piercer Availability, Configure Piercer Schedule UI, Overview effective-state integration, or later full lifecycle E2E coverage.
Historical transaction recovery and product-only behavior remain unchanged.
`validate_piercer_availability` and `prevent_conflicting_studio_hours` still enforce only permanent recurring configuration relationships.

Phase 4 can consume `StudioConfiguration.recurringHours`, `StudioConfiguration.temporarySchedules`, and the generated Effective Studio Hours RPC contract.
The existing Owner-only temporary configuration RPC is atomic; recurring edits still update one weekday under Owner RLS and do not yet have a bulk atomic mutation.
Resolver source, open state, IDs, and exception type support future source/status presentation, while temporary date metadata supplies upcoming, active, expired, and recurring-resume context.

## Approved model discrepancy

The approved `.model/piercing-corner-configure-hours.html` remains the interaction reference for future Configure Hours work.
Its labels, selected working days, open/closed states, date fields, and schedule summaries are compatible with the persisted seven-day representation.
Its browser-only state, current-week date limits, statements that recurring hours expire after the week, and current-week reset behavior conflict with the finalized plan and were not copied.
The persistence layer supports independent inclusive temporary date ranges and indefinite recurring defaults; recurrence controls, date pickers, badges, summaries, editing actions, validation presentation, and responsive behavior remain Phase 4 UI concerns.

## Boundary

Calendar intentionally retains the approved artifact's Owner-only placeholder.
Scheduling does not add appointments, public booking, service duration, split shifts, or a calendar grid.
