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
- `seed.sql` — the same public catalog rows for local `supabase db reset`.
  No student records or auth users are seeded.

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
- `study_requests`: readable/updatable only by the two participants,
  insertable only as the sender; DB trigger allows only
  `pending -> accepted|declined|cancelled` and keeps participants immutable.
- `blocks`: readable/writable only by the blocker.
- `reports`: insert-only for the reporter; ordinary users cannot read them.

The service-role key stays server-only and is never used by the Milestone 1
catalog routes; they run as the signed-in user.
