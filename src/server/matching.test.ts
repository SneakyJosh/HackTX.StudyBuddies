import assert from "node:assert/strict";
import test from "node:test";

import { MATCH_REASONS } from "#api";
import { rankDiscoveryCandidates, scoreMatch, type DiscoveryCandidate, type MatchPerson } from "./matching.ts";

const PCL = "11111111-1111-4111-8111-111111111111";
const EER = "11111111-1111-4111-8111-111111111112";
const M408C = "33333333-3333-4333-8333-333333333331";
const BIO = "33333333-3333-4333-8333-333333333333";
const LOW_ID = "00000000-0000-4000-8000-000000000001";
const HIGH_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";

function caller(overrides: Partial<MatchPerson> = {}): MatchPerson {
  return {
    userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    courseIds: [M408C],
    preferredDurationMinutes: 120,
    preferredGroupSize: 4,
    checkin: { courseId: M408C, locationId: PCL, studyStyle: "quiet" },
    ...overrides,
  };
}

function candidate(overrides: Partial<DiscoveryCandidate> = {}): DiscoveryCandidate {
  return {
    userId: LOW_ID,
    availability: "available",
    courseIds: [M408C],
    preferredDurationMinutes: 120,
    preferredGroupSize: 4,
    checkin: { courseId: M408C, locationId: PCL, studyStyle: "quiet" },
    ...overrides,
  };
}

test("score reaches 100 and does not include the location sort bonus", () => {
  const perfect = candidate();
  const scored = scoreMatch(caller(), perfect);
  assert.equal(scored.compatibilityScore, 100);
  assert.deepEqual(scored.reasons, [
    MATCH_REASONS.sameActiveCourse,
    MATCH_REASONS.studyStyle,
    MATCH_REASONS.sameLocation,
    MATCH_REASONS.durationWithin30,
    MATCH_REASONS.groupSize,
  ]);

  const ranked = rankDiscoveryCandidates(caller(), [perfect]);
  assert.equal(ranked[0]?.compatibilityScore, 100);
  assert.equal(ranked[0]?.reasons.includes(MATCH_REASONS.sameLocation), true);
});

test("a score of 0 has no reasons", () => {
  const scored = scoreMatch(
    caller(),
    candidate({
      courseIds: [BIO],
      preferredDurationMinutes: 30,
      preferredGroupSize: 1,
      checkin: { courseId: BIO, locationId: EER, studyStyle: "collaborative" },
    }),
  );
  assert.equal(scored.compatibilityScore, 0);
  assert.deepEqual(scored.reasons, []);
});

test("a 15-point higher score outranks a same-building student", () => {
  const me = caller();
  const sameBuilding = candidate({
    userId: LOW_ID,
    courseIds: [BIO],
    preferredDurationMinutes: 180,
    preferredGroupSize: 1,
    checkin: { courseId: BIO, locationId: PCL, studyStyle: "quiet" },
  });
  const higher = candidate({
    userId: HIGH_ID,
    courseIds: [M408C],
    preferredDurationMinutes: 120,
    preferredGroupSize: 4,
    checkin: { courseId: M408C, locationId: EER, studyStyle: "collaborative" },
  });
  const ranked = rankDiscoveryCandidates(me, [sameBuilding, higher]);
  assert.equal(scoreMatch(me, higher).compatibilityScore - scoreMatch(me, sameBuilding).compatibilityScore, 15);
  assert.equal(ranked[0]?.userId, HIGH_ID);
  assert.equal(ranked[0]?.compatibilityScore, scoreMatch(me, higher).compatibilityScore);
});

test("a 10-point gap lets the same location win the tie", () => {
  const me = caller({ preferredGroupSize: 2 });
  const otherBuilding = candidate({
    userId: LOW_ID,
    courseIds: [M408C],
    preferredDurationMinutes: 120,
    preferredGroupSize: 6,
    checkin: { courseId: M408C, locationId: EER, studyStyle: "quiet" },
  });
  const sameBuilding = candidate({
    userId: HIGH_ID,
    courseIds: [BIO],
    preferredDurationMinutes: 120,
    preferredGroupSize: 2,
    checkin: { courseId: BIO, locationId: PCL, studyStyle: "quiet" },
  });
  const ranked = rankDiscoveryCandidates(me, [otherBuilding, sameBuilding]);
  assert.equal(scoreMatch(me, otherBuilding).compatibilityScore - scoreMatch(me, sameBuilding).compatibilityScore, 10);
  assert.equal(ranked[0]?.userId, HIGH_ID);
});

test("focused check-ins are excluded by the matcher", () => {
  const visible = candidate({
    userId: LOW_ID,
    availability: "available",
    courseIds: [BIO],
    preferredDurationMinutes: 30,
    preferredGroupSize: 1,
    checkin: { courseId: BIO, locationId: EER, studyStyle: "collaborative" },
  });
  const focused = candidate({ userId: HIGH_ID, availability: "focused" });
  const ranked = rankDiscoveryCandidates(caller(), [focused, visible]);
  assert.deepEqual(ranked.map((item) => item.userId), [LOW_ID]);
  assert.equal(ranked[0]?.compatibilityScore, 0);
});
