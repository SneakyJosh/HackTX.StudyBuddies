-- Forward-only. Friends Studying Now uses the live discovery visibility
-- rules: visible, same campus, live check-in, not focused, and no block.
-- An accepted study request is the connection. This does not score
-- matches and does not change the existing discovery function.

create or replace function public.list_studying_connections()
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
    select pg_catalog.jsonb_agg(item.payload order by item.display_name, item.user_id)
    from (
      select
        other.display_name,
        other.id as user_id,
        pg_catalog.jsonb_build_object(
          'user', pg_catalog.jsonb_build_object(
            'id', other.id,
            'displayName', other.display_name,
            'major', other.major,
            'academicYear', other.academic_year,
            'studyStyle', ch.study_style
          ),
          'location', pg_catalog.jsonb_build_object(
            'id', loc.id,
            'name', loc.name,
            'buildingCode', loc.building_code
          ),
          'course', pg_catalog.jsonb_build_object(
            'id', course.id,
            'universityId', course.university_id,
            'code', course.code,
            'title', course.title
          ),
          'availability', ch.availability
        ) as payload
      from public.profiles caller
      join public.study_requests sr
        on sr.status = 'accepted'
       and (sr.sender_id = caller.id or sr.recipient_id = caller.id)
      join public.profiles other
        on other.id = case
          when sr.sender_id = caller.id then sr.recipient_id
          else sr.sender_id
        end
      join lateral (
        select c.*
        from public.checkins c
        where c.user_id = other.id
          and c.checked_out_at is null
          and c.started_at <= pg_catalog.clock_timestamp()
          and c.expires_at > pg_catalog.clock_timestamp()
        order by c.started_at desc
        limit 1
      ) ch on true
      join public.locations loc on loc.id = ch.location_id and loc.is_active
      join public.courses course on course.id = ch.course_id
      where caller.id = uid
        and other.id <> uid
        and other.university_id = caller.university_id
        and other.visible
        and ch.availability in ('available', 'questions_only')
        and not exists (
          select 1 from public.blocks b
          where (b.blocker_id = uid and b.blocked_id = other.id)
             or (b.blocker_id = other.id and b.blocked_id = uid)
        )
    ) item
  ), '[]'::jsonb);
end;
$fn$;

revoke all on function public.list_studying_connections() from public, anon;
grant execute on function public.list_studying_connections() to authenticated;
