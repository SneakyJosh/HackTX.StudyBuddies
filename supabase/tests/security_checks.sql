-- StudySync post-migration security checks (read-only assertions).
--
-- HOW TO RUN: after BOTH migrations have been applied to a *scratch/local*
-- Supabase project (never run migrations on a live project without owner
-- approval), run this file in the SQL editor or with psql. Every check
-- raises an exception on failure; reaching the final `do` block means all
-- assertions passed. It reads only catalog metadata and changes nothing.

do $$
begin
  -- RLS is enabled on every application table.
  if exists (
    select 1
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in (
        'universities', 'locations', 'courses', 'profiles',
        'profile_courses', 'checkins', 'study_requests', 'blocks', 'reports'
      )
      and not c.relrowsecurity
  ) then
    raise exception 'RLS is disabled on at least one application table';
  end if;

  -- No policy grants anything to anon or public.
  if exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public'
      and (roles::text like '%anon%' or roles::text like '%public%')
  ) then
    raise exception 'a public-schema policy mentions anon/public roles';
  end if;

  -- Private tables have no broad SELECT policy: every select policy on
  -- profiles/checkins/blocks must be scoped (contain auth.uid()).
  if exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename in ('profiles', 'profile_courses', 'checkins', 'blocks')
      and cmd = 'SELECT'
      and qual not like '%auth.uid()%'
  ) then
    raise exception 'an unscoped SELECT policy exists on a private table';
  end if;

  -- Reports must not be readable by ordinary users.
  if exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'reports' and cmd = 'SELECT'
  ) then
    raise exception 'reports must not have a SELECT policy';
  end if;

  -- Enrollments cannot be updated (replace = delete + insert only).
  if exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'profile_courses' and cmd = 'UPDATE'
  ) then
    raise exception 'profile_courses must not have an UPDATE policy';
  end if;

  -- One open check-in per user + one pending/accepted request per pair.
  if not exists (
    select 1 from pg_catalog.pg_indexes
    where schemaname = 'public' and indexname = 'checkins_one_open_per_user_idx'
  ) then
    raise exception 'missing checkins_one_open_per_user_idx';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_indexes
    where schemaname = 'public'
      and indexname in (
        'study_requests_one_pending_per_pair_idx',
        'study_requests_one_accepted_per_pair_idx'
      )
    having count(*) = 2
  ) then
    raise exception 'missing per-pair partial unique indexes on study_requests';
  end if;

  -- Request/report history survives profile deletion (ON DELETE RESTRICT).
  if exists (
    select 1 from pg_catalog.pg_constraint
    where conname in (
        'study_requests_sender_id_fkey', 'study_requests_recipient_id_fkey',
        'reports_reporter_id_fkey', 'reports_reported_id_fkey'
      )
      and confdeltype <> 'r'
  ) then
    raise exception 'history foreign keys must be ON DELETE RESTRICT';
  end if;

  -- Security triggers are installed.
  if not exists (
    select 1 from pg_catalog.pg_trigger
    where tgname in (
        'study_requests_enforce_insert_rules',
        'blocks_cancel_pending_requests',
        'profile_courses_prevent_update',
        'profiles_enforce_university_change'
      )
    having count(*) = 4
  ) then
    raise exception 'missing one or more security triggers';
  end if;

  raise notice 'StudySync security checks passed';
end;
$$;
