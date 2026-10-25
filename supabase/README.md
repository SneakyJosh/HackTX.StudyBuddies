# Supabase — StudySync backend

Schema and catalog seed live in `migrations/0001_studysync.sql`.
That file is for review. Do not apply it to a live database without approval.

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

An active check-in is one open row whose `expires_at` is still in the future.
That rule is enforced with a transaction advisory lock. There is no partial
unique index on open check-ins.

Pending and accepted study requests have one row per unordered pair, using
`least` / `greatest` of the two user ids.

Trigger functions stay executable by `authenticated` because PostgreSQL checks
`EXECUTE` when a trigger fires. PostgREST does not expose functions that
return `trigger`.
