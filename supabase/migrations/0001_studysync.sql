-- StudySync MVP schema, RLS, and catalog seed.
-- Review only. Do not apply to a live database without approval.
-- This is the single canonical migration for the MVP schema. (Earlier
-- draft migration files were consolidated into this one before any of
-- them was applied anywhere; there is no second migration to run.)
-- One active check-in (checked_out_at is null AND expires_at > server time)
-- is enforced by an advisory lock inside the check-in transaction.
-- Do not add a partial index: now() is not immutable, and
-- "checked_out_at is null" would also count expired rows as active.

create extension if not exists pgcrypto;

create table public.universities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique
);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities (id) on delete cascade,
  name text not null,
  building_code text not null,
  description text,
  is_active boolean not null default true,
  unique (university_id, building_code)
);

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities (id) on delete cascade,
  code text not null,
  title text not null,
  unique (university_id, code)
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  university_id uuid not null references public.universities (id) on delete restrict,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 40),
  major text check (major is null or char_length(btrim(major)) between 1 and 80),
  academic_year text check (
    academic_year is null
    or academic_year in ('freshman', 'sophomore', 'junior', 'senior', 'graduate', 'other')
  ),
  study_style text not null check (study_style in ('quiet', 'collaborative', 'flexible')),
  preferred_duration_minutes integer not null check (preferred_duration_minutes between 30 and 180),
  preferred_group_size integer not null check (preferred_group_size between 1 and 6),
  visible boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profile_courses (
  -- RESTRICT (not CASCADE): deleting a profile must not silently erase
  -- enrollment, check-in, block, request, or report history (see below).
  user_id uuid not null references public.profiles (id) on delete restrict,
  course_id uuid not null references public.courses (id) on delete restrict,
  primary key (user_id, course_id)
);

create table public.checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete restrict,
  location_id uuid not null references public.locations (id) on delete restrict,
  course_id uuid not null references public.courses (id) on delete restrict,
  availability text not null check (availability in ('available', 'questions_only', 'focused')),
  study_style text not null check (study_style in ('quiet', 'collaborative', 'flexible')),
  started_at timestamptz not null,
  expires_at timestamptz not null,
  checked_out_at timestamptz,
  check (expires_at >= started_at + interval '30 minutes'),
  check (expires_at <= started_at + interval '180 minutes'),
  check (checked_out_at is null or checked_out_at >= started_at)
);

create table public.study_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles (id) on delete restrict,
  recipient_id uuid not null references public.profiles (id) on delete restrict,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (sender_id <> recipient_id)
);

create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete restrict,
  blocked_id uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete restrict,
  reported_id uuid not null references public.profiles (id) on delete restrict,
  reason text not null check (reason in ('harassment', 'spam', 'other')),
  details text check (details is null or char_length(details) <= 500),
  created_at timestamptz not null default now(),
  check (reporter_id <> reported_id)
);

create index checkins_location_expires_idx on public.checkins (location_id, expires_at);
create index checkins_user_id_idx on public.checkins (user_id);
create index study_requests_sender_id_idx on public.study_requests (sender_id);
create index study_requests_recipient_id_idx on public.study_requests (recipient_id);

create unique index study_requests_one_pending_per_pair_idx
  on public.study_requests (least(sender_id, recipient_id), greatest(sender_id, recipient_id))
  where status = 'pending';

create unique index study_requests_one_accepted_per_pair_idx
  on public.study_requests (least(sender_id, recipient_id), greatest(sender_id, recipient_id))
  where status = 'accepted';

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $fn$
begin
  new.updated_at = pg_catalog.clock_timestamp();
  return new;
end;
$fn$;

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger study_requests_set_updated_at before update on public.study_requests
  for each row execute function public.set_updated_at();

create or replace function public.enforce_profile_course_rules()
returns trigger language plpgsql set search_path = '' as $fn$
declare
  profile_university uuid;
  course_university uuid;
  enrolled_count integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.user_id::text, 0));
  select university_id into profile_university from public.profiles where id = new.user_id;
  if profile_university is null then
    raise exception 'VALIDATION: profile is not completed' using errcode = '23514';
  end if;
  select university_id into course_university from public.courses where id = new.course_id;
  if course_university is null or course_university <> profile_university then
    raise exception 'VALIDATION: course does not belong to the profile university' using errcode = '23514';
  end if;
  select count(*) into enrolled_count from public.profile_courses where user_id = new.user_id;
  if enrolled_count >= 8 then
    raise exception 'VALIDATION: a profile may hold at most 8 courses' using errcode = '23514';
  end if;
  return new;
end;
$fn$;

create trigger profile_courses_enforce_rules before insert on public.profile_courses
  for each row execute function public.enforce_profile_course_rules();

create or replace function public.enforce_profile_course_count()
returns trigger language plpgsql set search_path = '' as $fn$
declare
  target_user uuid;
  enrolled_count integer;
begin
  if tg_table_name = 'profiles' then
    target_user := new.id;
  elsif tg_op = 'DELETE' then
    target_user := old.user_id;
  else
    target_user := new.user_id;
  end if;
  if target_user is null or not exists (select 1 from public.profiles where id = target_user) then
    return null;
  end if;
  select count(*) into enrolled_count from public.profile_courses where user_id = target_user;
  if enrolled_count < 1 or enrolled_count > 8 then
    raise exception 'VALIDATION: a profile must have between 1 and 8 courses' using errcode = '23514';
  end if;
  return null;
end;
$fn$;

create constraint trigger profiles_course_count_deferred
  after insert on public.profiles
  deferrable initially deferred
  for each row execute function public.enforce_profile_course_count();

create constraint trigger profile_courses_count_deferred
  after insert or delete on public.profile_courses
  deferrable initially deferred
  for each row execute function public.enforce_profile_course_count();

create or replace function public.prevent_profile_course_update()
returns trigger language plpgsql set search_path = '' as $fn$
begin
  raise exception 'VALIDATION: profile courses are replaced, not updated' using errcode = '23514';
end;
$fn$;

create trigger profile_courses_prevent_update before update on public.profile_courses
  for each row execute function public.prevent_profile_course_update();

create or replace function public.enforce_profile_university_change()
returns trigger language plpgsql set search_path = '' as $fn$
begin
  if new.id is distinct from old.id then
    raise exception 'VALIDATION: profile id is immutable' using errcode = '23514';
  end if;
  if new.university_id is distinct from old.university_id then
    if exists (
      select 1 from public.checkins
      where user_id = new.id and checked_out_at is null and expires_at > pg_catalog.clock_timestamp()
    ) then
      raise exception 'CONFLICT: university cannot change while a check-in is active' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.profile_courses where user_id = new.id) then
      raise exception 'VALIDATION: remove course enrollments before changing university' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$fn$;

create trigger profiles_enforce_university_change before update on public.profiles
  for each row execute function public.enforce_profile_university_change();

create or replace function public.enforce_checkin_rules()
returns trigger language plpgsql set search_path = '' as $fn$
declare
  profile_university uuid;
  profile_visible boolean;
  location_university uuid;
  course_university uuid;
  intended_duration interval;
  server_now timestamptz := pg_catalog.clock_timestamp();
begin
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
       or new.user_id is distinct from old.user_id
       or new.location_id is distinct from old.location_id
       or new.course_id is distinct from old.course_id
       or new.availability is distinct from old.availability
       or new.study_style is distinct from old.study_style
       or new.started_at is distinct from old.started_at
       or new.expires_at is distinct from old.expires_at then
      raise exception 'VALIDATION: a check-in may only be checked out' using errcode = '23514';
    end if;
    if old.checked_out_at is not null then
      raise exception 'VALIDATION: a checked-out check-in cannot change' using errcode = '23514';
    end if;
    return new;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.user_id::text, 0));
  update public.checkins set checked_out_at = expires_at
  where user_id = new.user_id and checked_out_at is null and expires_at <= server_now;
  if exists (
    select 1 from public.checkins
    where user_id = new.user_id and checked_out_at is null and expires_at > server_now
  ) then
    raise exception 'CONFLICT: an active check-in already exists' using errcode = 'P0001';
  end if;
  intended_duration := new.expires_at - new.started_at;
  if intended_duration < interval '30 minutes' or intended_duration > interval '180 minutes' then
    raise exception 'VALIDATION: durationMinutes must be between 30 and 180' using errcode = '23514';
  end if;
  new.started_at := server_now;
  new.expires_at := server_now + intended_duration;
  select university_id, visible into profile_university, profile_visible from public.profiles where id = new.user_id;
  if profile_university is null then
    raise exception 'FORBIDDEN: profile is not completed' using errcode = '42501';
  end if;
  if profile_visible is not true then
    raise exception 'FORBIDDEN: visibility is off' using errcode = '42501';
  end if;
  select university_id into location_university from public.locations where id = new.location_id and is_active;
  if location_university is null or location_university <> profile_university then
    raise exception 'VALIDATION: location is not available for this university' using errcode = '23514';
  end if;
  select university_id into course_university from public.courses where id = new.course_id;
  if course_university is null or course_university <> profile_university then
    raise exception 'VALIDATION: course does not belong to the profile university' using errcode = '23514';
  end if;
  if not exists (select 1 from public.profile_courses where user_id = new.user_id and course_id = new.course_id) then
    raise exception 'VALIDATION: course is not on the caller profile' using errcode = '23514';
  end if;
  return new;
end;
$fn$;

create trigger checkins_enforce_rules before insert or update on public.checkins
  for each row execute function public.enforce_checkin_rules();

create or replace function public.enforce_request_insert_rules()
returns trigger language plpgsql set search_path = '' as $fn$
declare
  sender_university uuid;
  recipient_university uuid;
  recipient_visible boolean;
begin
  if new.status <> 'pending' then
    raise exception 'VALIDATION: a request must be created as pending' using errcode = '23514';
  end if;

  -- Serialize request/block writes for this unordered pair so the block
  -- and discoverability checks below cannot be raced by a concurrent
  -- block insert or check-out (blocks take the same lock, see
  -- enforce_block_insert_rules).
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    pg_catalog.least(new.sender_id, new.recipient_id)::text || ':' ||
    pg_catalog.greatest(new.sender_id, new.recipient_id)::text, 0));

  -- Recipient discoverability, enforced in the database so a direct
  -- PostgREST insert cannot bypass it (the send_study_request RPC checks
  -- the same conditions; this trigger is the defence in depth):
  -- same university, profile visible, and an active check-in whose
  -- availability is available/questions_only (never focused).
  select university_id into sender_university
  from public.profiles where id = new.sender_id;
  if sender_university is null then
    raise exception 'FORBIDDEN: profile is not completed' using errcode = '42501';
  end if;

  select university_id, visible into recipient_university, recipient_visible
  from public.profiles where id = new.recipient_id;
  if recipient_university is null then
    raise exception 'NOT_FOUND: user not found' using errcode = 'P0002';
  end if;

  if recipient_university is distinct from sender_university
     or recipient_visible is not true
     or not exists (
       select 1 from public.checkins c
       where c.user_id = new.recipient_id
         and c.checked_out_at is null
         and c.started_at <= pg_catalog.clock_timestamp()
         and c.expires_at > pg_catalog.clock_timestamp()
         and c.availability in ('available', 'questions_only')
     )
     or exists (
       select 1 from public.blocks b
       where (b.blocker_id = new.sender_id and b.blocked_id = new.recipient_id)
          or (b.blocker_id = new.recipient_id and b.blocked_id = new.sender_id)
     ) then
    raise exception 'FORBIDDEN: recipient is not discoverable' using errcode = '42501';
  end if;

  return new;
end;
$fn$;

create trigger study_requests_enforce_insert_rules before insert on public.study_requests
  for each row execute function public.enforce_request_insert_rules();

create or replace function public.enforce_request_transition()
returns trigger language plpgsql set search_path = '' as $fn$
declare
  actor uuid := auth.uid();
begin
  if new.id is distinct from old.id
     or new.sender_id is distinct from old.sender_id
     or new.recipient_id is distinct from old.recipient_id
     or new.created_at is distinct from old.created_at then
    raise exception 'VALIDATION: request participants are immutable' using errcode = '23514';
  end if;
  if old.status = new.status then return new; end if;
  if old.status <> 'pending' then
    raise exception 'CONFLICT: request is no longer pending' using errcode = 'P0001';
  end if;
  if new.status = 'cancelled' then
    if actor = old.sender_id or exists (
      select 1 from public.blocks
      where blocker_id = actor
        and blocked_id in (old.sender_id, old.recipient_id)
        and actor in (old.sender_id, old.recipient_id)
    ) then
      return new;
    end if;
    raise exception 'FORBIDDEN: only the sender can cancel a pending request' using errcode = '42501';
  end if;
  if new.status in ('accepted', 'declined') then
    if actor = old.recipient_id then return new; end if;
    raise exception 'FORBIDDEN: only the recipient can accept or decline' using errcode = '42501';
  end if;
  raise exception 'CONFLICT: illegal status transition' using errcode = 'P0001';
end;
$fn$;

create trigger study_requests_enforce_transition before update on public.study_requests
  for each row execute function public.enforce_request_transition();

create or replace function public.cancel_pending_requests_on_block()
returns trigger language plpgsql security definer set search_path = '' as $fn$
begin
  update public.study_requests set status = 'cancelled'
  where status = 'pending' and (
    (sender_id = new.blocker_id and recipient_id = new.blocked_id)
    or (sender_id = new.blocked_id and recipient_id = new.blocker_id)
  );
  return new;
end;
$fn$;

create trigger blocks_cancel_pending_requests after insert on public.blocks
  for each row execute function public.cancel_pending_requests_on_block();

-- Blocks take the same per-pair advisory lock as request inserts, so a
-- request and a block for the same pair cannot interleave: whichever
-- commits second sees the other's committed state.
create or replace function public.enforce_block_insert_rules()
returns trigger language plpgsql set search_path = '' as $fn$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    pg_catalog.least(new.blocker_id, new.blocked_id)::text || ':' ||
    pg_catalog.greatest(new.blocker_id, new.blocked_id)::text, 0));
  return new;
end;
$fn$;

create trigger blocks_enforce_insert_rules before insert on public.blocks
  for each row execute function public.enforce_block_insert_rules();

alter table public.universities enable row level security;
alter table public.locations enable row level security;
alter table public.courses enable row level security;
alter table public.profiles enable row level security;
alter table public.profile_courses enable row level security;
alter table public.checkins enable row level security;
alter table public.study_requests enable row level security;
alter table public.blocks enable row level security;
alter table public.reports enable row level security;

create policy "universities_select_authenticated" on public.universities for select to authenticated using (true);
create policy "locations_select_active_authenticated" on public.locations for select to authenticated using (is_active);
create policy "courses_select_authenticated" on public.courses for select to authenticated using (true);

create policy "profiles_select_own" on public.profiles for select to authenticated using (id = auth.uid());
create policy "profiles_insert_own" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "profiles_update_own" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "profile_courses_select_own" on public.profile_courses for select to authenticated using (user_id = auth.uid());
create policy "profile_courses_insert_own" on public.profile_courses for insert to authenticated with check (user_id = auth.uid());
create policy "profile_courses_delete_own" on public.profile_courses for delete to authenticated using (user_id = auth.uid());

create policy "checkins_select_own" on public.checkins for select to authenticated using (user_id = auth.uid());
create policy "checkins_insert_own" on public.checkins for insert to authenticated with check (user_id = auth.uid());
create policy "checkins_update_own" on public.checkins for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "study_requests_select_participant" on public.study_requests for select to authenticated using (sender_id = auth.uid() or recipient_id = auth.uid());
create policy "study_requests_insert_sender" on public.study_requests for insert to authenticated with check (sender_id = auth.uid() and status = 'pending');
create policy "study_requests_update_participant" on public.study_requests for update to authenticated
  using (status = 'pending' and (sender_id = auth.uid() or recipient_id = auth.uid()))
  with check (sender_id = auth.uid() or recipient_id = auth.uid());

create policy "blocks_select_own" on public.blocks for select to authenticated using (blocker_id = auth.uid());
create policy "blocks_insert_own" on public.blocks for insert to authenticated with check (blocker_id = auth.uid());
create policy "blocks_delete_own" on public.blocks for delete to authenticated using (blocker_id = auth.uid());

create policy "reports_insert_own" on public.reports for insert to authenticated with check (reporter_id = auth.uid());

revoke all on public.universities, public.locations, public.courses, public.profiles, public.profile_courses, public.checkins, public.study_requests, public.blocks, public.reports from public, anon, authenticated;
grant select on public.universities, public.locations, public.courses to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, delete on public.profile_courses to authenticated;
grant select, insert, update on public.checkins to authenticated;
grant select, insert, update on public.study_requests to authenticated;
grant select, insert, delete on public.blocks to authenticated;
grant insert on public.reports to authenticated;
grant all on public.universities, public.locations, public.courses, public.profiles, public.profile_courses, public.checkins, public.study_requests, public.blocks, public.reports to service_role;

create or replace function public.save_profile(
  p_display_name text,
  p_university_id uuid,
  p_major text,
  p_academic_year text,
  p_course_ids uuid[],
  p_study_style text,
  p_preferred_duration_minutes integer,
  p_preferred_group_size integer,
  p_visible boolean
) returns void language plpgsql security invoker set search_path = public, extensions as $fn$
declare
  uid uuid := auth.uid();
  distinct_count integer;
  valid_count integer;
begin
  if uid is null then
    raise exception 'UNAUTHENTICATED: authentication required' using errcode = '28000';
  end if;
  if not exists (select 1 from public.universities where id = p_university_id) then
    raise exception 'VALIDATION: university is not an allowed campus' using errcode = '23514';
  end if;
  if p_course_ids is null or cardinality(p_course_ids) < 1 or cardinality(p_course_ids) > 8 then
    raise exception 'VALIDATION: courseIds must contain 1 to 8 courses' using errcode = '23514';
  end if;
  select count(*) into distinct_count from (select distinct unnest(p_course_ids)) ids;
  if distinct_count <> cardinality(p_course_ids) then
    raise exception 'VALIDATION: courseIds must be unique' using errcode = '23514';
  end if;
  select count(*) into valid_count from public.courses where id = any (p_course_ids) and university_id = p_university_id;
  if valid_count <> cardinality(p_course_ids) then
    raise exception 'VALIDATION: course does not belong to the profile university' using errcode = '23514';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text, 0));
  delete from public.profile_courses where user_id = uid;
  insert into public.profiles (
    id, university_id, display_name, major, academic_year, study_style,
    preferred_duration_minutes, preferred_group_size, visible
  ) values (
    uid, p_university_id, p_display_name, p_major, p_academic_year, p_study_style,
    p_preferred_duration_minutes, p_preferred_group_size, coalesce(p_visible, false)
  )
  on conflict (id) do update set
    university_id = excluded.university_id,
    display_name = excluded.display_name,
    major = excluded.major,
    academic_year = excluded.academic_year,
    study_style = excluded.study_style,
    preferred_duration_minutes = excluded.preferred_duration_minutes,
    preferred_group_size = excluded.preferred_group_size,
    visible = excluded.visible;
  insert into public.profile_courses (user_id, course_id)
  select uid, course_id from unnest(p_course_ids) as course_id;
end;
$fn$;

create or replace function public.current_checkin()
returns jsonb language sql volatile security invoker set search_path = public, extensions as $fn$
  select coalesce((
    select jsonb_build_object(
      'id', id, 'locationId', location_id, 'courseId', course_id,
      'availability', availability, 'studyStyle', study_style,
      'startedAt', started_at, 'expiresAt', expires_at
    )
    from public.checkins
    where user_id = auth.uid() and checked_out_at is null and expires_at > pg_catalog.clock_timestamp()
    order by started_at desc limit 1
  ), 'null'::jsonb);
$fn$;

create or replace function public.checkout_active()
returns void language plpgsql volatile security invoker set search_path = public, extensions as $fn$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'UNAUTHENTICATED: authentication required' using errcode = '28000';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text, 0));
  update public.checkins set checked_out_at = pg_catalog.clock_timestamp()
  where user_id = uid and checked_out_at is null and expires_at > pg_catalog.clock_timestamp();
end;
$fn$;

create or replace function public.replace_checkin(
  p_location_id uuid, p_course_id uuid, p_duration_minutes integer, p_availability text, p_study_style text
) returns jsonb language plpgsql volatile security invoker set search_path = public, extensions as $fn$
declare
  uid uuid := auth.uid();
  started timestamptz := pg_catalog.clock_timestamp();
  inserted public.checkins;
begin
  if uid is null then
    raise exception 'UNAUTHENTICATED: authentication required' using errcode = '28000';
  end if;
  if p_duration_minutes is null or p_duration_minutes < 30 or p_duration_minutes > 180 then
    raise exception 'VALIDATION: durationMinutes must be between 30 and 180' using errcode = '23514';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text, 0));
  update public.checkins set checked_out_at = pg_catalog.clock_timestamp()
  where user_id = uid and checked_out_at is null and expires_at > pg_catalog.clock_timestamp();
  insert into public.checkins (user_id, location_id, course_id, availability, study_style, started_at, expires_at)
  values (uid, p_location_id, p_course_id, p_availability, p_study_style, started, started + make_interval(mins => p_duration_minutes))
  returning * into inserted;
  return jsonb_build_object(
    'id', inserted.id, 'locationId', inserted.location_id, 'courseId', inserted.course_id,
    'availability', inserted.availability, 'studyStyle', inserted.study_style,
    'startedAt', inserted.started_at, 'expiresAt', inserted.expires_at
  );
end;
$fn$;

create or replace function public.discovery_candidates(p_location_id uuid default null, p_course_id uuid default null)
returns jsonb language plpgsql volatile security definer set search_path = public, extensions as $fn$
declare
  uid uuid := auth.uid();
begin
  -- Authorized discovery read path. Caller authentication, same-campus
  -- eligibility, visibility, active check-in, focused exclusion, and
  -- either-direction blocks are all enforced here, inside the database,
  -- so a direct RPC call can obtain nothing the API would not return.
  -- Scoring also happens here (contract Matching v1): the function
  -- returns only final public DiscoveryMatch fields, never a candidate's
  -- preferred duration, group size, or enrolled course list.
  if uid is null then
    raise exception 'UNAUTHENTICATED: authentication required' using errcode = '28000';
  end if;

  return coalesce((
    with caller_profile as (
      select * from public.profiles where id = uid
    ),
    caller_checkin as (
      select c.* from public.checkins c
      where c.user_id = uid and c.checked_out_at is null
        and c.expires_at > pg_catalog.clock_timestamp()
      order by c.started_at desc limit 1
    ),
    base as (
      select
        other.id as user_id,
        other.display_name,
        other.major,
        other.academic_year,
        ch.availability,
        ch.study_style as checkin_study_style,
        ch.expires_at as checkin_expires_at,
        loc.id as location_id,
        loc.name as location_name,
        loc.building_code,
        course.id as course_id,
        course.university_id as course_university_id,
        course.code as course_code,
        course.title as course_title,
        (cc.course_id is not null and cc.course_id = ch.course_id) as same_course,
        exists (
          select 1 from public.profile_courses mine
          join public.profile_courses theirs on theirs.course_id = mine.course_id
          where mine.user_id = uid and theirs.user_id = other.id
        ) as shared_course,
        (cc.course_id is not null and (
          cc.study_style = ch.study_style
          or cc.study_style = 'flexible'
          or ch.study_style = 'flexible'
        )) as style_ok,
        (cc.location_id is not null and cc.location_id = ch.location_id) as same_location,
        pg_catalog.abs(cp.preferred_duration_minutes - other.preferred_duration_minutes) as duration_gap,
        pg_catalog.abs(cp.preferred_group_size - other.preferred_group_size) as group_gap,
        (
          select sr.status from public.study_requests sr
          where (sr.sender_id = uid and sr.recipient_id = other.id)
             or (sr.sender_id = other.id and sr.recipient_id = uid)
          order by sr.created_at desc, sr.id desc limit 1
        ) as request_status
      from public.profiles other
      cross join caller_profile cp
      left join caller_checkin cc on true
      join lateral (
        select c.* from public.checkins c
        where c.user_id = other.id and c.checked_out_at is null
          and c.started_at <= pg_catalog.clock_timestamp()
          and c.expires_at > pg_catalog.clock_timestamp()
        order by c.started_at desc limit 1
      ) ch on true
      join public.locations loc on loc.id = ch.location_id and loc.is_active
      join public.courses course on course.id = ch.course_id
      where other.university_id = cp.university_id
        and other.id <> uid
        and other.visible
        and ch.availability in ('available', 'questions_only')
        and (p_location_id is null or ch.location_id = p_location_id)
        and (p_course_id is null or ch.course_id = p_course_id)
        and not exists (
          select 1 from public.blocks b
          where (b.blocker_id = uid and b.blocked_id = other.id)
             or (b.blocker_id = other.id and b.blocked_id = uid)
        )
    ),
    scored as (
      select base.*,
        (case when same_course then 40 when shared_course then 25 else 0 end
         + case when style_ok then 20 else 0 end
         + case when same_location then 20 else 0 end
         + case when duration_gap <= 30 then 10 when duration_gap <= 60 then 5 else 0 end
         + case when group_gap <= 1 then 10 else 0 end) as compatibility_score,
        pg_catalog.array_remove(array[
          case when same_course then 'Studying the same course'
               when shared_course then 'Shares another enrolled course' end,
          case when style_ok then 'Compatible study style' end,
          case when same_location then 'Same study location' end,
          case when duration_gap <= 30 then 'Preferred duration within 30 minutes'
               when duration_gap <= 60 then 'Preferred duration within 60 minutes' end,
          case when group_gap <= 1 then 'Similar preferred group size' end
        ], null) as reasons
      from base
    )
    select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'user', pg_catalog.jsonb_build_object(
          'id', user_id, 'displayName', display_name, 'major', major,
          'academicYear', academic_year, 'studyStyle', checkin_study_style
        ),
        'location', pg_catalog.jsonb_build_object(
          'id', location_id, 'name', location_name, 'buildingCode', building_code
        ),
        'course', pg_catalog.jsonb_build_object(
          'id', course_id, 'universityId', course_university_id,
          'code', course_code, 'title', course_title
        ),
        'availability', availability,
        'compatibilityScore', compatibility_score,
        'reasons', pg_catalog.to_jsonb(reasons),
        'checkinExpiresAt', checkin_expires_at,
        'requestStatus', request_status
      )
      order by
        (compatibility_score + case when same_location then 10 else 0 end) desc,
        same_location desc,
        user_id asc
    )
    from scored
  ), '[]'::jsonb);
end;
$fn$;

create or replace function public.study_request_payload(p_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = public, extensions as $fn$
declare
  uid uuid := auth.uid();
  sr public.study_requests%rowtype;
  other_id uuid;
  other public.profiles%rowtype;
  loc_id uuid;
  loc_name text;
  loc_code text;
  course_id uuid;
  course_university uuid;
  course_code text;
  course_title text;
  course_json jsonb;
  location_json jsonb;
begin
  if uid is null then
    raise exception 'UNAUTHENTICATED: authentication required' using errcode = '28000';
  end if;
  select * into sr from public.study_requests where id = p_request_id;
  if not found or (sr.sender_id <> uid and sr.recipient_id <> uid) then
    raise exception 'NOT_FOUND: request not found' using errcode = 'P0002';
  end if;
  other_id := case when sr.sender_id = uid then sr.recipient_id else sr.sender_id end;
  select * into other from public.profiles where id = other_id;
  if not found then
    raise exception 'NOT_FOUND: user not found' using errcode = 'P0002';
  end if;
  select c.location_id, l.name, l.building_code, co.id, co.university_id, co.code, co.title
  into loc_id, loc_name, loc_code, course_id, course_university, course_code, course_title
  from public.checkins c
  join public.locations l on l.id = c.location_id
  join public.courses co on co.id = c.course_id
  where c.user_id = other_id and c.checked_out_at is null and c.expires_at > pg_catalog.clock_timestamp()
  order by c.started_at desc limit 1;
  if found then
    course_json := jsonb_build_object('id', course_id, 'universityId', course_university, 'code', course_code, 'title', course_title);
    location_json := jsonb_build_object('id', loc_id, 'name', loc_name, 'buildingCode', loc_code);
  else
    course_json := null;
    location_json := null;
  end if;
  return jsonb_build_object(
    'id', sr.id, 'senderId', sr.sender_id, 'recipientId', sr.recipient_id, 'status', sr.status,
    'createdAt', sr.created_at, 'updatedAt', sr.updated_at,
    'counterpart', jsonb_build_object(
      'id', other.id, 'displayName', other.display_name, 'major', other.major,
      'academicYear', other.academic_year, 'studyStyle', other.study_style
    ),
    'course', course_json, 'location', location_json
  );
end;
$fn$;

create or replace function public.list_my_requests(p_direction text)
returns jsonb language plpgsql volatile security definer set search_path = public, extensions as $fn$
declare
  uid uuid := auth.uid();
  result jsonb;
begin
  if uid is null then
    raise exception 'UNAUTHENTICATED: authentication required' using errcode = '28000';
  end if;
  if p_direction not in ('incoming', 'outgoing', 'all') then
    raise exception 'VALIDATION: direction is invalid' using errcode = '23514';
  end if;
  select coalesce(jsonb_agg(public.study_request_payload(rows.id) order by rows.created_at desc, rows.id desc), '[]'::jsonb)
  into result
  from (
    select sr.id, sr.created_at from public.study_requests sr
    where (sr.sender_id = uid or sr.recipient_id = uid)
      and (p_direction = 'all' or (p_direction = 'incoming' and sr.recipient_id = uid) or (p_direction = 'outgoing' and sr.sender_id = uid))
      and not exists (
        select 1 from public.blocks b
        where (b.blocker_id = uid and b.blocked_id = case when sr.sender_id = uid then sr.recipient_id else sr.sender_id end)
           or (b.blocked_id = uid and b.blocker_id = case when sr.sender_id = uid then sr.recipient_id else sr.sender_id end)
      )
  ) rows;
  return result;
end;
$fn$;

create or replace function public.send_study_request(p_recipient_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = public, extensions as $fn$
declare
  uid uuid := auth.uid();
  caller_university uuid;
  recipient_university uuid;
  recipient_visible boolean;
  new_id uuid;
begin
  if uid is null then
    raise exception 'UNAUTHENTICATED: authentication required' using errcode = '28000';
  end if;
  if p_recipient_id is null or p_recipient_id = uid then
    raise exception 'VALIDATION: cannot send a request to yourself' using errcode = '23514';
  end if;
  if uid::text < p_recipient_id::text then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text, 0));
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_recipient_id::text, 0));
  else
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_recipient_id::text, 0));
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text, 0));
  end if;
  select university_id into caller_university from public.profiles where id = uid;
  if caller_university is null then
    raise exception 'FORBIDDEN: profile is not completed' using errcode = '42501';
  end if;
  select university_id, visible into recipient_university, recipient_visible from public.profiles where id = p_recipient_id;
  if not found then
    raise exception 'NOT_FOUND: user not found' using errcode = 'P0002';
  end if;
  if recipient_university is distinct from caller_university
     or recipient_visible is not true
     or exists (
       select 1 from public.blocks b
       where (b.blocker_id = uid and b.blocked_id = p_recipient_id)
          or (b.blocker_id = p_recipient_id and b.blocked_id = uid)
     )
     or not exists (
       select 1 from public.checkins c
       where c.user_id = p_recipient_id and c.checked_out_at is null
         and c.expires_at > pg_catalog.clock_timestamp()
         and c.availability in ('available', 'questions_only')
     )
  then
    raise exception 'FORBIDDEN: recipient is not discoverable' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.study_requests sr
    where sr.status = 'pending'
      and least(sr.sender_id, sr.recipient_id) = least(uid, p_recipient_id)
      and greatest(sr.sender_id, sr.recipient_id) = greatest(uid, p_recipient_id)
  ) then
    raise exception 'CONFLICT: a pending request already exists' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.study_requests sr
    where sr.status = 'accepted'
      and least(sr.sender_id, sr.recipient_id) = least(uid, p_recipient_id)
      and greatest(sr.sender_id, sr.recipient_id) = greatest(uid, p_recipient_id)
  ) then
    raise exception 'CONFLICT: an accepted request already exists' using errcode = 'P0001';
  end if;
  insert into public.study_requests (sender_id, recipient_id, status)
  values (uid, p_recipient_id, 'pending') returning id into new_id;
  return public.study_request_payload(new_id);
exception
  when unique_violation then
    raise exception 'CONFLICT: a pending or accepted request already exists' using errcode = 'P0001';
end;
$fn$;

create or replace function public.list_my_blocks()
returns jsonb language sql volatile security definer set search_path = public, extensions as $fn$
  select coalesce(jsonb_agg(jsonb_build_object(
    'blockedUserId', b.blocked_id, 'displayName', p.display_name, 'createdAt', b.created_at
  ) order by b.created_at desc, b.blocked_id asc), '[]'::jsonb)
  from public.blocks b
  left join public.profiles p on p.id = b.blocked_id
  where b.blocker_id = auth.uid();
$fn$;

create or replace function public.block_user(p_blocked_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = public, extensions as $fn$
declare
  uid uuid := auth.uid();
  inserted boolean := false;
  row_created timestamptz;
  display text;
begin
  if uid is null then
    raise exception 'UNAUTHENTICATED: authentication required' using errcode = '28000';
  end if;
  if p_blocked_id is null or p_blocked_id = uid then
    raise exception 'VALIDATION: cannot block yourself' using errcode = '23514';
  end if;
  if not exists (select 1 from public.profiles where id = uid) then
    raise exception 'FORBIDDEN: profile is not completed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = p_blocked_id) then
    raise exception 'NOT_FOUND: user not found' using errcode = 'P0002';
  end if;
  with ins as (
    insert into public.blocks (blocker_id, blocked_id) values (uid, p_blocked_id)
    on conflict do nothing returning 1
  )
  select count(*) > 0 into inserted from ins;
  select b.created_at, p.display_name into row_created, display
  from public.blocks b left join public.profiles p on p.id = b.blocked_id
  where b.blocker_id = uid and b.blocked_id = p_blocked_id;
  return jsonb_build_object('blockedUserId', p_blocked_id, 'displayName', display, 'createdAt', row_created, 'created', inserted);
end;
$fn$;

create or replace function public.create_report(p_reported_id uuid, p_reason text, p_details text)
returns uuid language plpgsql volatile security definer set search_path = public, extensions as $fn$
declare
  uid uuid := auth.uid();
  new_id uuid;
begin
  if uid is null then
    raise exception 'UNAUTHENTICATED: authentication required' using errcode = '28000';
  end if;
  if p_reported_id is null or p_reported_id = uid then
    raise exception 'VALIDATION: cannot report yourself' using errcode = '23514';
  end if;
  if p_reason not in ('harassment', 'spam', 'other') then
    raise exception 'VALIDATION: reason is invalid' using errcode = '23514';
  end if;
  if p_details is not null and char_length(p_details) > 500 then
    raise exception 'VALIDATION: details must be at most 500 characters' using errcode = '23514';
  end if;
  if not exists (select 1 from public.profiles where id = uid) then
    raise exception 'FORBIDDEN: profile is not completed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = p_reported_id) then
    raise exception 'NOT_FOUND: user not found' using errcode = 'P0002';
  end if;
  insert into public.reports (reporter_id, reported_id, reason, details)
  values (uid, p_reported_id, p_reason, p_details) returning id into new_id;
  return new_id;
end;
$fn$;

revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.enforce_profile_course_rules() from public, anon, authenticated;
revoke all on function public.enforce_profile_course_count() from public, anon, authenticated;
revoke all on function public.prevent_profile_course_update() from public, anon, authenticated;
revoke all on function public.enforce_profile_university_change() from public, anon, authenticated;
revoke all on function public.enforce_checkin_rules() from public, anon, authenticated;
revoke all on function public.enforce_request_insert_rules() from public, anon, authenticated;
revoke all on function public.enforce_request_transition() from public, anon, authenticated;
revoke all on function public.cancel_pending_requests_on_block() from public, anon, authenticated;
revoke all on function public.enforce_block_insert_rules() from public, anon, authenticated;

revoke all on function public.save_profile(text, uuid, text, text, uuid[], text, integer, integer, boolean) from public, anon;
revoke all on function public.current_checkin() from public, anon;
revoke all on function public.checkout_active() from public, anon;
revoke all on function public.replace_checkin(uuid, uuid, integer, text, text) from public, anon;
revoke all on function public.discovery_candidates(uuid, uuid) from public, anon;
revoke all on function public.study_request_payload(uuid) from public, anon;
revoke all on function public.list_my_requests(text) from public, anon;
revoke all on function public.send_study_request(uuid) from public, anon;
revoke all on function public.list_my_blocks() from public, anon;
revoke all on function public.block_user(uuid) from public, anon;
revoke all on function public.create_report(uuid, text, text) from public, anon;

grant execute on function public.save_profile(text, uuid, text, text, uuid[], text, integer, integer, boolean) to authenticated;
grant execute on function public.current_checkin() to authenticated;
grant execute on function public.checkout_active() to authenticated;
grant execute on function public.replace_checkin(uuid, uuid, integer, text, text) to authenticated;
grant execute on function public.discovery_candidates(uuid, uuid) to authenticated;
grant execute on function public.study_request_payload(uuid) to authenticated;
grant execute on function public.list_my_requests(text) to authenticated;
grant execute on function public.send_study_request(uuid) to authenticated;
grant execute on function public.list_my_blocks() to authenticated;
grant execute on function public.block_user(uuid) to authenticated;
grant execute on function public.create_report(uuid, text, text) to authenticated;

-- Trigger functions are deliberately NOT granted to anyone: PostgreSQL
-- does not require the table-changing user to hold EXECUTE on a trigger
-- function, and PostgREST must never be able to invoke them as RPCs.

-- Catalog seed only. No student rows, passwords, or coordinates.
insert into public.universities (id, name, slug) values
  ('22222222-2222-4222-8222-222222222222', 'University of Texas at Austin', 'ut-austin')
on conflict (id) do nothing;

insert into public.locations (id, university_id, name, building_code, description) values
  ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222',
   'Perry-Castañeda Library', 'PCL', 'Public library study spaces'),
  ('11111111-1111-4111-8111-111111111112', '22222222-2222-4222-8222-222222222222',
   'Engineering Education and Research Center', 'EER', 'Public engineering building study spaces'),
  ('11111111-1111-4111-8111-111111111113', '22222222-2222-4222-8222-222222222222',
   'Texas Union', 'UNION', 'Public union study spaces')
on conflict (id) do nothing;

insert into public.courses (id, university_id, code, title) values
  ('33333333-3333-4333-8333-333333333331', '22222222-2222-4222-8222-222222222222',
   'M408C', 'Differential and Integral Calculus'),
  ('33333333-3333-4333-8333-333333333332', '22222222-2222-4222-8222-222222222222',
   'CS314', 'Data Structures'),
  ('33333333-3333-4333-8333-333333333333', '22222222-2222-4222-8222-222222222222',
   'BIO311C', 'Introductory Biology')
on conflict (id) do nothing;
