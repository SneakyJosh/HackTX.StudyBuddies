-- Forward-only. Public building anchors for the street map.
-- 0001–0010 stay as applied. Schematic map_x and map_y stay in place.
-- These anchors are published building positions, not a student position.
-- The same sources recorded in 0010: OpenStreetMap building centroids,
-- and UT Parking and Transportation for the Union Building.

alter table public.campus_places
  add column anchor_lat numeric(9,6),
  add column anchor_lng numeric(9,6);

alter table public.campus_places
  add constraint campus_places_anchor_lat_check
    check (anchor_lat is null or anchor_lat between 30.270000 and 30.300000),
  add constraint campus_places_anchor_lng_check
    check (anchor_lng is null or anchor_lng between -97.750000 and -97.720000);

update public.campus_places as place_row
set
  anchor_lat = data.anchor_lat,
  anchor_lng = data.anchor_lng
from (
  values
    ('PCL', 30.282757, -97.738208),
    ('UTC', 30.283029, -97.738845),
    ('WCP', 30.284928, -97.736767),
    ('BTL', 30.285361, -97.740352),
    ('FAC', 30.286195, -97.740322),
    ('GDC', 30.286229, -97.736580),
    ('WEL', 30.286423, -97.737486),
    ('UNB', 30.286630, -97.741160),
    ('EER', 30.288253, -97.735339),
    ('PMA', 30.288824, -97.736097),
    ('BUR', 30.288867, -97.738344),
    ('ECJ', 30.288964, -97.735519)
) as data(abbreviation, anchor_lat, anchor_lng)
where place_row.university_id = '22222222-2222-4222-8222-222222222222'
  and place_row.abbreviation = data.abbreviation;

do $fn$
begin
  if (
    select count(*)
    from public.campus_places
    where anchor_lat is null or anchor_lng is null
  ) <> 0 then
    raise exception 'VALIDATION: every campus place needs an anchor' using errcode = '23514';
  end if;
end;
$fn$;

alter table public.campus_places
  alter column anchor_lat set not null,
  alter column anchor_lng set not null;

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
