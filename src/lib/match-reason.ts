import { MATCH_POINTS, MATCH_REASONS, type MatchReason } from "#api";

const REASON_POINTS: Record<MatchReason, number> = {
  [MATCH_REASONS.sameActiveCourse]: MATCH_POINTS.sameActiveCourse,
  [MATCH_REASONS.sharedEnrolledCourse]: MATCH_POINTS.sharedEnrolledCourse,
  [MATCH_REASONS.studyStyle]: MATCH_POINTS.studyStyle,
  [MATCH_REASONS.sameLocation]: MATCH_POINTS.sameLocation,
  [MATCH_REASONS.durationWithin30]: MATCH_POINTS.durationWithin30,
  [MATCH_REASONS.durationWithin60]: MATCH_POINTS.durationWithin60,
  [MATCH_REASONS.groupSize]: MATCH_POINTS.groupSize,
};

/** Highest-point reason. Equal points keep the earlier server reason. */
export function strongestReason(reasons: readonly MatchReason[]): MatchReason | null {
  let best: MatchReason | null = null;
  let bestPoints = -1;
  for (const reason of reasons) {
    const points = REASON_POINTS[reason];
    if (points > bestPoints) {
      best = reason;
      bestPoints = points;
    }
  }
  return best;
}
