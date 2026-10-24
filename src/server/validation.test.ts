import { describe, expect, it } from "vitest";

import { ApiError } from "./errors";
import {
  assertNoSearchParams,
  parseCourseSearchParams,
  parseUuidList,
} from "./validation";

const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function expectValidationError(run: () => unknown): void {
  expect(run).toThrowError(ApiError);
  try {
    run();
  } catch (error) {
    expect(error).toMatchObject({ code: "VALIDATION_ERROR", status: 400 });
  }
}

describe("parseCourseSearchParams", () => {
  it("accepts a missing q as no filter", () => {
    expect(parseCourseSearchParams(new URLSearchParams())).toEqual({ q: null });
  });

  it("trims q and treats blank q as no filter", () => {
    expect(parseCourseSearchParams(new URLSearchParams("q=%20M408%20"))).toEqual({
      q: "M408",
    });
    expect(parseCourseSearchParams(new URLSearchParams("q=%20%20"))).toEqual({
      q: null,
    });
  });

  it("rejects q longer than 40 characters", () => {
    expectValidationError(() =>
      parseCourseSearchParams(new URLSearchParams(`q=${"a".repeat(41)}`)),
    );
  });

  it("rejects control characters in q", () => {
    expectValidationError(() =>
      parseCourseSearchParams(new URLSearchParams("q=M4%0808")),
    );
  });

  it("rejects a repeated q parameter", () => {
    expectValidationError(() =>
      parseCourseSearchParams(new URLSearchParams("q=M408&q=CS314")),
    );
  });

  it("rejects unknown query parameters", () => {
    expectValidationError(() =>
      parseCourseSearchParams(new URLSearchParams("bogus=1")),
    );
  });
});

describe("assertNoSearchParams", () => {
  it("accepts an empty query string and rejects any parameter", () => {
    expect(() => assertNoSearchParams(new URLSearchParams())).not.toThrow();
    expectValidationError(() =>
      assertNoSearchParams(new URLSearchParams("q=M408")),
    );
  });
});

describe("parseUuidList", () => {
  it("dedupes valid UUIDs", () => {
    expect(parseUuidList([USER_ID, USER_ID, OTHER_ID], 50)).toEqual([
      USER_ID,
      OTHER_ID,
    ]);
  });

  it("rejects malformed ids and oversized lists", () => {
    expectValidationError(() => parseUuidList(["not-a-uuid"], 50));
    expectValidationError(() => parseUuidList([USER_ID, OTHER_ID], 1));
    expectValidationError(() => parseUuidList([""], 50));
  });
});
