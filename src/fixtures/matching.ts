import {
  LOCATION_RANK_BONUS,
  MATCH_POINTS,
  MATCH_REASONS,
  type Checkin,
  type MatchReason,
  type Profile,
} from "@/types/api";

export type ScoreInput = {
  profile: Profile | null;
  checkin: Checkin | null;
};

export type ScoreResult = {
  compatibilityScore: number;
  reasons: MatchReason[];
};

/**
 * Frozen matching v1. Study style comes from the check-in. Duration and
 * group size come from the profile. A reason is included only when that
 * rule awarded points. Score 0 returns an empty reasons array.
 */
export function scoreCompatibility(
  caller: ScoreInput,
  candidate: { profile: Profile; checkin: Checkin },
): ScoreResult {
  const reasons: MatchReason[] = [];
  let compatibilityScore = 0;

  const callerCourseId = caller.checkin?.courseId ?? null;
  if (callerCourseId !== null && callerCourseId === candidate.checkin.courseId) {
    compatibilityScore += MATCH_POINTS.sameActiveCourse;
    reasons.push(MATCH_REASONS.sameActiveCourse);
  } else if (
    caller.profile !== null &&
    caller.profile.courseIds.some((courseId) => candidate.profile.courseIds.includes(courseId))
  ) {
    compatibilityScore += MATCH_POINTS.sharedEnrolledCourse;
    reasons.push(MATCH_REASONS.sharedEnrolledCourse);
  }

  if (caller.checkin !== null) {
    const callerStyle = caller.checkin.studyStyle;
    const candidateStyle = candidate.checkin.studyStyle;
    if (
      callerStyle === candidateStyle ||
      callerStyle === "flexible" ||
      candidateStyle === "flexible"
    ) {
      compatibilityScore += MATCH_POINTS.studyStyle;
      reasons.push(MATCH_REASONS.studyStyle);
    }

    if (caller.checkin.locationId === candidate.checkin.locationId) {
      compatibilityScore += MATCH_POINTS.sameLocation;
      reasons.push(MATCH_REASONS.sameLocation);
    }
  }

  if (caller.profile !== null) {
    const durationGap = Math.abs(
      caller.profile.preferredDurationMinutes - candidate.profile.preferredDurationMinutes,
    );
    if (durationGap <= 30) {
      compatibilityScore += MATCH_POINTS.durationWithin30;
      reasons.push(MATCH_REASONS.durationWithin30);
    } else if (durationGap <= 60) {
      compatibilityScore += MATCH_POINTS.durationWithin60;
      reasons.push(MATCH_REASONS.durationWithin60);
    }

    const groupGap = Math.abs(
      caller.profile.preferredGroupSize - candidate.profile.preferredGroupSize,
    );
    if (groupGap <= 1) {
      compatibilityScore += MATCH_POINTS.groupSize;
      reasons.push(MATCH_REASONS.groupSize);
    }
  }

  if (compatibilityScore === 0) return { compatibilityScore: 0, reasons: [] };
  return { compatibilityScore, reasons };
}

export function discoveryRank(compatibilityScore: number, sameLocation: boolean): number {
  return compatibilityScore + (sameLocation ? LOCATION_RANK_BONUS : 0);
}

/**
 * Sort by rank, then same location, then user id. Rank adds LOCATION_RANK_BONUS
 * for ordering only. Callers must keep displaying compatibilityScore unchanged.
 */
export function compareDiscoveryMatches(
  left: { compatibilityScore: number; locationId: string; userId: string },
  right: { compatibilityScore: number; locationId: string; userId: string },
  callerLocationId: string | null,
): number {
  const leftSame = callerLocationId !== null && left.locationId === callerLocationId;
  const rightSame = callerLocationId !== null && right.locationId === callerLocationId;
  const rankDelta =
    discoveryRank(right.compatibilityScore, rightSame) -
    discoveryRank(left.compatibilityScore, leftSame);
  if (rankDelta !== 0) return rankDelta;
  if (leftSame !== rightSame) return leftSame ? -1 : 1;
  if (left.userId < right.userId) return -1;
  if (left.userId > right.userId) return 1;
  return 0;
}
