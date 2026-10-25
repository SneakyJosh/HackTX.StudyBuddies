import assert from "node:assert/strict";
import test from "node:test";

import { parseCheckin, parseCheckinStudyRecord } from "./checkin-payload.ts";

const checkin = {
  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  locationId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  courseId: "33333333-3333-4333-8333-333333333331",
  availability: "focused",
  studyStyle: "quiet",
  startedAt: "2026-10-25T15:00:00.000Z",
  expiresAt: "2026-10-25T15:30:00.000Z",
};

const record = {
  id: checkin.id,
  checkinId: checkin.id,
  course: {
    id: checkin.courseId,
    universityId: "22222222-2222-4222-8222-222222222222",
    code: "M408C",
    title: "Calculus",
  },
  location: { id: checkin.locationId, name: "PCL", buildingCode: "PCL" },
  studyStyle: "quiet",
  availability: "available",
  startedAt: checkin.startedAt,
  finishedAt: "2026-10-25T15:05:00.000Z",
  creditedMinutes: 5,
  countsTowardStats: true,
  campusDate: "2026-10-25",
  recordedAt: "2026-10-25T15:05:01.000Z",
  selfReported: true,
};

test("a check-in without live is treated as the current discovery window", () => {
  assert.equal(parseCheckin(checkin).live, true);
  assert.equal(parseCheckin({ ...checkin, live: false }).live, false);
});

test("a personal study record accepts one credited minute and rejects a mismatched flag", () => {
  assert.equal(parseCheckinStudyRecord({ ...record, creditedMinutes: 1, countsTowardStats: true }).creditedMinutes, 1);
  assert.equal(parseCheckinStudyRecord({ ...record, creditedMinutes: 0, countsTowardStats: false }).countsTowardStats, false);
  assert.throws(() => parseCheckinStudyRecord({ ...record, creditedMinutes: 0, countsTowardStats: true }));
  assert.throws(() => parseCheckinStudyRecord({ ...record, selfReported: false }));
});
