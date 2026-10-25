import assert from "node:assert/strict";
import test from "node:test";

import { parseStudyingConnection } from "./connection-payload.ts";

const friend = {
  user: {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    displayName: "Alex Kim",
    major: "Chemistry",
    academicYear: "junior",
    studyStyle: "quiet",
    email: "alex@studysync.example",
  },
  location: {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Perry-Castaneda Library",
    buildingCode: "PCL",
    latitude: 30.28,
  },
  course: {
    id: "33333333-3333-4333-8333-333333333331",
    universityId: "22222222-2222-4222-8222-222222222222",
    code: "CHEM220",
    title: "Organic Chemistry",
  },
  availability: "available",
  compatibilityScore: 80,
  rating: 5,
};

test("a studying friend keeps public fields and drops email, coordinates, and scores", () => {
  const parsed = parseStudyingConnection(friend);
  const serialized = JSON.stringify(parsed);
  assert.equal(parsed.user.displayName, "Alex Kim");
  assert.equal(parsed.location.buildingCode, "PCL");
  assert.equal(parsed.course.code, "CHEM220");
  assert.equal(parsed.availability, "available");
  assert.equal(serialized.includes("email"), false);
  assert.equal(serialized.includes("latitude"), false);
  assert.equal(serialized.includes("compatibilityScore"), false);
  assert.equal(serialized.includes("rating"), false);
  assert.throws(() => parseStudyingConnection({ ...friend, availability: "focused" }));
});
