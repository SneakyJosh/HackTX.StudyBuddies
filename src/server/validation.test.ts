import assert from "node:assert/strict";
import test from "node:test";

import {
  ContractValidationError,
  parsePostBlockBody,
  parsePostCheckinRatingBody,
  parsePostSessionBody,
  parsePostStudyRatingBody,
  parsePutProfileBody,
} from "./validation.ts";

const CALLER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

test("rejects unknown fields", () => {
  assert.throws(
    () => parsePostBlockBody({ blockedUserId: OTHER, reason: "nope" }, CALLER),
    (error: unknown) => {
      assert.ok(error instanceof ContractValidationError);
      assert.equal(error.details.reason, "Unknown field");
      return true;
    },
  );
});

test("rejects a self-block", () => {
  assert.throws(
    () => parsePostBlockBody({ blockedUserId: CALLER }, CALLER),
    (error: unknown) => {
      assert.ok(error instanceof ContractValidationError);
      assert.equal(error.details.blockedUserId, "Cannot block yourself");
      return true;
    },
  );
});

test("rejects an ambiguous Chicago time and an unknown session field", () => {
  const now = new Date("2026-10-01T12:00:00.000Z");
  assert.throws(
    () =>
      parsePostSessionBody(
        {
          title: "Review",
          courseId: "33333333-3333-4333-8333-333333333331",
          locationId: "11111111-1111-4111-8111-111111111111",
          localDate: "2026-11-01",
          localTime: "01:30",
          durationMinutes: 60,
          visibility: "solo",
          seatLimit: 1,
          inviteeIds: [],
          notes: "bring a laptop",
        },
        CALLER,
        now,
      ),
    (error: unknown) => {
      assert.ok(error instanceof ContractValidationError);
      assert.equal(error.details.notes, "Unknown field");
      assert.match(error.details.localTime, /twice/);
      return true;
    },
  );
});

test("rejects a spring-forward gap instead of moving the booking", () => {
  const now = new Date("2026-03-01T12:00:00.000Z");
  assert.throws(
    () =>
      parsePostSessionBody(
        {
          title: "Review",
          courseId: "33333333-3333-4333-8333-333333333331",
          locationId: "11111111-1111-4111-8111-111111111111",
          localDate: "2026-03-08",
          localTime: "02:30",
          durationMinutes: 60,
          visibility: "solo",
          seatLimit: 1,
          inviteeIds: [],
        },
        CALLER,
        now,
      ),
    (error: unknown) => {
      assert.ok(error instanceof ContractValidationError);
      assert.match(error.details.localTime, /does not exist/);
      return true;
    },
  );
});

test("rejects an unknown profile field", () => {
  assert.throws(
    () =>
      parsePutProfileBody({
        displayName: "Demo Student A",
        universityId: OTHER,
        major: null,
        academicYear: null,
        courseIds: ["33333333-3333-4333-8333-333333333331"],
        studyStyle: "quiet",
        preferredDurationMinutes: 60,
        preferredGroupSize: 2,
        email: "hidden@example.com",
      }),
    (error: unknown) => {
      assert.ok(error instanceof ContractValidationError);
      assert.equal(error.details.email, "Unknown field");
      return true;
    },
  );
});

test("ratings reject unknown fields, self ratings, and an empty body", () => {
  assert.throws(
    () => parsePostStudyRatingBody({ studyTime: 5, leaderboard: true }, CALLER),
    (error: unknown) => {
      assert.ok(error instanceof ContractValidationError);
      assert.equal(error.details.leaderboard, "Unknown field");
      return true;
    },
  );
  assert.throws(
    () => parsePostStudyRatingBody({ chemistry: [{ userId: CALLER, stars: 4 }] }, CALLER),
    (error: unknown) => {
      assert.ok(error instanceof ContractValidationError);
      assert.equal(error.details["chemistry.0"], "Rate another student from that session");
      return true;
    },
  );
  assert.throws(() => parsePostStudyRatingBody({}, CALLER), ContractValidationError);
  const parsed = parsePostStudyRatingBody({ environment: 3, chemistry: [{ userId: OTHER, stars: 2 }] }, CALLER);
  assert.equal(parsed.environment, 3);
  assert.equal(parsed.chemistry?.[0]?.userId, OTHER);
});

test("personal feedback accepts one category and rejects a partner rating", () => {
  assert.deepEqual(parsePostCheckinRatingBody({ studyTime: 5 }), { studyTime: 5 });
  assert.throws(
    () => parsePostCheckinRatingBody({ environment: 4, chemistry: [{ userId: OTHER, stars: 5 }] }),
    (error: unknown) => {
      assert.ok(error instanceof ContractValidationError);
      assert.equal(error.details.chemistry, "Unknown field");
      return true;
    },
  );
  assert.throws(() => parsePostCheckinRatingBody({}), ContractValidationError);
  assert.throws(() => parsePostCheckinRatingBody({ studyTime: 0 }), ContractValidationError);
});
