import assert from "node:assert/strict";
import test from "node:test";

import { ContractValidationError, parsePostBlockBody, parsePutProfileBody } from "./validation.ts";

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
