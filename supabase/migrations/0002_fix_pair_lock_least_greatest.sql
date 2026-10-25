-- 0002 — Fix pair-lock expressions in the request/block insert triggers.
--
-- Root cause of POST /api/requests returning 500 (PostgreSQL 42883):
-- enforce_request_insert_rules computed its per-pair advisory-lock key
-- with pg_catalog.least(uuid, uuid) / pg_catalog.greatest(uuid, uuid).
-- LEAST and GREATEST are not catalog functions (they are parser-level
-- expressions; pg_proc contains no such rows), so the schema-qualified
-- call fails with 42883 "function pg_catalog.least(uuid, uuid) does not
-- exist" the first time the trigger fires. enforce_block_insert_rules
-- has the identical defect, so POST /api/blocks would fail the same way.
--
-- Verified on real PostgreSQL without touching any live project: applying
-- 0001 to a scratch database, creating two profiles/check-ins, and calling
-- send_study_request reproduced 42883 exactly; replacing the qualified
-- calls with plain least()/greatest() (which resolve regardless of
-- search_path, including the '' used by these trigger functions) makes
-- send_study_request and list_my_requests succeed. 0001 stays untouched
-- because it is already applied to studysync-dev; apply this migration
-- after it. CREATE OR REPLACE preserves the functions' existing ACLs,
-- so the EXECUTE revocations from 0001 still hold.

create or replace function public.enforce_request_insert_rules()
returns trigger language plpgsql set search_path = '' as $fn$
declare
  sender_university uuid;
  recipient_university uuid;
  recipient_visible boolean;
begin
  if new.status <> 'pending' then
    raise exception 'VALIDATION: a request must be created as pending' using errcode = '23514';
  end if;

  -- Serialize request/block writes for this unordered pair so the block
  -- and discoverability checks below cannot be raced by a concurrent
  -- block insert or check-out (blocks take the same lock, see
  -- enforce_block_insert_rules). least/greatest must stay unqualified:
  -- the pg_catalog-qualified form does not exist (42883).
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    least(new.sender_id, new.recipient_id)::text || ':' ||
    greatest(new.sender_id, new.recipient_id)::text, 0));

  -- Recipient discoverability, enforced in the database so a direct
  -- PostgREST insert cannot bypass it (the send_study_request RPC checks
  -- the same conditions; this trigger is the defence in depth):
  -- same university, profile visible, and an active check-in whose
  -- availability is available/questions_only (never focused).
  select university_id into sender_university
  from public.profiles where id = new.sender_id;
  if sender_university is null then
    raise exception 'FORBIDDEN: profile is not completed' using errcode = '42501';
  end if;

  select university_id, visible into recipient_university, recipient_visible
  from public.profiles where id = new.recipient_id;
  if recipient_university is null then
    raise exception 'NOT_FOUND: user not found' using errcode = 'P0002';
  end if;

  if recipient_university is distinct from sender_university
     or recipient_visible is not true
     or not exists (
       select 1 from public.checkins c
       where c.user_id = new.recipient_id
         and c.checked_out_at is null
         and c.started_at <= pg_catalog.clock_timestamp()
         and c.expires_at > pg_catalog.clock_timestamp()
         and c.availability in ('available', 'questions_only')
     )
     or exists (
       select 1 from public.blocks b
       where (b.blocker_id = new.sender_id and b.blocked_id = new.recipient_id)
          or (b.blocker_id = new.recipient_id and b.blocked_id = new.sender_id)
     ) then
    raise exception 'FORBIDDEN: recipient is not discoverable' using errcode = '42501';
  end if;

  return new;
end;
$fn$;

create or replace function public.enforce_block_insert_rules()
returns trigger language plpgsql set search_path = '' as $fn$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    least(new.blocker_id, new.blocked_id)::text || ':' ||
    greatest(new.blocker_id, new.blocked_id)::text, 0));
  return new;
end;
$fn$;
