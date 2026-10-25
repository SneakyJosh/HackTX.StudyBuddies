-- Forward-only. 0005 is already applied and still records the original
-- 30-minute flag. Study time now includes every finished session with at
-- least 1 credited minute. A streak day is 5 combined minutes in America/Chicago.
-- Booking length stays 30–180 minutes. An early finish can credit fewer minutes.

do $fix$
declare
  old_name text;
begin
  select con.conname into old_name
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class rel on rel.oid = con.conrelid
  join pg_catalog.pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'study_session_attendance'
    and con.contype = 'c'
    and pg_catalog.pg_get_constraintdef(con.oid) like '%credited_minutes >= 30%';
  if old_name is null then
    raise exception 'VALIDATION: study time check was not found' using errcode = '23514';
  end if;
  execute format('alter table public.study_session_attendance drop constraint %I', old_name);
end
$fix$;

update public.study_session_attendance
set counts_toward_stats = (outcome = 'completed' and credited_minutes >= 1);

alter table public.study_session_attendance
  add constraint study_session_attendance_counts_toward_stats_check
  check (counts_toward_stats = (outcome = 'completed' and credited_minutes >= 1));

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
    s.id, uid, 'completed', credited, credited >= 1,
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

create or replace function public.study_day_minutes(p_user_id uuid, p_day date, p_course_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = public, extensions
as $fn$
declare
  total integer;
begin
  if auth.uid() is distinct from p_user_id then
    raise exception 'NOT_FOUND: session not found' using errcode = 'P0002';
  end if;
  select coalesce(sum(a.credited_minutes), 0)::integer into total
  from public.study_session_attendance a
  join public.study_sessions s on s.id = a.session_id
  where a.user_id = p_user_id
    and a.counts_toward_stats
    and a.campus_date = p_day
    and (p_course_id is null or s.course_id = p_course_id);
  return total;
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
  if auth.uid() is distinct from p_user_id then
    raise exception 'NOT_FOUND: session not found' using errcode = 'P0002';
  end if;
  anchor := today_campus;
  if public.study_day_minutes(p_user_id, anchor, p_course_id) < 5 then
    anchor := today_campus - 1;
  end if;
  if public.study_day_minutes(p_user_id, anchor, p_course_id) < 5 then
    return 0;
  end if;
  cursor_day := anchor;
  while public.study_day_minutes(p_user_id, cursor_day, p_course_id) >= 5 loop
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
    'description', 'Self-reported study time. Not independently verified, and not used for matching. Finished sessions with at least 1 minute count. A streak day is 5 combined minutes in America/Chicago.',
    'streakDays', public.study_streak_length(uid, null),
    'qualifyingMinutes', total_minutes,
    'weekMinutes', week_total,
    'week', week,
    'courseStreaks', courses
  );
end;
$fn$;

revoke all on function public.study_day_minutes(uuid, date, uuid) from public, anon, authenticated;
revoke all on function public.study_streak_length(uuid, uuid) from public, anon, authenticated;
