import assert from "node:assert/strict";
import test from "node:test";

import { parseOpenSession, parseScheduledSession, parseStudyRecord, parseStudyStats } from "./session-payload.ts";

const person = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  displayName: "Demo Student A",
  major: "Engineering",
  academicYear: "freshman",
  email: "hidden@example.com",
};

const session = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  title: "Calculus review",
  course: {
    id: "33333333-3333-4333-8333-333333333331",
    universityId: "22222222-2222-4222-8222-222222222222",
    code: "M408C",
    title: "Differential and Integral Calculus",
  },
  location: {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Perry-Castañeda Library",
    buildingCode: "PCL",
    description: "Room 2.220",
  },
  visibility: "open",
  seatLimit: 4,
  seatsTaken: 1,
  seatsReserved: 2,
  startsAt: "2026-07-15T19:00:00.000Z",
  endsAt: "2026-07-15T21:00:00.000Z",
  status: "scheduled",
  host: person,
  myRole: "host",
  myStatus: "accepted",
  participants: [
    { user: person, role: "joiner", status: "requested" },
    { user: person, role: "invitee", status: "invited" },
  ],
  email: "hidden@example.com",
};

test("a scheduled session keeps public fields and drops private ones", () => {
  const parsed = parseScheduledSession(session);
  assert.equal(parsed.status, "scheduled");
  assert.equal(parsed.participants[0]?.status, "requested");
  assert.equal(parsed.participants[1]?.status, "invited");
  assert.equal(parsed.seatsTaken, 1);
  assert.equal(parsed.seatsReserved, 2);
  assert.equal("email" in parsed, false);
  assert.equal("email" in parsed.host, false);
  assert.equal("description" in parsed.location, false);
});

test("a past booking is still scheduled, never completed", () => {
  assert.throws(() => parseScheduledSession({ ...session, status: "completed" }));
});

test("an open card cannot carry a roster or an email", () => {
  const open = {
    id: session.id,
    title: session.title,
    course: session.course,
    location: session.location,
    seatLimit: session.seatLimit,
    seatsTaken: session.seatsTaken,
    seatsReserved: session.seatsReserved,
    startsAt: session.startsAt,
    endsAt: session.endsAt,
    host: session.host,
    myStatus: session.myStatus,
  };
  const parsed = parseOpenSession(open);
  assert.equal(parsed.myStatus, "accepted");
  assert.equal("participants" in parsed, false);
  assert.throws(() => parseOpenSession({ ...open, participants: [] }));
  assert.throws(() => parseOpenSession({ ...open, email: "hidden@example.com" }));
});

const record = {
  id: session.id,
  title: session.title,
  course: session.course,
  location: session.location,
  startsAt: session.startsAt,
  endsAt: session.endsAt,
  sessionStatus: "scheduled",
  attendance: "completed",
  creditedMinutes: 60,
  countsTowardStats: true,
  campusDate: "2026-07-15",
  recordedAt: "2026-07-15T21:00:00.000Z",
  selfReported: true,
  participants: [person],
  myRatings: { studyTime: null, environment: 4, chemistry: [{ userId: person.id, stars: 5 }] },
};

test("a study record keeps hours self-reported and rejects a forged miss", () => {
  const parsed = parseStudyRecord(record);
  assert.equal(parsed.selfReported, true);
  assert.equal(parsed.countsTowardStats, true);
  assert.equal(parsed.myRatings.environment, 4);
  assert.throws(() => parseStudyRecord({ ...record, selfReported: false }));
  assert.throws(() => parseStudyRecord({ ...record, attendance: "missed", creditedMinutes: 30, countsTowardStats: true }));
  assert.throws(() => parseStudyRecord({ ...record, creditedMinutes: 10, countsTowardStats: true }));
});

test("study stats require seven campus days and a self-reported flag", () => {
  const stats = parseStudyStats({
    selfReported: true,
    description: "Self-reported study time. Not independently verified, and not used for matching.",
    streakDays: 0,
    qualifyingMinutes: 0,
    weekMinutes: 0,
    week: ["2026-07-13", "2026-07-14", "2026-07-15", "2026-07-16", "2026-07-17", "2026-07-18", "2026-07-19"].map((date) => ({
      date,
      minutes: 0,
    })),
    courseStreaks: [],
  });
  assert.equal(stats.week.length, 7);
  assert.equal(stats.streakDays, 0);
  assert.throws(() => parseStudyStats({ ...stats, selfReported: false }));
  assert.throws(() => parseStudyStats({ ...stats, week: stats.week.slice(0, 6) }));
});
