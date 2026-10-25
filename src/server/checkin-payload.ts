import { STUDY_TIME_MINIMUM_MINUTES } from "../lib/study-time.ts";
import type { Availability, Checkin, CheckinStudyRecord, Course, PublicLocation, StudyStyle } from "#api";

const AVAILABILITIES = new Set(["available", "questions_only", "focused"]);
const STUDY_STYLES = new Set(["quiet", "collaborative", "flexible"]);
const CAMPUS_DATE = /^\d{4}-\d{2}-\d{2}$/;

function badPayload(): never {
  throw new Error("Invalid check-in payload");
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

function asBoolean(value: unknown): boolean {
  if (typeof value !== "boolean") badPayload();
  return value;
}

function asInteger(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value)) badPayload();
  return value;
}

function asIsoTimestamp(value: unknown): string {
  const raw = asString(value);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) badPayload();
  return date.toISOString();
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

export function parseCheckin(value: unknown): Checkin {
  const row = asRecord(value);
  const availability = asString(row.availability);
  const studyStyle = asString(row.studyStyle);
  if (!AVAILABILITIES.has(availability) || !STUDY_STYLES.has(studyStyle)) badPayload();
  return {
    id: asString(row.id),
    locationId: asString(row.locationId),
    courseId: asString(row.courseId),
    availability: availability as Availability,
    studyStyle: studyStyle as StudyStyle,
    startedAt: asIsoTimestamp(row.startedAt),
    expiresAt: asIsoTimestamp(row.expiresAt),
    live: row.live === undefined ? true : asBoolean(row.live),
  };
}

export function parseCheckinStudyRecord(value: unknown): CheckinStudyRecord {
  const row = asRecord(value);
  const availability = asString(row.availability);
  const studyStyle = asString(row.studyStyle);
  if (!AVAILABILITIES.has(availability) || !STUDY_STYLES.has(studyStyle)) badPayload();
  if (row.selfReported !== true) badPayload();
  const creditedMinutes = asInteger(row.creditedMinutes);
  const countsTowardStats = asBoolean(row.countsTowardStats);
  const campusDate = asString(row.campusDate);
  if (creditedMinutes < 0 || creditedMinutes > 180) badPayload();
  if (countsTowardStats !== (creditedMinutes >= STUDY_TIME_MINIMUM_MINUTES)) badPayload();
  if (!CAMPUS_DATE.test(campusDate)) badPayload();
  const id = asString(row.id);
  const checkinId = asString(row.checkinId);
  if (id !== checkinId) badPayload();
  return {
    id,
    checkinId,
    course: asCourse(row.course),
    location: asLocation(row.location),
    studyStyle: studyStyle as StudyStyle,
    availability: availability as Availability,
    startedAt: asIsoTimestamp(row.startedAt),
    finishedAt: asIsoTimestamp(row.finishedAt),
    creditedMinutes,
    countsTowardStats,
    campusDate,
    recordedAt: asIsoTimestamp(row.recordedAt),
    selfReported: true,
  };
}

export function parseCheckinStudyRecords(value: unknown): CheckinStudyRecord[] {
  return asArray(value).map(parseCheckinStudyRecord);
}
