import assert from "node:assert/strict";
import test from "node:test";

import { parseOpenSession, parseScheduledSession } from "./session-payload.ts";

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
