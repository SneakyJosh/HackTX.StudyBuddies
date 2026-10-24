-- StudySync security hardening (follow-up to 20261024120000, review fixes).
--
-- Target: Supabase Postgres. DO NOT apply to a live Supabase project without
-- the project owner's approval. This migration has not been deployed anywhere;
-- it is additive so databases that already ran the first migration can move
-- forward, and fresh installs simply run both in order.
--
-- Fixes:
--  1. Request status transitions are role-checked in the database: only the
--     recipient may accept/decline, only the sender may cancel (a block may
--     also cancel, see 2). Requests must be inserted as `pending`.
--  2. Inserting a block cancels every pending request between the pair.
--     New requests between a blocked pair (either direction) are rejected.
--  3. Check-ins are immutable after creation except checkout; profile
--     course rows cannot be UPDATE-ed at all (replace = delete + insert);
--     a profile cannot change university while enrollments exist or a
--     check-in is active.
--  4. One active check-in per user: per-user advisory lock, expired open
--     rows are closed by the database, the server owns started_at /
--     expires_at (the client-supplied duration is preserved), and a partial
--     unique index is the backstop.
--  5. Deleting a profile/account can no longer cascade-delete another
--     student's study_requests or reports history (ON DELETE RESTRICT).
--  6. Trigger functions get a fixed search_path and lose public EXECUTE.

-- ---------------------------------------------------------------------------
-- 5 (first, so nothing below can recreate cascade behaviour): history FKs
-- ---------------------------------------------------------------------------

alter table public.study_requests
  drop constraint study_requests_sender_id_fkey,
  add constraint study_requests_sender_id_fkey
    foreign key (sender_id) references public.profiles (id) on delete restrict,
  drop constraint study_requests_recipient_id_fkey,
  add constraint study_requests_recipient_id_fkey
    foreign key (recipient_id) references public.profiles (id) on delete restrict;

alter table public.reports
  drop constraint reports_reporter_id_fkey,
  add constraint reports_reporter_id_fkey
    foreign key (reporter_id) references public.profiles (id) on delete restrict,
  drop constraint reports_reported_id_fkey,
  add constraint reports_reported_id_fkey
    foreign key (reported_id) references public.profiles (id) on delete restrict;

-- Consequence (intentional): an auth account whose profile participates in
-- requests or reports cannot be deleted until an administrator removes or
-- anonymizes that history through a controlled, audited process. One
-- student's delete can no longer erase another student's history.

-- ---------------------------------------------------------------------------
-- 1. Request lifecycle: role-checked transitions, pending-only inserts
-- ---------------------------------------------------------------------------

create or replace function public.enforce_request_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  block_cancellation boolean :=
    coalesce(pg_catalog.current_setting('studysync.allow_block_cancellation', true), '') = 'on';
begin
  if new.id is distinct from old.id
     or new.sender_id is distinct from old.sender_id
     or new.recipient_id is distinct from old.recipient_id
     or new.created_at is distinct from old.created_at then
    raise exception 'request identity fields are immutable' using errcode = '23514';
  end if;

  if old.status <> 'pending' then
    raise exception 'only a pending request may change status' using errcode = '23514';
  end if;

  if new.status not in ('accepted', 'declined', 'cancelled') then
    raise exception 'a pending request may only move to a terminal status'
      using errcode = '23514';
  end if;

  -- Direct (authenticated) callers are role-checked here, not only in the
  -- API. A null auth.uid() means a trusted server-side caller (service role
  -- or a SECURITY DEFINER trigger below); route handlers still enforce the
  -- same rules and return 403/409 per the contract.
  if actor is not null then
    if new.status in ('accepted', 'declined') and actor <> old.recipient_id then
      raise exception 'only the recipient may accept or decline a request'
        using errcode = '42501';
    end if;
    if new.status = 'cancelled'
       and actor <> old.sender_id
       and not block_cancellation then
      raise exception 'only the sender may cancel a request'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.enforce_request_insert_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status <> 'pending' then
    raise exception 'a request must be created as pending' using errcode = '23514';
  end if;

  if exists (
    select 1 from public.blocks
    where (blocker_id = new.sender_id and blocked_id = new.recipient_id)
       or (blocker_id = new.recipient_id and blocked_id = new.sender_id)
  ) then
    raise exception 'a blocked pair cannot open a request' using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger study_requests_enforce_insert_rules
  before insert on public.study_requests
  for each row execute function public.enforce_request_insert_rules();

-- Tighten the UPDATE policy so RLS itself only exposes pending rows for
-- mutation (the trigger above enforces who may perform which transition).
drop policy "study_requests_update_participant" on public.study_requests;
create policy "study_requests_update_participant"
  on public.study_requests for update to authenticated
  using (
    status = 'pending'
    and (sender_id = auth.uid() or recipient_id = auth.uid())
  )
  with check (sender_id = auth.uid() or recipient_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 2. Blocking cancels pending requests in both directions
-- ---------------------------------------------------------------------------

create or replace function public.cancel_pending_requests_on_block()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- SECURITY DEFINER so cancellation succeeds regardless of which
  -- participant created the block; the transaction-local flag tells the
  -- transition trigger this cancellation is block-driven (the blocker may
  -- be the recipient, who may not cancel via the request API).
  perform pg_catalog.set_config('studysync.allow_block_cancellation', 'on', true);

  update public.study_requests
  set status = 'cancelled'
  where status = 'pending'
    and (
      (sender_id = new.blocker_id and recipient_id = new.blocked_id)
      or (sender_id = new.blocked_id and recipient_id = new.blocker_id)
    );

  return new;
end;
$$;

create trigger blocks_cancel_pending_requests
  after insert on public.blocks
  for each row execute function public.cancel_pending_requests_on_block();

-- ---------------------------------------------------------------------------
-- 3. Check-ins immutable except checkout; enrollments cannot be updated
-- ---------------------------------------------------------------------------

-- One function now guards both INSERT and UPDATE of check-ins (see 4 for
-- the insert-side active-check-in and server-timestamp logic).
create or replace function public.enforce_checkin_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  profile_university uuid;
  location_university uuid;
  course_university uuid;
  intended_duration interval;
  server_now timestamptz := pg_catalog.clock_timestamp();
begin
  if tg_op = 'UPDATE' then
    -- Only checkout may change a check-in. Everything study-relevant is
    -- fixed at creation; "replace" flows end the old row and insert anew.
    if new.id is distinct from old.id
       or new.user_id is distinct from old.user_id
       or new.location_id is distinct from old.location_id
       or new.course_id is distinct from old.course_id
       or new.availability is distinct from old.availability
       or new.study_style is distinct from old.study_style
       or new.started_at is distinct from old.started_at
       or new.expires_at is distinct from old.expires_at then
      raise exception 'a check-in may only be checked out after creation'
        using errcode = '23514';
    end if;
    if old.checked_out_at is not null then
      raise exception 'a checked-out check-in cannot change' using errcode = '23514';
    end if;
    return new;
  end if;

  -- INSERT: serialize per user so the one-active-check-in rule is exact
  -- under concurrency (the partial unique index below is the backstop).
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.user_id::text, 0)
  );

  -- Expired-but-never-checked-out rows are closed by the database, so a
  -- student can always check in again after expiry.
  update public.checkins
  set checked_out_at = expires_at
  where user_id = new.user_id
    and checked_out_at is null
    and expires_at <= server_now;

  if exists (
    select 1 from public.checkins
    where user_id = new.user_id
      and checked_out_at is null
      and expires_at > server_now
  ) then
    raise exception 'the student already has an active check-in'
      using errcode = '23514';
  end if;

  -- The server owns the timestamps: keep the caller's intended duration,
  -- but anchor it at database time so clients cannot backdate a check-in
  -- or stretch it by choosing their own started_at.
  intended_duration := new.expires_at - new.started_at;
  if intended_duration < interval '30 minutes'
     or intended_duration > interval '180 minutes' then
    raise exception 'check-in duration must be between 30 and 180 minutes'
      using errcode = '23514';
  end if;
  new.started_at := server_now;
  new.expires_at := server_now + intended_duration;

  select university_id into profile_university
  from public.profiles where id = new.user_id;
  if profile_university is null then
    raise exception 'profile % does not exist', new.user_id using errcode = '23503';
  end if;

  select university_id into location_university
  from public.locations where id = new.location_id;
  if location_university is null or location_university <> profile_university then
    raise exception 'location does not belong to the profile university'
      using errcode = '23514';
  end if;

  select university_id into course_university
  from public.courses where id = new.course_id;
  if course_university is null or course_university <> profile_university then
    raise exception 'course does not belong to the profile university'
      using errcode = '23514';
  end if;

  if not exists (
    select 1 from public.profile_courses
    where user_id = new.user_id and course_id = new.course_id
  ) then
    raise exception 'course is not on the caller profile' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger checkins_enforce_rules on public.checkins;
create trigger checkins_enforce_rules
  before insert or update on public.checkins
  for each row execute function public.enforce_checkin_rules();

-- 4 (index): close stale open rows first so the index can be created, then
-- guarantee at most one not-checked-out check-in per user at all times.
update public.checkins
set checked_out_at = expires_at
where checked_out_at is null and expires_at <= now();

create unique index checkins_one_open_per_user_idx
  on public.checkins (user_id)
  where checked_out_at is null;

-- Check-out is an UPDATE, never a DELETE: an owner could otherwise erase
-- a check-in (and quietly rewrite their history) instead of checking out.
drop policy if exists "checkins_delete_own" on public.checkins;
revoke delete on public.checkins from authenticated;

-- Enrollments: rows are replaced by delete + insert, never updated. The
-- policy and grant are removed and a trigger blocks updates even for
-- privileged callers, so the insert-time university/8-course rules (first
-- migration) cannot be sidestepped by mutating an existing row.
drop policy if exists "profile_courses_update_own" on public.profile_courses;
revoke update on public.profile_courses from authenticated;

create or replace function public.prevent_profile_course_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'profile courses are replaced by deleting and inserting rows'
    using errcode = '23514';
end;
$$;

create trigger profile_courses_prevent_update
  before update on public.profile_courses
  for each row execute function public.prevent_profile_course_update();

-- A profile cannot drift away from its enrollments/check-ins by changing
-- university directly. The profile write path must delete enrollments in
-- the same transaction before changing university (and may not change it
-- at all while a check-in is active, per the contract's 409 rule).
create or replace function public.enforce_profile_university_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.university_id is distinct from old.university_id then
    if exists (
      select 1 from public.checkins
      where user_id = new.id
        and checked_out_at is null
        and expires_at > pg_catalog.clock_timestamp()
    ) then
      raise exception 'cannot change university while a check-in is active'
        using errcode = '23514';
    end if;
    if exists (select 1 from public.profile_courses where user_id = new.id) then
      raise exception 'remove course enrollments before changing university'
        using errcode = '23514';
    end if;
  end if;
  if new.id is distinct from old.id then
    raise exception 'profile id is immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger profiles_enforce_university_change
  before update on public.profiles
  for each row execute function public.enforce_profile_university_change();

-- ---------------------------------------------------------------------------
-- 6. Function hardening: fixed search_path, no public EXECUTE on triggers
-- ---------------------------------------------------------------------------

alter function public.set_updated_at() set search_path = '';
alter function public.enforce_profile_course_rules() set search_path = '';

revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.enforce_profile_course_rules() from public, anon, authenticated;
revoke all on function public.enforce_checkin_rules() from public, anon, authenticated;
revoke all on function public.enforce_request_transition() from public, anon, authenticated;
revoke all on function public.enforce_request_insert_rules() from public, anon, authenticated;
revoke all on function public.cancel_pending_requests_on_block() from public, anon, authenticated;
revoke all on function public.prevent_profile_course_update() from public, anon, authenticated;
revoke all on function public.enforce_profile_university_change() from public, anon, authenticated;
