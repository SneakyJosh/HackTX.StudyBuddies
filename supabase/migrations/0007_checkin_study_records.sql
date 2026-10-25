-- Forward-only. 0001–0006 stay as applied or committed.
-- A finished personal check-in records self-reported minutes. It does not
-- complete or cancel a scheduled booking. Time after expires_at is not credited.

create table public.checkin_study_records (
  checkin_id uuid primary key references public.checkins (id) on delete restrict,
  user_id uuid not null references public.profiles (id) on delete restrict,
  credited_minutes integer not null check (credited_minutes between 0 and 180),
  counts_toward_stats boolean not null,
  campus_date date not null,
  started_at timestamptz not null,
  finished_at timestamptz not null,
  course_id uuid not null references public.courses (id) on delete restrict,
  location_id uuid not null references public.locations (id) on delete restrict,
  study_style text not null check (study_style in ('quiet', 'collaborative', 'flexible')),
  availability text not null check (availability in ('available', 'questions_only', 'focused')),
  recorded_at timestamptz not null default now(),
  check (finished_at >= started_at),
  check (counts_toward_stats = (credited_minutes >= 1))
);

create index checkin_study_records_user_day_idx
  on public.checkin_study_records (user_id, campus_date)
  where counts_toward_stats;

alter table public.checkin_study_records enable row level security;

create policy "checkin_study_records_select_own" on public.checkin_study_records
  for select to authenticated
  using (user_id = auth.uid());

revoke all on public.checkin_study_records from public, anon, authenticated;
grant all on public.checkin_study_records to service_role;

create or replace function public.enforce_checkin_study_record()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $fn$
declare
  owner uuid;
  checkin_started timestamptz;
begin
  select c.user_id, c.started_at into owner, checkin_started
  from public.checkins c
  where c.id = new.checkin_id;
  if owner is null or owner is distinct from new.user_id or checkin_started is distinct from new.started_at then
    raise exception 'NOT_FOUND: check-in not found' using errcode = 'P0002';
  end if;
  return new;
end;
$fn$;

create trigger checkin_study_records_enforce
  before insert on public.checkin_study_records
  for each row execute function public.enforce_checkin_study_record();

create or replace function public.checkin_study_payload(p_checkin_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $fn$
declare
  uid uuid := auth.uid();
  record_row public.checkin_study_records%rowtype;
  course_row public.courses%rowtype;
  location_row public.locations%rowtype;
begin
  if uid is null then
    raise exception 'UNAUTHENTICATED: authentication required' using errcode = '28000';
  end if;
  select * into record_row
  from public.checkin_study_records
  where checkin_id = p_checkin_id and user_id = uid;
  if not found then
    raise exception 'NOT_FOUND: check-in not found' using errcode = 'P0002';
  end if;
  select * into course_row from public.courses where id = record_row.course_id;
  select * into location_row from public.locations where id = record_row.location_id;
  return jsonb_build_object(
    'id', record_row.checkin_id,
    'checkinId', record_row.checkin_id,
    'course', jsonb_build_object(
      'id', course_row.id,
      'universityId', course_row.university_id,
      'code', course_row.code,
      'title', course_row.title
    ),
    'location', jsonb_build_object(
      'id', location_row.id,
      'name', location_row.name,
      'buildingCode', location_row.building_code
    ),
    'studyStyle', record_row.study_style,
    'availability', record_row.availability,
    'startedAt', record_row.started_at,
    'finishedAt', record_row.finished_at,
    'creditedMinutes', record_row.credited_minutes,
    'countsTowardStats', record_row.counts_toward_stats,
    'campusDate', record_row.campus_date,
    'recordedAt', record_row.recorded_at,
    'selfReported', true
  );
end;
$fn$;

create or replace function public.finish_checkin_study(p_checkin_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $fn$
declare
  uid uuid := auth.uid();
  open_checkin public.checkins%rowtype;
  planned_minutes integer;
  elapsed_minutes integer;
  credited integer;
  finished timestamptz := pg_catalog.clock_timestamp();
begin
  if uid is null then
    raise exception 'UNAUTHENTICATED: authentication required' using errcode = '28000';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text, 0));
  if exists (
    select 1 from public.checkin_study_records
    where checkin_id = p_checkin_id and user_id = uid
  ) then
    return public.checkin_study_payload(p_checkin_id);
  end if;
  select * into open_checkin
  from public.checkins
  where id = p_checkin_id
  for update;
  if not found or open_checkin.user_id is distinct from uid then
    raise exception 'NOT_FOUND: check-in not found' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.checkin_study_records
    where checkin_id = p_checkin_id and user_id = uid
  ) then
    return public.checkin_study_payload(p_checkin_id);
  end if;
  if open_checkin.checked_out_at is not null then
    raise exception 'CONFLICT: that check-in was ended without a study record' using errcode = 'P0001';
  end if;
  if finished > open_checkin.expires_at + interval '2 hours' then
    raise exception 'CONFLICT: the finish window has closed' using errcode = 'P0001';
  end if;

  planned_minutes := floor(extract(epoch from (open_checkin.expires_at - open_checkin.started_at)) / 60)::integer;
  elapsed_minutes := greatest(
    0,
    floor(extract(epoch from (least(finished, open_checkin.expires_at) - open_checkin.started_at)) / 60)
  )::integer;
  credited := least(planned_minutes, elapsed_minutes);

  insert into public.checkin_study_records (
    checkin_id, user_id, credited_minutes, counts_toward_stats, campus_date,
    started_at, finished_at, course_id, location_id, study_style, availability
  ) values (
    open_checkin.id,
    uid,
    credited,
    credited >= 1,
    (open_checkin.started_at at time zone 'America/Chicago')::date,
    open_checkin.started_at,
    finished,
    open_checkin.course_id,
    open_checkin.location_id,
    open_checkin.study_style,
    open_checkin.availability
  );
  update public.checkins
  set checked_out_at = finished
  where id = open_checkin.id;
  return public.checkin_study_payload(open_checkin.id);
exception
  when unique_violation then
    return public.checkin_study_payload(p_checkin_id);
end;
$fn$;

create or replace function public.list_checkin_study_records()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $fn$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'UNAUTHENTICATED: authentication required' using errcode = '28000';
  end if;
  return coalesce((
    select jsonb_agg(public.checkin_study_payload(record_row.checkin_id) order by record_row.started_at desc, record_row.checkin_id)
    from public.checkin_study_records record_row
    where record_row.user_id = uid
  ), '[]'::jsonb);
end;
$fn$;

create or replace function public.current_checkin()
returns jsonb
language sql
volatile
security invoker
set search_path = public, extensions
as $fn$
  select coalesce((
    select jsonb_build_object(
      'id', id,
      'locationId', location_id,
      'courseId', course_id,
      'availability', availability,
      'studyStyle', study_style,
      'startedAt', started_at,
      'expiresAt', expires_at,
      'live', expires_at > pg_catalog.clock_timestamp()
    )
    from public.checkins
    where user_id = auth.uid()
      and checked_out_at is null
      and expires_at + interval '2 hours' > pg_catalog.clock_timestamp()
    order by started_at desc
    limit 1
  ), 'null'::jsonb);
$fn$;

create or replace function public.checkout_active()
returns void
language plpgsql
volatile
security invoker
set search_path = public, extensions
as $fn$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'UNAUTHENTICATED: authentication required' using errcode = '28000';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text, 0));
  update public.checkins
  set checked_out_at = pg_catalog.clock_timestamp()
  where user_id = uid
    and checked_out_at is null
    and expires_at + interval '2 hours' > pg_catalog.clock_timestamp();
end;
$fn$;

create or replace function public.replace_checkin(
  p_location_id uuid,
  p_course_id uuid,
  p_duration_minutes integer,
  p_availability text,
  p_study_style text
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public, extensions
as $fn$
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
  update public.checkins
  set checked_out_at = pg_catalog.clock_timestamp()
  where user_id = uid and checked_out_at is null and expires_at > pg_catalog.clock_timestamp();
  insert into public.checkins (user_id, location_id, course_id, availability, study_style, started_at, expires_at)
  values (
    uid,
    p_location_id,
    p_course_id,
    p_availability,
    p_study_style,
    started,
    started + make_interval(mins => p_duration_minutes)
  )
  returning * into inserted;
  return jsonb_build_object(
    'id', inserted.id,
    'locationId', inserted.location_id,
    'courseId', inserted.course_id,
    'availability', inserted.availability,
    'studyStyle', inserted.study_style,
    'startedAt', inserted.started_at,
    'expiresAt', inserted.expires_at,
    'live', true
  );
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
  select coalesce(sum(combined.credited_minutes), 0)::integer into total
  from (
    select a.credited_minutes
    from public.study_session_attendance a
    join public.study_sessions s on s.id = a.session_id
    where a.user_id = p_user_id
      and a.counts_toward_stats
      and a.campus_date = p_day
      and (p_course_id is null or s.course_id = p_course_id)
    union all
    select r.credited_minutes
    from public.checkin_study_records r
    where r.user_id = p_user_id
      and r.counts_toward_stats
      and r.campus_date = p_day
      and (p_course_id is null or r.course_id = p_course_id)
  ) combined;
  return total;
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
  select coalesce(sum(combined.credited_minutes), 0)::integer into total_minutes
  from (
    select a.credited_minutes
    from public.study_session_attendance a
    where a.user_id = uid and a.counts_toward_stats
    union all
    select r.credited_minutes
    from public.checkin_study_records r
    where r.user_id = uid and r.counts_toward_stats
  ) combined;
  select coalesce(jsonb_agg(jsonb_build_object(
    'date', day_value::date,
    'minutes', coalesce((
      select sum(a.credited_minutes) from public.study_session_attendance a
      where a.user_id = uid and a.counts_toward_stats and a.campus_date = day_value::date
    ), 0) + coalesce((
      select sum(r.credited_minutes) from public.checkin_study_records r
      where r.user_id = uid and r.counts_toward_stats and r.campus_date = day_value::date
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
  ) or exists (
    select 1 from public.checkin_study_records r
    where r.user_id = uid and r.counts_toward_stats and r.course_id = c.id
  );
  return jsonb_build_object(
    'selfReported', true,
    'description', 'Self-reported study time. Not independently verified, and not used for matching. Finished bookings and finished check-ins with at least 1 minute count. A streak day is 5 combined minutes in America/Chicago.',
    'streakDays', public.study_streak_length(uid, null),
    'qualifyingMinutes', total_minutes,
    'weekMinutes', week_total,
    'week', week,
    'courseStreaks', courses
  );
end;
$fn$;

revoke all on function public.enforce_checkin_study_record() from public, anon, authenticated;
revoke all on function public.checkin_study_payload(uuid) from public, anon, authenticated;
revoke all on function public.finish_checkin_study(uuid) from public, anon, authenticated;
revoke all on function public.list_checkin_study_records() from public, anon, authenticated;
revoke all on function public.study_day_minutes(uuid, date, uuid) from public, anon, authenticated;
grant execute on function public.finish_checkin_study(uuid) to authenticated;
grant execute on function public.list_checkin_study_records() to authenticated;
