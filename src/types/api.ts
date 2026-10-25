/**
 * Shared StudySync API types. Mirrors docs/API_CONTRACT.md.
 * Cursor owns this file. Change it only together with a contract update.
 */

export const API_ERROR_STATUS = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
} as const;

export type ApiErrorCode = keyof typeof API_ERROR_STATUS;

export type ApiError = {
  error: {
    code: ApiErrorCode;
    message: string;
    details: Record<string, unknown>;
  };
};

export type ApiData<T> = { data: T };

export type ApiList<T> = { data: T[]; meta: { count: number } };

export const VALIDATION = {
  displayName: { min: 1, max: 40 },
  major: { min: 1, max: 80 },
  courseIds: { min: 1, max: 8 },
  preferredDurationMinutes: { min: 30, max: 180 },
  durationMinutes: { min: 30, max: 180 },
  preferredGroupSize: { min: 1, max: 6 },
  courseQuery: { max: 40 },
  reportDetails: { max: 500 },
  sessionTitle: { min: 1, max: 60 },
  sessionSeatLimit: { min: 1, max: 6 },
  sessionGroupSeatLimit: { min: 2, max: 6 },
  sessionHorizonDays: 180,
  sessionMinuteStep: 5,
} as const;

/** Wall-clock zone for scheduled sessions. Stored instants are UTC. */
export const CAMPUS_TIME_ZONE = "America/Chicago";

/**
 * Added only while ordering discovery results. Never add this into
 * `compatibilityScore` and never list it as a match reason.
 * A same-location student outranks someone whose displayed score is
 * at most this many points higher. A larger gap follows the higher score.
 */
export const LOCATION_RANK_BONUS = 10;

export const MATCH_REASONS = {
  sameActiveCourse: "Studying the same course",
  sharedEnrolledCourse: "Shares another enrolled course",
  studyStyle: "Compatible study style",
  sameLocation: "Same study location",
  durationWithin30: "Preferred duration within 30 minutes",
  durationWithin60: "Preferred duration within 60 minutes",
  groupSize: "Similar preferred group size",
} as const;

export type MatchReason = (typeof MATCH_REASONS)[keyof typeof MATCH_REASONS];

export const MATCH_POINTS = {
  sameActiveCourse: 40,
  sharedEnrolledCourse: 25,
  studyStyle: 20,
  sameLocation: 20,
  durationWithin30: 10,
  durationWithin60: 5,
  groupSize: 10,
} as const;

export type StudyStyle = "quiet" | "collaborative" | "flexible";
export type Availability = "available" | "questions_only" | "focused";
export type RequestStatus = "pending" | "accepted" | "declined" | "cancelled";
export type AcademicYear =
  | "freshman"
  | "sophomore"
  | "junior"
  | "senior"
  | "graduate"
  | "other";
export type ReportReason = "harassment" | "spam" | "other";
export type RequestDirection = "incoming" | "outgoing" | "all";
export type SessionVisibility = "solo" | "open" | "invite_only";
export type SessionStatus = "scheduled" | "cancelled";
export type SessionParticipantStatus =
  | "invited"
  | "requested"
  | "accepted"
  | "declined"
  | "left"
  | "cancelled";
export type SessionRole = "host" | "invitee" | "joiner";
export type SessionWhen = "upcoming" | "past" | "history" | "missed";
export type SessionAttendance = "completed" | "missed";
export type RatingCategory = "study_time" | "environment" | "chemistry";

export type University = {
  id: string;
  name: string;
  slug: string;
};

export type Profile = {
  id: string;
  displayName: string;
  universityId: string;
  major: string | null;
  academicYear: AcademicYear | null;
  courseIds: string[];
  studyStyle: StudyStyle;
  preferredDurationMinutes: number;
  preferredGroupSize: number;
  visible: boolean;
};

export type Location = {
  id: string;
  universityId: string;
  name: string;
  buildingCode: string;
  description: string | null;
};

/** Building-level public place. No description, room, desk, or coordinates. */
export type PublicLocation = Pick<Location, "id" | "name" | "buildingCode">;

export type Course = {
  id: string;
  universityId: string;
  code: string;
  title: string;
};

export type Checkin = {
  id: string;
  locationId: string;
  courseId: string;
  availability: Availability;
  studyStyle: StudyStyle;
  startedAt: string;
  expiresAt: string;
};

export type DiscoveryUser = {
  id: string;
  displayName: string;
  major: string | null;
  academicYear: AcademicYear | null;
  /** Check-in study style. This is the value used for matching. */
  studyStyle: StudyStyle;
};

export type DiscoveryMatch = {
  user: DiscoveryUser;
  location: PublicLocation;
  course: Course;
  availability: Availability;
  compatibilityScore: number;
  reasons: MatchReason[];
  checkinExpiresAt: string;
  requestStatus: RequestStatus | null;
};

export type RequestCounterpart = {
  id: string;
  displayName: string;
  major: string | null;
  academicYear: AcademicYear | null;
  /** Profile study style. Remains available after the counterpart checks out. */
  studyStyle: StudyStyle;
};

export type StudyRequest = {
  id: string;
  senderId: string;
  recipientId: string;
  status: RequestStatus;
  createdAt: string;
  updatedAt: string;
  /** The other participant. Never the caller. */
  counterpart: RequestCounterpart;
  /** Counterpart's current active check-in course, or null after checkout/expiry. */
  course: Course | null;
  /** Counterpart's current building-level check-in, or null after checkout/expiry. */
  location: PublicLocation | null;
};

export type SessionPerson = {
  id: string;
  displayName: string;
  major: string | null;
  academicYear: AcademicYear | null;
};

export type SessionParticipant = {
  user: SessionPerson;
  role: SessionRole;
  status: SessionParticipantStatus;
};

/**
 * A booking. `status` stays `scheduled` after `endsAt` passes.
 * Milestone 9 does not mark a booking completed and does not record study hours.
 */
export type ScheduledSession = {
  id: string;
  title: string;
  course: Course;
  location: PublicLocation;
  visibility: SessionVisibility;
  seatLimit: number;
  /** Accepted participants, including the host. */
  seatsTaken: number;
  /** Accepted participants plus pending invitations. Join requests are excluded. */
  seatsReserved: number;
  startsAt: string;
  endsAt: string;
  status: SessionStatus;
  host: SessionPerson;
  myRole: SessionRole | null;
  myStatus: SessionParticipantStatus | null;
  participants: SessionParticipant[];
};

/** Public card for an open booking. No roster and no private schedule. */
export type OpenSession = {
  id: string;
  title: string;
  course: Course;
  location: PublicLocation;
  seatLimit: number;
  seatsTaken: number;
  seatsReserved: number;
  startsAt: string;
  endsAt: string;
  host: SessionPerson;
  myStatus: SessionParticipantStatus | null;
};

export type Block = {
  blockedUserId: string;
  displayName: string | null;
  createdAt: string;
};

export type PutProfileBody = {
  displayName: string;
  universityId: string;
  major: string | null;
  academicYear: AcademicYear | null;
  courseIds: string[];
  studyStyle: StudyStyle;
  preferredDurationMinutes: number;
  preferredGroupSize: number;
  /** Omitted means false. */
  visible?: boolean;
};

export type PostCheckinBody = {
  locationId: string;
  courseId: string;
  durationMinutes: number;
  availability: Availability;
  studyStyle: StudyStyle;
};

export type PostRequestBody = { recipientId: string };

export type PatchRequestBody = {
  status: "accepted" | "declined" | "cancelled";
};

export type PostBlockBody = { blockedUserId: string };

export type PostSessionBody = {
  title: string;
  courseId: string;
  locationId: string;
  /** Campus calendar date, `YYYY-MM-DD`, interpreted in America/Chicago. */
  localDate: string;
  /** Campus time, `HH:MM` on a 5-minute grid, interpreted in America/Chicago. */
  localTime: string;
  durationMinutes: number;
  visibility: SessionVisibility;
  seatLimit: number;
  inviteeIds: string[];
};

export type PostInvitationBody = { inviteeId: string };

export type PatchInvitationBody = { status: "accepted" | "declined" };

export type PatchSessionParticipantBody = { status: "accepted" | "declined" };

/**
 * One caller's record of a booking. Hours are self-reported, not verified,
 * and they are not a match input.
 */
export type StudyRecord = {
  id: string;
  title: string;
  course: Course;
  location: PublicLocation;
  startsAt: string;
  endsAt: string;
  sessionStatus: SessionStatus;
  attendance: SessionAttendance;
  /** Minutes this caller claimed. Zero when missed. */
  creditedMinutes: number;
  countsTowardStats: boolean;
  /** America/Chicago date of the booking start, `YYYY-MM-DD`. */
  campusDate: string;
  recordedAt: string;
  selfReported: true;
  participants: SessionPerson[];
  myRatings: {
    studyTime: number | null;
    environment: number | null;
    chemistry: { userId: string; stars: number }[];
  };
};

export type StudyCourseStreak = {
  courseId: string;
  code: string;
  title: string;
  streakDays: number;
};

export type StudyDayMinutes = { date: string; minutes: number };

/** Totals from qualifying self-reported completions. Never a public ranking. */
export type StudyStats = {
  selfReported: true;
  description: string;
  streakDays: number;
  qualifyingMinutes: number;
  weekMinutes: number;
  week: StudyDayMinutes[];
  courseStreaks: StudyCourseStreak[];
};

export type PostStudyRatingBody = {
  studyTime?: number;
  environment?: number;
  chemistry?: { userId: string; stars: number }[];
};

export type PostReportBody = {
  reportedUserId: string;
  reason: ReportReason;
  details?: string | null;
};

export type CheckoutResult = { checkedOut: true };
export type UnblockResult = { unblocked: true };
export type ReportResult = { id: string };

/** Public campus seed. Not student records. Auth user ids are assigned at seed time. */
export const DEMO_UNIVERSITY = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "University of Texas at Austin",
  slug: "ut-austin",
} as const satisfies University;

export const DEMO_LOCATIONS = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    universityId: DEMO_UNIVERSITY.id,
    name: "Perry-Castañeda Library",
    buildingCode: "PCL",
    description: "Public library study spaces",
  },
  {
    id: "11111111-1111-4111-8111-111111111112",
    universityId: DEMO_UNIVERSITY.id,
    name: "Engineering Education and Research Center",
    buildingCode: "EER",
    description: "Public engineering building study spaces",
  },
  {
    id: "11111111-1111-4111-8111-111111111113",
    universityId: DEMO_UNIVERSITY.id,
    name: "Texas Union",
    buildingCode: "UNION",
    description: "Public union study spaces",
  },
] as const satisfies readonly Location[];

export const DEMO_COURSES = [
  {
    id: "33333333-3333-4333-8333-333333333331",
    universityId: DEMO_UNIVERSITY.id,
    code: "M408C",
    title: "Differential and Integral Calculus",
  },
  {
    id: "33333333-3333-4333-8333-333333333332",
    universityId: DEMO_UNIVERSITY.id,
    code: "CS314",
    title: "Data Structures",
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    universityId: DEMO_UNIVERSITY.id,
    code: "BIO311C",
    title: "Introductory Biology",
  },
] as const satisfies readonly Course[];

export const DEMO_ACCOUNTS = [
  {
    label: "Demo Student A",
    email: "demo-student-a@studysync.example",
  },
  {
    label: "Demo Student B",
    email: "demo-student-b@studysync.example",
  },
] as const;
