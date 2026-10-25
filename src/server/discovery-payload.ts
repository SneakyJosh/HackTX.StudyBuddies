import {
  MATCH_REASONS,
  type AcademicYear,
  type Availability,
  type DiscoveryMatch,
  type MatchReason,
  type RequestStatus,
  type StudyStyle,
} from "#api";

/**
 * Self-contained parsing helpers. This module intentionally depends only
 * on the frozen contract module so it can be unit-tested in plain Node
 * without a Next.js request context; malformed payloads raise a plain
 * Error, which the server route layer maps to 500 INTERNAL_ERROR.
 */
function badPayload(): never {
  throw new Error("Invalid discovery payload");
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) badPayload();
  return value as Record<string, unknown>;
}

function asArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) badPayload();
  return value;
}

function asString(value: unknown): string {
  if (typeof value !== "string") badPayload();
  return value;
}

function asNullableString(value: unknown): string | null {
  if (value === null) return null;
  return asString(value);
}

function asNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) badPayload();
  return value;
}

function asIsoTimestamp(value: unknown): string {
  const date = new Date(asString(value));
  if (Number.isNaN(date.getTime())) badPayload();
  return date.toISOString();
}

function internalError(): never {
  badPayload();
}

/**
 * Parser for the authorized discovery read path.
 *
 * The database function `discovery_candidates` enforces caller
 * authentication, same-campus eligibility, visibility, active check-in,
 * focused exclusion, and blocks, and it computes the contract score
 * server-side. It returns only public DiscoveryMatch fields. This parser
 * is the second line of defence: it rebuilds every match from an explicit
 * field whitelist, so a regression that made the RPC return an extra
 * column (email, preferred duration, course list, ...) could not leak it
 * into an API response, and a candidate whose availability is not
 * discoverable fails closed instead of being displayed.
 */

const YEARS = new Set(["freshman", "sophomore", "junior", "senior", "graduate", "other"]);
const STYLES = new Set(["quiet", "collaborative", "flexible"]);
const AVAILABILITIES = new Set(["available", "questions_only"]);
const STATUSES = new Set(["pending", "accepted", "declined", "cancelled"]);
const REASONS = new Set<string>(Object.values(MATCH_REASONS));

function year(value: unknown): AcademicYear | null {
  if (value === null) return null;
  const text = asString(value);
  if (!YEARS.has(text)) throw internalError();
  return text as AcademicYear;
}

function style(value: unknown): StudyStyle {
  const text = asString(value);
  if (!STYLES.has(text)) throw internalError();
  return text as StudyStyle;
}

function availability(value: unknown): Availability {
  const text = asString(value);
  if (!AVAILABILITIES.has(text)) throw internalError();
  return text as Availability;
}

function requestStatus(value: unknown): RequestStatus | null {
  if (value === null) return null;
  const text = asString(value);
  if (!STATUSES.has(text)) throw internalError();
  return text as RequestStatus;
}

function reasons(value: unknown, score: number): MatchReason[] {
  const parsed = asArray(value).map((entry) => {
    const text = asString(entry);
    if (!REASONS.has(text)) throw internalError();
    return text as MatchReason;
  });
  if (score === 0 && parsed.length > 0) throw internalError();
  if (new Set(parsed).size !== parsed.length) throw internalError();
  return parsed;
}

export function parseDiscoveryMatch(value: unknown): DiscoveryMatch {
  const row = asRecord(value);
  const user = asRecord(row.user);
  const location = asRecord(row.location);
  const course = asRecord(row.course);
  const score = asNumber(row.compatibilityScore);
  if (!Number.isInteger(score) || score < 0 || score > 100) throw internalError();

  return {
    user: {
      id: asString(user.id),
      displayName: asString(user.displayName),
      major: asNullableString(user.major),
      academicYear: year(user.academicYear),
      studyStyle: style(user.studyStyle),
    },
    location: {
      id: asString(location.id),
      name: asString(location.name),
      buildingCode: asString(location.buildingCode),
    },
    course: {
      id: asString(course.id),
      universityId: asString(course.universityId),
      code: asString(course.code),
      title: asString(course.title),
    },
    availability: availability(row.availability),
    compatibilityScore: score,
    reasons: reasons(row.reasons, score),
    checkinExpiresAt: asIsoTimestamp(row.checkinExpiresAt),
    requestStatus: requestStatus(row.requestStatus),
  };
}

export function parseDiscoveryMatches(value: unknown): DiscoveryMatch[] {
  return asArray(value).map(parseDiscoveryMatch);
}
