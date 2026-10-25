-- Forward-only fix. 0003 is already applied on studysync-dev.
-- create_study_session declared plpgsql variables named starts_at and ends_at,
-- then used those names in a query against study_session_commitments.
-- PostgreSQL 42702: the names match both the variables and the table columns.
-- POST /api/sessions returned 500 before a booking or an invitation was written.

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
    where l.id = p_location_id and l.university_id = profile_university and l.is_active
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
