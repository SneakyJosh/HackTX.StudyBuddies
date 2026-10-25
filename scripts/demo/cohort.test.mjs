import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { EXPECTED_PROJECT_REF, readConfirmedEnv } from "./guard.mjs";
import { uuidV5 } from "./ids.mjs";
import { chicagoInstant } from "./time.mjs";
import {
  BOOKABLE_LOCATION_IDS,
  LOCATIONS,
  PROTECTED_EMAILS,
  buildPlan,
  connectCandidates,
  expectedFriends,
  scoreDemo,
  validatePlan,
} from "./cohort.mjs";

const demoDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(demoDir, "../..");
const fixedNow = new Date("2026-10-25T15:14:00.000Z");

function readTree(directory, files = []) {
  for (const name of readdirSync(directory)) {
    if (name === "node_modules" || name === ".next" || name === ".git") continue;
    const full = path.join(directory, name);
    if (statSync(full).isDirectory()) readTree(full, files);
    else files.push(full);
  }
  return files;
}

test("uuid v5 matches the published DNS example", () => {
  assert.equal(uuidV5("python.org", "6ba7b810-9dad-11d1-80b4-00c04fd430c8"), "886313e1-3b8a-5372-9b90-0c9aee199e5d");
});

test("Chicago wall time converts for both daylight and standard time", () => {
  assert.equal(chicagoInstant({ year: 2026, month: 10, day: 25 }, 16, 0).toISOString(), "2026-10-25T21:00:00.000Z");
  assert.equal(chicagoInstant({ year: 2027, month: 1, day: 15 }, 16, 0).toISOString(), "2027-01-15T22:00:00.000Z");
});

test("the synthetic cohort keeps catalog ids, privacy, and booking rules valid", () => {
  const plan = buildPlan(fixedNow);
  assert.equal(plan.people.length, 20);
  assert.equal(plan.people.filter((person) => person.checkin).length, 8);
  assert.equal(plan.requests.filter((request) => request.accept).length, 12);
  assert.equal(plan.future.length + 1, 6);
  assert.equal(BOOKABLE_LOCATION_IDS.length, 15);
  assert.equal(BOOKABLE_LOCATION_IDS.includes(LOCATIONS.LTD), false);
  assert.deepEqual(
    plan.people.filter((person) => person.email.endsWith("@studysync.example") && person.email.startsWith("demo-host")).map((person) => person.name),
    ["Avery Chen"],
  );
  for (const email of PROTECTED_EMAILS) assert.equal(plan.people.some((person) => person.email === email), false);

  const connect = connectCandidates("avery", plan);
  const score = (key) => connect.find((row) => row.person.key === key);
  assert.equal(score("jordan").compatibilityScore, 100);
  assert.equal(score("jordan").reasons.includes("Same study location"), true);
  assert.equal(score("riley").compatibilityScore, 65);
  assert.equal(score("noah").compatibilityScore, 0);
  assert.equal(score("noah").reasons.length, 0);
  assert.equal(score("marcus").compatibilityScore, 80);
  assert.equal(connect.some((row) => row.person.key === "sam" || row.person.key === "jonah"), false);
  assert.equal(score("jordan").compatibilityScore < 110, true);

  const friends = expectedFriends(plan, "avery").map((person) => person.key).sort();
  assert.deepEqual(friends, ["hana", "jordan", "noah", "priya", "riley"]);
  assert.equal(friends.includes("marcus"), false);

  const caller = { style: "quiet", duration: 60, groupSize: 2, courses: ["M408C"], checkin: { course: "M408C", location: "WEL" } };
  const cafe = scoreDemo(caller, { ...caller, checkin: { course: "M408C", location: "UAA" } });
  const building = scoreDemo(caller, caller);
  assert.equal(building.compatibilityScore - cafe.compatibilityScore, 20);
  assert.equal(cafe.reasons.includes("Same study location"), false);

  const attendance = plan.history.flatMap((item) => item.participants);
  assert.equal(attendance.length, 12);
  assert.equal(attendance.filter((row) => row.studyTime !== null && row.environment !== null).length, 8);
  assert.equal(attendance.filter((row) => row.studyTime === null).length, 4);
  assert.equal(attendance.reduce((sum, row) => sum + row.chemistry.length, 0), 4);
  const invite = plan.future.find((item) => item.visibility === "invite_only");
  assert.deepEqual(invite.invitees, ["riley"]);
  assert.equal(plan.liveSprint.accepted.includes("riley"), true);
  assert.equal(JSON.stringify(plan).includes(PROTECTED_EMAILS[0]), false);
});

test("validation fails closed for a non-bookable location or an overlap", () => {
  const unbookable = buildPlan(fixedNow);
  unbookable.people.find((person) => person.key === "noah").checkin.location = "LTD";
  assert.throws(() => validatePlan(unbookable), /not bookable/);

  const overlap = buildPlan(fixedNow);
  overlap.future[0].host = "jordan";
  overlap.future[0].course = "CS314";
  overlap.future[0].startsAt = overlap.future[1].startsAt;
  overlap.future[0].endsAt = overlap.future[1].endsAt;
  assert.throws(() => validatePlan(overlap), /overlap/);
});

test("writes require the confirmed project and the scripts cannot impersonate a user", () => {
  assert.throws(() => readConfirmedEnv(["--confirm-project=someone-else"]), /Refusing/);
  const saved = process.env.SUPABASE_URL;
  delete process.env.SUPABASE_URL;
  try {
    assert.throws(() => readConfirmedEnv([`--confirm-project=${EXPECTED_PROJECT_REF}`]), /Refusing/);
  } finally {
    if (saved === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = saved;
  }
});

test("demo scripts stay isolated from the app and do not carry secrets or policy changes", () => {
  const sources = [
    "guard.mjs",
    "schema.mjs",
    "accounts.mjs",
    "cohort.mjs",
    "create-users.mjs",
    "seed.mjs",
    "refresh-live.mjs",
    "cleanup.mjs",
    "ids.mjs",
    "time.mjs",
    "README.md",
  ];
  const combined = sources.map((name) => readFileSync(path.join(demoDir, name), "utf8")).join("\n");
  for (const pattern of [/request\.jwt/, /set_config/, /\beyJ/, /service_role/, /password\s*[:=]\s*["']/, /disable trigger/i, /alter policy/i]) {
    assert.equal(pattern.test(combined), false, pattern.source);
  }
  const refresh = readFileSync(path.join(demoDir, "refresh-live.mjs"), "utf8");
  assert.equal(refresh.includes("replace_checkin"), true);
  assert.equal(refresh.includes("create_study_session"), false);
  assert.equal(refresh.includes("study_requests"), false);
  const cleanup = readFileSync(path.join(demoDir, "cleanup.mjs"), "utf8");
  for (const table of ["locations", "courses", "universities", "campus_places"]) {
    assert.equal(cleanup.includes(`.from("${table}")`), false);
  }
  assert.equal(cleanup.includes("Nothing was deleted."), true);
  const appHits = readTree(path.join(root, "src")).filter((file) => readFileSync(file, "utf8").includes("scripts/demo"));
  assert.deepEqual(appHits, []);
  const matching = readFileSync(path.join(root, "src", "server", "matching.ts"), "utf8");
  const points = readFileSync(path.join(root, "src", "types", "api.ts"), "utf8");
  const scoreFn = matching.slice(matching.indexOf("export function scoreMatch"), matching.indexOf("export function rankDiscovery"));
  assert.equal(scoreFn.includes("LOCATION_RANK_BONUS"), false);
  assert.equal(points.includes("sameLocation: 20"), true);
  assert.equal(matching.includes("hackathon-2026"), false);
});
