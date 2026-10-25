-- Forward-only. Curated UT Austin study map. 0001–0009 stay as applied.
-- This migration is not applied by the change that adds it.
-- Map buildings are not new check-in rows. Only Perry-Castañeda Library,
-- the Engineering Education and Research Center, and the existing Texas Union
-- location row are linked. Every other place has a null location_id.
-- Official abbreviations were read on 2026-10-25 from the UT building
-- directory, main campus table:
-- https://utdirect.utexas.edu/apps/campus/buildings/information/nlogon/maps/utm/
-- The Union pin uses the directory abbreviation UNB. The locations row keeps
-- its existing building code. William C. Powers, Jr. Student Activity Center
-- uses WCP (renamed 2019-08-15; https://universityunions.utexas.edu/visit/wcp).
-- Physics, Math, and Astronomy uses PMA
-- (https://utdirect.utexas.edu/apps/campus/buildings/information/nlogon/maps/utm/pma/).
-- Retired abbreviations are not seeded.
-- Quiet study is a zone inside a building, not a building-wide flag.
-- UT Libraries tour, floors 3, 4, and 6:
-- https://guides.lib.utexas.edu/librarytour/floor346
-- Quiet stacks seating, floors 3 and 4:
-- https://www.lib.utexas.edu/visit-us/spaces/pcl-quiet-stacks-seating
-- Floor 5 is Collaborative Commons, so it is not a quiet zone:
-- https://www.lib.utexas.edu/visit-us/locations/pcl/floor-plan
-- map_x and map_y are percentages on one main-campus box:
-- west -97.7422, east -97.7342, south 30.2815, north 30.2900.
-- Positions come from OpenStreetMap building centroids on 2026-10-25,
-- except the Union, which uses UT Parking and Transportation
-- 30.28663, -97.74116 (https://parking.utexas.edu/maps/gps-coordinates).
-- Burdine Hall is north campus, 2505 University Avenue.
-- No coffee venue is seeded: none was confirmed inside a catalog building.

create table public.campus_places (
  id uuid primary key,
  university_id uuid not null references public.universities (id) on delete restrict,
  location_id uuid references public.locations (id) on delete restrict,
  name text not null check (char_length(name) between 1 and 120),
  abbreviation text not null check (abbreviation ~ '^[A-Z0-9]{2,6}$'),
  category text not null check (category in ('library', 'academic_center', 'student_hub')),
  map_x numeric(5,2) not null check (map_x between 0 and 100),
  map_y numeric(5,2) not null check (map_y between 0 and 100),
  sort_order integer not null check (sort_order between 0 and 1000),
  is_active boolean not null default true,
  unique (university_id, abbreviation),
  unique (location_id)
);

create table public.campus_quiet_zones (
  id uuid primary key,
  place_id uuid not null references public.campus_places (id) on delete restrict,
  name text not null check (char_length(name) between 1 and 80),
  detail text not null check (char_length(detail) between 1 and 240),
  sort_order integer not null check (sort_order between 0 and 100)
);

create index campus_places_university_idx
  on public.campus_places (university_id)
  where is_active;

alter table public.campus_places enable row level security;
alter table public.campus_quiet_zones enable row level security;

revoke all on public.campus_places from public, anon, authenticated;
revoke all on public.campus_quiet_zones from public, anon, authenticated;
grant all on public.campus_places to service_role;
grant all on public.campus_quiet_zones to service_role;

-- PCL 30.282757, -97.738208
-- EER 30.288253, -97.735339
-- UNB 30.286630, -97.741160
-- BTL 30.285361, -97.740352
-- BUR 30.288867, -97.738344
-- ECJ 30.288964, -97.735519
-- FAC 30.286195, -97.740322
-- GDC 30.286229, -97.736580 (2317 Speedway)
-- PMA 30.288824, -97.736097 (2515 Speedway)
-- UTC 30.283029, -97.738845
-- WCP 30.284928, -97.736767 (2201 Speedway)
-- WEL 30.286423, -97.737486

insert into public.campus_places (
  id, university_id, location_id, name, abbreviation, category, map_x, map_y, sort_order
) values
  ('55555555-5555-4555-8555-555555555501', '22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 'Perry-Castañeda Library', 'PCL', 'library', 49.92, 76.76, 1),
  ('55555555-5555-4555-8555-555555555502', '22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111112', 'Engineering Education and Research Center', 'EER', 'academic_center', 77.18, 27.62, 2),
  ('55555555-5555-4555-8555-555555555503', '22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111113', 'Union Building', 'UNB', 'student_hub', 21.88, 42.13, 3),
  ('55555555-5555-4555-8555-555555555504', '22222222-2222-4222-8222-222222222222', null, 'Battle Hall', 'BTL', 'academic_center', 29.56, 53.48, 4),
  ('55555555-5555-4555-8555-555555555505', '22222222-2222-4222-8222-222222222222', null, 'Burdine Hall', 'BUR', 'academic_center', 48.63, 22.13, 5),
  ('55555555-5555-4555-8555-555555555506', '22222222-2222-4222-8222-222222222222', null, 'Ernest Cockrell Jr. Hall', 'ECJ', 'academic_center', 75.47, 21.26, 6),
  ('55555555-5555-4555-8555-555555555507', '22222222-2222-4222-8222-222222222222', null, 'Peter T. Flawn Academic Center', 'FAC', 'academic_center', 29.84, 46.02, 7),
  ('55555555-5555-4555-8555-555555555508', '22222222-2222-4222-8222-222222222222', null, 'Gates Dell Complex', 'GDC', 'academic_center', 65.39, 45.72, 8),
  ('55555555-5555-4555-8555-555555555509', '22222222-2222-4222-8222-222222222222', null, 'Physics, Math, and Astronomy Building', 'PMA', 'academic_center', 69.98, 22.51, 9),
  ('55555555-5555-4555-8555-555555555510', '22222222-2222-4222-8222-222222222222', null, 'University Teaching Center', 'UTC', 'academic_center', 43.87, 74.33, 10),
  ('55555555-5555-4555-8555-555555555511', '22222222-2222-4222-8222-222222222222', null, 'William C. Powers, Jr. Student Activity Center', 'WCP', 'student_hub', 63.61, 57.35, 11),
  ('55555555-5555-4555-8555-555555555512', '22222222-2222-4222-8222-222222222222', null, 'Robert A. Welch Hall', 'WEL', 'academic_center', 56.78, 43.98, 12);

insert into public.campus_quiet_zones (id, place_id, name, detail, sort_order) values
  (
    '66666666-6666-4666-8666-666666666601',
    '55555555-5555-4555-8555-555555555501',
    'Floors 3 and 4',
    'Open stacks seating for quiet individual study.',
    1
  ),
  (
    '66666666-6666-4666-8666-666666666602',
    '55555555-5555-4555-8555-555555555501',
    'Floor 6',
    'Designated quiet study.',
    2
  );

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
        'bookingAvailable', place_row.location_id is not null,
        'mapX', place_row.map_x,
        'mapY', place_row.map_y,
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
        )
      ) as place_json
    from public.campus_places place_row
    where place_row.university_id = campus
      and place_row.is_active
  ) item;

  return jsonb_build_object('studyStyle', style, 'places', places);
end;
$fn$;

revoke all on function public.campus_map_payload() from public, anon;
grant execute on function public.campus_map_payload() to authenticated;
