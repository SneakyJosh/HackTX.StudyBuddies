import { CAMPUS_TIME_MESSAGES, resolveCampusStart } from "../lib/campus-time.ts";
import {
  VALIDATION,
  type AcademicYear,
  type Availability,
  type PatchInvitationBody,
  type PatchSessionParticipantBody,
  type PostBlockBody,
  type PostCheckinBody,
  type PostInvitationBody,
  type PostReportBody,
  type PostRequestBody,
  type PostSessionBody,
  type PostStudyRatingBody,
  type PutProfileBody,
  type ReportReason,
  type RequestDirection,
  type SessionVisibility,
  type SessionWhen,
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
const SESSION_VISIBILITIES = ["solo", "open", "invite_only"] as const satisfies readonly SessionVisibility[];
const SESSION_WHENS = ["upcoming", "past", "history", "missed"] as const satisfies readonly SessionWhen[];
const INVITE_RESPONSES = ["accepted", "declined"] as const;
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

export function parseSessionWhen(searchParams: URLSearchParams): SessionWhen {
  rejectSearchParams(searchParams, ["when"]);
  const raw = searchParams.get("when");
  if (raw === null) return "upcoming";
  if (!SESSION_WHENS.includes(raw as SessionWhen)) {
    throw new ContractValidationError("Validation failed", { when: "when is invalid" });
  }
  return raw as SessionWhen;
}

export function parseOpenSessionQuery(searchParams: URLSearchParams): { courseId: string | null; today: boolean } {
  rejectSearchParams(searchParams, ["courseId", "today"]);
  const details: Record<string, string> = {};
  const courseRaw = searchParams.get("courseId");
  const courseId = courseRaw === null ? null : parseUuid(courseRaw, "courseId", details);
  const todayRaw = searchParams.get("today");
  let today = false;
  if (todayRaw !== null && todayRaw !== "true") {
    details.today = "today must be true";
  } else {
    today = todayRaw === "true";
  }
  fail(details);
  return { courseId, today };
}

export function parsePostSessionBody(body: Record<string, unknown>, callerId: string, now = new Date()): PostSessionBody {
  const details = unknownFields(body, [
    "title",
    "courseId",
    "locationId",
    "localDate",
    "localTime",
    "durationMinutes",
    "visibility",
    "seatLimit",
    "inviteeIds",
  ]);
  for (const key of ["title", "courseId", "locationId", "localDate", "localTime", "durationMinutes", "visibility", "seatLimit", "inviteeIds"]) {
    requirePresent(body, key, details);
  }
  let title = "";
  if (typeof body.title === "string") {
    title = body.title.trim();
    if (title.length < VALIDATION.sessionTitle.min || title.length > VALIDATION.sessionTitle.max || /[<>]/.test(title)) {
      details.title = "title must be 1 to 60 characters without < or >";
    }
  } else if (Object.prototype.hasOwnProperty.call(body, "title")) {
    details.title = "title must be a string";
  }
  const courseId = Object.prototype.hasOwnProperty.call(body, "courseId")
    ? parseUuid(body.courseId, "courseId", details)
    : null;
  const locationId = Object.prototype.hasOwnProperty.call(body, "locationId")
    ? parseUuid(body.locationId, "locationId", details)
    : null;
  const durationMinutes = Object.prototype.hasOwnProperty.call(body, "durationMinutes")
    ? parseInteger(body.durationMinutes, "durationMinutes", VALIDATION.durationMinutes.min, VALIDATION.durationMinutes.max, details)
    : null;
  const visibility = Object.prototype.hasOwnProperty.call(body, "visibility")
    ? parseEnum(body.visibility, "visibility", SESSION_VISIBILITIES, details)
    : null;
  const seatLimit = Object.prototype.hasOwnProperty.call(body, "seatLimit")
    ? parseInteger(body.seatLimit, "seatLimit", VALIDATION.sessionSeatLimit.min, VALIDATION.sessionSeatLimit.max, details)
    : null;
  const localDate = typeof body.localDate === "string" ? body.localDate : "";
  const localTime = typeof body.localTime === "string" ? body.localTime : "";
  if (Object.prototype.hasOwnProperty.call(body, "localDate") && typeof body.localDate !== "string") {
    details.localDate = "localDate must be a string";
  }
  if (Object.prototype.hasOwnProperty.call(body, "localTime") && typeof body.localTime !== "string") {
    details.localTime = "localTime must be a string";
  }
  if (typeof body.localDate === "string" && typeof body.localTime === "string") {
    const resolved = resolveCampusStart(localDate, localTime, now);
    if (!resolved.ok) {
      const field = resolved.reason === "invalid-date" ? "localDate" : "localTime";
      details[field] = CAMPUS_TIME_MESSAGES[resolved.reason];
    }
  }
  let inviteeIds: string[] = [];
  if (Object.prototype.hasOwnProperty.call(body, "inviteeIds")) {
    if (!Array.isArray(body.inviteeIds)) {
      details.inviteeIds = "inviteeIds must be an array of UUIDs";
    } else {
      const seen = new Set<string>();
      inviteeIds = body.inviteeIds.flatMap((value) => {
        const parsed = parseUuid(value, "inviteeIds", details);
        if (!parsed) return [];
        if (sameUser(parsed, callerId)) details.inviteeIds = "Cannot invite yourself";
        if (seen.has(parsed)) details.inviteeIds = "inviteeIds must be unique";
        seen.add(parsed);
        return [parsed];
      });
    }
  }
  if (visibility === "solo" && (seatLimit !== 1 || inviteeIds.length > 0)) {
    details.seatLimit = "A solo session has one seat and no invites";
  }
  if (visibility && visibility !== "solo" && seatLimit !== null && (seatLimit < 2 || inviteeIds.length > seatLimit - 1)) {
    details.seatLimit = "Leave a seat for yourself and stay within 2 to 6 seats";
  }
  if (visibility === "invite_only" && inviteeIds.length < 1) {
    details.inviteeIds = "Invite at least one study partner";
  }
  fail(details);
  return {
    title,
    courseId: courseId as string,
    locationId: locationId as string,
    localDate,
    localTime,
    durationMinutes: durationMinutes as number,
    visibility: visibility as SessionVisibility,
    seatLimit: seatLimit as number,
    inviteeIds,
  };
}

export function parsePostInvitationBody(body: Record<string, unknown>, callerId: string): PostInvitationBody {
  const details = unknownFields(body, ["inviteeId"]);
  requirePresent(body, "inviteeId", details);
  const inviteeId = Object.prototype.hasOwnProperty.call(body, "inviteeId")
    ? parseUuid(body.inviteeId, "inviteeId", details)
    : null;
  if (inviteeId && sameUser(inviteeId, callerId)) details.inviteeId = "Cannot invite yourself";
  fail(details);
  return { inviteeId: inviteeId as string };
}

export function parsePatchInvitationBody(body: Record<string, unknown>): PatchInvitationBody {
  const details = unknownFields(body, ["status"]);
  requirePresent(body, "status", details);
  const status = Object.prototype.hasOwnProperty.call(body, "status")
    ? parseEnum(body.status, "status", INVITE_RESPONSES, details)
    : null;
  fail(details);
  return { status: status as "accepted" | "declined" };
}

export function parsePatchSessionParticipantBody(body: Record<string, unknown>): PatchSessionParticipantBody {
  return parsePatchInvitationBody(body);
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

export function parsePostStudyRatingBody(body: Record<string, unknown>, callerId: string): PostStudyRatingBody {
  const details = unknownFields(body, ["studyTime", "environment", "chemistry"]);
  let studyTime: number | undefined;
  let environment: number | undefined;
  if (Object.prototype.hasOwnProperty.call(body, "studyTime")) {
    const stars = parseInteger(body.studyTime, "studyTime", 1, 5, details);
    if (stars !== null) studyTime = stars;
  }
  if (Object.prototype.hasOwnProperty.call(body, "environment")) {
    const stars = parseInteger(body.environment, "environment", 1, 5, details);
    if (stars !== null) environment = stars;
  }
  const chemistry: { userId: string; stars: number }[] = [];
  if (Object.prototype.hasOwnProperty.call(body, "chemistry")) {
    if (!Array.isArray(body.chemistry)) {
      details.chemistry = "chemistry must be a list";
    } else {
      const seen = new Set<string>();
      body.chemistry.forEach((entry, index) => {
        const field = `chemistry.${index}`;
        if (!isRecord(entry)) {
          details[field] = "chemistry entries must be userId and stars";
          return;
        }
        const extra = unknownFields(entry, ["userId", "stars"]);
        Object.assign(details, extra);
        const userId = parseUuid(entry.userId, `${field}.userId`, details);
        const stars = parseInteger(entry.stars, `${field}.stars`, 1, 5, details);
        if (!userId || stars === null) return;
        if (sameUser(userId, callerId)) {
          details[field] = "Rate another student from that session";
          return;
        }
        if (seen.has(userId)) {
          details[field] = "Rate each student once";
          return;
        }
        seen.add(userId);
        chemistry.push({ userId, stars });
      });
    }
  }
  if (studyTime === undefined && environment === undefined && chemistry.length === 0 && Object.keys(details).length === 0) {
    details.studyTime = "Add at least one rating";
  }
  fail(details);
  return {
    ...(studyTime === undefined ? {} : { studyTime }),
    ...(environment === undefined ? {} : { environment }),
    ...(chemistry.length === 0 ? {} : { chemistry }),
  };
}
