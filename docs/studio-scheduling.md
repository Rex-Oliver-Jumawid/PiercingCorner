# Studio scheduling and resource administration

**Status: complete.**

The Owner-only Studio page implements the approved artifact's configuration
model: standard Studio Hours, piercer profiles, service qualifications,
transaction catalogs, recurring piercer availability, and dated closures or
reduced-hours exceptions. Station administration is Owner-only under Settings.
Piercer remains a Studio-domain profile and is not an application access role.

Settings also provides the persisted singleton Business Profile, append-only
waiver-template administration, and read-only account visibility. Secure staff
account mutation and notification delivery infrastructure remain deferred.

## Scheduling rules

- Weekly Studio Hours use Manila local time. Monday through Saturday initially
  open from 10:00 AM to 8:00 PM; Sunday initially closes.
- Piercer availability has at most one recurring interval per weekday and must
  remain within that day's Studio Hours. A missing interval means unavailable.
- Shortening or closing Studio Hours is rejected while conflicting piercer
  availability exists, preserving the saved schedule.
- A dated all-day closure makes every piercer unavailable. Reduced hours narrow
  the normal operating window and must remain within it.
- A piercer must be active, currently available, and qualified for every
  selected active service before a new signed service transaction is created.
- The live schedule is checked once when the signed Pending transaction is
  established. Later waiver/payment recovery is not blocked after hours.
- New service lines on an assigned open transaction require a current
  qualification. Existing lines remain completable after configuration changes.

No qualifications, piercer availability, or dated exceptions are invented for
existing data. Owners must configure these before new service transactions can
assign a piercer. Product-only transactions are unaffected.

## Boundary

Calendar intentionally retains the approved artifact's Owner-only placeholder.
This phase does not add appointments, public booking, service duration, split
shifts, or a calendar grid. Persisted scheduling rules and the checked current-
assignment projection provide the foundation for a later Calendar phase.
