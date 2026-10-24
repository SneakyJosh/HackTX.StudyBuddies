import { compareDiscoveryMatches, scoreCompatibility } from "@/fixtures/matching";
import type { FixtureCheckinRecord, FixtureRequestRecord } from "@/fixtures/population";
import {
  changeRequestStatus,
  checkoutActive,
  getSessionUserId,
  insertRequest,
  isEitherBlocked,
  readCheckins,
  readProfile,
  readProfiles,
  readRequests,
  replaceActiveCheckin,
  upsertProfile,
} from "@/fixtures/store";
import { ACADEMIC_YEARS, AVAILABILITIES, STUDY_STYLES } from "@/lib/labels";
import {
  DEMO_COURSES,
  DEMO_LOCATIONS,
  DEMO_UNIVERSITY,
  VALIDATION,
  type ApiData,
  type ApiError,
  type ApiErrorCode,
  type ApiList,
  type AcademicYear,
  type Availability,
  type Checkin,
  type CheckoutResult,
  type Course,
  type DiscoveryMatch,
  type Location,
  type PatchRequestBody,
  type PostCheckinBody,
  type PostRequestBody,
  type Profile,
  type PublicLocation,
  type PutProfileBody,
  type RequestDirection,
  type StudyRequest,
  type StudyStyle,
  type University,
} from "@/types/api";

/**
 * Fixture-backed StudySync client.
 * Success and error shapes match the frozen contract. A later integration can
 * replace each function body with fetch() without changing these signatures.
 */

const READ_DELAY_MS = 220;
const WRITE_DELAY_MS = 80;

const PROFILE_KEYS = [
  "displayName",
  "universityId",
  "major",
  "academicYear",
  "courseIds",
  "studyStyle",
  "preferredDurationMinutes",
  "preferredGroupSize",
  "visible",
] as const;

const CHECKIN_KEYS = [
  "locationId",
  "courseId",
  "durationMinutes",
  "availability",
  "studyStyle",
] as const;

const REQUEST_KEYS = ["recipientId"] as const;
const PATCH_KEYS = ["status"] as const;
const DISCOVERY_KEYS = ["locationId", "courseId"] as const;
const PATCH_STATUSES = ["accepted", "declined", "cancelled"] as const satisfies readonly PatchRequestBody["status"][];
const REQUEST_DIRECTIONS = ["incoming", "outgoing", "all"] as const satisfies readonly RequestDirection[];

export type DiscoveryFilters = {
  locationId?: string;
  courseId?: string;
};

export function isApiError(value: object): value is ApiError {
  return "error" in value;
}

function apiError(
  code: ApiErrorCode,
  message: string,
  details: Record<string, unknown> = {},
): ApiError {
  return { error: { code, message, details } };
}

function wait<T>(value: T, ms: number): Promise<T> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(value), ms);
  });
}

function requireUser(): { userId: string } | ApiError {
  const userId = getSessionUserId();
  if (!userId) return apiError("UNAUTHENTICATED", "Sign in with a demo account to continue.");
  return { userId };
}

function isUser(value: { userId: string } | ApiError): value is { userId: string } {
  return "userId" in value;
}

function unknownKeys(body: object, allowed: readonly string[]): string[] {
  return Object.keys(body).filter((key) => !allowed.includes(key));
}

function validation(message: string, details: Record<string, unknown>): ApiError {
  return apiError("VALIDATION_ERROR", message, details);
}

function isStudyStyle(value: unknown): value is StudyStyle {
  return typeof value === "string" && STUDY_STYLES.some((style) => style === value);
}

function isAvailability(value: unknown): value is Availability {
  return typeof value === "string" && AVAILABILITIES.some((availability) => availability === value);
}

function isAcademicYear(value: unknown): value is AcademicYear {
  return typeof value === "string" && ACADEMIC_YEARS.some((year) => year === value);
}

function inRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

function campusCourses(universityId: string): Course[] {
  return DEMO_COURSES.filter((course) => course.universityId === universityId).map((course) => ({
    ...course,
  }));
}

function campusLocations(universityId: string): Location[] {
  return DEMO_LOCATIONS.filter((location) => location.universityId === universityId).map(
    (location) => ({ ...location }),
  );
}

function courseById(courseId: string): Course | null {
  const course = DEMO_COURSES.find((item) => item.id === courseId);
  return course ? { ...course } : null;
}

function locationById(locationId: string): Location | null {
  const location = DEMO_LOCATIONS.find((item) => item.id === locationId);
  return location ? { ...location } : null;
}

function toPublicLocation(location: Location): PublicLocation {
  return { id: location.id, name: location.name, buildingCode: location.buildingCode };
}

function toCheckin(record: FixtureCheckinRecord): Checkin {
  return {
    id: record.id,
    locationId: record.locationId,
    courseId: record.courseId,
    availability: record.availability,
    studyStyle: record.studyStyle,
    startedAt: record.startedAt,
    expiresAt: record.expiresAt,
  };
}

function callerUniversityId(profile: Profile | null): string {
  return profile?.universityId ?? DEMO_UNIVERSITY.id;
}

function activeCheckin(userId: string, nowMs: number): FixtureCheckinRecord | null {
  const active = readCheckins().filter(
    (checkin) =>
      checkin.userId === userId &&
      checkin.checkedOutAt === null &&
      Date.parse(checkin.expiresAt) > nowMs,
  );
  active.sort((left, right) => (left.startedAt < right.startedAt ? 1 : -1));
  return active[0] ?? null;
}

function pairRequests(leftUserId: string, rightUserId: string): FixtureRequestRecord[] {
  return readRequests().filter(
    (request) =>
      (request.senderId === leftUserId && request.recipientId === rightUserId) ||
      (request.senderId === rightUserId && request.recipientId === leftUserId),
  );
}

function latestRequest(leftUserId: string, rightUserId: string): FixtureRequestRecord | null {
  const rows = pairRequests(leftUserId, rightUserId);
  rows.sort((left, right) => {
    if (left.updatedAt !== right.updatedAt) return left.updatedAt < right.updatedAt ? 1 : -1;
    if (left.id === right.id) return 0;
    return left.id < right.id ? 1 : -1;
  });
  return rows[0] ?? null;
}

function isDiscoverable(callerId: string, profile: Profile, nowMs: number): boolean {
  if (profile.id === callerId) return false;
  if (!profile.visible) return false;
  if (profile.universityId !== callerUniversityId(readProfile(callerId))) return false;
  if (isEitherBlocked(callerId, profile.id)) return false;
  const checkin = activeCheckin(profile.id, nowMs);
  if (!checkin) return false;
  return checkin.availability === "available" || checkin.availability === "questions_only";
}

function toStudyRequest(record: FixtureRequestRecord, callerId: string, nowMs: number): StudyRequest | null {
  const counterpartId = record.senderId === callerId ? record.recipientId : record.senderId;
  if (record.senderId !== callerId && record.recipientId !== callerId) return null;
  if (isEitherBlocked(callerId, counterpartId)) return null;
  const profile = readProfile(counterpartId);
  if (!profile) return null;
  const checkin = activeCheckin(counterpartId, nowMs);
  const course = checkin ? courseById(checkin.courseId) : null;
  const locationRecord = checkin ? locationById(checkin.locationId) : null;
  return {
    id: record.id,
    senderId: record.senderId,
    recipientId: record.recipientId,
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    counterpart: {
      id: profile.id,
      displayName: profile.displayName,
      major: profile.major,
      academicYear: profile.academicYear,
      studyStyle: profile.studyStyle,
    },
    course,
    location: locationRecord ? toPublicLocation(locationRecord) : null,
  };
}

export async function getUniversities(): Promise<ApiList<University> | ApiError> {
  const session = requireUser();
  if (!isUser(session)) return wait(session, READ_DELAY_MS);
  const data: University[] = [{ ...DEMO_UNIVERSITY }];
  return wait({ data, meta: { count: data.length } }, READ_DELAY_MS);
}

export async function getLocations(): Promise<ApiList<Location> | ApiError> {
  const session = requireUser();
  if (!isUser(session)) return wait(session, READ_DELAY_MS);
  const profile = readProfile(session.userId);
  const data = campusLocations(callerUniversityId(profile));
  return wait({ data, meta: { count: data.length } }, READ_DELAY_MS);
}

export async function getCourses(query?: string): Promise<ApiList<Course> | ApiError> {
  const session = requireUser();
  if (!isUser(session)) return wait(session, READ_DELAY_MS);
  let needle = "";
  if (query !== undefined) {
    if (typeof query !== "string") {
      return wait(validation("Course search is invalid.", { q: "Search must be text." }), READ_DELAY_MS);
    }
    needle = query.trim();
    if (needle.length > VALIDATION.courseQuery.max) {
      return wait(
        validation("Course search is too long.", {
          q: `Search must be at most ${VALIDATION.courseQuery.max} characters.`,
        }),
        READ_DELAY_MS,
      );
    }
  }
  const profile = readProfile(session.userId);
  const lowered = needle.toLowerCase();
  const data = campusCourses(callerUniversityId(profile)).filter((course) => {
    if (!lowered) return true;
    return (
      course.code.toLowerCase().includes(lowered) || course.title.toLowerCase().includes(lowered)
    );
  });
  return wait({ data, meta: { count: data.length } }, READ_DELAY_MS);
}

export async function getProfile(): Promise<ApiData<Profile | null> | ApiError> {
  const session = requireUser();
  if (!isUser(session)) return wait(session, READ_DELAY_MS);
  return wait({ data: readProfile(session.userId) }, READ_DELAY_MS);
}

export async function putProfile(body: PutProfileBody): Promise<ApiData<Profile> | ApiError> {
  const session = requireUser();
  if (!isUser(session)) return wait(session, WRITE_DELAY_MS);
  const extra = unknownKeys(body, PROFILE_KEYS);
  if (extra.length > 0) {
    return wait(validation("Unknown profile fields.", { fields: extra }), WRITE_DELAY_MS);
  }

  const details: Record<string, unknown> = {};
  const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
  if (
    typeof body.displayName !== "string" ||
    displayName.length < VALIDATION.displayName.min ||
    displayName.length > VALIDATION.displayName.max
  ) {
    details.displayName = `Display name must be ${VALIDATION.displayName.min}–${VALIDATION.displayName.max} characters.`;
  }

  let major: string | null = null;
  if (body.major !== null && typeof body.major !== "string") {
    details.major = "Major must be text or empty.";
  } else if (typeof body.major === "string") {
    const trimmed = body.major.trim();
    if (trimmed.length < VALIDATION.major.min || trimmed.length > VALIDATION.major.max) {
      details.major = `Major must be ${VALIDATION.major.min}–${VALIDATION.major.max} characters when provided.`;
    } else {
      major = trimmed;
    }
  }

  let academicYear: AcademicYear | null = null;
  if (body.academicYear !== null && !isAcademicYear(body.academicYear)) {
    details.academicYear = "Academic year is not a supported value.";
  } else {
    academicYear = body.academicYear;
  }

  if (typeof body.universityId !== "string" || body.universityId !== DEMO_UNIVERSITY.id) {
    details.universityId = "Choose the seeded university.";
  }

  const courseIds = Array.isArray(body.courseIds) ? body.courseIds : null;
  if (
    !courseIds ||
    courseIds.length < VALIDATION.courseIds.min ||
    courseIds.length > VALIDATION.courseIds.max ||
    courseIds.some((courseId) => typeof courseId !== "string")
  ) {
    details.courseIds = `Choose ${VALIDATION.courseIds.min}–${VALIDATION.courseIds.max} courses.`;
  } else if (new Set(courseIds).size !== courseIds.length) {
    details.courseIds = "Course ids must be unique.";
  } else if (
    courseIds.some(
      (courseId) => !DEMO_COURSES.some((course) => course.id === courseId && course.universityId === body.universityId),
    )
  ) {
    details.courseIds = "Each course must belong to the selected university.";
  }

  if (!isStudyStyle(body.studyStyle)) {
    details.studyStyle = "Choose quiet, collaborative, or flexible.";
  }

  if (
    !inRange(
      body.preferredDurationMinutes,
      VALIDATION.preferredDurationMinutes.min,
      VALIDATION.preferredDurationMinutes.max,
    )
  ) {
    details.preferredDurationMinutes = `Preferred duration must be a whole number from ${VALIDATION.preferredDurationMinutes.min} to ${VALIDATION.preferredDurationMinutes.max}.`;
  }

  if (
    !inRange(body.preferredGroupSize, VALIDATION.preferredGroupSize.min, VALIDATION.preferredGroupSize.max)
  ) {
    details.preferredGroupSize = `Preferred group size must be a whole number from ${VALIDATION.preferredGroupSize.min} to ${VALIDATION.preferredGroupSize.max}.`;
  }

  if (body.visible !== undefined && typeof body.visible !== "boolean") {
    details.visible = "Visibility must be true or false.";
  }

  if (Object.keys(details).length > 0) {
    return wait(validation("Check the highlighted profile fields.", details), WRITE_DELAY_MS);
  }

  const existing = readProfile(session.userId);
  const nowMs = Date.now();
  if (existing && activeCheckin(session.userId, nowMs) && existing.universityId !== body.universityId) {
    return wait(
      apiError("CONFLICT", "Finish your check-in before changing university.", {
        universityId: "University cannot change during an active check-in.",
      }),
      WRITE_DELAY_MS,
    );
  }

  const profile: Profile = {
    id: session.userId,
    displayName,
    universityId: body.universityId,
    major,
    academicYear,
    courseIds: [...(courseIds as string[])],
    studyStyle: body.studyStyle,
    preferredDurationMinutes: body.preferredDurationMinutes,
    preferredGroupSize: body.preferredGroupSize,
    visible: body.visible ?? false,
  };
  upsertProfile(profile);
  return wait({ data: readProfile(session.userId) ?? profile }, WRITE_DELAY_MS);
}

export async function getCheckin(): Promise<ApiData<Checkin | null> | ApiError> {
  const session = requireUser();
  if (!isUser(session)) return wait(session, READ_DELAY_MS);
  const record = activeCheckin(session.userId, Date.now());
  return wait({ data: record ? toCheckin(record) : null }, READ_DELAY_MS);
}

export async function postCheckin(body: PostCheckinBody): Promise<ApiData<Checkin> | ApiError> {
  const session = requireUser();
  if (!isUser(session)) return wait(session, WRITE_DELAY_MS);
  const extra = unknownKeys(body, CHECKIN_KEYS);
  if (extra.length > 0) {
    return wait(validation("Unknown check-in fields.", { fields: extra }), WRITE_DELAY_MS);
  }

  const profile = readProfile(session.userId);
  if (!profile) {
    return wait(
      apiError("FORBIDDEN", "Complete your profile before checking in.", { profile: "Profile is required." }),
      WRITE_DELAY_MS,
    );
  }
  if (!profile.visible) {
    return wait(
      apiError("FORBIDDEN", "Turn on discovery visibility before checking in.", {
        visible: "Visibility must be on.",
      }),
      WRITE_DELAY_MS,
    );
  }

  const details: Record<string, unknown> = {};
  if (typeof body.courseId !== "string" || !profile.courseIds.includes(body.courseId)) {
    details.courseId = "Choose a course from your profile.";
  } else if (!DEMO_COURSES.some((course) => course.id === body.courseId && course.universityId === profile.universityId)) {
    details.courseId = "That course is not on this campus.";
  }
  if (
    typeof body.locationId !== "string" ||
    !DEMO_LOCATIONS.some(
      (location) => location.id === body.locationId && location.universityId === profile.universityId,
    )
  ) {
    details.locationId = "Choose a public campus building.";
  }
  if (!inRange(body.durationMinutes, VALIDATION.durationMinutes.min, VALIDATION.durationMinutes.max)) {
    details.durationMinutes = `Duration must be a whole number from ${VALIDATION.durationMinutes.min} to ${VALIDATION.durationMinutes.max}.`;
  }
  if (!isAvailability(body.availability)) details.availability = "Choose an availability.";
  if (!isStudyStyle(body.studyStyle)) details.studyStyle = "Choose a check-in study style.";
  if (Object.keys(details).length > 0) {
    return wait(validation("Check the check-in fields.", details), WRITE_DELAY_MS);
  }

  const startedMs = Date.now();
  const record: FixtureCheckinRecord = {
    id: crypto.randomUUID(),
    userId: session.userId,
    locationId: body.locationId,
    courseId: body.courseId,
    availability: body.availability,
    studyStyle: body.studyStyle,
    startedAt: new Date(startedMs).toISOString(),
    expiresAt: new Date(startedMs + body.durationMinutes * 60_000).toISOString(),
    checkedOutAt: null,
  };
  replaceActiveCheckin(record, startedMs);
  return wait({ data: toCheckin(record) }, WRITE_DELAY_MS);
}

export async function deleteCheckin(): Promise<ApiData<CheckoutResult> | ApiError> {
  const session = requireUser();
  if (!isUser(session)) return wait(session, WRITE_DELAY_MS);
  const nowMs = Date.now();
  checkoutActive(session.userId, new Date(nowMs).toISOString(), nowMs);
  return wait({ data: { checkedOut: true } }, WRITE_DELAY_MS);
}

export async function getDiscovery(
  filters: DiscoveryFilters = {},
): Promise<ApiList<DiscoveryMatch> | ApiError> {
  const session = requireUser();
  if (!isUser(session)) return wait(session, READ_DELAY_MS);
  const extra = unknownKeys(filters, DISCOVERY_KEYS);
  if (extra.length > 0) {
    return wait(validation("Unknown discovery filters.", { fields: extra }), READ_DELAY_MS);
  }

  const callerProfile = readProfile(session.userId);
  const universityId = callerUniversityId(callerProfile);
  if (
    filters.locationId !== undefined &&
    (typeof filters.locationId !== "string" ||
      !DEMO_LOCATIONS.some(
        (location) => location.id === filters.locationId && location.universityId === universityId,
      ))
  ) {
    return wait(
      validation("That building is not on this campus.", { locationId: "Choose a public campus building." }),
      READ_DELAY_MS,
    );
  }
  if (
    filters.courseId !== undefined &&
    (typeof filters.courseId !== "string" ||
      !DEMO_COURSES.some((course) => course.id === filters.courseId && course.universityId === universityId))
  ) {
    return wait(
      validation("That course is not on this campus.", { courseId: "Choose a seeded course." }),
      READ_DELAY_MS,
    );
  }

  const nowMs = Date.now();
  const callerCheckin = activeCheckin(session.userId, nowMs);
  const matches: DiscoveryMatch[] = [];

  for (const profile of readProfiles()) {
    if (!isDiscoverable(session.userId, profile, nowMs)) continue;
    const record = activeCheckin(profile.id, nowMs);
    if (!record) continue;
    if (filters.locationId && record.locationId !== filters.locationId) continue;
    if (filters.courseId && record.courseId !== filters.courseId) continue;
    const course = courseById(record.courseId);
    const location = locationById(record.locationId);
    if (!course || !location) continue;
    const scored = scoreCompatibility(
      {
        profile: callerProfile,
        checkin: callerCheckin ? toCheckin(callerCheckin) : null,
      },
      { profile, checkin: toCheckin(record) },
    );
    const request = latestRequest(session.userId, profile.id);
    matches.push({
      user: {
        id: profile.id,
        displayName: profile.displayName,
        major: profile.major,
        academicYear: profile.academicYear,
        studyStyle: record.studyStyle,
      },
      location: toPublicLocation(location),
      course,
      availability: record.availability,
      compatibilityScore: scored.compatibilityScore,
      reasons: scored.reasons,
      checkinExpiresAt: record.expiresAt,
      requestStatus: request?.status ?? null,
    });
  }

  const callerLocationId = callerCheckin?.locationId ?? null;
  matches.sort((left, right) =>
    compareDiscoveryMatches(
      {
        compatibilityScore: left.compatibilityScore,
        locationId: left.location.id,
        userId: left.user.id,
      },
      {
        compatibilityScore: right.compatibilityScore,
        locationId: right.location.id,
        userId: right.user.id,
      },
      callerLocationId,
    ),
  );

  return wait({ data: matches, meta: { count: matches.length } }, READ_DELAY_MS);
}

export async function getRequests(
  direction: RequestDirection = "all",
): Promise<ApiList<StudyRequest> | ApiError> {
  const session = requireUser();
  if (!isUser(session)) return wait(session, READ_DELAY_MS);
  if (!REQUEST_DIRECTIONS.some((item) => item === direction)) {
    return wait(validation("Request direction is invalid.", { direction: "Use incoming, outgoing, or all." }), READ_DELAY_MS);
  }
  const nowMs = Date.now();
  const data = readRequests()
    .filter((request) => request.senderId === session.userId || request.recipientId === session.userId)
    .filter((request) => {
      if (direction === "incoming") return request.recipientId === session.userId;
      if (direction === "outgoing") return request.senderId === session.userId;
      return true;
    })
    .map((request) => toStudyRequest(request, session.userId, nowMs))
    .filter((request): request is StudyRequest => request !== null)
    .sort((left, right) => {
      if (left.updatedAt !== right.updatedAt) return left.updatedAt < right.updatedAt ? 1 : -1;
      return left.id < right.id ? 1 : -1;
    });
  return wait({ data, meta: { count: data.length } }, READ_DELAY_MS);
}

export async function postRequest(body: PostRequestBody): Promise<ApiData<StudyRequest> | ApiError> {
  const session = requireUser();
  if (!isUser(session)) return wait(session, WRITE_DELAY_MS);
  const extra = unknownKeys(body, REQUEST_KEYS);
  if (extra.length > 0) {
    return wait(validation("Unknown request fields.", { fields: extra }), WRITE_DELAY_MS);
  }
  if (typeof body.recipientId !== "string") {
    return wait(validation("Choose a student.", { recipientId: "Recipient is required." }), WRITE_DELAY_MS);
  }
  if (body.recipientId === session.userId) {
    return wait(validation("You cannot send a study request to yourself.", { recipientId: "Choose someone else." }), WRITE_DELAY_MS);
  }

  const nowMs = Date.now();
  const recipient = readProfile(body.recipientId);
  if (!recipient) {
    return wait(apiError("NOT_FOUND", "That student could not be found.", { recipientId: "No profile exists." }), WRITE_DELAY_MS);
  }
  if (!isDiscoverable(session.userId, recipient, nowMs)) {
    return wait(
      apiError("FORBIDDEN", "That student is not available for a study request.", {
        recipientId: "The student is hidden, focused, checked out, or blocked.",
      }),
      WRITE_DELAY_MS,
    );
  }

  const history = pairRequests(session.userId, body.recipientId);
  if (history.some((request) => request.status === "pending")) {
    return wait(
      apiError("CONFLICT", "A pending request already exists between these students.", {
        recipientId: "Wait for the current request to finish.",
      }),
      WRITE_DELAY_MS,
    );
  }
  if (history.some((request) => request.status === "accepted")) {
    return wait(
      apiError("CONFLICT", "An accepted request already exists between these students.", {
        recipientId: "This pair is already connected.",
      }),
      WRITE_DELAY_MS,
    );
  }

  const stamp = new Date(nowMs).toISOString();
  const record: FixtureRequestRecord = {
    id: crypto.randomUUID(),
    senderId: session.userId,
    recipientId: body.recipientId,
    status: "pending",
    createdAt: stamp,
    updatedAt: stamp,
  };
  insertRequest(record);
  const created = toStudyRequest(record, session.userId, nowMs);
  if (!created) {
    return wait(apiError("INTERNAL_ERROR", "The request could not be prepared."), WRITE_DELAY_MS);
  }
  return wait({ data: created }, WRITE_DELAY_MS);
}

export async function patchRequest(
  id: string,
  body: PatchRequestBody,
): Promise<ApiData<StudyRequest> | ApiError> {
  const session = requireUser();
  if (!isUser(session)) return wait(session, WRITE_DELAY_MS);
  const extra = unknownKeys(body, PATCH_KEYS);
  if (extra.length > 0) {
    return wait(validation("Unknown request fields.", { fields: extra }), WRITE_DELAY_MS);
  }
  if (!PATCH_STATUSES.some((status) => status === body.status)) {
    return wait(
      validation("That status change is not supported.", {
        status: "Use accepted, declined, or cancelled.",
      }),
      WRITE_DELAY_MS,
    );
  }

  const current = readRequests().find((request) => request.id === id);
  if (!current || (current.senderId !== session.userId && current.recipientId !== session.userId)) {
    return wait(apiError("NOT_FOUND", "That request could not be found."), WRITE_DELAY_MS);
  }
  if (current.status !== "pending") {
    return wait(
      apiError("CONFLICT", "This request is no longer pending.", { status: "Only a pending request can change." }),
      WRITE_DELAY_MS,
    );
  }

  const isRecipient = current.recipientId === session.userId;
  if ((body.status === "accepted" || body.status === "declined") && !isRecipient) {
    return wait(
      apiError("FORBIDDEN", "Only the recipient can accept or decline this request.", { status: "Sender cannot accept or decline." }),
      WRITE_DELAY_MS,
    );
  }
  if (body.status === "cancelled" && isRecipient) {
    return wait(
      apiError("FORBIDDEN", "Only the sender can cancel this request.", { status: "Recipient cannot cancel." }),
      WRITE_DELAY_MS,
    );
  }

  const nowMs = Date.now();
  const updatedAt = new Date(nowMs).toISOString();
  changeRequestStatus(id, body.status, updatedAt);
  const updated = readRequests().find((request) => request.id === id);
  if (!updated) return wait(apiError("NOT_FOUND", "That request could not be found."), WRITE_DELAY_MS);
  const view = toStudyRequest(updated, session.userId, nowMs);
  if (!view) return wait(apiError("NOT_FOUND", "That request could not be found."), WRITE_DELAY_MS);
  return wait({ data: view }, WRITE_DELAY_MS);
}
