-- Forward-only. Personal study feedback. 0001–0008 stay as applied.
-- Booking ratings stay in study_session_ratings. A personal check-in has no
-- roster, so this table stores session quality and place only. Skip writes
-- nothing. Stored stars stay private to the rater. They do not change
-- minutes, streaks, profile preferences, or discovery.

create table public.checkin_study_ratings (
  checkin_id uuid not null references public.checkin_study_records (checkin_id) on delete restrict,
  rater_id uuid not null references public.profiles (id) on delete restrict,
  category text not null check (category in ('study_time', 'environment')),
  stars integer not null check (stars between 1 and 5),
  created_at timestamptz not null default now(),
  primary key (checkin_id, rater_id, category)
);

alter table public.checkin_study_ratings enable row level security;

create policy "checkin_study_ratings_select_own" on public.checkin_study_ratings
  for select to authenticated
  using (rater_id = auth.uid());

revoke all on public.checkin_study_ratings from public, anon, authenticated;
grant all on public.checkin_study_ratings to service_role;

create or replace function public.enforce_checkin_study_rating()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $fn$
declare
  owner uuid;
begin
  select record_row.user_id into owner
  from public.checkin_study_records record_row
  where record_row.checkin_id = new.checkin_id;
  if owner is null or owner is distinct from new.rater_id then
    raise exception 'NOT_FOUND: check-in not found' using errcode = 'P0002';
  end if;
  return new;
end;
$fn$;

create trigger checkin_study_ratings_enforce
  before insert on public.checkin_study_ratings
  for each row execute function public.enforce_checkin_study_rating();

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
  study_stars integer;
  place_stars integer;
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
  select stars into study_stars from public.checkin_study_ratings
  where checkin_id = record_row.checkin_id and rater_id = uid and category = 'study_time';
  select stars into place_stars from public.checkin_study_ratings
  where checkin_id = record_row.checkin_id and rater_id = uid and category = 'environment';
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
    'selfReported', true,
    'myRatings', jsonb_build_object(
      'studyTime', study_stars,
      'environment', place_stars
    )
  );
end;
$fn$;

create or replace function public.submit_checkin_ratings(
  p_checkin_id uuid,
  p_study_time integer,
  p_environment integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $fn$
declare
  uid uuid := auth.uid();
  owned public.checkin_study_records%rowtype;
  wrote boolean := false;
begin
  if uid is null then
    raise exception 'UNAUTHENTICATED: authentication required' using errcode = '28000';
  end if;
  select * into owned
  from public.checkin_study_records
  where checkin_id = p_checkin_id and user_id = uid;
  if not found then
    raise exception 'NOT_FOUND: check-in not found' using errcode = 'P0002';
  end if;
  if p_study_time is not null and (p_study_time < 1 or p_study_time > 5) then
    raise exception 'VALIDATION: studyTime must be from 1 to 5' using errcode = '23514';
  end if;
  if p_environment is not null and (p_environment < 1 or p_environment > 5) then
    raise exception 'VALIDATION: environment must be from 1 to 5' using errcode = '23514';
  end if;
  if p_study_time is not null then
    insert into public.checkin_study_ratings (checkin_id, rater_id, category, stars)
    values (p_checkin_id, uid, 'study_time', p_study_time);
    wrote := true;
  end if;
  if p_environment is not null then
    insert into public.checkin_study_ratings (checkin_id, rater_id, category, stars)
    values (p_checkin_id, uid, 'environment', p_environment);
    wrote := true;
  end if;
  if not wrote then
    raise exception 'VALIDATION: add at least one rating' using errcode = '23514';
  end if;
  return public.checkin_study_payload(p_checkin_id);
exception
  when unique_violation then
    raise exception 'CONFLICT: that rating was already submitted' using errcode = 'P0001';
end;
$fn$;

revoke all on function public.enforce_checkin_study_rating() from public, anon, authenticated;
revoke all on function public.checkin_study_payload(uuid) from public, anon, authenticated;
revoke all on function public.submit_checkin_ratings(uuid, integer, integer) from public, anon;
grant execute on function public.submit_checkin_ratings(uuid, integer, integer) to authenticated;
