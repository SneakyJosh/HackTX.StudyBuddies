import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

/**
 * Static regression tests for the reported database/server bypasses.
 * They scan the canonical migration and server sources so a future edit
 * cannot silently reintroduce a bypass. (Behavioural proof of the SQL
 * still requires a real PostgreSQL/Supabase run; see supabase/README.)
 */

const migration = readFileSync("supabase/migrations/0001_studysync.sql", "utf8");

test("the canonical migration contains no null-actor consent bypass", () => {
  assert.equal(migration.includes("actor is not null"), false);
  assert.equal(migration.includes("allow_block_cancellation"), false);
  // Recipient-only acceptance/decline and sender-only cancellation.
  assert.match(migration, /only the recipient can accept or decline/);
  assert.match(migration, /only the sender can cancel a pending request/);
});

test("request inserts enforce recipient discoverability at the database level", () => {
  const insertFn = migration.slice(
    migration.indexOf("function public.enforce_request_insert_rules"),
    migration.indexOf("function public.enforce_request_transition"),
  );
  assert.match(insertFn, /recipient_visible is not true/);
  assert.match(insertFn, /recipient_university is distinct from sender_university/);
  assert.match(insertFn, /availability in \('available', 'questions_only'\)/);
  assert.match(insertFn, /expires_at > pg_catalog\.clock_timestamp\(\)/);
  assert.match(insertFn, /public\.blocks/);
  assert.match(insertFn, /a request must be created as pending/);
});

test("profile deletion cannot cascade-erase user history", () => {
  for (const table of ["profile_courses", "checkins", "study_requests", "blocks", "reports"]) {
    const start = migration.indexOf(`create table public.${table} (`);
    assert.notEqual(start, -1, `${table} table missing`);
    const ddl = migration.slice(start, migration.indexOf(");", start));
    assert.equal(ddl.includes("on delete cascade"), false, `${table} must not cascade-delete`);
  }
});

test("discovery scoring stays in the database and returns no private scoring inputs", () => {
  const start = migration.indexOf("function public.discovery_candidates");
  const fn = migration.slice(start, migration.indexOf("function public.study_request_payload"));
  assert.match(fn, /auth\.uid\(\)/);
  assert.match(fn, /other\.visible/);
  assert.match(fn, /'available', 'questions_only'/);
  assert.match(fn, /public\.blocks/);
  const returnedPayload = fn.slice(fn.indexOf("jsonb_build_object("));
  assert.equal(returnedPayload.includes("preferred_duration"), false);
  assert.equal(returnedPayload.includes("preferred_group_size"), false);
  assert.equal(returnedPayload.includes("'courseIds'"), false);
});

test("blocked pairs cannot leak counterpart data through study_request_payload", () => {
  const fn = migration.slice(
    migration.indexOf("function public.study_request_payload"),
    migration.indexOf("function public.list_my_requests"),
  );
  // Blocked pairs are refused inside the helper itself, indistinguishably
  // from a missing/non-participant request.
  assert.match(fn, /from public\.blocks b/);
  assert.match(fn, /raise exception 'NOT_FOUND: request not found'/);
  // Least privilege: the helper is internal-only; clients reach request
  // payloads through list_my_requests / send_study_request, which stay
  // granted and still call the helper within the definer chain.
  assert.equal(
    migration.includes(
      "grant execute on function public.study_request_payload(uuid) to authenticated",
    ),
    false,
  );
  assert.match(migration, /revoke all on function public\.study_request_payload\(uuid\) from public, anon, authenticated;/);
  assert.match(migration, /grant execute on function public\.list_my_requests\(text\) to authenticated;/);
  assert.match(migration, /grant execute on function public\.send_study_request\(uuid\) to authenticated;/);
  assert.match(migration, /public\.study_request_payload\(rows\.id\)/);
  assert.match(migration, /return public\.study_request_payload\(new_id\);/);
  // Server code must not call the internal helper directly either.
  const requestsSource = readFileSync("src/server/requests.ts", "utf8");
  assert.equal(requestsSource.includes('rpc("study_request_payload"'), false);
});

test("no general-purpose privileged client or service-role credential remains in server code", () => {
  assert.equal(existsSync("src/server/admin.ts"), false);
  assert.equal(existsSync("src/server/public-profiles.ts"), false);
  for (const file of [
    "src/server/discovery.ts",
    "src/server/requests.ts",
    "src/server/supabase.ts",
    "src/server/auth.ts",
  ]) {
    const source = readFileSync(file, "utf8");
    assert.equal(source.includes("SUPABASE_SERVICE_ROLE_KEY"), false, file);
    assert.equal(source.includes("createSupabaseAdminClient"), false, file);
  }
});

test("privileged read paths carry the server-only build guard", () => {
  for (const file of ["src/server/discovery.ts", "src/server/requests.ts"]) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /^import "server-only";/m, `${file} must import server-only first`);
  }
});
