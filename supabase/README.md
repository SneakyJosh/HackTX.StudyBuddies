# Supabase — StudySync backend

## Status

Milestone 1 (B1) schema is **written but not deployed**. Do not apply these
migrations to a live Supabase project without the project owner's approval
(TASKS.md checkpoint C3 reviews migrations and RLS first).

## Layout

- `migrations/20261024120000_studysync_milestone1.sql` — universities,
  locations, courses, profiles, profile_courses, checkins, study_requests,
  blocks, and reports; contract checks, partial unique indexes, triggers for
  cross-university/enrollment/transition invariants, RLS, grants, and the
  fictional UT Austin catalog seed (ids frozen by `docs/API_CONTRACT.md`).
- `migrations/20261024130000_security_hardening.sql` — security-review fixes:
  role-checked request transitions in the database (only the recipient may
  accept/decline, only the sender may cancel), requests must be created as
  `pending`, blocks cancel pending requests in both directions and block new
  ones, check-ins are immutable except checkout with one active check-in per
  user enforced by an advisory lock + server-owned timestamps + partial
  unique index, enrollments cannot be UPDATE-ed, request/report history is
  `ON DELETE RESTRICT`, and trigger functions lose public EXECUTE with a
  fixed `search_path`.
- `seed.sql` — the same public catalog rows for local `supabase db reset`.
  No student records or auth users are seeded.
- `tests/security_checks.sql` — read-only catalog assertions to run after
  applying the migrations on a scratch/local project (RLS enabled, no
  anon/public policies, history FKs are RESTRICT, triggers/indexes present).

## Local use only (after approval / on a scratch project)

```bash
supabase db reset   # local stack only: applies migrations, then seed.sql
```

## RLS model

Route handlers authenticate the caller from the Supabase session cookie and
query with that user's client, so RLS is the second line of defence:

- Catalog tables: readable by any signed-in user (works before onboarding);
  inactive locations are hidden; no client writes.
- `profiles` / `profile_courses` / `checkins`: owner-only direct access.
  Other users are only ever seen through server routes (discovery, requests)
  that check the session and select the contract's public fields.
- `study_requests`: readable by the two participants, insertable only as
  the sender and only as `pending`; mutations are role-checked by a DB
  trigger (recipient accepts/declines, sender cancels), so the rule holds
  even for direct PostgREST calls that bypass the API.
- `blocks`: readable/writable only by the blocker. Inserting a block
  cancels every pending request between the pair (either direction) and
  the database rejects new requests between a blocked pair.
- `reports`: insert-only for the reporter; ordinary users cannot read them.

## Privileged reads for discovery / counterparts

Profiles, check-ins, and blocks stay owner-only, so no policy was loosened
for discovery. Instead, server route handlers will:

1. Authenticate the caller from the session cookie
   (`requireAuthenticatedUser` in `src/server/auth.ts`).
2. Only then use the service-role client from `src/server/admin.ts`
   (server-only; fails closed without `SUPABASE_SERVICE_ROLE_KEY`, which is
   never `NEXT_PUBLIC_*` and never logged).
3. Read through narrow helpers such as `fetchCounterpartSummaries` in
   `src/server/public-profiles.ts`, which select explicit public columns,
   cap and UUID-validate id lists, and map rows onto contract types so
   private fields (email, preferences, enrollments, visibility) cannot
   leak. Entitlement (who may see whom) remains the route handler's job.

The Milestone 1 catalog routes do not use the privileged client; they run
as the signed-in user.

## Account deletion and history

`study_requests` and `reports` reference profiles with
`ON DELETE RESTRICT`. Deleting one student's account can therefore no
longer cascade-delete another student's request history or erase reports.
The trade-off is deliberate: an account with such history cannot be
deleted until an administrator removes or anonymizes that history through
a controlled process.

## Check-in replacement flow (for B3)

The database guarantees one active check-in per user: before-insert logic
takes a per-user advisory lock, closes expired open rows, rejects a second
active check-in, and re-anchors the client-supplied duration at database
time. The check-in route should end any active check-in (checkout) in the
same transaction before inserting the replacement, and must expect a
`23514` violation to map to a contract error if it races.
