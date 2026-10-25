import assert from "node:assert/strict";
import test from "node:test";

import { formatCampusTimestamp, resolveCampusStart } from "../lib/campus-time.ts";

const SPRING = new Date("2026-03-01T12:00:00.000Z");
const SUMMER = new Date("2026-06-01T12:00:00.000Z");
const FALL = new Date("2026-10-01T12:00:00.000Z");

test("summer and winter campus times use the matching Chicago offset", () => {
  const summer = resolveCampusStart("2026-07-15", "14:00", SUMMER);
  const winter = resolveCampusStart("2026-12-15", "14:00", FALL);
  assert.equal(summer.ok && summer.startsAt, "2026-07-15T19:00:00.000Z");
  assert.equal(winter.ok && winter.startsAt, "2026-12-15T20:00:00.000Z");
});

test("a spring-forward gap is rejected instead of shifted forward", () => {
  const gap = resolveCampusStart("2026-03-08", "02:30", SPRING);
  assert.deepEqual(gap, { ok: false, reason: "nonexistent" });
  const before = resolveCampusStart("2026-03-08", "01:30", SPRING);
  const after = resolveCampusStart("2026-03-08", "03:30", SPRING);
  assert.equal(before.ok && before.startsAt, "2026-03-08T07:30:00.000Z");
  assert.equal(after.ok && after.startsAt, "2026-03-08T08:30:00.000Z");
});

test("a fall-back overlap is rejected instead of picking an offset", () => {
  const overlap = resolveCampusStart("2026-11-01", "01:30", FALL);
  assert.deepEqual(overlap, { ok: false, reason: "ambiguous" });
  const before = resolveCampusStart("2026-11-01", "00:30", FALL);
  const after = resolveCampusStart("2026-11-01", "02:30", FALL);
  assert.equal(before.ok && before.startsAt, "2026-11-01T05:30:00.000Z");
  assert.equal(after.ok && after.startsAt, "2026-11-01T08:30:00.000Z");
});

test("impossible dates, the 5-minute grid, the past, and the horizon fail", () => {
  assert.equal(resolveCampusStart("2026-02-31", "10:00", SPRING).ok, false);
  assert.equal(resolveCampusStart("2026-07-15", "14:02", SUMMER).ok, false);
  assert.equal(resolveCampusStart("2026-03-01", "06:00", SPRING).ok, false);
  assert.equal(resolveCampusStart("2027-09-01", "12:00", SUMMER).ok, false);
});

test("campus formatting stays in America/Chicago", () => {
  assert.match(formatCampusTimestamp("2026-07-15T19:00:00.000Z"), /2:00/);
  assert.match(formatCampusTimestamp("2026-07-15T19:00:00.000Z"), /CDT|CT|GMT-5/);
});
