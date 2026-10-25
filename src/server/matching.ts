import { LOCATION_RANK_BONUS, MATCH_POINTS, MATCH_REASONS, type Availability, type MatchReason, type StudyStyle } from "#api";

export type MatchCheckin = {
  courseId: string;
  locationId: string;
  studyStyle: StudyStyle;
};

export type MatchPerson = {
  userId: string;
  courseIds: readonly string[];
  preferredDurationMinutes: number;
  preferredGroupSize: number;
  checkin: MatchCheckin | null;
};

export type DiscoveryCandidate = {
  userId: string;
  availability: Availability;
  courseIds: readonly string[];
  preferredDurationMinutes: number;
  preferredGroupSize: number;
  checkin: MatchCheckin;
};

export type ScoredMatch = {
  compatibilityScore: number;
  reasons: MatchReason[];
};

export function isDiscoverableAvailability(availability: Availability): boolean {
  return availability === "available" || availability === "questions_only";
}

function intersects(left: readonly string[], right: readonly string[]): boolean {
  const rightIds = new Set(right.map((id) => id.toLowerCase()));
  return left.some((id) => rightIds.has(id.toLowerCase()));
}

function sameId(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

export function scoreMatch(caller: MatchPerson, candidate: DiscoveryCandidate): ScoredMatch {
  let compatibilityScore = 0;
  const reasons: MatchReason[] = [];
  const callerCheckin = caller.checkin;
  const candidateCheckin = candidate.checkin;

  if (callerCheckin && sameId(callerCheckin.courseId, candidateCheckin.courseId)) {
    compatibilityScore += MATCH_POINTS.sameActiveCourse;
    reasons.push(MATCH_REASONS.sameActiveCourse);
  } else if (intersects(caller.courseIds, candidate.courseIds)) {
    compatibilityScore += MATCH_POINTS.sharedEnrolledCourse;
    reasons.push(MATCH_REASONS.sharedEnrolledCourse);
  }

  if (callerCheckin) {
    const callerStyle = callerCheckin.studyStyle;
    const candidateStyle = candidateCheckin.studyStyle;
    if (callerStyle === candidateStyle || callerStyle === "flexible" || candidateStyle === "flexible") {
      compatibilityScore += MATCH_POINTS.studyStyle;
      reasons.push(MATCH_REASONS.studyStyle);
    }
    if (sameId(callerCheckin.locationId, candidateCheckin.locationId)) {
      compatibilityScore += MATCH_POINTS.sameLocation;
      reasons.push(MATCH_REASONS.sameLocation);
    }
  }

  const durationGap = Math.abs(caller.preferredDurationMinutes - candidate.preferredDurationMinutes);
  if (durationGap <= 30) {
    compatibilityScore += MATCH_POINTS.durationWithin30;
    reasons.push(MATCH_REASONS.durationWithin30);
  } else if (durationGap <= 60) {
    compatibilityScore += MATCH_POINTS.durationWithin60;
    reasons.push(MATCH_REASONS.durationWithin60);
  }

  if (Math.abs(caller.preferredGroupSize - candidate.preferredGroupSize) <= 1) {
    compatibilityScore += MATCH_POINTS.groupSize;
    reasons.push(MATCH_REASONS.groupSize);
  }

  return { compatibilityScore, reasons: compatibilityScore === 0 ? [] : reasons };
}

export function rankDiscoveryCandidates<T extends DiscoveryCandidate>(
  caller: MatchPerson,
  candidates: readonly T[],
): Array<T & ScoredMatch> {
  const activeLocationId = caller.checkin ? caller.checkin.locationId : null;
  const scored = candidates
    .filter((candidate) => candidate.userId !== caller.userId && isDiscoverableAvailability(candidate.availability))
    .map((candidate) => ({ ...candidate, ...scoreMatch(caller, candidate) }));

  return scored.sort((left, right) => {
    const bonus = (locationId: string) =>
      activeLocationId !== null && sameId(locationId, activeLocationId) ? LOCATION_RANK_BONUS : 0;
    const rankDelta =
      right.compatibilityScore + bonus(right.checkin.locationId) -
      (left.compatibilityScore + bonus(left.checkin.locationId));
    if (rankDelta !== 0) return rankDelta;
    const leftSame = bonus(left.checkin.locationId) > 0;
    const rightSame = bonus(right.checkin.locationId) > 0;
    if (leftSame !== rightSame) return leftSame ? -1 : 1;
    if (left.userId < right.userId) return -1;
    if (left.userId > right.userId) return 1;
    return 0;
  });
}
