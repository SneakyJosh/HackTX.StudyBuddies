-- StudySync local seed: fictional public campus catalog only.
-- No student records, auth users, emails, or schedules are seeded here.
-- Demo auth accounts (Demo Student A/B) are created separately in Supabase
-- Auth; their passwords stay in the local environment and are never committed.
-- Idempotent: safe to re-run via `supabase db reset` against a local database.

insert into public.universities (id, name, slug) values
  ('22222222-2222-4222-8222-222222222222', 'University of Texas at Austin', 'ut-austin')
on conflict (id) do nothing;

insert into public.locations (id, university_id, name, building_code, description) values
  ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222',
   'Perry-Castañeda Library', 'PCL', 'Public library study spaces'),
  ('11111111-1111-4111-8111-111111111112', '22222222-2222-4222-8222-222222222222',
   'Engineering Education and Research Center', 'EER', 'Public engineering building study spaces'),
  ('11111111-1111-4111-8111-111111111113', '22222222-2222-4222-8222-222222222222',
   'Texas Union', 'UNION', 'Public union study spaces')
on conflict (id) do nothing;

insert into public.courses (id, university_id, code, title) values
  ('33333333-3333-4333-8333-333333333331', '22222222-2222-4222-8222-222222222222',
   'M408C', 'Differential and Integral Calculus'),
  ('33333333-3333-4333-8333-333333333332', '22222222-2222-4222-8222-222222222222',
   'CS314', 'Data Structures'),
  ('33333333-3333-4333-8333-333333333333', '22222222-2222-4222-8222-222222222222',
   'BIO311C', 'Introductory Biology')
on conflict (id) do nothing;
