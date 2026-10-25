import assert from "node:assert/strict";
import test from "node:test";

import { parseDiscoveryMatches } from "./discovery-payload.ts";

const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const UNIVERSITY = "22222222-2222-4222-8222-222222222222";
const LOCATION = "11111111-1111-4111-8111-111111111111";
const COURSE = "33333333-3333-4333-8333-333333333331";

function validMatch(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    user: {
      id: USER,
      displayName: "Demo Student A",
      major: "Engineering",
      academicYear: "freshman",
      studyStyle: "collaborative",
    },
    location: { id: LOCATION, name: "Perry-Castañeda Library", buildingCode: "PCL" },
    course: {
      id: COURSE,
      universityId: UNIVERSITY,
      code: "M408C",
      title: "Differential and Integral Calculus",
    },
    availability: "available",
    compatibilityScore: 70,
    reasons: ["Studying the same course", "Compatible study style", "Preferred duration within 30 minutes"],
    checkinExpiresAt: "2026-10-24T20:00:00.000Z",
    requestStatus: null,
    ...overrides,
  };
}

test("returns exactly the contract fields for a valid match", () => {
  const [match] = parseDiscoveryMatches([validMatch()]);
  assert.deepEqual(match, {
    user: {
      id: USER,
      displayName: "Demo Student A",
      major: "Engineering",
      academicYear: "freshman",
      studyStyle: "collaborative",
    },
    location: { id: LOCATION, name: "Perry-Castañeda Library", buildingCode: "PCL" },
    course: {
      id: COURSE,
      universityId: UNIVERSITY,
      code: "M408C",
      title: "Differential and Integral Calculus",
    },
    availability: "available",
    compatibilityScore: 70,
    reasons: ["Studying the same course", "Compatible study style", "Preferred duration within 30 minutes"],
    checkinExpiresAt: "2026-10-24T20:00:00.000Z",
    requestStatus: null,
  });
});

test("strips private fields if the RPC ever returns them", () => {
  const wide = validMatch({
    email: "demo-student-a@studysync.example",
    preferredDurationMinutes: 120,
    preferredGroupSize: 2,
    courseIds: [COURSE],
    visible: true,
    user: {
      id: USER,
      displayName: "Demo Student A",
      major: null,
      academicYear: null,
      studyStyle: "quiet",
      email: "demo-student-a@studysync.example",
      preferredDurationMinutes: 120,
    },
  });

  const [match] = parseDiscoveryMatches([wide]);
  const serialized = JSON.stringify(match);
  assert.equal(serialized.includes("studysync.example"), false);
  assert.equal(serialized.includes("preferredDurationMinutes"), false);
  assert.equal(serialized.includes("preferredGroupSize"), false);
  assert.equal(serialized.includes("courseIds"), false);
  assert.deepEqual(Object.keys(match.user).sort(), [
    "academicYear",
    "displayName",
    "id",
    "major",
    "studyStyle",
  ]);
});

test("fails closed on a focused candidate (focused must never be discovered)", () => {
  assert.throws(() => parseDiscoveryMatches([validMatch({ availability: "focused" })]));
});

test("fails closed on a non-contract reason or a filler reason at score 0", () => {
  assert.throws(() =>
    parseDiscoveryMatches([validMatch({ reasons: ["Likes the same library"] })]),
  );
  assert.throws(() =>
    parseDiscoveryMatches([
      validMatch({ compatibilityScore: 0, reasons: ["Compatible study style"] }),
    ]),
  );
  assert.throws(() =>
    parseDiscoveryMatches([validMatch({ compatibilityScore: 101 })]),
  );
});

test("accepts questions_only and a latest request status", () => {
  const [match] = parseDiscoveryMatches([
    validMatch({ availability: "questions_only", requestStatus: "pending" }),
  ]);
  assert.equal(match.availability, "questions_only");
  assert.equal(match.requestStatus, "pending");
});
