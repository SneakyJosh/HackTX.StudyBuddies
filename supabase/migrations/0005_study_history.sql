-- Milestone 10 study history. Forward-only. Does not edit 0001–0004.
-- Hours are self-reported. Completion is per person. Unconfirmed bookings stay unconfirmed.
-- Apply only after review.

create table public.study_session_attendance (
  session_id uuid not null references public.study_sessions (id) on delete restrict,
  user_id uuid not null references public.profiles (id) on delete restrict,
  outcome text not null check (outcome in ('completed', 'missed')),
  credited_minutes integer not null check (credited_minutes between 0 and 180),
  counts_toward_stats boolean not null,
  campus_date date not null,
  recorded_at timestamptz not null default now(),
  display_name text not null,
  major text,
  academic_year text,
  roster jsonb not null,
  primary key (session_id, user_id),
  check (
    (outcome = 'missed' and credited_minutes = 0 and counts_toward_stats = false)
    or outcome = 'completed'
  ),
  check (counts_toward_stats = (outcome = 'completed' and credited_minutes >= 30))
);

create table public.study_session_ratings (
  session_id uuid not null references public.study_sessions (id) on delete restrict,
  rater_id uuid not null references public.profiles (id) on delete restrict,
  category text not null check (category in ('study_time', 'environment', 'chemistry')),
  subject_user_id uuid references public.profiles (id) on delete restrict,
  stars integer not null check (stars between 1 and 5),
  created_at timestamptz not null default now(),
  primary key (session_id, rater_id, category, subject_user_id),
  check (
    (category in ('study_time', 'environment') and subject_user_id = rater_id)
    or (category = 'chemistry' and subject_user_id is not null and subject_user_id <> rater_id)
  )
);

create index study_session_attendance_user_day_idx
  on public.study_session_attendance (user_id, campus_date)
  where counts_toward_stats;

-- Chemistry subjects are other students. Study time and environment use the
-- rater as the subject so the primary key can reject a duplicate without nulls.
create unique index study_session_ratings_one_chemistry_idx
  on public.study_session_ratings (session_id, rater_id, subject_user_id)
  where category = 'chemistry';

alter table public.study_session_attendance enable row level security;
alter table public.study_session_ratings enable row level security;

create policy "study_session_attendance_select_own" on public.study_session_attendance
  for select to authenticated
  using (user_id = auth.uid());

create policy "study_session_ratings_select_own" on public.study_session_ratings
  for select to authenticated
  using (rater_id = auth.uid());

revoke all on public.study_session_attendance, public.study_session_ratings from public, anon, authenticated;
grant select on public.study_session_attendance, public.study_session_ratings to authenticated;
grant all on public.study_session_attendance, public.study_session_ratings to service_role;

create or replace function public.study_record_payload(p_session_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $fn$
declare
  uid uuid := auth.uid();
  s public.study_sessions%rowtype;
  attendance public.study_session_attendance%rowtype;
  course_row public.courses%rowtype;
  location_row public.locations%rowtype;
  people jsonb;
  study_stars integer;
  place_stars integer;
  chemistry jsonb;
begin
  if uid is null or uid <> p_user_id then
    raise exception 'NOT_FOUND: session not found' using errcode = 'P0002';
  end if;
  select * into attendance
  from public.study_session_attendance
  where session_id = p_session_id and user_id = uid;
  if not found then
    raise exception 'NOT_FOUND: session not found' using errcode = 'P0002';
  end if;
  select * into s from public.study_sessions where id = p_session_id;
  select * into course_row from public.courses where id = s.course_id;
  select * into location_row from public.locations where id = s.location_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', person->>'id',
    'displayName', person->>'displayName',
    'major', person->'major',
    'academicYear', person->'academicYear'
  ) order by person->>'displayName', person->>'id'), '[]'::jsonb)
  into people
  from jsonb_array_elements(attendance.roster) person
  where person->>'id' <> uid::text
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = uid and b.blocked_id = (person->>'id')::uuid)
         or (b.blocker_id = (person->>'id')::uuid and b.blocked_id = uid)
    );

  select stars into study_stars from public.study_session_ratings
  where session_id = s.id and rater_id = uid and category = 'study_time';
  select stars into place_stars from public.study_session_ratings
  where session_id = s.id and rater_id = uid and category = 'environment';
  select coalesce(jsonb_agg(jsonb_build_object('userId', r.subject_user_id, 'stars', r.stars)
    order by r.subject_user_id), '[]'::jsonb)
  into chemistry
  from public.study_session_ratings r
  where r.session_id = s.id and r.rater_id = uid and r.category = 'chemistry'
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = uid and b.blocked_id = r.subject_user_id)
         or (b.blocker_id = r.subject_user_id and b.blocked_id = uid)
    );

  return jsonb_build_object(
    'id', s.id,
    'title', s.title,
    'course', jsonb_build_object('id', course_row.id, 'universityId', course_row.university_id, 'code', course_row.code, 'title', course_row.title),
    'location', jsonb_build_object('id', location_row.id, 'name', location_row.name, 'buildingCode', location_row.building_code),
    'startsAt', s.starts_at,
    'endsAt', s.ends_at,
    'sessionStatus', s.status,
    'attendance', attendance.outcome,
    'creditedMinutes', attendance.credited_minutes,
    'countsTowardStats', attendance.counts_toward_stats,
    'campusDate', attendance.campus_date,
    'recordedAt', attendance.recorded_at,
    'selfReported', true,
    'participants', people,
    'myRatings', jsonb_build_object(
      'studyTime', study_stars,
      'environment', place_stars,
      'chemistry', chemistry
    )
  );
end;
$fn$;

create or replace function public.assert_session_recorder(p_session_id uuid)
returns public.study_sessions
language plpgsql
volatile
security definer
set search_path = public, extensions
as $fn$
declare
  uid uuid := auth.uid();
  s public.study_sessions%rowtype;
  caller_status text;
begin
  if uid is null then
    raise exception 'UNAUTHENTICATED: authentication required' using errcode = '28000';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('session:' || p_session_id::text, 1));
  select * into s from public.study_sessions where id = p_session_id for update;
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
  select status into caller_status
  from public.study_session_participants
  where session_id = s.id and user_id = uid
  for update;
  if caller_status is distinct from 'accepted' then
    raise exception 'NOT_FOUND: session not found' using errcode = 'P0002';
  end if;
  return s;
end;
$fn$;

create or replace function public.finish_study_session(p_session_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $fn$
declare
  uid uuid := auth.uid();
  s public.study_sessions%rowtype;
  prior text;
  booked_minutes integer;
  elapsed_minutes integer;
  credited integer;
  me public.profiles%rowtype;
  roster jsonb;
begin
  if uid is null then
    raise exception 'UNAUTHENTICATED: authentication required' using errcode = '28000';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('session:' || p_session_id::text, 1));
  select * into s from public.study_sessions where id = p_session_id for update;
  if not found then
    raise exception 'NOT_FOUND: session not found' using errcode = 'P0002';
  end if;
  select outcome into prior
  from public.study_session_attendance
  where session_id = s.id and user_id = uid;
  -- A second finish returns the stored record. It does not add minutes,
  -- including after the booking was cancelled.
  if prior = 'completed' then
    return public.study_record_payload(s.id, uid);
  end if;
  if prior = 'missed' then
    raise exception 'CONFLICT: that session was already marked missed' using errcode = 'P0001';
  end if;
  perform public.assert_session_recorder(p_session_id);
  if s.status <> 'scheduled' then
    raise exception 'CONFLICT: that booking is cancelled' using errcode = 'P0001';
  end if;
  if pg_catalog.clock_timestamp() < s.starts_at then
    raise exception 'CONFLICT: that session has not started' using errcode = 'P0001';
  end if;
  if pg_catalog.clock_timestamp() > s.ends_at + interval '2 hours' then
    raise exception 'CONFLICT: the finish window has closed' using errcode = 'P0001';
  end if;

  booked_minutes := floor(extract(epoch from (s.ends_at - s.starts_at)) / 60)::integer;
  elapsed_minutes := greatest(0, floor(extract(epoch from (pg_catalog.clock_timestamp() - s.starts_at)) / 60))::integer;
  if pg_catalog.clock_timestamp() >= s.ends_at then
    credited := booked_minutes;
  else
    credited := least(booked_minutes, elapsed_minutes);
  end if;

  select * into me from public.profiles where id = uid;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', pr.id,
    'displayName', pr.display_name,
    'major', pr.major,
    'academicYear', pr.academic_year,
    'role', participant.role
  ) order by pr.display_name, pr.id), '[]'::jsonb)
  into roster
  from public.study_session_participants participant
  join public.profiles pr on pr.id = participant.user_id
  where participant.session_id = s.id and participant.status = 'accepted';

  insert into public.study_session_attendance (
    session_id, user_id, outcome, credited_minutes, counts_toward_stats, campus_date,
    display_name, major, academic_year, roster
  ) values (
    s.id, uid, 'completed', credited, credited >= 30,
    (s.starts_at at time zone 'America/Chicago')::date,
    me.display_name, me.major, me.academic_year, roster
  );
  return public.study_record_payload(s.id, uid);
exception
  when unique_violation then
    select outcome into prior
    from public.study_session_attendance
    where session_id = p_session_id and user_id = auth.uid();
    if prior = 'completed' then
      return public.study_record_payload(p_session_id, auth.uid());
    end if;
    raise exception 'CONFLICT: that session was already marked missed' using errcode = 'P0001';
end;
$fn$;

create or replace function public.miss_study_session(p_session_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $fn$
declare
  uid uuid := auth.uid();
  s public.study_sessions%rowtype;
  prior text;
  me public.profiles%rowtype;
  roster jsonb;
begin
  if uid is null then
    raise exception 'UNAUTHENTICATED: authentication required' using errcode = '28000';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('session:' || p_session_id::text, 1));
  select * into s from public.study_sessions where id = p_session_id for update;
  if not found then
    raise exception 'NOT_FOUND: session not found' using errcode = 'P0002';
  end if;
  select outcome into prior
  from public.study_session_attendance
  where session_id = s.id and user_id = uid;
  if prior = 'missed' then
    return public.study_record_payload(s.id, uid);
  end if;
  if prior = 'completed' then
    raise exception 'CONFLICT: that completion is already recorded' using errcode = 'P0001';
  end if;
  perform public.assert_session_recorder(p_session_id);
  if s.status <> 'scheduled' then
    raise exception 'CONFLICT: that booking is cancelled' using errcode = 'P0001';
  end if;
  if pg_catalog.clock_timestamp() < s.starts_at then
    raise exception 'CONFLICT: that session has not started' using errcode = 'P0001';
  end if;
  select * into me from public.profiles where id = uid;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', pr.id,
    'displayName', pr.display_name,
    'major', pr.major,
    'academicYear', pr.academic_year,
    'role', participant.role
  ) order by pr.display_name, pr.id), '[]'::jsonb)
  into roster
  from public.study_session_participants participant
  join public.profiles pr on pr.id = participant.user_id
  where participant.session_id = s.id and participant.status = 'accepted';
  insert into public.study_session_attendance (
    session_id, user_id, outcome, credited_minutes, counts_toward_stats, campus_date,
    display_name, major, academic_year, roster
  ) values (
    s.id, uid, 'missed', 0, false,
    (s.starts_at at time zone 'America/Chicago')::date,
    me.display_name, me.major, me.academic_year, roster
  );
  return public.study_record_payload(s.id, uid);
exception
  when unique_violation then
    select outcome into prior
    from public.study_session_attendance
    where session_id = p_session_id and user_id = auth.uid();
    if prior = 'missed' then
      return public.study_record_payload(p_session_id, auth.uid());
    end if;
    raise exception 'CONFLICT: that completion is already recorded' using errcode = 'P0001';
end;
$fn$;

-- Past bookings stay unconfirmed: an attendance row removes that caller from
-- upcoming and past, and nothing here writes missed rows.
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
    and not exists (
      select 1 from public.study_session_attendance a
      where a.session_id = s.id and a.user_id = uid
    )
    and (
      (p_when = 'upcoming' and s.ends_at > pg_catalog.clock_timestamp() and p.status in ('invited', 'requested', 'accepted'))
      or (p_when = 'past' and s.ends_at <= pg_catalog.clock_timestamp() and (s.host_id = uid or p.status = 'accepted'))
    );
  return result;
end;
$fn$;

create or replace function public.list_study_records(p_outcome text)
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
  if p_outcome not in ('completed', 'missed') then
    raise exception 'VALIDATION: when is invalid' using errcode = '23514';
  end if;
  select coalesce(jsonb_agg(public.study_record_payload(a.session_id, uid) order by s.starts_at desc, s.id), '[]'::jsonb)
  into result
  from public.study_session_attendance a
  join public.study_sessions s on s.id = a.session_id
  where a.user_id = uid and a.outcome = p_outcome;
  return result;
end;
$fn$;

create or replace function public.submit_study_ratings(
  p_session_id uuid,
  p_study_time integer,
  p_environment integer,
  p_chemistry jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $fn$
declare
  uid uuid := auth.uid();
  attendance public.study_session_attendance%rowtype;
  entry jsonb;
  subject uuid;
  stars integer;
  wrote boolean := false;
begin
  if uid is null then
    raise exception 'UNAUTHENTICATED: authentication required' using errcode = '28000';
  end if;
  select * into attendance
  from public.study_session_attendance
  where session_id = p_session_id and user_id = uid and outcome = 'completed';
  if not found then
    raise exception 'NOT_FOUND: session not found' using errcode = 'P0002';
  end if;
  if p_study_time is not null and (p_study_time < 1 or p_study_time > 5) then
    raise exception 'VALIDATION: studyTime must be from 1 to 5' using errcode = '23514';
  end if;
  if p_environment is not null and (p_environment < 1 or p_environment > 5) then
    raise exception 'VALIDATION: environment must be from 1 to 5' using errcode = '23514';
  end if;
  if p_study_time is not null then
    insert into public.study_session_ratings (session_id, rater_id, category, subject_user_id, stars)
    values (p_session_id, uid, 'study_time', uid, p_study_time);
    wrote := true;
  end if;
  if p_environment is not null then
    insert into public.study_session_ratings (session_id, rater_id, category, subject_user_id, stars)
    values (p_session_id, uid, 'environment', uid, p_environment);
    wrote := true;
  end if;
  if p_chemistry is not null and jsonb_typeof(p_chemistry) <> 'array' then
    raise exception 'VALIDATION: chemistry must be a list' using errcode = '23514';
  end if;
  for entry in select value from jsonb_array_elements(coalesce(p_chemistry, '[]'::jsonb)) loop
    if jsonb_typeof(entry) <> 'object' or (entry - 'userId' - 'stars') <> '{}'::jsonb then
      raise exception 'VALIDATION: chemistry entries must be userId and stars' using errcode = '23514';
    end if;
    subject := (entry->>'userId')::uuid;
    stars := (entry->>'stars')::integer;
    if stars is null or stars < 1 or stars > 5 then
      raise exception 'VALIDATION: stars must be from 1 to 5' using errcode = '23514';
    end if;
    if subject = uid or not exists (
      select 1 from jsonb_array_elements(attendance.roster) person
      where person->>'id' = subject::text and person->>'id' <> uid::text
    ) then
      raise exception 'VALIDATION: rate an accepted participant from that session' using errcode = '23514';
    end if;
    if exists (
      select 1 from public.blocks b
      where (b.blocker_id = uid and b.blocked_id = subject)
         or (b.blocker_id = subject and b.blocked_id = uid)
    ) then
      raise exception 'VALIDATION: rate an accepted participant from that session' using errcode = '23514';
    end if;
    insert into public.study_session_ratings (session_id, rater_id, category, subject_user_id, stars)
    values (p_session_id, uid, 'chemistry', subject, stars);
    wrote := true;
  end loop;
  if not wrote then
    raise exception 'VALIDATION: add at least one rating' using errcode = '23514';
  end if;
  return public.study_record_payload(p_session_id, uid);
exception
  when unique_violation then
    raise exception 'CONFLICT: that rating was already submitted' using errcode = 'P0001';
  when invalid_text_representation then
    raise exception 'VALIDATION: chemistry entries must be userId and stars' using errcode = '23514';
end;
$fn$;

create or replace function public.study_streak_length(p_user_id uuid, p_course_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = public, extensions
as $fn$
declare
  today_campus date := (pg_catalog.clock_timestamp() at time zone 'America/Chicago')::date;
  anchor date;
  cursor_day date;
  streak integer := 0;
begin
  anchor := today_campus;
  if not exists (
    select 1 from public.study_session_attendance a
    join public.study_sessions s on s.id = a.session_id
    where a.user_id = p_user_id and a.counts_toward_stats and a.campus_date = anchor
      and (p_course_id is null or s.course_id = p_course_id)
  ) then
    anchor := today_campus - 1;
  end if;
  if not exists (
    select 1 from public.study_session_attendance a
    join public.study_sessions s on s.id = a.session_id
    where a.user_id = p_user_id and a.counts_toward_stats and a.campus_date = anchor
      and (p_course_id is null or s.course_id = p_course_id)
  ) then
    return 0;
  end if;
  cursor_day := anchor;
  while exists (
    select 1 from public.study_session_attendance a
    join public.study_sessions s on s.id = a.session_id
    where a.user_id = p_user_id and a.counts_toward_stats and a.campus_date = cursor_day
      and (p_course_id is null or s.course_id = p_course_id)
  ) loop
    streak := streak + 1;
    cursor_day := cursor_day - 1;
  end loop;
  return streak;
end;
$fn$;

create or replace function public.study_self_report()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $fn$
declare
  uid uuid := auth.uid();
  chicago timestamp := pg_catalog.clock_timestamp() at time zone 'America/Chicago';
  week_start date := date_trunc('week', chicago)::date;
  total_minutes integer;
  week_total integer;
  week jsonb;
  courses jsonb;
begin
  if uid is null then
    raise exception 'UNAUTHENTICATED: authentication required' using errcode = '28000';
  end if;
  select coalesce(sum(a.credited_minutes), 0)::integer into total_minutes
  from public.study_session_attendance a
  where a.user_id = uid and a.counts_toward_stats;
  select coalesce(jsonb_agg(jsonb_build_object(
    'date', day_value::date,
    'minutes', coalesce((
      select sum(a.credited_minutes) from public.study_session_attendance a
      where a.user_id = uid and a.counts_toward_stats and a.campus_date = day_value::date
    ), 0)
  ) order by day_value), '[]'::jsonb)
  into week
  from generate_series(week_start, week_start + 6, interval '1 day') as day_value;
  select coalesce(sum((item->>'minutes')::integer), 0)::integer into week_total
  from jsonb_array_elements(week) item;
  select coalesce(jsonb_agg(jsonb_build_object(
    'courseId', c.id,
    'code', c.code,
    'title', c.title,
    'streakDays', public.study_streak_length(uid, c.id)
  ) order by c.code), '[]'::jsonb)
  into courses
  from public.courses c
  where exists (
    select 1 from public.study_session_attendance a
    join public.study_sessions s on s.id = a.session_id
    where a.user_id = uid and a.counts_toward_stats and s.course_id = c.id
  );
  return jsonb_build_object(
    'selfReported', true,
    'description', 'Self-reported study time. Not independently verified, and not used for matching.',
    'streakDays', public.study_streak_length(uid, null),
    'qualifyingMinutes', total_minutes,
    'weekMinutes', week_total,
    'week', week,
    'courseStreaks', courses
  );
end;
$fn$;

revoke all on function public.study_record_payload(uuid, uuid) from public, anon, authenticated;
revoke all on function public.assert_session_recorder(uuid) from public, anon, authenticated;
revoke all on function public.study_streak_length(uuid, uuid) from public, anon, authenticated;

revoke all on function public.finish_study_session(uuid) from public, anon;
revoke all on function public.miss_study_session(uuid) from public, anon;
revoke all on function public.list_study_records(text) from public, anon;
revoke all on function public.submit_study_ratings(uuid, integer, integer, jsonb) from public, anon;
revoke all on function public.study_self_report() from public, anon;

grant execute on function public.finish_study_session(uuid) to authenticated;
grant execute on function public.miss_study_session(uuid) to authenticated;
grant execute on function public.list_study_records(text) to authenticated;
grant execute on function public.submit_study_ratings(uuid, integer, integer, jsonb) to authenticated;
grant execute on function public.study_self_report() to authenticated;
