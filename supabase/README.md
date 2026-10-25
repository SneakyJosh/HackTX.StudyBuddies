# Supabase — StudySync backend

Schema and catalog seed live in `migrations/0001_studysync.sql`, which has
been applied to the isolated studysync-dev project and is now frozen.
`migrations/0002_fix_pair_lock_least_greatest.sql` is an additive fix that
must be applied after it: 0001's request/block insert triggers compute
their pair lock with `pg_catalog.least/greatest(uuid, uuid)`, which does
not exist (PostgreSQL 42883 — least/greatest are parser expressions, not
catalog functions) and breaks `POST /api/requests` (and would break
`POST /api/blocks` identically). 0002 replaces just those two trigger
functions with the unqualified form; nothing else changes, and the
replacement was verified end-to-end on a scratch PostgreSQL (real 0001,
two profiles/check-ins: 42883 before, success after). Apply 0002 only
with explicit approval; do not edit 0001 to back-fix it.

`seed.sql` repeats the same public catalog rows so a local reset can load
them again. Both files seed only the demo university, three locations, and
three courses. There are no student rows, passwords, or coordinates.

## Access model

Route handlers create a cookie-bound Supabase client from the public URL and
anon key, then call `auth.getUser()`. The signed-in user id comes from that
session. Row level security applies to ordinary table access.

Profiles, profile courses, and check-ins are owner-only. Discovery, request
payloads, blocks, and reports use security-definer functions that run as the
caller (`auth.uid()`) and return only the fields the contract allows the
route to show. The service-role key is not read by application code.

Discovery is authorized entirely inside `discovery_candidates`: it
re-checks the caller, same-campus eligibility, visibility, an active
check-in, focused exclusion, and either-direction blocks, and it computes
the contract score in SQL so a candidate's preferred duration, group size,
and enrolled courses never leave Postgres — the function returns only
final public `DiscoveryMatch` fields. Direct table inserts into
`study_requests` face the same discoverability rules in
`enforce_request_insert_rules`, and request status transitions are
role-checked (recipient accepts/declines, sender cancels) with no
privileged-caller bypass.

`study_request_payload` is an internal helper only: it is not granted to
any client role, is called solely by `list_my_requests` and
`send_study_request` (both stay granted), and refuses blocked pairs, so a
block cuts off the counterpart's name and current building everywhere.

Deleting a profile cannot erase history: enrollments, check-ins, blocks,
requests, and reports all reference profiles with `ON DELETE RESTRICT`,
so account deletion with history requires a controlled admin process
instead of a silent cascade.

An active check-in is one open row whose `expires_at` is still in the future.
That rule is enforced with a transaction advisory lock. There is no partial
unique index on open check-ins.

Pending and accepted study requests have one row per unordered pair, using
`least` / `greatest` of the two user ids.

Trigger functions are not granted to any role. PostgreSQL does not
require the table-changing user to hold `EXECUTE` on a trigger function,
and PostgREST must never be able to invoke them as RPCs. Verify all of
the above on a scratch project after applying the migration (two signed-in
sessions, direct PostgREST attempts, and concurrent check-ins/requests);
none of it has been run against a live database yet.
