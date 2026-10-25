import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
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

test("pair-lock triggers never call pg_catalog.least/greatest (42883 regression)", () => {
  // least/greatest are parser expressions, not catalog functions:
  // pg_catalog.least(uuid, uuid) raises 42883 on the request/block insert
  // triggers. 0001 is already applied and keeps the defective text; 0002
  // supersedes both functions with the unqualified form.
  const fix = readFileSync(
    "supabase/migrations/0002_fix_pair_lock_least_greatest.sql",
    "utf8",
  );
  assert.match(fix, /create or replace function public\.enforce_request_insert_rules\(\)/);
  assert.match(fix, /create or replace function public\.enforce_block_insert_rules\(\)/);
  assert.match(fix, /least\(new\.sender_id, new\.recipient_id\)/);
  assert.match(fix, /greatest\(new\.sender_id, new\.recipient_id\)/);
  assert.match(fix, /least\(new\.blocker_id, new\.blocked_id\)/);
  assert.match(fix, /greatest\(new\.blocker_id, new\.blocked_id\)/);
  // No migration other than the frozen, already-applied 0001 may contain
  // a schema-qualified least/greatest call.
  for (const file of readdirSync("supabase/migrations")) {
    if (file === "0001_studysync.sql") continue;
    const source = readFileSync(`supabase/migrations/${file}`, "utf8");
    assert.equal(/pg_catalog\.(least|greatest)\(new\./.test(source), false, file);
  }
});

test("no general-purpose privileged client or service-role credential remains in server code", () => {
  assert.equal(existsSync("src/server/admin.ts"), false);
  assert.equal(existsSync("src/server/public-profiles.ts"), false);
  for (const file of [
    "src/server/discovery.ts",
    "src/server/requests.ts",
    "src/server/sessions.ts",
    "src/server/supabase.ts",
    "src/server/auth.ts",
  ]) {
    const source = readFileSync(file, "utf8");
    assert.equal(source.includes("SUPABASE_SERVICE_ROLE_KEY"), false, file);
    assert.equal(source.includes("createSupabaseAdminClient"), false, file);
  }
});

test("privileged read paths carry the server-only build guard", () => {
  for (const file of ["src/server/discovery.ts", "src/server/requests.ts", "src/server/sessions.ts"]) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /^import "server-only";/m, `${file} must import server-only first`);
  }
});

test("the dev auth test page is development-only and exposes no secrets", () => {
  const page = readFileSync("src/app/dev-auth-test/page.tsx", "utf8");
  const client = readFileSync("src/app/dev-auth-test/dev-auth-test-client.tsx", "utf8");
  // The server page 404s in production; the interactive UI is client-only.
  assert.match(page, /process\.env\.NODE_ENV === "production"/);
  assert.match(page, /notFound\(\)/);
  assert.match(client, /^"use client";/m);
  // Standard browser sign-in flow through @supabase/ssr cookies, no
  // service-role credential and no session/token handling that could leak.
  assert.match(client, /createBrowserClient/);
  assert.match(client, /signInWithPassword/);
  assert.match(client, /signOut\(\)/);
  for (const forbidden of [
    "SUPABASE_SERVICE_ROLE_KEY",
    "service_role",
    "access_token",
    "refresh_token",
    "getSession",
    "document.cookie",
  ]) {
    assert.equal(client.includes(forbidden), false, `dev auth test must not touch ${forbidden}`);
  }
  // It exercises exactly the three catalog endpoints and shows statuses.
  for (const endpoint of ["/api/universities", "/api/locations", "/api/courses"]) {
    assert.equal(client.includes(endpoint), true, endpoint);
  }
  assert.match(client, /response\.status/);
});

test("the dev auth test page drives the full two-student workflow and negative checks", () => {
  const client = readFileSync("src/app/dev-auth-test/dev-auth-test-client.tsx", "utf8");
  // Every workflow route from the frozen contract is exercised.
  for (const path of [
    "/api/profile",
    "/api/checkin",
    "/api/discovery",
    "/api/requests",
    "/api/blocks",
  ]) {
    assert.equal(client.includes(path), true, path);
  }
  for (const action of ["accepted", "declined", "cancelled", "signInWithPassword", "signOut"]) {
    assert.equal(client.includes(action), true, action);
  }
  // Negative checks assert the contract's expected failure statuses.
  for (const expected of ["400", "403", "404", "409"]) {
    assert.equal(client.includes(expected), true, `expected status ${expected}`);
  }
  // It must stay read-safe: no destructive verbs beyond the contract's own
  // check-out / unblock / transitions, and no report creation is needed.
  assert.equal(client.includes("/api/reports"), false);
});

test("scheduled sessions stay private and do not complete themselves", () => {
  const migration = readFileSync("supabase/migrations/0003_study_sessions.sql", "utf8");
  assert.match(migration, /status in \('scheduled', 'cancelled'\)/);
  assert.equal(migration.includes("'completed'"), false);
  assert.match(migration, /'requested'/);
  assert.match(migration, /status in \('accepted', 'invited'\)/);
  assert.match(migration, /exclude using gist/);
  assert.match(migration, /America\/Chicago/);
  assert.match(migration, /ambiguous in America\/Chicago/);
  assert.match(migration, /does not exist in America\/Chicago/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /using \(public\.study_session_visible\(id\)\)/);
  assert.match(migration, /using \(public\.study_session_participant_visible\(session_id, user_id\)\)/);
  assert.equal(migration.includes("where p.session_id = study_sessions.id"), false);
  assert.match(migration, /delete from public\.study_session_commitments where session_id = s\.id/);
  assert.match(migration, /apply_block_to_study_sessions/);
  assert.match(migration, /hashtextextended\('session:' \|\| target_id::text, 1\)/);
  assert.match(migration, /if not found then\s+raise exception 'CONFLICT: that invitation is no longer pending'/);
  assert.equal(
    migration.includes("grant execute on function public.study_session_payload(uuid) to authenticated"),
    false,
  );
  assert.equal(
    migration.includes("grant execute on function public.study_session_payload(uuid, boolean) to authenticated"),
    false,
  );
  assert.equal(migration.includes("discovery_candidates"), false);
  const scoring = readFileSync("supabase/migrations/0001_studysync.sql", "utf8");
  assert.equal(readFileSync("supabase/migrations/0002_fix_pair_lock_least_greatest.sql", "utf8").includes("study_sessions"), false);
  assert.match(scoring, /function public\.discovery_candidates/);
});
