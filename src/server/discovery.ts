import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  AcademicYear,
  Availability,
  DiscoveryMatch,
  RequestStatus,
  StudyStyle,
} from "@/types/api";

import { internalError, throwMappedDbError } from "./errors";
import { asArray, asIsoTimestamp, asNullableString, asNumber, asRecord, asString, asStringArray } from "./json";
import { rankDiscoveryCandidates, type DiscoveryCandidate, type MatchPerson } from "./matching";

const YEARS = new Set(["freshman", "sophomore", "junior", "senior", "graduate", "other"]);
const STYLES = new Set(["quiet", "collaborative", "flexible"]);
const AVAILABILITIES = new Set(["available", "questions_only", "focused"]);
const STATUSES = new Set(["pending", "accepted", "declined", "cancelled"]);

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

function status(value: unknown): RequestStatus | null {
  if (value === null) return null;
  const text = asString(value);
  if (!STATUSES.has(text)) throw internalError();
  return text as RequestStatus;
}

type CandidateRow = {
  userId: string;
  displayName: string;
  major: string | null;
  academicYear: AcademicYear | null;
  availability: Availability;
  studyStyle: StudyStyle;
  locationId: string;
  locationName: string;
  buildingCode: string;
  courseId: string;
  courseUniversityId: string;
  courseCode: string;
  courseTitle: string;
  checkinExpiresAt: string;
  requestStatus: RequestStatus | null;
  candidate: DiscoveryCandidate;
};

function parseCandidate(value: unknown): CandidateRow {
  const row = asRecord(value);
  const candidate: DiscoveryCandidate = {
    userId: asString(row.id),
    availability: availability(row.availability),
    courseIds: asStringArray(row.courseIds),
    preferredDurationMinutes: asNumber(row.preferredDurationMinutes),
    preferredGroupSize: asNumber(row.preferredGroupSize),
    checkin: {
      courseId: asString(row.courseId),
      locationId: asString(row.locationId),
      studyStyle: style(row.studyStyle),
    },
  };
  return {
    userId: candidate.userId,
    displayName: asString(row.displayName),
    major: asNullableString(row.major),
    academicYear: year(row.academicYear),
    availability: candidate.availability,
    studyStyle: candidate.checkin.studyStyle,
    locationId: candidate.checkin.locationId,
    locationName: asString(row.locationName),
    buildingCode: asString(row.buildingCode),
    courseId: candidate.checkin.courseId,
    courseUniversityId: asString(row.courseUniversityId),
    courseCode: asString(row.courseCode),
    courseTitle: asString(row.courseTitle),
    checkinExpiresAt: asIsoTimestamp(row.checkinExpiresAt),
    requestStatus: status(row.requestStatus),
    candidate,
  };
}

export async function discoverMatches(
  supabase: SupabaseClient,
  userId: string,
  locationId: string | null,
  courseId: string | null,
): Promise<DiscoveryMatch[]> {
  const { data, error } = await supabase.rpc("discovery_candidates", {
    p_location_id: locationId,
    p_course_id: courseId,
  });
  if (error) throwMappedDbError(error);
  const payload = asRecord(data);
  if (payload.caller === null) return [];
  const callerRow = asRecord(payload.caller);
  const checkin = callerRow.checkin === null ? null : asRecord(callerRow.checkin);
  const caller: MatchPerson = {
    userId,
    courseIds: asStringArray(callerRow.courseIds),
    preferredDurationMinutes: asNumber(callerRow.preferredDurationMinutes),
    preferredGroupSize: asNumber(callerRow.preferredGroupSize),
    checkin: checkin
      ? {
          courseId: asString(checkin.courseId),
          locationId: asString(checkin.locationId),
          studyStyle: style(checkin.studyStyle),
        }
      : null,
  };
  const rows = asArray(payload.candidates).map(parseCandidate);
  const ranked = rankDiscoveryCandidates(
    caller,
    rows.map((row) => row.candidate),
  );
  const byId = new Map(rows.map((row) => [row.userId, row]));
  return ranked.map((item) => {
    const row = byId.get(item.userId);
    if (!row) throw internalError();
    return {
      user: {
        id: row.userId,
        displayName: row.displayName,
        major: row.major,
        academicYear: row.academicYear,
        studyStyle: row.studyStyle,
      },
      location: { id: row.locationId, name: row.locationName, buildingCode: row.buildingCode },
      course: {
        id: row.courseId,
        universityId: row.courseUniversityId,
        code: row.courseCode,
        title: row.courseTitle,
      },
      availability: row.availability,
      compatibilityScore: item.compatibilityScore,
      reasons: item.reasons,
      checkinExpiresAt: row.checkinExpiresAt,
      requestStatus: row.requestStatus,
    };
  });
}
