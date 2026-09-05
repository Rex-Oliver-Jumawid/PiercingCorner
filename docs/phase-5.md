# Phase 5 — Durable waiver signing and PDF

**Status: complete.**

Phase 5 completes the latest approved v5 service-sale path:

```text
Record Sale → prepared waiver → accepted signature → PDF/Storage → payment → completed
```

## Signing contract

- PostgreSQL prepares an RPC-only signing event against the current immutable
  waiver template. An unsigned event expires after a fixed 30 minutes.
- Publishing a newer template does not invalidate wording already presented to
  a client. Acceptance remains bound to the pinned template.
- Acceptance atomically creates or binds the Pending service transaction and
  records `signed_at` with `clock_timestamp()`. The accepted event does not
  expire while document persistence or payment continues.
- Client, catalog names/prices, transaction reference, template and signing time
  are server-owned facts. Browser code supplies only client input, catalog IDs,
  the drawn PNG and the resulting PDF.
- Final waiver rows are immutable and use the signing-event ID. Ordinary direct
  waiver insertion is denied.

## Documents and recovery

Signature PNGs and waiver PDFs use the private `waiver-documents` bucket:

```text
transactions/<transaction-id>/waivers/<event-id>/signature.png
transactions/<transaction-id>/waivers/<event-id>/waiver.pdf
```

The checked finalization RPC verifies both objects, deterministic paths, MIME
types and uploader before recording the waiver. Referenced objects cannot be
updated or deleted. Uploaders can remove only their unreferenced artifacts.

The generated A4 PDF contains Piercing Corner letterhead, the transaction and
client snapshots, exact pinned wording/version, drawn signature, and the
server-authoritative signing time. Long wording wraps by measured font width and
continues onto additional pages before the intact signature block.

The happy path moves directly from successful waiver persistence to the
separate payment modal. If the flow is left after acceptance, the underlying
transaction remains Pending. An uploaded signature can be recovered after a
reload to regenerate/finalize its PDF; otherwise the old event is retained for
audit and a new signature is required. Signed Pending/Ongoing transactions can
resume payment from Dashboard without signing again.

## Boundaries

Typed signatures, guardian/minor consent, identity verification, public links,
email delivery, piercer/station assignment, split payments, refunds and legal
template administration remain outside Phase 5.

## Phase 6 continuation

Phase 6 now projects completed waiver-backed and product-only transactions into
the Owner Sales, Overview, and Reports pages. It adds immutable completion and
client snapshot facts without changing the Phase 5 signing or payment order.
