-- Forward-only. 0001–0011 stay as applied.
-- The twelve curated buildings and three cafes become study locations.
-- PCL, EER, and Texas Union keep the ids seeded in 0001.
-- Littlefield Residence Hall is LTD in the UT directory and is not bookable.
-- Littlefield Patio Cafe is at that hall, 2503 Whitis Ave.
-- Up and Atom is inside Welch Hall, 105 E 24th St.
-- Medici Roasting at 2222B Guadalupe St has no parent building.
-- Cafe anchors are public building positions. Quiet zones stay on PCL only.

alter table public.locations
  add column if not exists kind text not null default 'building',
  add column if not exists bookable boolean not null default true,
  add column if not exists parent_location_id uuid;

alter table public.locations drop constraint if exists locations_kind_check;
alter table public.locations
  add constraint locations_kind_check check (kind in ('building', 'cafe'));

alter table public.locations drop constraint if exists locations_cafe_bookable_check;
alter table public.locations
  add constraint locations_cafe_bookable_check check (kind = 'building' or bookable);

do $fn$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'locations_parent_location_id_fkey'
      and conrelid = 'public.locations'::regclass
  ) then
    alter table public.locations
      add constraint locations_parent_location_id_fkey
      foreign key (parent_location_id) references public.locations (id) on delete restrict;
  end if;
end;
$fn$;

create or replace function public.enforce_location_parent()
returns trigger
language plpgsql
set search_path = public, extensions
as $fn$
declare
  parent_kind text;
begin
  if new.parent_location_id is null then
    return new;
  end if;
  if new.parent_location_id = new.id or new.kind is distinct from 'cafe' then
    raise exception 'VALIDATION: only a cafe names a parent building' using errcode = '23514';
  end if;
  select location_row.kind into parent_kind
  from public.locations location_row
  where location_row.id = new.parent_location_id;
  if parent_kind is distinct from 'building' then
    raise exception 'VALIDATION: a study location parent must be a building' using errcode = '23514';
  end if;
  return new;
end;
$fn$;

drop trigger if exists locations_enforce_parent on public.locations;
create trigger locations_enforce_parent
  before insert or update on public.locations
  for each row execute function public.enforce_location_parent();

insert into public.locations (id, university_id, name, building_code, description, kind, bookable)
values
  ('11111111-1111-4111-8111-111111111114', '22222222-2222-4222-8222-222222222222', 'University Teaching Center', 'UTC', 'Public classroom building study spaces', 'building', true),
  ('11111111-1111-4111-8111-111111111115', '22222222-2222-4222-8222-222222222222', 'William C. Powers, Jr. Student Activity Center', 'WCP', 'Public student activity center study spaces', 'building', true),
  ('11111111-1111-4111-8111-111111111116', '22222222-2222-4222-8222-222222222222', 'Battle Hall', 'BTL', 'Public academic study spaces', 'building', true),
  ('11111111-1111-4111-8111-111111111117', '22222222-2222-4222-8222-222222222222', 'Peter T. Flawn Academic Center', 'FAC', 'Public academic study spaces', 'building', true),
  ('11111111-1111-4111-8111-111111111118', '22222222-2222-4222-8222-222222222222', 'Gates Dell Complex', 'GDC', 'Public academic study spaces', 'building', true),
  ('11111111-1111-4111-8111-111111111119', '22222222-2222-4222-8222-222222222222', 'Robert A. Welch Hall', 'WEL', 'Public academic study spaces', 'building', true),
  ('11111111-1111-4111-8111-11111111111a', '22222222-2222-4222-8222-222222222222', 'Physics, Math, and Astronomy Building', 'PMA', 'Public academic study spaces', 'building', true),
  ('11111111-1111-4111-8111-11111111111b', '22222222-2222-4222-8222-222222222222', 'Burdine Hall', 'BUR', 'Public academic study spaces', 'building', true),
  ('11111111-1111-4111-8111-11111111111c', '22222222-2222-4222-8222-222222222222', 'Ernest Cockrell Jr. Hall', 'ECJ', 'Public academic study spaces', 'building', true),
  ('11111111-1111-4111-8111-11111111111d', '22222222-2222-4222-8222-222222222222', 'Littlefield Residence Hall', 'LTD', 'Residence hall. Not a check-in location.', 'building', false)
on conflict (id) do nothing;

update public.campus_places as place_row
set location_id = data.new_location_id
from (
  values
    ('UTC', '11111111-1111-4111-8111-111111111114'::uuid),
    ('WCP', '11111111-1111-4111-8111-111111111115'::uuid),
    ('BTL', '11111111-1111-4111-8111-111111111116'::uuid),
    ('FAC', '11111111-1111-4111-8111-111111111117'::uuid),
    ('GDC', '11111111-1111-4111-8111-111111111118'::uuid),
    ('WEL', '11111111-1111-4111-8111-111111111119'::uuid),
    ('PMA', '11111111-1111-4111-8111-11111111111a'::uuid),
    ('BUR', '11111111-1111-4111-8111-11111111111b'::uuid),
    ('ECJ', '11111111-1111-4111-8111-11111111111c'::uuid)
) as data(abbreviation, new_location_id)
where place_row.university_id = '22222222-2222-4222-8222-222222222222'
  and place_row.abbreviation = data.abbreviation
  and place_row.location_id is null;

insert into public.locations (id, university_id, name, building_code, description, kind, bookable, parent_location_id)
values
  (
    '11111111-1111-4111-8111-11111111111e',
    '22222222-2222-4222-8222-222222222222',
    'Littlefield Patio Cafe',
    'LPC',
    'Coffee shop at Littlefield Residence Hall, 2503 Whitis Ave.',
    'cafe',
    true,
    '11111111-1111-4111-8111-11111111111d'
  ),
  (
    '11111111-1111-4111-8111-11111111111f',
    '22222222-2222-4222-8222-222222222222',
    'Up and Atom',
    'UAA',
    'Coffee shop inside Welch Hall, 105 E 24th St.',
    'cafe',
    true,
    '11111111-1111-4111-8111-111111111119'
  ),
  (
    '11111111-1111-4111-8111-111111111120',
    '22222222-2222-4222-8222-222222222222',
    'Medici Roasting',
    'MED',
    'Coffee shop at 2222B Guadalupe St.',
    'cafe',
    true,
    null
  )
on conflict (id) do nothing;

alter table public.campus_places drop constraint if exists campus_places_category_check;
alter table public.campus_places
  add constraint campus_places_category_check
  check (category in ('library', 'academic_center', 'student_hub', 'cafe'));

insert into public.campus_places (
  id, university_id, location_id, name, abbreviation, category, map_x, map_y, anchor_lat, anchor_lng, sort_order
) values
  (
    '55555555-5555-4555-8555-555555555513',
    '22222222-2222-4222-8222-222222222222',
    '11111111-1111-4111-8111-11111111111e',
    'Littlefield Patio Cafe',
    'LPC',
    'cafe',
    30.90,
    7.95,
    30.289324,
    -97.739728,
    13
  ),
  (
    '55555555-5555-4555-8555-555555555514',
    '22222222-2222-4222-8222-222222222222',
    '11111111-1111-4111-8111-11111111111f',
    'Up and Atom',
    'UAA',
    'cafe',
    56.78,
    43.98,
    30.286423,
    -97.737486,
    14
  ),
  (
    '55555555-5555-4555-8555-555555555515',
    '22222222-2222-4222-8222-222222222222',
    '11111111-1111-4111-8111-111111111120',
    'Medici Roasting',
    'MED',
    'cafe',
    0.83,
    52.39,
    30.285547,
    -97.742134,
    15
  )
on conflict (id) do nothing;

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
  select university_id into location_university
  from public.locations
  where id = new.location_id and is_active and bookable;
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
  session_starts timestamptz;
  session_ends timestamptz;
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
  if (
    select count(*) from unnest(coalesce(p_invitee_ids, array[]::uuid[])) as listed(invitee_id)
  ) <> (
    select count(distinct listed.invitee_id)
    from unnest(coalesce(p_invitee_ids, array[]::uuid[])) as listed(invitee_id)
  ) then
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
    where l.id = p_location_id and l.university_id = profile_university and l.is_active and l.bookable
  ) then
    raise exception 'VALIDATION: location is not available for this university' using errcode = '23514';
  end if;

  local_ts := p_local_date + p_local_time::time;
  session_starts := public.campus_instant(local_ts);
  session_ends := session_starts + make_interval(mins => p_duration_minutes);
  if session_starts <= pg_catalog.clock_timestamp() then
    raise exception 'VALIDATION: that time has passed in America/Chicago' using errcode = '23514';
  end if;
  if session_starts > pg_catalog.clock_timestamp() + interval '180 days' then
    raise exception 'VALIDATION: pick a time within the next 180 days' using errcode = '23514';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text, 0));
  if exists (
    select 1 from public.study_session_commitments c
    where c.user_id = uid
      and tstzrange(c.starts_at, c.ends_at, '[)') && tstzrange(session_starts, session_ends, '[)')
  ) then
    raise exception 'CONFLICT: that time overlaps another session' using errcode = 'P0001';
  end if;

  insert into public.study_sessions (
    host_id, university_id, course_id, location_id, title, visibility, seat_limit, starts_at, ends_at, status
  ) values (
    uid, profile_university, p_course_id, p_location_id, trimmed, p_visibility, p_seat_limit, session_starts, session_ends, 'scheduled'
  ) returning id into new_id;

  insert into public.study_session_participants (session_id, user_id, role, status)
  values (new_id, uid, 'host', 'accepted');
  insert into public.study_session_commitments (user_id, session_id, starts_at, ends_at)
  values (uid, new_id, session_starts, session_ends);

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('session:' || new_id::text, 1));
  foreach invitee in array coalesce(p_invitee_ids, array[]::uuid[]) loop
    perform public.assert_session_partner(uid, invitee);
    select count(*) filter (where participant.status in ('accepted', 'invited')) into reserved
    from public.study_session_participants participant
    where participant.session_id = new_id;
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

create or replace function public.campus_map_payload()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $fn$
declare
  uid uuid := auth.uid();
  campus uuid;
  style text;
  places jsonb;
begin
  if uid is null then
    raise exception 'UNAUTHENTICATED: authentication required' using errcode = '28000';
  end if;

  select profile_row.university_id, profile_row.study_style
    into campus, style
  from public.profiles profile_row
  where profile_row.id = uid;

  if campus is null then
    style := null;
    select university_row.id into campus
    from public.universities university_row
    where (select count(*) from public.universities) = 1;
  end if;

  if campus is null then
    return jsonb_build_object('studyStyle', null, 'places', '[]'::jsonb);
  end if;

  select coalesce(
    jsonb_agg(item.place_json order by item.sort_order, item.abbreviation, item.place_id),
    '[]'::jsonb
  )
    into places
  from (
    select
      place_row.id as place_id,
      place_row.sort_order,
      place_row.abbreviation,
      jsonb_build_object(
        'id', place_row.id,
        'locationId', place_row.location_id,
        'name', place_row.name,
        'abbreviation', place_row.abbreviation,
        'category', place_row.category,
        'bookingAvailable', place_row.location_id is not null and coalesce(location_row.bookable, false),
        'mapX', place_row.map_x,
        'mapY', place_row.map_y,
        'anchorLat', place_row.anchor_lat,
        'anchorLng', place_row.anchor_lng,
        'sortOrder', place_row.sort_order,
        'quietZones', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', zone_row.id,
              'name', zone_row.name,
              'detail', zone_row.detail
            )
            order by zone_row.sort_order, zone_row.name
          )
          from public.campus_quiet_zones zone_row
          where zone_row.place_id = place_row.id
        ), '[]'::jsonb),
        'historyVisits', (
          select count(*)::integer
          from (
            select session_row.location_id as visited_location_id
            from public.study_session_attendance attendance_row
            join public.study_sessions session_row
              on session_row.id = attendance_row.session_id
            where attendance_row.user_id = uid
              and attendance_row.outcome = 'completed'
              and place_row.location_id is not null
              and session_row.location_id = place_row.location_id
            union all
            select record_row.location_id
            from public.checkin_study_records record_row
            where record_row.user_id = uid
              and place_row.location_id is not null
              and record_row.location_id = place_row.location_id
          ) visited
        ),
        'parent', case
          when parent_row.id is null then null
          else jsonb_build_object('name', parent_row.name, 'buildingCode', parent_row.building_code)
        end,
        'detail', location_row.description
      ) as place_json
    from public.campus_places place_row
    left join public.locations location_row
      on location_row.id = place_row.location_id
    left join public.locations parent_row
      on parent_row.id = location_row.parent_location_id
    where place_row.university_id = campus
      and place_row.is_active
  ) item;

  return jsonb_build_object('studyStyle', style, 'places', places);
end;
$fn$;

revoke all on function public.enforce_location_parent() from public, anon, authenticated;
revoke all on function public.campus_map_payload() from public, anon;
grant execute on function public.campus_map_payload() to authenticated;

do $fn$
declare
  linked integer;
  cafes integer;
begin
  select count(*) into linked
  from public.campus_places
  where abbreviation in ('UTC', 'WCP', 'BTL', 'FAC', 'GDC', 'WEL', 'PMA', 'BUR', 'ECJ')
    and location_id is not null;
  if linked <> 9 then
    raise exception 'VALIDATION: every curated building needs a study location' using errcode = '23514';
  end if;
  select count(*) into cafes
  from public.locations
  where id in (
    '11111111-1111-4111-8111-11111111111e',
    '11111111-1111-4111-8111-11111111111f',
    '11111111-1111-4111-8111-111111111120'
  )
    and bookable
    and kind = 'cafe';
  if cafes <> 3 then
    raise exception 'VALIDATION: the three cafes must be bookable' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.locations
    where id = '11111111-1111-4111-8111-11111111111d' and bookable
  ) then
    raise exception 'VALIDATION: Littlefield Residence Hall is not a check-in location' using errcode = '23514';
  end if;
end;
$fn$;
