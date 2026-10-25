import {
  DEMO_ACCOUNTS,
  DEMO_COURSES,
  DEMO_LOCATIONS,
  DEMO_UNIVERSITY,
  type AcademicYear,
  type Availability,
  type Profile,
  type StudyStyle,
} from "@/types/api";

/**
 * Local demo user ids. Auth ids are not in the frozen seed, so fixtures
 * assign these stand-ins. Only Demo Student A and Demo Student B can sign in.
 */
export const FIXTURE_USER_IDS = {
  demoA: "a1111111-1111-4111-8111-111111111111",
  demoB: "b2222222-2222-4222-8222-222222222222",
  demoC: "c3333333-3333-4333-8333-333333333333",
  demoD: "d4444444-4444-4444-8444-444444444444",
  demoE: "e5555555-5555-4555-8555-555555555555",
  demoF: "f6666666-6666-4666-8666-666666666666",
  demoG: "77777777-7777-4777-8777-777777777771",
  demoH: "88888888-8888-4888-8888-888888888881",
  demoI: "99999999-9999-4999-8999-999999999991",
} as const;

export const FIXTURE_DEMO_LOGINS = [
  {
    userId: FIXTURE_USER_IDS.demoA,
    label: DEMO_ACCOUNTS[0].label,
    email: DEMO_ACCOUNTS[0].email,
  },
  {
    userId: FIXTURE_USER_IDS.demoB,
    label: DEMO_ACCOUNTS[1].label,
    email: DEMO_ACCOUNTS[1].email,
  },
] as const;

export type FixtureCheckinRecord = {
  id: string;
  userId: string;
  locationId: string;
  courseId: string;
  availability: Availability;
  studyStyle: StudyStyle;
  startedAt: string;
  expiresAt: string;
  checkedOutAt: string | null;
};

export type FixtureRequestRecord = {
  id: string;
  senderId: string;
  recipientId: string;
  status: "pending" | "accepted" | "declined" | "cancelled";
  createdAt: string;
  updatedAt: string;
};

const ACTIVE_START = "2026-10-24T15:00:00.000Z";
const ACTIVE_EXPIRES = "2027-06-01T18:00:00.000Z";
const CHECKED_OUT_AT = "2026-10-24T16:30:00.000Z";

const [calculus, dataStructures, biology] = DEMO_COURSES;
const [library, engineeringCenter, union] = DEMO_LOCATIONS;

function persona(input: {
  id: string;
  displayName: string;
  major: string | null;
  academicYear: AcademicYear | null;
  courseIds: string[];
  studyStyle: StudyStyle;
  preferredDurationMinutes: number;
  preferredGroupSize: number;
  visible: boolean;
}): Profile {
  return {
    id: input.id,
    displayName: input.displayName,
    universityId: DEMO_UNIVERSITY.id,
    major: input.major,
    academicYear: input.academicYear,
    courseIds: input.courseIds,
    studyStyle: input.studyStyle,
    preferredDurationMinutes: input.preferredDurationMinutes,
    preferredGroupSize: input.preferredGroupSize,
    visible: input.visible,
  };
}

function checkedIn(input: {
  id: string;
  userId: string;
  locationId: string;
  courseId: string;
  availability: Availability;
  studyStyle: StudyStyle;
  checkedOutAt?: string | null;
}): FixtureCheckinRecord {
  return {
    id: input.id,
    userId: input.userId,
    locationId: input.locationId,
    courseId: input.courseId,
    availability: input.availability,
    studyStyle: input.studyStyle,
    startedAt: ACTIVE_START,
    expiresAt: ACTIVE_EXPIRES,
    checkedOutAt: input.checkedOutAt ?? null,
  };
}

/**
 * Demo Student A and Demo Student B start without profiles so onboarding
 * defaults visibility to false. C–F are discoverable. G is Focused, H is
 * checked out, and I is hidden.
 *
 * Profile study style and check-in study style differ on purpose. Scoring
 * uses the check-in style. Request cards keep the profile style.
 */
export function createSeedProfiles(): Profile[] {
  return [
    persona({
      id: FIXTURE_USER_IDS.demoC,
      displayName: "Demo Student C",
      major: "Engineering",
      academicYear: "sophomore",
      courseIds: [calculus.id, dataStructures.id],
      studyStyle: "quiet",
      preferredDurationMinutes: 90,
      preferredGroupSize: 2,
      visible: true,
    }),
    persona({
      id: FIXTURE_USER_IDS.demoD,
      displayName: "Demo Student D",
      major: "Computer Science",
      academicYear: "junior",
      courseIds: [dataStructures.id],
      studyStyle: "quiet",
      preferredDurationMinutes: 60,
      preferredGroupSize: 1,
      visible: true,
    }),
    persona({
      id: FIXTURE_USER_IDS.demoE,
      displayName: "Demo Student E",
      major: "Biology",
      academicYear: "freshman",
      courseIds: [biology.id, calculus.id],
      studyStyle: "quiet",
      preferredDurationMinutes: 120,
      preferredGroupSize: 4,
      visible: true,
    }),
    persona({
      id: FIXTURE_USER_IDS.demoF,
      displayName: "Demo Student F",
      major: "Mathematics",
      academicYear: "senior",
      courseIds: [calculus.id],
      studyStyle: "quiet",
      preferredDurationMinutes: 180,
      preferredGroupSize: 3,
      visible: true,
    }),
    persona({
      id: FIXTURE_USER_IDS.demoG,
      displayName: "Demo Student G",
      major: "Physics",
      academicYear: "graduate",
      courseIds: [calculus.id, dataStructures.id, biology.id],
      studyStyle: "collaborative",
      preferredDurationMinutes: 120,
      preferredGroupSize: 2,
      visible: true,
    }),
    persona({
      id: FIXTURE_USER_IDS.demoH,
      displayName: "Demo Student H",
      major: "Undeclared",
      academicYear: "other",
      courseIds: [dataStructures.id, biology.id],
      studyStyle: "flexible",
      preferredDurationMinutes: 90,
      preferredGroupSize: 2,
      visible: true,
    }),
    persona({
      id: FIXTURE_USER_IDS.demoI,
      displayName: "Demo Student I",
      major: "Chemistry",
      academicYear: "junior",
      courseIds: [calculus.id],
      studyStyle: "collaborative",
      preferredDurationMinutes: 60,
      preferredGroupSize: 1,
      visible: false,
    }),
  ];
}

export function createSeedCheckins(): FixtureCheckinRecord[] {
  return [
    checkedIn({
      id: "66666666-6666-4666-8666-666666666661",
      userId: FIXTURE_USER_IDS.demoC,
      locationId: library.id,
      courseId: calculus.id,
      availability: "available",
      studyStyle: "collaborative",
    }),
    checkedIn({
      id: "66666666-6666-4666-8666-666666666662",
      userId: FIXTURE_USER_IDS.demoD,
      locationId: engineeringCenter.id,
      courseId: dataStructures.id,
      availability: "questions_only",
      studyStyle: "quiet",
    }),
    checkedIn({
      id: "66666666-6666-4666-8666-666666666663",
      userId: FIXTURE_USER_IDS.demoE,
      locationId: library.id,
      courseId: biology.id,
      availability: "available",
      studyStyle: "flexible",
    }),
    checkedIn({
      id: "66666666-6666-4666-8666-666666666664",
      userId: FIXTURE_USER_IDS.demoF,
      locationId: union.id,
      courseId: calculus.id,
      availability: "available",
      studyStyle: "collaborative",
    }),
    checkedIn({
      id: "66666666-6666-4666-8666-666666666665",
      userId: FIXTURE_USER_IDS.demoG,
      locationId: library.id,
      courseId: calculus.id,
      availability: "focused",
      studyStyle: "collaborative",
    }),
    checkedIn({
      id: "66666666-6666-4666-8666-666666666666",
      userId: FIXTURE_USER_IDS.demoH,
      locationId: engineeringCenter.id,
      courseId: dataStructures.id,
      availability: "available",
      studyStyle: "flexible",
      checkedOutAt: CHECKED_OUT_AT,
    }),
    checkedIn({
      id: "66666666-6666-4666-8666-666666666667",
      userId: FIXTURE_USER_IDS.demoI,
      locationId: library.id,
      courseId: calculus.id,
      availability: "available",
      studyStyle: "collaborative",
    }),
  ];
}

export function createSeedRequests(): FixtureRequestRecord[] {
  return [
    {
      id: "55555555-5555-4555-8555-555555555551",
      senderId: FIXTURE_USER_IDS.demoC,
      recipientId: FIXTURE_USER_IDS.demoA,
      status: "pending",
      createdAt: "2026-10-24T15:05:00.000Z",
      updatedAt: "2026-10-24T15:05:00.000Z",
    },
    {
      id: "55555555-5555-4555-8555-555555555552",
      senderId: FIXTURE_USER_IDS.demoA,
      recipientId: FIXTURE_USER_IDS.demoH,
      status: "pending",
      createdAt: "2026-10-24T15:06:00.000Z",
      updatedAt: "2026-10-24T15:06:00.000Z",
    },
    {
      id: "55555555-5555-4555-8555-555555555553",
      senderId: FIXTURE_USER_IDS.demoF,
      recipientId: FIXTURE_USER_IDS.demoA,
      status: "declined",
      createdAt: "2026-10-24T15:07:00.000Z",
      updatedAt: "2026-10-24T15:12:00.000Z",
    },
    {
      id: "55555555-5555-4555-8555-555555555554",
      senderId: FIXTURE_USER_IDS.demoE,
      recipientId: FIXTURE_USER_IDS.demoB,
      status: "pending",
      createdAt: "2026-10-24T15:08:00.000Z",
      updatedAt: "2026-10-24T15:08:00.000Z",
    },
    {
      id: "55555555-5555-4555-8555-555555555555",
      senderId: FIXTURE_USER_IDS.demoD,
      recipientId: FIXTURE_USER_IDS.demoB,
      status: "accepted",
      createdAt: "2026-10-24T15:09:00.000Z",
      updatedAt: "2026-10-24T15:18:00.000Z",
    },
    {
      id: "55555555-5555-4555-8555-555555555556",
      senderId: FIXTURE_USER_IDS.demoB,
      recipientId: FIXTURE_USER_IDS.demoH,
      status: "cancelled",
      createdAt: "2026-10-24T15:11:00.000Z",
      updatedAt: "2026-10-24T15:16:00.000Z",
    },
  ];
}

export function demoLoginFor(userId: string) {
  return FIXTURE_DEMO_LOGINS.find((account) => account.userId === userId) ?? null;
}
