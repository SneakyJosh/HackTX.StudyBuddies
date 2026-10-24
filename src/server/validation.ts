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
  q: z.string().trim().max(VALIDATION.courseQuery.max).optional(),
});

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
      q: `q must be at most ${VALIDATION.courseQuery.max} characters`,
    });
  }

  const q = parsed.data.q?.trim() ?? "";
  return { q: q.length > 0 ? q : null };
}
