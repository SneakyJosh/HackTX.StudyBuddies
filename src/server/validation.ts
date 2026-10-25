import {
  VALIDATION,
  type AcademicYear,
  type Availability,
  type PostBlockBody,
  type PostCheckinBody,
  type PostReportBody,
  type PostRequestBody,
  type PutProfileBody,
  type ReportReason,
  type RequestDirection,
  type StudyStyle,
} from "#api";

export class ContractValidationError extends Error {
  readonly details: Record<string, string>;

  constructor(message: string, details: Record<string, string> = {}) {
    super(message);
    this.name = "ContractValidationError";
    this.details = details;
  }
}

const STUDY_STYLES = ["quiet", "collaborative", "flexible"] as const satisfies readonly StudyStyle[];
const AVAILABILITIES = ["available", "questions_only", "focused"] as const satisfies readonly Availability[];
const ACADEMIC_YEARS = ["freshman", "sophomore", "junior", "senior", "graduate", "other"] as const satisfies readonly AcademicYear[];
const REPORT_REASONS = ["harassment", "spam", "other"] as const satisfies readonly ReportReason[];
const PATCH_STATUSES = ["accepted", "declined", "cancelled"] as const;
const DIRECTIONS = ["incoming", "outgoing", "all"] as const satisfies readonly RequestDirection[];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(details: Record<string, string>): void {
  if (Object.keys(details).length > 0) {
    throw new ContractValidationError("Validation failed", details);
  }
}

function unknownFields(body: Record<string, unknown>, allowed: readonly string[]): Record<string, string> {
  const details: Record<string, string> = {};
  for (const key of Object.keys(body)) {
    if (!allowed.includes(key)) {
      details[key] = "Unknown field";
    }
  }
  return details;
}

function requirePresent(body: Record<string, unknown>, key: string, details: Record<string, string>): boolean {
  if (!Object.prototype.hasOwnProperty.call(body, key)) {
    details[key] = `${key} is required`;
    return false;
  }
  return true;
}

export function parseUuid(value: unknown, field: string, details: Record<string, string>): string | null {
  if (typeof value !== "string" || !UUID_RE.test(value)) {
    details[field] = `${field} must be a UUID`;
    return null;
  }
  return value.toLowerCase();
}

export function parsePathUuid(value: string, field: string): string {
  const details: Record<string, string> = {};
  const parsed = parseUuid(value, field, details);
  fail(details);
  return parsed as string;
}

function parseEnum<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[],
  details: Record<string, string>,
): T | null {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    details[field] = `${field} is invalid`;
    return null;
  }
  return value as T;
}

function parseInteger(
  value: unknown,
  field: string,
  min: number,
  max: number,
  details: Record<string, string>,
): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    details[field] = `${field} must be an integer from ${min} to ${max}`;
    return null;
  }
  return value;
}

function sameUser(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    throw new ContractValidationError("Malformed JSON");
  }
  if (!isRecord(parsed)) {
    throw new ContractValidationError("Request body must be a JSON object");
  }
  return parsed;
}

function rejectSearchParams(searchParams: URLSearchParams, allowed: readonly string[]): void {
  const details: Record<string, string> = {};
  const seen = new Set<string>();
  for (const key of searchParams.keys()) {
    if (!allowed.includes(key)) {
      details[key] = "Unknown field";
      continue;
    }
    if (seen.has(key)) {
      details[key] = "Provide this field at most once";
    }
    seen.add(key);
  }
  fail(details);
}

export function assertNoSearchParams(searchParams: URLSearchParams): void {
  rejectSearchParams(searchParams, []);
}

export type CourseQuery = { q: string | null };

export function parseCourseSearchParams(searchParams: URLSearchParams): CourseQuery {
  rejectSearchParams(searchParams, ["q"]);
  const raw = searchParams.get("q");
  if (raw === null) return { q: null };
  if (/[\u0000-\u001f\u007f]/.test(raw)) {
    throw new ContractValidationError("Validation failed", { q: "q must not contain control characters" });
  }
  const trimmed = raw.trim();
  if (trimmed.length > VALIDATION.courseQuery.max) {
    throw new ContractValidationError("Validation failed", {
      q: `q must be at most ${VALIDATION.courseQuery.max} characters`,
    });
  }
  return { q: trimmed.length > 0 ? trimmed : null };
}

export type DiscoveryQuery = { locationId: string | null; courseId: string | null };

export function parseDiscoveryQuery(searchParams: URLSearchParams): DiscoveryQuery {
  rejectSearchParams(searchParams, ["locationId", "courseId"]);
  const details: Record<string, string> = {};
  const locationRaw = searchParams.get("locationId");
  const courseRaw = searchParams.get("courseId");
  const locationId = locationRaw === null ? null : parseUuid(locationRaw, "locationId", details);
  const courseId = courseRaw === null ? null : parseUuid(courseRaw, "courseId", details);
  fail(details);
  return { locationId, courseId };
}

export function parseRequestDirection(searchParams: URLSearchParams): RequestDirection {
  rejectSearchParams(searchParams, ["direction"]);
  const raw = searchParams.get("direction");
  if (raw === null) return "all";
  if (!DIRECTIONS.includes(raw as RequestDirection)) {
    throw new ContractValidationError("Validation failed", { direction: "direction is invalid" });
  }
  return raw as RequestDirection;
}

export function parsePutProfileBody(body: Record<string, unknown>): PutProfileBody {
  const details = unknownFields(body, [
    "displayName",
    "universityId",
    "major",
    "academicYear",
    "courseIds",
    "studyStyle",
    "preferredDurationMinutes",
    "preferredGroupSize",
    "visible",
  ]);
  for (const key of ["displayName", "universityId", "major", "academicYear", "courseIds", "studyStyle", "preferredDurationMinutes", "preferredGroupSize"]) {
    requirePresent(body, key, details);
  }

  let displayName = "";
  if (requirePresent(body, "displayName", details) && typeof body.displayName === "string") {
    displayName = body.displayName.trim();
    if (displayName.length < VALIDATION.displayName.min || displayName.length > VALIDATION.displayName.max) {
      details.displayName = `displayName must be ${VALIDATION.displayName.min} to ${VALIDATION.displayName.max} characters`;
    }
  } else if (Object.prototype.hasOwnProperty.call(body, "displayName")) {
    details.displayName = "displayName must be a string";
  }

  const universityId = Object.prototype.hasOwnProperty.call(body, "universityId")
    ? parseUuid(body.universityId, "universityId", details)
    : null;

  let major: string | null = null;
  if (Object.prototype.hasOwnProperty.call(body, "major")) {
    if (body.major === null) {
      major = null;
    } else if (typeof body.major === "string") {
      major = body.major.trim();
      if (major.length < VALIDATION.major.min || major.length > VALIDATION.major.max) {
        details.major = `major must be null or ${VALIDATION.major.min} to ${VALIDATION.major.max} characters`;
      }
    } else {
      details.major = "major must be a string or null";
    }
  }

  let academicYear: AcademicYear | null = null;
  if (Object.prototype.hasOwnProperty.call(body, "academicYear")) {
    if (body.academicYear === null) {
      academicYear = null;
    } else {
      academicYear = parseEnum(body.academicYear, "academicYear", ACADEMIC_YEARS, details);
    }
  }

  const courseIds: string[] = [];
  if (Object.prototype.hasOwnProperty.call(body, "courseIds")) {
    if (!Array.isArray(body.courseIds)) {
      details.courseIds = `courseIds must contain ${VALIDATION.courseIds.min} to ${VALIDATION.courseIds.max} unique courses`;
    } else if (body.courseIds.length < VALIDATION.courseIds.min || body.courseIds.length > VALIDATION.courseIds.max) {
      details.courseIds = `courseIds must contain ${VALIDATION.courseIds.min} to ${VALIDATION.courseIds.max} unique courses`;
    } else {
      const seen = new Set<string>();
      for (const entry of body.courseIds) {
        const id = parseUuid(entry, "courseIds", details);
        if (id) {
          if (seen.has(id)) details.courseIds = "courseIds must be unique";
          seen.add(id);
          courseIds.push(id);
        }
      }
    }
  }

  const studyStyle = Object.prototype.hasOwnProperty.call(body, "studyStyle")
    ? parseEnum(body.studyStyle, "studyStyle", STUDY_STYLES, details)
    : null;
  const preferredDurationMinutes = Object.prototype.hasOwnProperty.call(body, "preferredDurationMinutes")
    ? parseInteger(body.preferredDurationMinutes, "preferredDurationMinutes", VALIDATION.preferredDurationMinutes.min, VALIDATION.preferredDurationMinutes.max, details)
    : null;
  const preferredGroupSize = Object.prototype.hasOwnProperty.call(body, "preferredGroupSize")
    ? parseInteger(body.preferredGroupSize, "preferredGroupSize", VALIDATION.preferredGroupSize.min, VALIDATION.preferredGroupSize.max, details)
    : null;

  let visible = false;
  if (Object.prototype.hasOwnProperty.call(body, "visible")) {
    if (typeof body.visible !== "boolean") details.visible = "visible must be a boolean";
    else visible = body.visible;
  }

  fail(details);
  return {
    displayName,
    universityId: universityId as string,
    major,
    academicYear,
    courseIds,
    studyStyle: studyStyle as StudyStyle,
    preferredDurationMinutes: preferredDurationMinutes as number,
    preferredGroupSize: preferredGroupSize as number,
    visible,
  };
}

export function parsePostCheckinBody(body: Record<string, unknown>): PostCheckinBody {
  const details = unknownFields(body, ["locationId", "courseId", "durationMinutes", "availability", "studyStyle"]);
  for (const key of ["locationId", "courseId", "durationMinutes", "availability", "studyStyle"]) {
    requirePresent(body, key, details);
  }
  const locationId = Object.prototype.hasOwnProperty.call(body, "locationId") ? parseUuid(body.locationId, "locationId", details) : null;
  const courseId = Object.prototype.hasOwnProperty.call(body, "courseId") ? parseUuid(body.courseId, "courseId", details) : null;
  const durationMinutes = Object.prototype.hasOwnProperty.call(body, "durationMinutes")
    ? parseInteger(body.durationMinutes, "durationMinutes", VALIDATION.durationMinutes.min, VALIDATION.durationMinutes.max, details)
    : null;
  const availability = Object.prototype.hasOwnProperty.call(body, "availability")
    ? parseEnum(body.availability, "availability", AVAILABILITIES, details)
    : null;
  const studyStyle = Object.prototype.hasOwnProperty.call(body, "studyStyle")
    ? parseEnum(body.studyStyle, "studyStyle", STUDY_STYLES, details)
    : null;
  fail(details);
  return {
    locationId: locationId as string,
    courseId: courseId as string,
    durationMinutes: durationMinutes as number,
    availability: availability as Availability,
    studyStyle: studyStyle as StudyStyle,
  };
}

export function parsePostRequestBody(body: Record<string, unknown>, callerId: string): PostRequestBody {
  const details = unknownFields(body, ["recipientId"]);
  requirePresent(body, "recipientId", details);
  const recipientId = Object.prototype.hasOwnProperty.call(body, "recipientId")
    ? parseUuid(body.recipientId, "recipientId", details)
    : null;
  if (recipientId && sameUser(recipientId, callerId)) {
    details.recipientId = "Cannot request yourself";
  }
  fail(details);
  return { recipientId: recipientId as string };
}

export function parsePatchRequestBody(body: Record<string, unknown>): { status: "accepted" | "declined" | "cancelled" } {
  const details = unknownFields(body, ["status"]);
  requirePresent(body, "status", details);
  const status = Object.prototype.hasOwnProperty.call(body, "status")
    ? parseEnum(body.status, "status", PATCH_STATUSES, details)
    : null;
  fail(details);
  return { status: status as "accepted" | "declined" | "cancelled" };
}

export function parsePostBlockBody(body: Record<string, unknown>, callerId: string): PostBlockBody {
  const details = unknownFields(body, ["blockedUserId"]);
  requirePresent(body, "blockedUserId", details);
  const blockedUserId = Object.prototype.hasOwnProperty.call(body, "blockedUserId")
    ? parseUuid(body.blockedUserId, "blockedUserId", details)
    : null;
  if (blockedUserId && sameUser(blockedUserId, callerId)) {
    details.blockedUserId = "Cannot block yourself";
  }
  fail(details);
  return { blockedUserId: blockedUserId as string };
}

export function parsePostReportBody(body: Record<string, unknown>, callerId: string): PostReportBody {
  const details = unknownFields(body, ["reportedUserId", "reason", "details"]);
  requirePresent(body, "reportedUserId", details);
  requirePresent(body, "reason", details);
  const reportedUserId = Object.prototype.hasOwnProperty.call(body, "reportedUserId")
    ? parseUuid(body.reportedUserId, "reportedUserId", details)
    : null;
  if (reportedUserId && sameUser(reportedUserId, callerId)) {
    details.reportedUserId = "Cannot report yourself";
  }
  const reason = Object.prototype.hasOwnProperty.call(body, "reason")
    ? parseEnum(body.reason, "reason", REPORT_REASONS, details)
    : null;
  let reportDetails: string | null = null;
  if (Object.prototype.hasOwnProperty.call(body, "details")) {
    if (body.details === null) {
      reportDetails = null;
    } else if (typeof body.details !== "string") {
      details.details = "details must be a string or null";
    } else if (body.details.length > VALIDATION.reportDetails.max) {
      details.details = `details must be at most ${VALIDATION.reportDetails.max} characters`;
    } else {
      reportDetails = body.details;
    }
  }
  fail(details);
  return {
    reportedUserId: reportedUserId as string,
    reason: reason as ReportReason,
    details: reportDetails,
  };
}
