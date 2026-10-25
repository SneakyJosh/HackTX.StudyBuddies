import { STUDY_TIME_MINIMUM_MINUTES } from "../lib/study-time.ts";
import type {
  AcademicYear,
  Course,
  OpenSession,
  PublicLocation,
  ScheduledSession,
  SessionParticipant,
  SessionParticipantStatus,
  SessionAttendance,
  SessionPerson,
  SessionRole,
  SessionStatus,
  SessionVisibility,
  StudyRecord,
  StudyStats,
} from "#api";

function badPayload(): never {
  throw new Error("Invalid session payload");
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

function asInteger(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value)) badPayload();
  return value;
}

const YEARS = new Set(["freshman", "sophomore", "junior", "senior", "graduate", "other"]);
const VISIBILITIES = new Set(["solo", "open", "invite_only"]);
const SESSION_STATUSES = new Set(["scheduled", "cancelled"]);
const PARTICIPANT_STATUSES = new Set(["invited", "requested", "accepted", "declined", "left", "cancelled"]);
const ROLES = new Set(["host", "invitee", "joiner"]);

function asYear(value: unknown): AcademicYear | null {
  if (value === null) return null;
  if (typeof value !== "string" || !YEARS.has(value)) badPayload();
  return value as AcademicYear;
}

function asPerson(value: unknown): SessionPerson {
  const row = asRecord(value);
  return {
    id: asString(row.id),
    displayName: asString(row.displayName),
    major: asNullableString(row.major),
    academicYear: asYear(row.academicYear),
  };
}

function asCourse(value: unknown): Course {
  const row = asRecord(value);
  return {
    id: asString(row.id),
    universityId: asString(row.universityId),
    code: asString(row.code),
    title: asString(row.title),
  };
}

function asLocation(value: unknown): PublicLocation {
  const row = asRecord(value);
  return { id: asString(row.id), name: asString(row.name), buildingCode: asString(row.buildingCode) };
}

function asParticipant(value: unknown): SessionParticipant {
  const row = asRecord(value);
  const role = asString(row.role);
  const status = asString(row.status);
  if (!ROLES.has(role) || !PARTICIPANT_STATUSES.has(status)) badPayload();
  return { user: asPerson(row.user), role: role as SessionRole, status: status as SessionParticipantStatus };
}

export function parseScheduledSession(value: unknown): ScheduledSession {
  const row = asRecord(value);
  const visibility = asString(row.visibility);
  const status = asString(row.status);
  if (!VISIBILITIES.has(visibility) || !SESSION_STATUSES.has(status)) badPayload();
  const myRole = row.myRole === null ? null : asString(row.myRole);
  const myStatus = row.myStatus === null ? null : asString(row.myStatus);
  if (myRole !== null && !ROLES.has(myRole)) badPayload();
  if (myStatus !== null && !PARTICIPANT_STATUSES.has(myStatus)) badPayload();
  return {
    id: asString(row.id),
    title: asString(row.title),
    course: asCourse(row.course),
    location: asLocation(row.location),
    visibility: visibility as SessionVisibility,
    seatLimit: asInteger(row.seatLimit),
    seatsTaken: asInteger(row.seatsTaken),
    seatsReserved: asInteger(row.seatsReserved),
    startsAt: asString(row.startsAt),
    endsAt: asString(row.endsAt),
    status: status as SessionStatus,
    host: asPerson(row.host),
    myRole: myRole as SessionRole | null,
    myStatus: myStatus as SessionParticipantStatus | null,
    participants: asArray(row.participants).map(asParticipant),
  };
}

export function parseScheduledSessions(value: unknown): ScheduledSession[] {
  return asArray(value).map(parseScheduledSession);
}

export function parseOpenSession(value: unknown): OpenSession {
  const row = asRecord(value);
  const myStatus = row.myStatus === null ? null : asString(row.myStatus);
  if (myStatus !== null && !PARTICIPANT_STATUSES.has(myStatus)) badPayload();
  if ("participants" in row || "email" in row) badPayload();
  return {
    id: asString(row.id),
    title: asString(row.title),
    course: asCourse(row.course),
    location: asLocation(row.location),
    seatLimit: asInteger(row.seatLimit),
    seatsTaken: asInteger(row.seatsTaken),
    seatsReserved: asInteger(row.seatsReserved),
    startsAt: asString(row.startsAt),
    endsAt: asString(row.endsAt),
    host: asPerson(row.host),
    myStatus: myStatus as SessionParticipantStatus | null,
  };
}

export function parseOpenSessions(value: unknown): OpenSession[] {
  return asArray(value).map(parseOpenSession);
}

const ATTENDANCE = new Set(["completed", "missed"]);
const CAMPUS_DATE = /^\d{4}-\d{2}-\d{2}$/;

function asBoolean(value: unknown): boolean {
  if (typeof value !== "boolean") badPayload();
  return value;
}

function asStars(value: unknown): number | null {
  if (value === null) return null;
  const stars = asInteger(value);
  if (stars < 1 || stars > 5) badPayload();
  return stars;
}

export function parseStudyRecord(value: unknown): StudyRecord {
  const row = asRecord(value);
  const attendance = asString(row.attendance);
  const sessionStatus = asString(row.sessionStatus);
  if (!ATTENDANCE.has(attendance) || !SESSION_STATUSES.has(sessionStatus)) badPayload();
  if (row.selfReported !== true) badPayload();
  const creditedMinutes = asInteger(row.creditedMinutes);
  const countsTowardStats = asBoolean(row.countsTowardStats);
  if (creditedMinutes < 0 || creditedMinutes > 180) badPayload();
  if (attendance === "missed" && (creditedMinutes !== 0 || countsTowardStats)) badPayload();
  if (attendance === "completed" && countsTowardStats !== (creditedMinutes >= STUDY_TIME_MINIMUM_MINUTES)) badPayload();
  const campusDate = asString(row.campusDate);
  if (!CAMPUS_DATE.test(campusDate)) badPayload();
  const ratings = asRecord(row.myRatings);
  const chemistry = asArray(ratings.chemistry).map((entry) => {
    const item = asRecord(entry);
    const stars = asInteger(item.stars);
    if (stars < 1 || stars > 5) badPayload();
    return { userId: asString(item.userId), stars };
  });
  return {
    id: asString(row.id),
    title: asString(row.title),
    course: asCourse(row.course),
    location: asLocation(row.location),
    startsAt: asString(row.startsAt),
    endsAt: asString(row.endsAt),
    sessionStatus: sessionStatus as SessionStatus,
    attendance: attendance as SessionAttendance,
    creditedMinutes,
    countsTowardStats,
    campusDate,
    recordedAt: asString(row.recordedAt),
    selfReported: true,
    participants: asArray(row.participants).map(asPerson),
    myRatings: {
      studyTime: asStars(ratings.studyTime),
      environment: asStars(ratings.environment),
      chemistry,
    },
  };
}

export function parseStudyRecords(value: unknown): StudyRecord[] {
  return asArray(value).map(parseStudyRecord);
}

export function parseStudyStats(value: unknown): StudyStats {
  const row = asRecord(value);
  if (row.selfReported !== true) badPayload();
  const week = asArray(row.week).map((entry) => {
    const day = asRecord(entry);
    const date = asString(day.date);
    const minutes = asInteger(day.minutes);
    if (!CAMPUS_DATE.test(date) || minutes < 0) badPayload();
    return { date, minutes };
  });
  if (week.length !== 7) badPayload();
  const courseStreaks = asArray(row.courseStreaks).map((entry) => {
    const course = asRecord(entry);
    const streakDays = asInteger(course.streakDays);
    if (streakDays < 0) badPayload();
    return {
      courseId: asString(course.courseId),
      code: asString(course.code),
      title: asString(course.title),
      streakDays,
    };
  });
  const streakDays = asInteger(row.streakDays);
  const qualifyingMinutes = asInteger(row.qualifyingMinutes);
  const weekMinutes = asInteger(row.weekMinutes);
  if (streakDays < 0 || qualifyingMinutes < 0 || weekMinutes < 0) badPayload();
  return {
    selfReported: true,
    description: asString(row.description),
    streakDays,
    qualifyingMinutes,
    weekMinutes,
    week,
    courseStreaks,
  };
}
