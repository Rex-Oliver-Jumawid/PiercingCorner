# Studio scheduling and resource administration

**Scheduling status: Phase 7 Effective Piercer Availability Resolver implemented.**

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
The Owner can configure the complete recurring week from one Configure Hours dialog or continue to edit one recurring weekday at a time.
The bulk workflow selects working days plus one opening and closing interval, saves selected days open and unselected days explicitly closed, and commits all seven rows atomically through `configure_recurring_studio_hours(jsonb)`.
If any weekday conflicts with Recurring Piercer Availability, PostgreSQL rolls back the complete configuration and the UI directs the Owner to update the conflicting piercer schedule first.
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
The Configure Hours dialog exposes Temporary mode with inclusive start/end dates, working days, and one opening and closing interval.
It uses the existing atomic RPC for both creation and explicit `Edit temporary schedule` replacement.
Temporary configuration never mutates Recurring Studio Hours, and the UI explains the date on which the recurring schedule resumes.
Phase 4 does not add an end or delete action; Temporary Studio Schedules stop applying through their inclusive date range and expired records remain stored.

### Recurring Piercer Availability

`piercer_availability` is the current recurring weekly Piercer Availability source of truth.
It permits at most one row for a piercer and ISO weekday, repeats every week until changed, and supports explicit `studio` and `custom` modes.
A missing row continues to mean unavailable for that weekday.

**Same as Studio Hours** (`mode = studio`) stores null `starts_at` and `ends_at` values and dynamically follows that date's Effective Studio Hours.
A Temporary Studio Schedule therefore changes this piercer's operational window without rewriting Recurring Piercer Availability, and a Studio closure makes the piercer unavailable.
**Custom Hours** (`mode = custom`) stores one explicit increasing interval.
The database requires it to fit within that weekday's open Recurring Studio Hours, while assignment additionally intersects it with Effective Studio Hours for the target date.
The database rejects shortening or closing a recurring Studio Hours row only when a saved Custom Hours interval would conflict; Studio-mode rows follow the changed Studio window and do not block the edit.

The Owner currently edits one weekday and piercer at a time from Studio.
That editor can mark the weekday unavailable by deleting the row, select Same as Studio Hours, or select Custom Hours and enter explicit times.
The full Configure Piercer Schedule workflow remains deferred.
No qualifications, recurring availability, or Studio Exceptions are invented for existing data.

### Temporary Piercer Schedule persistence

`piercer_temporary_schedules` stores independent inclusive start and end dates for one piercer's date-bounded override.
`piercer_temporary_availability` stores exactly seven explicit ISO weekday states for every schedule created through the atomic configuration RPC.
An unavailable day stores `is_available = false` with null mode and times; Same as Studio Hours stores `is_available = true`, `mode = studio`, and null times; Custom Hours stores `is_available = true`, `mode = custom`, and one explicit increasing interval.
Temporary Custom Hours receive structural interval validation at persistence time and are intersected with Effective Studio Hours by the canonical Effective Piercer Availability resolver at runtime.

The database rejects incomplete or duplicate weekday payloads, reversed date ranges, malformed state/time combinations, and overlapping inclusive date ranges for the same piercer.
Different piercers may have Temporary Piercer Schedules for the same dates.
The Owner-only `configure_temporary_piercer_schedule(...)` RPC atomically creates a complete schedule or replaces the metadata and all seven states of an existing schedule belonging to the same piercer.
Direct browser writes are not granted, so clients cannot persist a partial schedule or use replacement to target another piercer.

Temporary schedules never update or delete `piercer_availability` or change its recurring `studio`/`custom` values and times.
Expired schedules remain stored and cease to be relevant through their inclusive date bounds; there is no reset, cleanup job, or cron task.
This preserves Recurring Piercer Availability as the automatic fallback after the configured range.

Temporary Piercer schedules now affect operational assignment through the canonical database resolver and existing checked assignment call chain.
The existing individual editor continues to edit Recurring Piercer Availability only, and the full Configure Piercer Schedule UI remains deferred to Phase 8.

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

### Effective Piercer Availability

`get_effective_piercer_availability(target_piercer_profile_id uuid, target_date date)` is the canonical database resolver for one piercer and one Manila business date.
It selects `Temporary Piercer Schedule > Recurring Piercer Availability`, then intersects that selected state with `get_effective_studio_hours(target_date)`.
The result contains the piercer and date, ISO weekday, effective availability flag and interval, selected mode, source (`recurring` or `temporary`), applicable Temporary Piercer Schedule ID, and Effective Studio Hours source/identifiers for future presentation.
The resolver is stable, read-only, and internal: browser roles cannot execute it directly in Phase 7.

Unavailable returns `is_available = false` with null effective times.
This includes an explicit temporary Unavailable state, a missing recurring weekday row, a closed Studio, a malformed selected state, or a Custom interval with no overlap.
Temporary Unavailable completely overrides recurring availability and never falls back.
Same as Studio Hours (`mode = studio`) dynamically returns the Effective Studio Hours interval when the Studio is open.
Custom Hours (`mode = custom`) return `greatest(studio_opens_at, piercer_starts_at)` through `least(studio_closes_at, piercer_ends_at)` only when that interval is non-empty.
Structurally valid Custom Hours outside the Studio window remain persisted but resolve unavailable for that date.

Temporary ranges use inclusive dates.
Before their start and after their end, the recurring weekday row resumes automatically; expired schedules need no cleanup.
If a covering Temporary Piercer Schedule is structurally corrupted and lacks the required weekday child row, its `temporary` source and schedule ID remain selected but the result fails closed with no effective interval.
The resolver never merges with or exposes the recurring row in that case and never mutates recurring or temporary persistence.
Timestamp callers derive `target_date` and the checked local time in `Asia/Manila`.

### Current assignment and transaction behavior

`get_assignable_piercers(uuid[])` and `piercer_is_assignable(...)` evaluate the PostgreSQL server clock in `Asia/Manila`.
The checked RPC remains thin and delegates to `piercer_is_assignable`, which converts the timestamp to a Manila date/time and consumes `get_effective_piercer_availability`.
It requires the local time to be within the returned effective interval, with opening inclusive and closing exclusive.
Active-profile status, selected active-service validation, and qualification for every selected service remain separate assignment checks outside the scheduling resolver.
The runtime window is therefore `Effective Studio Hours INTERSECT selected Piercer Availability`, where temporary fully overrides recurring; neither Studio nor piercer resolution rewrites stored schedule rows.
The underlying security-definer predicate is not directly executable by browser roles.
`accept_new_service_waiver(...)` repeats this check immediately before it creates a signed Pending service transaction, so it inherits Temporary Piercer Availability without duplicate scheduling logic.
The live scheduling check happens when that signed service transaction is established.
Later waiver or payment recovery for the persisted transaction is not blocked after hours.
New service lines on an already assigned open transaction still require a current qualification, while historical and unchanged open lines remain completable.
Product-only transactions do not require a piercer and are unaffected by Studio or piercer availability.
Dashboard continues through `get_assignable_piercers(...)`; no React scheduling resolver was added.

### Permissions, frontend data flow, and readiness

Studio is an Owner-only route, and RLS limits scheduling mutations to Owners.
Active Staff accounts may consume the checked assignable-piercer result in Dashboard but cannot mutate Studio configuration.
`studioService.ts` loads configuration and today's `get_effective_studio_hours` result, and writes individual recurring hours, atomic recurring configurations, atomic temporary configurations, availability, and exceptions.
`studioQueries.ts` invalidates the authenticated Studio scope plus Dashboard and Settings queries after a Studio configuration mutation.
`StudioConfiguration.tsx` presents the existing individual editors, and `StudioPage.tsx` composes the Owner-only workspace.
Owner Overview currently treats recurring Studio Hours as ready only when all seven `studio_hours` rows exist and at least one is open.
It separately reports an intentionally all-closed week and does not describe today's operational state.

Successful recurring and temporary configuration mutations use the existing authenticated Studio configuration query scope, which invalidates and refetches Studio configuration plus the existing Dashboard and Settings dependent scopes.
Dashboard assignment and waiver acceptance respect temporary hours through the canonical backend call chain; no Dashboard, waiver, or Settings presentation changed.

### Configure Studio Hours workflow and UI states

`Configure hours` opens one Owner dialog with explicit `Recurring` and `Temporary` choices.
Recurring means “Repeats every week until changed.” and has no date fields.
Temporary means “Overrides recurring Studio Hours only for the selected dates.” and requires an inclusive valid date range.
Both modes submit a complete seven-day schedule; open days receive the chosen interval and closed days receive null times.
The dialog keeps persisted schedule data as TanStack Query server state and uses local state only for unsaved form values.
It disables the complete form while saving, shows translated validation and persistence errors, and displays the refetched server result after success.

The Studio Hours panel shows the backend-resolved source and window for today's Manila business date.
React displays the returned `recurring`, `temporary`, or `exception` result and does not reproduce scheduling precedence.
The panel separately identifies the active Temporary Studio Schedule, its inclusive range, and its recurring-resume date; future non-overlapping schedules are listed as upcoming, while expired schedules remain persisted but are not presented as active.
An explicit temporary edit action opens the same dialog with the selected schedule and cannot switch into a recurring mutation.
The daily rows remain labeled as recurring, and their individual edit actions only change that recurring weekday.

## Target Scheduling Model

Studio precedence, recurring Piercer modes, Temporary Piercer persistence, and the canonical Effective Piercer Availability resolver are implemented.
The bulk Configure Piercer Schedule interface remains planned for Phase 8.

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
`piercer_availability` is its source of truth and stores at most one `studio` or `custom` row per piercer and weekday; no row means unavailable.

**Temporary Piercer Schedule** is a date-bounded override of Recurring Piercer Availability.
It must never overwrite or replace Recurring Piercer Availability.
When its date range ends, Recurring Piercer Availability must resume through date evaluation.

Effective Piercer Availability resolves with this precedence:

```text
Temporary Piercer Schedule > Recurring Piercer Availability
```

**Same as Studio Hours** means a piercer dynamically follows Effective Studio Hours.
Persistence represents this as `mode = studio` with null explicit times rather than permanently copying Studio times into piercer rows.
Changes to Recurring Studio Hours, a Temporary Studio Schedule, or a Studio Exception must therefore be reflected dynamically for this mode.

**Custom Hours** means a piercer has explicitly configured availability times.
Custom Hours remain constrained by Effective Studio Hours when the assignable interval is calculated.

The actual working window is derived as:

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
| Bulk recurring Studio Hours configuration | Supported | Configure Hours saves all seven selected/open and unselected/closed rows through one Owner-only atomic RPC. |
| Temporary Studio Schedule | Supported | The production Configure Hours dialog creates and explicitly edits date-bounded schedules through the existing atomic mutation. |
| Studio Exception precedence | Supported | Exceptions override temporary and recurring hours; reduced exceptions validate against the base resolver. |
| Effective Studio Hours resolution | Supported | `get_effective_studio_hours` returns the canonical interval and source and is consumed by assignment. |
| Recurring Piercer Availability | Supported | `piercer_availability` persists one weekly `studio` or `custom` row per piercer and weekday; absence means unavailable. |
| Same as Studio Hours piercer mode | Supported | Null-time `studio` rows dynamically use Effective Studio Hours during assignment. |
| Custom Hours piercer mode | Supported | Explicit weekly intervals remain constrained by Recurring Studio Hours at configuration and Effective Studio Hours at assignment. |
| Temporary Piercer Schedule | Operationally supported | Independent inclusive ranges and seven explicit states are stored through one atomic Owner RPC and override recurring availability during resolution; UI is deferred. |
| Effective Piercer Availability resolution | Supported | The internal resolver returns the selected source/mode and final Studio-intersected interval, including fail-closed corrupted-temporary behavior. |
| Studio/piercer schedule intersection | Supported | One database resolver consumes Effective Studio Hours and intersects it with the selected temporary-or-recurring Piercer state. |
| Assignable-piercer integration | Supported | Dashboard and waiver acceptance inherit Effective Piercer Availability through `piercer_is_assignable`. |
| Overview readiness integration | Partially supported | Overview counts recurring `studio_hours` rows and open days, but cannot distinguish a configured schedule from today's temporary or exception-driven state. |
| Owner permissions | Already supported | The Studio route is Owner-only and scheduling table mutations have Owner-only RLS policies. |
| Staff operational consumption | Already supported | Active Staff can call the checked assignable-piercer RPC for Dashboard without configuration mutation rights. |
| Manila timezone support | Already supported | Database assignment and Overview day boundaries explicitly use `Asia/Manila`. |

## Deferred implementation

Phase 7 does not add the full Configure Piercer Schedule UI, Overview effective-state integration, later full lifecycle E2E coverage, or a Temporary Studio deletion/end workflow.
Historical transaction recovery and product-only behavior remain unchanged.
`validate_piercer_availability` and `prevent_conflicting_studio_hours` enforce permanent recurring configuration relationships only for Custom Hours; Studio-mode rows have no explicit interval to validate or conflict.

Phase 4 consumes `StudioConfiguration.recurringHours`, `StudioConfiguration.temporarySchedules`, and the generated Effective Studio Hours RPC contract.
The recurring and temporary bulk operations are separate atomic Owner-only RPCs; the older per-day recurring update remains available for maintenance.
Resolver source, open state, IDs, and exception type drive today's presentation, while temporary date metadata supplies upcoming, active, expired, and recurring-resume context.
`StudioConfiguration.temporaryPiercerSchedules` loads temporary piercer metadata and its seven child states separately from recurring `availability`; no service-layer merge or effective schedule derivation occurs.

## Approved model discrepancy

The approved `.model/piercing-corner-configure-hours.html` remains the interaction reference for future Configure Hours work.
Its labels, selected working days, open/closed states, date fields, and schedule summaries are compatible with the persisted seven-day representation.
Its browser-only state, current-week date limits, statements that recurring hours expire after the week, and current-week reset behavior conflict with the finalized plan and were not copied.
The production UI keeps the model's useful date pickers, badges, summaries, working-day controls, editing actions, validation presentation, and responsive layout while applying the finalized persistence semantics.

## Boundary

Calendar intentionally retains the approved artifact's Owner-only placeholder.
Scheduling does not add appointments, public booking, service duration, split shifts, or a calendar grid.
