import { CAMPUS_TIME_ZONE } from "#api";

/**
 * Self-reported study time. Booking length stays 30–180 minutes.
 * Credited minutes are the time recorded at finish and can be shorter.
 * A personal check-in credits elapsed minutes and never time after its planned end.
 */

export const STUDY_TIME_MINIMUM_MINUTES = 1;
export const STREAK_DAY_MINIMUM_MINUTES = 5;
export const CHECKIN_FINISH_GRACE_MS = 2 * 60 * 60 * 1000;

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

/** Full minutes from the check-in start through the planned end. Later time adds nothing. */
export function checkinCreditedMinutes(startedAt: Date, expiresAt: Date, finishedAt: Date): number {
  const planned = Math.floor((expiresAt.getTime() - startedAt.getTime()) / 60_000);
  const creditEnd = Math.min(finishedAt.getTime(), expiresAt.getTime());
  const elapsed = Math.floor(Math.max(0, creditEnd - startedAt.getTime()) / 60_000);
  return Math.min(Math.max(0, planned), Math.max(0, elapsed));
}

export function chicagoCampusDate(instant: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CAMPUS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const read = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${read("year")}-${read("month")}-${read("day")}`;
}

export type OpenCheckin = {
  id: string;
  userId: string;
  startedAt: string;
  expiresAt: string;
  checkedOutAt: string | null;
};

export type PersonalStudyRecord = {
  checkinId: string;
  userId: string;
  creditedMinutes: number;
  countsTowardStats: boolean;
  campusDate: string;
  startedAt: string;
  finishedAt: string;
};

export class StudyRuleError extends Error {
  readonly code: "NOT_FOUND" | "CONFLICT";

  constructor(code: "NOT_FOUND" | "CONFLICT", message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * Same rules as finish_checkin_study: one record per check-in, server clock,
 * and no credit after the planned end. A second finish returns the stored record.
 */
export function applyCheckinFinish(
  checkins: readonly OpenCheckin[],
  records: readonly PersonalStudyRecord[],
  checkinId: string,
  userId: string,
  now: Date,
): { checkins: OpenCheckin[]; records: PersonalStudyRecord[]; record: PersonalStudyRecord } {
  const existing = records.find((record) => record.checkinId === checkinId && record.userId === userId);
  if (existing) {
    return { checkins: checkins.map((checkin) => ({ ...checkin })), records: records.map((record) => ({ ...record })), record: existing };
  }
  const checkin = checkins.find((item) => item.id === checkinId && item.userId === userId);
  if (!checkin) throw new StudyRuleError("NOT_FOUND", "check-in not found");
  if (checkin.checkedOutAt) throw new StudyRuleError("CONFLICT", "that check-in was ended without a study record");
  const expiresAt = new Date(checkin.expiresAt);
  if (now.getTime() > expiresAt.getTime() + CHECKIN_FINISH_GRACE_MS) {
    throw new StudyRuleError("CONFLICT", "the finish window has closed");
  }
  const startedAt = new Date(checkin.startedAt);
  const credited = checkinCreditedMinutes(startedAt, expiresAt, now);
  const record: PersonalStudyRecord = {
    checkinId,
    userId,
    creditedMinutes: credited,
    countsTowardStats: credited >= STUDY_TIME_MINIMUM_MINUTES,
    campusDate: chicagoCampusDate(startedAt),
    startedAt: checkin.startedAt,
    finishedAt: now.toISOString(),
  };
  return {
    checkins: checkins.map((item) => (item.id === checkinId ? { ...item, checkedOutAt: now.toISOString() } : { ...item })),
    records: [...records.map((item) => ({ ...item })), record],
    record,
  };
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
