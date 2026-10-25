import type { AcademicYear, StudyingConnection, StudyStyle } from "#api";

function badPayload(): never {
  throw new Error("Invalid connection payload");
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

const YEARS = new Set(["freshman", "sophomore", "junior", "senior", "graduate", "other"]);
const STYLES = new Set(["quiet", "collaborative", "flexible"]);
const AVAILABILITIES = new Set(["available", "questions_only"]);

export function parseStudyingConnection(value: unknown): StudyingConnection {
  const row = asRecord(value);
  const user = asRecord(row.user);
  const location = asRecord(row.location);
  const course = asRecord(row.course);
  const availability = asString(row.availability);
  const studyStyle = asString(user.studyStyle);
  const academicYear = user.academicYear === null ? null : asString(user.academicYear);
  if (!AVAILABILITIES.has(availability) || !STYLES.has(studyStyle)) badPayload();
  if (academicYear !== null && !YEARS.has(academicYear)) badPayload();
  return {
    user: {
      id: asString(user.id),
      displayName: asString(user.displayName),
      major: asNullableString(user.major),
      academicYear: academicYear as AcademicYear | null,
      studyStyle: studyStyle as StudyStyle,
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
    availability: availability as StudyingConnection["availability"],
  };
}

export function parseStudyingConnections(value: unknown): StudyingConnection[] {
  return asArray(value).map(parseStudyingConnection);
}
