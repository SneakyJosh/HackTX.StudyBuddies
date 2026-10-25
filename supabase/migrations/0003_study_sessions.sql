-- Milestone 9 scheduled sessions. Additive. Does not change check-ins, discovery, or study requests.
-- Apply only after review. Do not edit 0001 or 0002.

create extension if not exists btree_gist with schema extensions;

-- The exclusion constraint needs btree_gist's uuid operator class. This lasts
-- for the migration session only and does not change the database search path.
set search_path = public, extensions;

create table public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles (id) on delete restrict,
  university_id uuid not null references public.universities (id) on delete restrict,
  course_id uuid not null references public.courses (id) on delete restrict,
  location_id uuid not null references public.locations (id) on delete restrict,
  title text not null check (char_length(btrim(title)) between 1 and 60),
  visibility text not null check (visibility in ('solo', 'open', 'invite_only')),
  seat_limit integer not null check (seat_limit between 1 and 6),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz,
  check (ends_at >= starts_at + interval '30 minutes'),
  check (ends_at <= starts_at + interval '180 minutes'),
  check (
    (visibility = 'solo' and seat_limit = 1)
    or (visibility in ('open', 'invite_only') and seat_limit between 2 and 6)
  ),
  check (cancelled_at is null or status = 'cancelled')
);

create table public.study_session_participants (
  session_id uuid not null references public.study_sessions (id) on delete restrict,
  user_id uuid not null references public.profiles (id) on delete restrict,
  role text not null check (role in ('host', 'invitee', 'joiner')),
  status text not null check (status in ('invited', 'requested', 'accepted', 'declined', 'left', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (session_id, user_id),
  check (
    (role = 'host' and status in ('accepted', 'cancelled'))
    or (role = 'invitee' and status in ('invited', 'accepted', 'declined', 'left', 'cancelled'))
    or (role = 'joiner' and status in ('requested', 'accepted', 'declined', 'left', 'cancelled'))
  )
);

create unique index study_session_one_host_idx
  on public.study_session_participants (session_id)
  where role = 'host';

create table public.study_session_commitments (
  user_id uuid not null references public.profiles (id) on delete restrict,
  session_id uuid not null references public.study_sessions (id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  primary key (user_id, session_id),
  check (ends_at > starts_at),
  exclude using gist (
    user_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  )
);

create index study_sessions_host_starts_idx on public.study_sessions (host_id, starts_at);
create index study_sessions_open_idx on public.study_sessions (university_id, visibility, status, starts_at);
create index study_session_participants_user_idx on public.study_session_participants (user_id, status);

create trigger study_sessions_set_updated_at before update on public.study_sessions
  for each row execute function public.set_updated_at();
create trigger study_session_participants_set_updated_at before update on public.study_session_participants
  for each row execute function public.set_updated_at();

-- One America/Chicago instant. A gap or an overlap raises instead of shifting the clock.
create or replace function public.campus_instant(p_local timestamp)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $fn$
declare
  offset_hours integer;
  candidate timestamptz;
  matches integer := 0;
  chosen timestamptz;
begin
  foreach offset_hours in array array[5, 6] loop
    candidate := (p_local at time zone 'UTC') + make_interval(hours => offset_hours);
    if (candidate at time zone 'America/Chicago') = p_local then
      matches := matches + 1;
      chosen := candidate;
    end if;
  end loop;
  if matches = 0 then
    raise exception 'VALIDATION: that local time does not exist in America/Chicago' using errcode = '23514';
  end if;
  if matches > 1 then
    raise exception 'VALIDATION: that local time is ambiguous in America/Chicago' using errcode = '23514';
  end if;
  return chosen;
end;
$fn$;

create or replace function public.study_session_payload(
  p_session_id uuid,
  p_include_inactive boolean default false
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $fn$
declare
  uid uuid := auth.uid();
  s public.study_sessions%rowtype;
  caller_role text;
  caller_status text;
  taken integer;
  reserved integer;
  participants jsonb;
  course_row public.courses%rowtype;
  location_row public.locations%rowtype;
  host_row public.profiles%rowtype;
begin
  if uid is null then
    raise exception 'UNAUTHENTICATED: authentication required' using errcode = '28000';
  end if;
  select * into s from public.study_sessions where id = p_session_id;
  if not found then
    raise exception 'NOT_FOUND: session not found' using errcode = 'P0002';
  end if;
  if uid <> s.host_id and exists (
    select 1 from public.blocks b
    where (b.blocker_id = uid and b.blocked_id = s.host_id)
       or (b.blocker_id = s.host_id and b.blocked_id = uid)
  ) then
    raise exception 'NOT_FOUND: session not found' using errcode = 'P0002';
  end if;

  select p.role, p.status into caller_role, caller_status
  from public.study_session_participants p
  where p.session_id = s.id and p.user_id = uid;

  -- Inactive rows do not keep a private schedule. Decline and leave pass
  -- p_include_inactive so their own response can return after the status write.
  -- A stranger, or a declined/left/cancelled caller, falls through to the
  -- public open-booking rules. NULL status must not pass the IN test.
  if uid <> s.host_id
     and coalesce(caller_status, '') not in ('accepted', 'invited', 'requested')
     and not p_include_inactive then
    if s.visibility <> 'open'
       or s.status <> 'scheduled'
       or s.ends_at <= pg_catalog.clock_timestamp()
       or not exists (
         select 1 from public.profiles me
         where me.id = uid and me.university_id = s.university_id
       ) then
      raise exception 'NOT_FOUND: session not found' using errcode = 'P0002';
    end if;
  end if;

  select
    count(*) filter (where status = 'accepted'),
    count(*) filter (where status in ('accepted', 'invited'))
  into taken, reserved
  from public.study_session_participants
  where session_id = s.id;

  if uid = s.host_id then
    select coalesce(jsonb_agg(jsonb_build_object(
      'user', jsonb_build_object('id', pr.id, 'displayName', pr.display_name, 'major', pr.major, 'academicYear', pr.academic_year),
      'role', p.role,
      'status', p.status
    ) order by p.created_at, p.user_id), '[]'::jsonb)
    into participants
    from public.study_session_participants p
    join public.profiles pr on pr.id = p.user_id
    where p.session_id = s.id;
  elsif caller_status in ('accepted', 'invited', 'requested') then
    select coalesce(jsonb_agg(jsonb_build_object(
      'user', jsonb_build_object('id', pr.id, 'displayName', pr.display_name, 'major', pr.major, 'academicYear', pr.academic_year),
      'role', p.role,
      'status', p.status
    ) order by p.created_at, p.user_id), '[]'::jsonb)
    into participants
    from public.study_session_participants p
    join public.profiles pr on pr.id = p.user_id
    where p.session_id = s.id
      and (
        p.user_id = uid
        or (
          p.status = 'accepted'
          and not exists (
            select 1 from public.blocks b
            where (b.blocker_id = uid and b.blocked_id = p.user_id)
               or (b.blocker_id = p.user_id and b.blocked_id = uid)
          )
        )
      );
  else
    participants := '[]'::jsonb;
  end if;

  select * into course_row from public.courses where id = s.course_id;
  select * into location_row from public.locations where id = s.location_id;
  select * into host_row from public.profiles where id = s.host_id;

  return jsonb_build_object(
    'id', s.id,
    'title', s.title,
    'course', jsonb_build_object('id', course_row.id, 'universityId', course_row.university_id, 'code', course_row.code, 'title', course_row.title),
    'location', jsonb_build_object('id', location_row.id, 'name', location_row.name, 'buildingCode', location_row.building_code),
    'visibility', s.visibility,
    'seatLimit', s.seat_limit,
    'seatsTaken', taken,
    'seatsReserved', reserved,
    'startsAt', s.starts_at,
    'endsAt', s.ends_at,
    'status', s.status,
    'host', jsonb_build_object('id', host_row.id, 'displayName', host_row.display_name, 'major', host_row.major, 'academicYear', host_row.academic_year),
    'myRole', caller_role,
    'myStatus', caller_status,
    'participants', participants
  );
end;
$fn$;

create or replace function public.assert_session_partner(p_host uuid, p_invitee uuid)
returns void
language plpgsql
stable
security definer
set search_path = public, extensions
as $fn$
declare
  host_university uuid;
  invitee_university uuid;
begin
  if p_invitee = p_host then
    raise exception 'VALIDATION: cannot invite yourself' using errcode = '23514';
  end if;
  select university_id into host_university from public.profiles where id = p_host;
  select university_id into invitee_university from public.profiles where id = p_invitee;
  if invitee_university is null then
    raise exception 'NOT_FOUND: user not found' using errcode = 'P0002';
  end if;
  if invitee_university is distinct from host_university then
    raise exception 'FORBIDDEN: invitee is on another campus' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.blocks b
    where (b.blocker_id = p_host and b.blocked_id = p_invitee)
       or (b.blocker_id = p_invitee and b.blocked_id = p_host)
  ) then
    raise exception 'FORBIDDEN: that student is blocked' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.study_requests sr
    where sr.status = 'accepted'
      and least(sr.sender_id, sr.recipient_id) = least(p_host, p_invitee)
      and greatest(sr.sender_id, sr.recipient_id) = greatest(p_host, p_invitee)
  ) then
    raise exception 'FORBIDDEN: invite an accepted study partner' using errcode = '42501';
  end if;
end;
$fn$;

create or replace function public.create_study_session(
  p_title text,
  p_course_id uuid,
  p_location_id uuid,
  p_local_date date,
  p_local_time text,
  p_duration_minutes integer,
  p_visibility text,
  p_seat_limit integer,
  p_invitee_ids uuid[]
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $fn$
declare
  uid uuid := auth.uid();
  trimmed text;
  local_ts timestamp;
  starts_at timestamptz;
  ends_at timestamptz;
  new_id uuid;
  invitee uuid;
  reserved integer;
  profile_university uuid;
begin
  if uid is null then
    raise exception 'UNAUTHENTICATED: authentication required' using errcode = '28000';
  end if;
  select university_id into profile_university from public.profiles where id = uid;
  if profile_university is null then
    raise exception 'FORBIDDEN: profile is not completed' using errcode = '42501';
  end if;
  trimmed := btrim(coalesce(p_title, ''));
  if char_length(trimmed) < 1 or char_length(trimmed) > 60 or trimmed ~ '[<>]' then
    raise exception 'VALIDATION: title must be 1 to 60 characters without < or >' using errcode = '23514';
  end if;
  if p_visibility not in ('solo', 'open', 'invite_only') then
    raise exception 'VALIDATION: visibility is invalid' using errcode = '23514';
  end if;
  if p_duration_minutes is null or p_duration_minutes < 30 or p_duration_minutes > 180 then
    raise exception 'VALIDATION: durationMinutes must be between 30 and 180' using errcode = '23514';
  end if;
  if p_local_time is null or p_local_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or substring(p_local_time, 4, 2)::integer % 5 <> 0 then
    raise exception 'VALIDATION: localTime must be HH:MM on a 5-minute grid' using errcode = '23514';
  end if;
  if p_local_date is null then
    raise exception 'VALIDATION: localDate is required' using errcode = '23514';
  end if;
  if p_visibility = 'solo' and (p_seat_limit <> 1 or coalesce(array_length(p_invitee_ids, 1), 0) <> 0) then
    raise exception 'VALIDATION: a solo session has one seat and no invites' using errcode = '23514';
  end if;
  if p_visibility <> 'solo' and (p_seat_limit < 2 or p_seat_limit > 6) then
    raise exception 'VALIDATION: seatLimit must be from 2 to 6' using errcode = '23514';
  end if;
  if p_visibility = 'invite_only' and coalesce(array_length(p_invitee_ids, 1), 0) < 1 then
    raise exception 'VALIDATION: invite at least one study partner' using errcode = '23514';
  end if;
  if (select count(*) from unnest(coalesce(p_invitee_ids, array[]::uuid[])) as invitee_id) <>
     (select count(distinct invitee_id) from unnest(coalesce(p_invitee_ids, array[]::uuid[])) as invitee_id) then
    raise exception 'VALIDATION: inviteeIds must be unique' using errcode = '23514';
  end if;
  if coalesce(array_length(p_invitee_ids, 1), 0) > p_seat_limit - 1 then
    raise exception 'CONFLICT: not enough seats for those invitations' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.profile_courses pc
    where pc.user_id = uid and pc.course_id = p_course_id
  ) then
    raise exception 'VALIDATION: course is not on your profile' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.locations l
    where l.id = p_location_id and l.university_id = profile_university and l.is_active
  ) then
    raise exception 'VALIDATION: location is not available for this university' using errcode = '23514';
  end if;

  local_ts := p_local_date + p_local_time::time;
  starts_at := public.campus_instant(local_ts);
  ends_at := starts_at + make_interval(mins => p_duration_minutes);
  if starts_at <= pg_catalog.clock_timestamp() then
    raise exception 'VALIDATION: that time has passed in America/Chicago' using errcode = '23514';
  end if;
  if starts_at > pg_catalog.clock_timestamp() + interval '180 days' then
    raise exception 'VALIDATION: pick a time within the next 180 days' using errcode = '23514';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text, 0));
  if exists (
    select 1 from public.study_session_commitments c
    where c.user_id = uid
      and tstzrange(c.starts_at, c.ends_at, '[)') && tstzrange(starts_at, ends_at, '[)')
  ) then
    raise exception 'CONFLICT: that time overlaps another session' using errcode = 'P0001';
  end if;

  insert into public.study_sessions (
    host_id, university_id, course_id, location_id, title, visibility, seat_limit, starts_at, ends_at, status
  ) values (
    uid, profile_university, p_course_id, p_location_id, trimmed, p_visibility, p_seat_limit, starts_at, ends_at, 'scheduled'
  ) returning id into new_id;

  insert into public.study_session_participants (session_id, user_id, role, status)
  values (new_id, uid, 'host', 'accepted');
  insert into public.study_session_commitments (user_id, session_id, starts_at, ends_at)
  values (uid, new_id, starts_at, ends_at);

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('session:' || new_id::text, 1));
  foreach invitee in array coalesce(p_invitee_ids, array[]::uuid[]) loop
    perform public.assert_session_partner(uid, invitee);
    select count(*) filter (where status in ('accepted', 'invited')) into reserved
    from public.study_session_participants where session_id = new_id;
    if reserved >= p_seat_limit then
      raise exception 'CONFLICT: not enough seats for those invitations' using errcode = 'P0001';
    end if;
    insert into public.study_session_participants (session_id, user_id, role, status)
    values (new_id, invitee, 'invitee', 'invited');
  end loop;

  return public.study_session_payload(new_id);
exception
  when exclusion_violation then
    raise exception 'CONFLICT: that time overlaps another session' using errcode = 'P0001';
end;
$fn$;

create or replace function public.list_my_study_sessions(p_when text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $fn$
declare
  uid uuid := auth.uid();
  result jsonb;
begin
  if uid is null then
    raise exception 'UNAUTHENTICATED: authentication required' using errcode = '28000';
  end if;
  if p_when not in ('upcoming', 'past') then
    raise exception 'VALIDATION: when is invalid' using errcode = '23514';
  end if;
  select coalesce(jsonb_agg(public.study_session_payload(s.id) order by s.starts_at, s.id), '[]'::jsonb)
  into result
  from public.study_sessions s
  join public.study_session_participants p on p.session_id = s.id and p.user_id = uid
  where s.status = 'scheduled'
    and (
      (p_when = 'upcoming' and s.ends_at > pg_catalog.clock_timestamp() and p.status in ('invited', 'requested', 'accepted'))
      or (p_when = 'past' and s.ends_at <= pg_catalog.clock_timestamp() and (s.host_id = uid or p.status = 'accepted'))
    );
  return result;
end;
$fn$;

create or replace function public.list_open_study_sessions(p_course_id uuid, p_today boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $fn$
declare
  uid uuid := auth.uid();
  campus uuid;
  result jsonb;
begin
  if uid is null then
    raise exception 'UNAUTHENTICATED: authentication required' using errcode = '28000';
  end if;
  select university_id into campus from public.profiles where id = uid;
  if campus is null then
    raise exception 'FORBIDDEN: profile is not completed' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id,
    'title', s.title,
    'course', jsonb_build_object('id', c.id, 'universityId', c.university_id, 'code', c.code, 'title', c.title),
    'location', jsonb_build_object('id', l.id, 'name', l.name, 'buildingCode', l.building_code),
    'seatLimit', s.seat_limit,
    'seatsTaken', (
      select count(*) from public.study_session_participants p
      where p.session_id = s.id and p.status = 'accepted'
    ),
    'seatsReserved', (
      select count(*) from public.study_session_participants p
      where p.session_id = s.id and p.status in ('accepted', 'invited')
    ),
    'startsAt', s.starts_at,
    'endsAt', s.ends_at,
    'host', jsonb_build_object('id', h.id, 'displayName', h.display_name, 'major', h.major, 'academicYear', h.academic_year),
    'myStatus', (
      select p.status from public.study_session_participants p
      where p.session_id = s.id and p.user_id = uid
    )
  ) order by s.starts_at, s.id), '[]'::jsonb)
  into result
  from public.study_sessions s
  join public.courses c on c.id = s.course_id
  join public.locations l on l.id = s.location_id
  join public.profiles h on h.id = s.host_id
  where s.visibility = 'open'
    and s.status = 'scheduled'
    and s.ends_at > pg_catalog.clock_timestamp()
    and s.university_id = campus
    and s.host_id <> uid
    and (p_course_id is null or s.course_id = p_course_id)
    and (
      p_today is not true
      or (s.starts_at at time zone 'America/Chicago')::date = (pg_catalog.clock_timestamp() at time zone 'America/Chicago')::date
    )
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = uid and b.blocked_id = s.host_id)
         or (b.blocker_id = s.host_id and b.blocked_id = uid)
    );
  return result;
end;
$fn$;

create or replace function public.get_study_session(p_session_id uuid)
returns jsonb
language sql
volatile
security definer
set search_path = public, extensions
as $fn$
  select public.study_session_payload(p_session_id);
$fn$;

create or replace function public.invite_to_study_session(p_session_id uuid, p_invitee_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $fn$
declare
  uid uuid := auth.uid();
  s public.study_sessions%rowtype;
  reserved integer;
begin
  if uid is null then
    raise exception 'UNAUTHENTICATED: authentication required' using errcode = '28000';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('session:' || p_session_id::text, 1));
  select * into s from public.study_sessions where id = p_session_id for update;
  if not found or s.host_id <> uid then
    raise exception 'NOT_FOUND: session not found' using errcode = 'P0002';
  end if;
  if s.status <> 'scheduled' or s.ends_at <= pg_catalog.clock_timestamp() then
    raise exception 'CONFLICT: that session is no longer open for invites' using errcode = 'P0001';
  end if;
  if s.visibility = 'solo' then
    raise exception 'FORBIDDEN: a solo session cannot take invites' using errcode = '42501';
  end if;
  perform public.assert_session_partner(uid, p_invitee_id);
  if exists (
    select 1 from public.study_session_participants
    where session_id = s.id and user_id = p_invitee_id and status in ('invited', 'requested', 'accepted')
  ) then
    raise exception 'CONFLICT: that student already has a seat or a pending invite' using errcode = 'P0001';
  end if;
  select count(*) filter (where status in ('accepted', 'invited')) into reserved
  from public.study_session_participants where session_id = s.id;
  if reserved >= s.seat_limit then
    raise exception 'CONFLICT: every seat is reserved' using errcode = 'P0001';
  end if;
  insert into public.study_session_participants (session_id, user_id, role, status)
  values (s.id, p_invitee_id, 'invitee', 'invited')
  on conflict (session_id, user_id) do update
    set role = 'invitee', status = 'invited', updated_at = pg_catalog.clock_timestamp()
    where public.study_session_participants.status in ('declined', 'left', 'cancelled');
  if not found then
    raise exception 'CONFLICT: that student already has a seat or a pending invite' using errcode = 'P0001';
  end if;
  return public.study_session_payload(s.id);
end;
$fn$;

create or replace function public.respond_study_session_invite(p_session_id uuid, p_status text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $fn$
declare
  uid uuid := auth.uid();
  s public.study_sessions%rowtype;
  current_status text;
begin
  if uid is null then
    raise exception 'UNAUTHENTICATED: authentication required' using errcode = '28000';
  end if;
  if p_status not in ('accepted', 'declined') then
    raise exception 'VALIDATION: status is invalid' using errcode = '23514';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('session:' || p_session_id::text, 1));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text, 0));
  select * into s from public.study_sessions where id = p_session_id for update;
  if not found then
    raise exception 'NOT_FOUND: session not found' using errcode = 'P0002';
  end if;
  select status into current_status
  from public.study_session_participants
  where session_id = s.id and user_id = uid and role = 'invitee'
  for update;
  if current_status is null then
    raise exception 'NOT_FOUND: session not found' using errcode = 'P0002';
  end if;
  if current_status <> 'invited' or s.status <> 'scheduled' or s.ends_at <= pg_catalog.clock_timestamp() then
    raise exception 'CONFLICT: that invitation is no longer pending' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.profiles me
    where me.id = uid and me.university_id = s.university_id
  ) then
    raise exception 'FORBIDDEN: invitee is on another campus' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.blocks b
    where (b.blocker_id = uid and b.blocked_id = s.host_id)
       or (b.blocker_id = s.host_id and b.blocked_id = uid)
  ) then
    raise exception 'NOT_FOUND: session not found' using errcode = 'P0002';
  end if;
  if p_status = 'declined' then
    update public.study_session_participants set status = 'declined'
    where session_id = s.id and user_id = uid and status = 'invited';
    if not found then
      raise exception 'CONFLICT: that invitation is no longer pending' using errcode = 'P0001';
    end if;
    return public.study_session_payload(s.id, true);
  end if;
  if exists (
    select 1 from public.study_session_commitments c
    where c.user_id = uid
      and c.session_id <> s.id
      and tstzrange(c.starts_at, c.ends_at, '[)') && tstzrange(s.starts_at, s.ends_at, '[)')
  ) then
    raise exception 'CONFLICT: that time overlaps another session' using errcode = 'P0001';
  end if;
  update public.study_session_participants set status = 'accepted'
  where session_id = s.id and user_id = uid and status = 'invited';
  if not found then
    raise exception 'CONFLICT: that invitation is no longer pending' using errcode = 'P0001';
  end if;
  insert into public.study_session_commitments (user_id, session_id, starts_at, ends_at)
  values (uid, s.id, s.starts_at, s.ends_at);
  return public.study_session_payload(s.id);
exception
  when exclusion_violation then
    raise exception 'CONFLICT: that time overlaps another session' using errcode = 'P0001';
end;
$fn$;

create or replace function public.request_join_study_session(p_session_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $fn$
declare
  uid uuid := auth.uid();
  s public.study_sessions%rowtype;
  campus uuid;
  existing text;
begin
  if uid is null then
    raise exception 'UNAUTHENTICATED: authentication required' using errcode = '28000';
  end if;
  select university_id into campus from public.profiles where id = uid;
  if campus is null then
    raise exception 'FORBIDDEN: profile is not completed' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('session:' || p_session_id::text, 1));
  select * into s from public.study_sessions where id = p_session_id for update;
  if not found or s.visibility <> 'open' or s.status <> 'scheduled' or s.ends_at <= pg_catalog.clock_timestamp()
     or s.university_id <> campus or s.host_id = uid then
    raise exception 'NOT_FOUND: session not found' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.blocks b
    where (b.blocker_id = uid and b.blocked_id = s.host_id)
       or (b.blocker_id = s.host_id and b.blocked_id = uid)
  ) then
    raise exception 'NOT_FOUND: session not found' using errcode = 'P0002';
  end if;
  select status into existing from public.study_session_participants where session_id = s.id and user_id = uid;
  if existing in ('requested', 'invited', 'accepted') then
    raise exception 'CONFLICT: you already have a request or a seat' using errcode = 'P0001';
  end if;
  if existing is null then
    insert into public.study_session_participants (session_id, user_id, role, status)
    values (s.id, uid, 'joiner', 'requested');
  else
    update public.study_session_participants
    set role = 'joiner', status = 'requested'
    where session_id = s.id and user_id = uid and status in ('declined', 'left', 'cancelled');
    if not found then
      raise exception 'CONFLICT: you already have a request or a seat' using errcode = 'P0001';
    end if;
  end if;
  return public.study_session_payload(s.id);
end;
$fn$;

create or replace function public.respond_study_session_join(p_session_id uuid, p_user_id uuid, p_status text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $fn$
declare
  uid uuid := auth.uid();
  s public.study_sessions%rowtype;
  reserved integer;
  current_status text;
begin
  if uid is null then
    raise exception 'UNAUTHENTICATED: authentication required' using errcode = '28000';
  end if;
  if p_status not in ('accepted', 'declined') then
    raise exception 'VALIDATION: status is invalid' using errcode = '23514';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('session:' || p_session_id::text, 1));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));
  select * into s from public.study_sessions where id = p_session_id for update;
  if not found or s.host_id <> uid then
    raise exception 'NOT_FOUND: session not found' using errcode = 'P0002';
  end if;
  select status into current_status
  from public.study_session_participants
  where session_id = s.id and user_id = p_user_id and role = 'joiner'
  for update;
  if current_status is null then
    raise exception 'NOT_FOUND: join request not found' using errcode = 'P0002';
  end if;
  if current_status <> 'requested' or s.status <> 'scheduled' or s.ends_at <= pg_catalog.clock_timestamp() then
    raise exception 'CONFLICT: that join request is no longer pending' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.profiles student
    where student.id = p_user_id and student.university_id = s.university_id
  ) then
    raise exception 'FORBIDDEN: that student is on another campus' using errcode = '42501';
  end if;
  if p_status = 'declined' then
    update public.study_session_participants set status = 'declined'
    where session_id = s.id and user_id = p_user_id and status = 'requested';
    if not found then
      raise exception 'CONFLICT: that join request is no longer pending' using errcode = 'P0001';
    end if;
    return public.study_session_payload(s.id, true);
  end if;
  select count(*) filter (where status in ('accepted', 'invited')) into reserved
  from public.study_session_participants where session_id = s.id;
  if reserved >= s.seat_limit then
    raise exception 'CONFLICT: every seat is reserved' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.blocks b
    where (b.blocker_id = uid and b.blocked_id = p_user_id)
       or (b.blocker_id = p_user_id and b.blocked_id = uid)
  ) then
    raise exception 'FORBIDDEN: that student is blocked' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.study_session_commitments c
    where c.user_id = p_user_id
      and c.session_id <> s.id
      and tstzrange(c.starts_at, c.ends_at, '[)') && tstzrange(s.starts_at, s.ends_at, '[)')
  ) then
    raise exception 'CONFLICT: that time overlaps another session' using errcode = 'P0001';
  end if;
  update public.study_session_participants set status = 'accepted'
  where session_id = s.id and user_id = p_user_id and status = 'requested';
  if not found then
    raise exception 'CONFLICT: that join request is no longer pending' using errcode = 'P0001';
  end if;
  insert into public.study_session_commitments (user_id, session_id, starts_at, ends_at)
  values (p_user_id, s.id, s.starts_at, s.ends_at);
  return public.study_session_payload(s.id);
exception
  when exclusion_violation then
    raise exception 'CONFLICT: that time overlaps another session' using errcode = 'P0001';
end;
$fn$;

create or replace function public.leave_study_session(p_session_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $fn$
declare
  uid uuid := auth.uid();
  s public.study_sessions%rowtype;
  current_role text;
  current_status text;
begin
  if uid is null then
    raise exception 'UNAUTHENTICATED: authentication required' using errcode = '28000';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('session:' || p_session_id::text, 1));
  select * into s from public.study_sessions where id = p_session_id for update;
  if not found then
    raise exception 'NOT_FOUND: session not found' using errcode = 'P0002';
  end if;
  select role, status into current_role, current_status
  from public.study_session_participants
  where session_id = s.id and user_id = uid
  for update;
  if current_role is null then
    raise exception 'NOT_FOUND: session not found' using errcode = 'P0002';
  end if;
  if current_role = 'host' then
    raise exception 'FORBIDDEN: the host cancels the session instead of leaving' using errcode = '42501';
  end if;
  if current_status <> 'accepted' or s.status <> 'scheduled' then
    raise exception 'CONFLICT: you do not have a seat to leave' using errcode = 'P0001';
  end if;
  update public.study_session_participants set status = 'left'
  where session_id = s.id and user_id = uid and status = 'accepted';
  if not found then
    raise exception 'CONFLICT: you do not have a seat to leave' using errcode = 'P0001';
  end if;
  delete from public.study_session_commitments where session_id = s.id and user_id = uid;
  return public.study_session_payload(s.id, true);
end;
$fn$;

create or replace function public.cancel_study_session(p_session_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $fn$
declare
  uid uuid := auth.uid();
  s public.study_sessions%rowtype;
begin
  if uid is null then
    raise exception 'UNAUTHENTICATED: authentication required' using errcode = '28000';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('session:' || p_session_id::text, 1));
  select * into s from public.study_sessions where id = p_session_id for update;
  if not found or s.host_id <> uid then
    raise exception 'NOT_FOUND: session not found' using errcode = 'P0002';
  end if;
  if s.status = 'scheduled' then
    delete from public.study_session_commitments where session_id = s.id;
    update public.study_session_participants
    set status = 'cancelled'
    where session_id = s.id and status in ('invited', 'requested', 'accepted');
    update public.study_sessions
    set status = 'cancelled', cancelled_at = pg_catalog.clock_timestamp()
    where id = s.id;
  end if;
  return public.study_session_payload(s.id);
end;
$fn$;

create or replace function public.enforce_profile_university_change()
returns trigger
language plpgsql
set search_path = ''
as $fn$
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
    if exists (
      select 1 from public.study_sessions s
      where s.host_id = new.id and s.status = 'scheduled' and s.ends_at > pg_catalog.clock_timestamp()
    ) or exists (
      select 1
      from public.study_session_participants p
      join public.study_sessions s on s.id = p.session_id
      where p.user_id = new.id
        and p.status = 'accepted'
        and s.status = 'scheduled'
        and s.ends_at > pg_catalog.clock_timestamp()
    ) then
      raise exception 'CONFLICT: university cannot change while a study session is scheduled' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$fn$;

create or replace function public.apply_block_to_study_sessions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  target_id uuid;
begin
  -- Same session lock, in id order, that accept, leave, and cancel hold.
  -- Taking it first avoids writing a commitment back after this trigger deletes it.
  for target_id in
    select s.id
    from public.study_sessions s
    where s.status = 'scheduled'
      and s.ends_at > pg_catalog.clock_timestamp()
      and s.host_id in (new.blocker_id, new.blocked_id)
    order by s.id
  loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('session:' || target_id::text, 1));
  end loop;

  update public.study_session_participants p
  set status = 'cancelled'
  from public.study_sessions s
  where p.session_id = s.id
    and s.status = 'scheduled'
    and s.ends_at > pg_catalog.clock_timestamp()
    and p.role <> 'host'
    and p.status in ('invited', 'requested', 'accepted')
    and (
      (s.host_id = new.blocker_id and p.user_id = new.blocked_id)
      or (s.host_id = new.blocked_id and p.user_id = new.blocker_id)
    );
  delete from public.study_session_commitments c
  using public.study_sessions s
  where c.session_id = s.id
    and s.status = 'scheduled'
    and s.ends_at > pg_catalog.clock_timestamp()
    and (
      (s.host_id = new.blocker_id and c.user_id = new.blocked_id)
      or (s.host_id = new.blocked_id and c.user_id = new.blocker_id)
    );
  return new;
end;
$fn$;

create trigger blocks_apply_study_sessions
  after insert on public.blocks
  for each row execute function public.apply_block_to_study_sessions();

alter table public.study_sessions enable row level security;
alter table public.study_session_participants enable row level security;
alter table public.study_session_commitments enable row level security;

-- Policies call security-definer predicates. A policy that selected the other
-- table directly would recurse, because each table's policy would re-enter the other.
create or replace function public.study_session_visible(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select exists (
    select 1
    from public.study_sessions s
    where s.id = p_session_id
      and (
        s.host_id = auth.uid()
        or exists (
          select 1
          from public.study_session_participants p
          where p.session_id = s.id
            and p.user_id = auth.uid()
            and p.status in ('invited', 'requested', 'accepted')
            and not exists (
              select 1
              from public.blocks b
              where (b.blocker_id = auth.uid() and b.blocked_id = s.host_id)
                 or (b.blocker_id = s.host_id and b.blocked_id = auth.uid())
            )
        )
      )
  );
$fn$;

create or replace function public.study_session_participant_visible(p_session_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select auth.uid() is not null
    and (
      p_user_id = auth.uid()
      or exists (
        select 1
        from public.study_sessions s
        where s.id = p_session_id
          and s.host_id = auth.uid()
      )
    );
$fn$;

create policy "study_sessions_select_participant" on public.study_sessions
  for select to authenticated
  using (public.study_session_visible(id));

create policy "study_session_participants_select_own_or_host" on public.study_session_participants
  for select to authenticated
  using (public.study_session_participant_visible(session_id, user_id));

create policy "study_session_commitments_select_own" on public.study_session_commitments
  for select to authenticated
  using (user_id = auth.uid());

revoke all on public.study_sessions, public.study_session_participants, public.study_session_commitments from public, anon, authenticated;
grant select on public.study_sessions, public.study_session_participants, public.study_session_commitments to authenticated;
grant all on public.study_sessions, public.study_session_participants, public.study_session_commitments to service_role;

revoke all on function public.campus_instant(timestamp) from public, anon, authenticated;
revoke all on function public.study_session_payload(uuid, boolean) from public, anon, authenticated;
revoke all on function public.assert_session_partner(uuid, uuid) from public, anon, authenticated;
revoke all on function public.study_session_visible(uuid) from public, anon;
revoke all on function public.study_session_participant_visible(uuid, uuid) from public, anon;
revoke all on function public.enforce_profile_university_change() from public, anon, authenticated;
revoke all on function public.apply_block_to_study_sessions() from public, anon, authenticated;

revoke all on function public.create_study_session(text, uuid, uuid, date, text, integer, text, integer, uuid[]) from public, anon;
revoke all on function public.list_my_study_sessions(text) from public, anon;
revoke all on function public.list_open_study_sessions(uuid, boolean) from public, anon;
revoke all on function public.get_study_session(uuid) from public, anon;
revoke all on function public.invite_to_study_session(uuid, uuid) from public, anon;
revoke all on function public.respond_study_session_invite(uuid, text) from public, anon;
revoke all on function public.request_join_study_session(uuid) from public, anon;
revoke all on function public.respond_study_session_join(uuid, uuid, text) from public, anon;
revoke all on function public.leave_study_session(uuid) from public, anon;
revoke all on function public.cancel_study_session(uuid) from public, anon;

grant execute on function public.create_study_session(text, uuid, uuid, date, text, integer, text, integer, uuid[]) to authenticated;
grant execute on function public.list_my_study_sessions(text) to authenticated;
grant execute on function public.list_open_study_sessions(uuid, boolean) to authenticated;
grant execute on function public.get_study_session(uuid) to authenticated;
grant execute on function public.invite_to_study_session(uuid, uuid) to authenticated;
grant execute on function public.respond_study_session_invite(uuid, text) to authenticated;
grant execute on function public.request_join_study_session(uuid) to authenticated;
grant execute on function public.respond_study_session_join(uuid, uuid, text) to authenticated;
grant execute on function public.leave_study_session(uuid) to authenticated;
grant execute on function public.cancel_study_session(uuid) to authenticated;
grant execute on function public.study_session_visible(uuid) to authenticated;
grant execute on function public.study_session_participant_visible(uuid, uuid) to authenticated;
