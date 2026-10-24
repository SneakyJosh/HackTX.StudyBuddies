import { z } from "zod";

import { VALIDATION } from "@/types/api";

import { validationError } from "./errors";

/**
 * Query-string validation for the read-only catalog endpoints.
 * The contract rejects unknown fields, so unknown query parameters are a
 * 400 VALIDATION_ERROR here as well rather than being silently ignored.
 */

function assertOnlyAllowedParams(
  searchParams: URLSearchParams,
  allowed: readonly string[],
): void {
  for (const key of searchParams.keys()) {
    if (!allowed.includes(key)) {
      throw validationError("Unknown query parameter", { [key]: "Unknown field" });
    }
  }
}

export function assertNoSearchParams(searchParams: URLSearchParams): void {
  assertOnlyAllowedParams(searchParams, []);
}

const courseQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .max(VALIDATION.courseQuery.max)
    // Control characters (incl. NUL) have no legitimate use in a course
    // search and are a classic filter/log injection vector.
    .refine((value) => !/[\u0000-\u001f\u007f]/.test(value), {
      message: "q must not contain control characters",
    })
    .optional(),
});

const uuidSchema = z.uuid();

/**
 * Validate and dedupe a list of user-supplied UUIDs (e.g. counterpart ids
 * for privileged summary lookups). Anything malformed is a 400, and the
 * list is capped so a caller cannot turn one request into an unbounded
 * privileged query.
 */
export function parseUuidList(values: string[], maxItems: number): string[] {
  if (!Array.isArray(values) || values.length > maxItems) {
    throw validationError("Validation failed", {
      ids: `Provide at most ${maxItems} ids`,
    });
  }

  const unique = new Set<string>();
  for (const value of values) {
    const parsed = uuidSchema.safeParse(value);
    if (!parsed.success) {
      throw validationError("Validation failed", { ids: "Ids must be UUIDs" });
    }
    unique.add(parsed.data);
  }
  return [...unique];
}

export type CourseQuery = {
  /** Trimmed substring filter, or null when no filtering was requested. */
  q: string | null;
};

export function parseCourseSearchParams(searchParams: URLSearchParams): CourseQuery {
  assertOnlyAllowedParams(searchParams, ["q"]);

  const qValues = searchParams.getAll("q");
  if (qValues.length > 1) {
    throw validationError("Validation failed", { q: "Provide q at most once" });
  }

  const parsed = courseQuerySchema.safeParse(
    qValues.length === 0 ? {} : { q: qValues[0] },
  );
  if (!parsed.success) {
    throw validationError("Validation failed", {
      q: `q must be at most ${VALIDATION.courseQuery.max} characters and contain no control characters`,
    });
  }

  const q = parsed.data.q?.trim() ?? "";
  return { q: q.length > 0 ? q : null };
}
