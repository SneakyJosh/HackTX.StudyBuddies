-- StudySync Milestone 1 (B1): schema, constraints, RLS, and public catalog seed.
--
-- Target: Supabase Postgres (relies on the `auth` schema / `auth.uid()`).
-- DO NOT apply to a live Supabase project without the project owner's approval
-- (see TASKS.md checkpoint C3: migrations and RLS are reviewed before applying).
-- This file is the reviewable source of truth; it has not been deployed.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.universities (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  created_at timestamptz not null default now()
);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  building_code text not null check (char_length(btrim(building_code)) between 1 and 20),
  description text check (description is null or char_length(description) <= 500),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (university_id, building_code)
);

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities (id) on delete cascade,
  code text not null check (char_length(btrim(code)) between 1 and 20),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  created_at timestamptz not null default now(),
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
  preferred_duration_minutes integer not null
    check (preferred_duration_minutes between 30 and 180),
  preferred_group_size integer not null check (preferred_group_size between 1 and 6),
  visible boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profile_courses (
  user_id uuid not null references public.profiles (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, course_id)
);

create table public.checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  location_id uuid not null references public.locations (id) on delete restrict,
  course_id uuid not null references public.courses (id) on delete restrict,
  availability text not null check (availability in ('available', 'questions_only', 'focused')),
  study_style text not null check (study_style in ('quiet', 'collaborative', 'flexible')),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  checked_out_at timestamptz,
  check (expires_at >= started_at + interval '30 minutes'),
  check (expires_at <= started_at + interval '180 minutes'),
  check (checked_out_at is null or checked_out_at >= started_at)
);

create table public.study_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (sender_id <> recipient_id)
);

create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reported_id uuid not null references public.profiles (id) on delete cascade,
  reason text not null check (reason in ('harassment', 'spam', 'other')),
  details text check (details is null or char_length(details) <= 500),
  created_at timestamptz not null default now(),
  check (reporter_id <> reported_id)
);

-- ---------------------------------------------------------------------------
-- Indexes (contract: check-ins by location/expiry, requests by participant)
-- ---------------------------------------------------------------------------

create index profiles_university_id_idx on public.profiles (university_id);
create index locations_university_id_idx on public.locations (university_id) where is_active;
create index courses_university_id_idx on public.courses (university_id);
create index profile_courses_course_id_idx on public.profile_courses (course_id);
create index checkins_location_expires_idx on public.checkins (location_id, expires_at);
create index checkins_user_expires_idx on public.checkins (user_id, expires_at);
create index study_requests_sender_idx on public.study_requests (sender_id, created_at desc);
create index study_requests_recipient_idx on public.study_requests (recipient_id, created_at desc);
create index blocks_blocked_id_idx on public.blocks (blocked_id);
create index reports_reported_id_idx on public.reports (reported_id);

-- One pending and one accepted request per unordered pair (contract).
create unique index study_requests_one_pending_per_pair_idx
  on public.study_requests ((least(sender_id, recipient_id)), (greatest(sender_id, recipient_id)))
  where status = 'pending';

create unique index study_requests_one_accepted_per_pair_idx
  on public.study_requests ((least(sender_id, recipient_id)), (greatest(sender_id, recipient_id)))
  where status = 'accepted';

-- NOTE: "one active check-in per user" is intentionally NOT a partial unique
-- index: an active check-in is `checked_out_at is null and expires_at > now()`,
-- and a partial index cannot use now() safely. The check-in route (B3) must
-- enforce it in a transaction / with an advisory lock, per the contract.

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger study_requests_set_updated_at
  before update on public.study_requests
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Cross-university and enrollment invariants the FK graph cannot express
-- ---------------------------------------------------------------------------

-- A profile course must belong to the profile's university, and a profile may
-- hold at most 8 courses (contract: a ninth enrollment must fail in the DB).
create or replace function public.enforce_profile_course_rules()
returns trigger
language plpgsql
as $$
declare
  profile_university uuid;
  course_university uuid;
  enrolled_count integer;
begin
  -- Serialize concurrent enrollment writes for this user so the count is exact.
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));

  select university_id into profile_university
  from public.profiles where id = new.user_id;
  if profile_university is null then
    raise exception 'profile % does not exist', new.user_id using errcode = '23503';
  end if;

  select university_id into course_university
  from public.courses where id = new.course_id;
  if course_university is null then
    raise exception 'course % does not exist', new.course_id using errcode = '23503';
  end if;

  if course_university <> profile_university then
    raise exception 'course does not belong to the profile university'
      using errcode = '23514';
  end if;

  select count(*) into enrolled_count
  from public.profile_courses where user_id = new.user_id;
  if enrolled_count >= 8 then
    raise exception 'a profile may hold at most 8 courses' using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger profile_courses_enforce_rules
  before insert on public.profile_courses
  for each row execute function public.enforce_profile_course_rules();

-- A check-in's location and course must belong to the caller's university and
-- the course must be one of the caller's profile courses. Visibility
-- (`visible = true`) is enforced by the check-in route as 403 FORBIDDEN (B3);
-- it is deliberately not a DB check so toggling visibility later never
-- invalidates an existing check-in.
create or replace function public.enforce_checkin_rules()
returns trigger
language plpgsql
as $$
declare
  profile_university uuid;
  location_university uuid;
  course_university uuid;
begin
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

create trigger checkins_enforce_rules
  before insert on public.checkins
  for each row execute function public.enforce_checkin_rules();

-- Requests: participants are immutable and only a pending request may change,
-- into a terminal status. Role rules (recipient accepts/declines, sender
-- cancels) are enforced by the route handler as 403/409 (B5); the block flow
-- must also be able to cancel pending requests in either direction, so the
-- database does not hard-code which participant performs the cancellation.
create or replace function public.enforce_request_transition()
returns trigger
language plpgsql
as $$
begin
  if new.sender_id <> old.sender_id or new.recipient_id <> old.recipient_id then
    raise exception 'request participants are immutable' using errcode = '23514';
  end if;
  if old.status <> 'pending' then
    raise exception 'only a pending request may change status' using errcode = '23514';
  end if;
  if new.status not in ('accepted', 'declined', 'cancelled') then
    raise exception 'a pending request may only move to a terminal status'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger study_requests_enforce_transition
  before update on public.study_requests
  for each row execute function public.enforce_request_transition();

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- Model: route handlers authenticate the caller from the Supabase session
-- cookie and query with that user's client, so RLS is the second line of
-- defence. User-linked rows are owner/participant-scoped. Discovery (B4) must
-- run server-side after a session check and select only the public fields in
-- the contract; it must never expose this schema wholesale to other users.
-- ---------------------------------------------------------------------------

alter table public.universities enable row level security;
alter table public.locations enable row level security;
alter table public.courses enable row level security;
alter table public.profiles enable row level security;
alter table public.profile_courses enable row level security;
alter table public.checkins enable row level security;
alter table public.study_requests enable row level security;
alter table public.blocks enable row level security;
alter table public.reports enable row level security;

-- Public catalog: readable by any signed-in user (works before a profile
-- exists). Inactive locations are never exposed. No client writes.
create policy "universities_select_authenticated"
  on public.universities for select to authenticated using (true);
create policy "locations_select_active_authenticated"
  on public.locations for select to authenticated using (is_active);
create policy "courses_select_authenticated"
  on public.courses for select to authenticated using (true);

-- Profiles: owner-only direct access. Other users are only ever seen through
-- the server discovery/request routes, which select public fields.
create policy "profiles_select_own"
  on public.profiles for select to authenticated using (id = auth.uid());
create policy "profiles_insert_own"
  on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "profiles_update_own"
  on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy "profiles_delete_own"
  on public.profiles for delete to authenticated using (id = auth.uid());

create policy "profile_courses_select_own"
  on public.profile_courses for select to authenticated using (user_id = auth.uid());
create policy "profile_courses_insert_own"
  on public.profile_courses for insert to authenticated with check (user_id = auth.uid());
create policy "profile_courses_update_own"
  on public.profile_courses for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "profile_courses_delete_own"
  on public.profile_courses for delete to authenticated using (user_id = auth.uid());

create policy "checkins_select_own"
  on public.checkins for select to authenticated using (user_id = auth.uid());
create policy "checkins_insert_own"
  on public.checkins for insert to authenticated with check (user_id = auth.uid());
create policy "checkins_update_own"
  on public.checkins for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "checkins_delete_own"
  on public.checkins for delete to authenticated using (user_id = auth.uid());

-- Requests: readable by either participant; insertable only as the sender;
-- updatable only by a participant (allowed transitions enforced above and in
-- the route handler). No deletes.
create policy "study_requests_select_participant"
  on public.study_requests for select to authenticated
  using (sender_id = auth.uid() or recipient_id = auth.uid());
create policy "study_requests_insert_sender"
  on public.study_requests for insert to authenticated
  with check (sender_id = auth.uid());
create policy "study_requests_update_participant"
  on public.study_requests for update to authenticated
  using (sender_id = auth.uid() or recipient_id = auth.uid())
  with check (sender_id = auth.uid() or recipient_id = auth.uid());

-- Blocks: only the blocker can read or manage their blocks.
create policy "blocks_select_own"
  on public.blocks for select to authenticated using (blocker_id = auth.uid());
create policy "blocks_insert_own"
  on public.blocks for insert to authenticated with check (blocker_id = auth.uid());
create policy "blocks_delete_own"
  on public.blocks for delete to authenticated using (blocker_id = auth.uid());

-- Reports: insertable by the reporter; intentionally no select/update/delete
-- policy, so ordinary users cannot read reports.
create policy "reports_insert_own"
  on public.reports for insert to authenticated with check (reporter_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Table privileges (RLS still applies on top of these grants)
-- ---------------------------------------------------------------------------

revoke all on public.universities, public.locations, public.courses,
  public.profiles, public.profile_courses, public.checkins,
  public.study_requests, public.blocks, public.reports from anon;

grant select on public.universities, public.locations, public.courses to authenticated;
grant select, insert, update, delete on public.profiles, public.profile_courses,
  public.checkins to authenticated;
grant select, insert, update on public.study_requests to authenticated;
grant select, insert, delete on public.blocks to authenticated;
grant insert on public.reports to authenticated;

grant all on public.universities, public.locations, public.courses,
  public.profiles, public.profile_courses, public.checkins,
  public.study_requests, public.blocks, public.reports to service_role;

-- ---------------------------------------------------------------------------
-- Public catalog seed (fictional campus data, ids frozen by the contract).
-- Kept idempotent so re-running against a scratch database is harmless.
-- ---------------------------------------------------------------------------

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
