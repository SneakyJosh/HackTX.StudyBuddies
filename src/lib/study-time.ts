/**
 * Self-reported study time. Booking length stays 30–180 minutes.
 * Credited minutes are the time recorded at finish and can be shorter.
 */

export const STUDY_TIME_MINIMUM_MINUTES = 1;
export const STREAK_DAY_MINIMUM_MINUTES = 5;

export type StudyCredit = {
  campusDate: string;
  creditedMinutes: number;
  outcome: "completed" | "missed";
  courseId?: string;
};

export function countsTowardStudyTime(credit: StudyCredit): boolean {
  return credit.outcome === "completed" && credit.creditedMinutes >= STUDY_TIME_MINIMUM_MINUTES;
}

export function totalStudyMinutes(credits: readonly StudyCredit[], courseId?: string): number {
  return credits.reduce((sum, credit) => {
    if (!countsTowardStudyTime(credit)) return sum;
    if (courseId !== undefined && credit.courseId !== courseId) return sum;
    return sum + credit.creditedMinutes;
  }, 0);
}

export function minutesOnDay(credits: readonly StudyCredit[], campusDate: string, courseId?: string): number {
  return totalStudyMinutes(
    credits.filter((credit) => credit.campusDate === campusDate),
    courseId,
  );
}

export function dayQualifies(credits: readonly StudyCredit[], campusDate: string, courseId?: string): boolean {
  return minutesOnDay(credits, campusDate, courseId) >= STREAK_DAY_MINIMUM_MINUTES;
}

export function creditedMinutes(bookedMinutes: number, elapsedMinutes: number, finishedAtOrAfterEnd: boolean): number {
  if (finishedAtOrAfterEnd) return bookedMinutes;
  return Math.min(bookedMinutes, Math.max(0, elapsedMinutes));
}

function shiftCampusDate(campusDate: string, days: number): string {
  const [year, month, day] = campusDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Consecutive qualifying campus dates ending today, or yesterday when today is empty. */
export function streakLength(credits: readonly StudyCredit[], today: string, courseId?: string): number {
  let anchor = today;
  if (!dayQualifies(credits, anchor, courseId)) anchor = shiftCampusDate(today, -1);
  if (!dayQualifies(credits, anchor, courseId)) return 0;
  let streak = 0;
  let cursor = anchor;
  while (dayQualifies(credits, cursor, courseId)) {
    streak += 1;
    cursor = shiftCampusDate(cursor, -1);
  }
  return streak;
}
