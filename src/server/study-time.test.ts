import assert from "node:assert/strict";
import test from "node:test";

import { VALIDATION } from "#api";

import {
  CHECKIN_FINISH_GRACE_MS,
  applyCheckinFinish,
  checkinCreditedMinutes,
  chicagoCampusDate,
  creditedMinutes,
  dayQualifies,
  minutesOnDay,
  streakLength,
  totalStudyMinutes,
  StudyRuleError,
  type OpenCheckin,
  type StudyCredit,
} from "../lib/study-time.ts";

const TODAY = "2026-10-25";
const YESTERDAY = "2026-10-24";

function completed(campusDate: string, creditedMinutes: number, courseId?: string): StudyCredit {
  return { campusDate, creditedMinutes, outcome: "completed", courseId };
}

test("bookings stay 30 to 180 minutes while an early finish can credit 1 to 4", () => {
  assert.equal(VALIDATION.durationMinutes.min, 30);
  assert.equal(VALIDATION.durationMinutes.max, 180);
  assert.equal(creditedMinutes(30, 1, false), 1);
  assert.equal(creditedMinutes(30, 4, false), 4);
  assert.equal(creditedMinutes(30, 5, false), 5);
  assert.equal(creditedMinutes(90, 120, true), 90);
});

test("one credited minute counts toward study time and does not qualify a streak day", () => {
  const credits = [completed(TODAY, 1)];
  assert.equal(totalStudyMinutes(credits), 1);
  assert.equal(dayQualifies(credits, TODAY), false);
  assert.equal(streakLength(credits, TODAY), 0);
});

test("four credited minutes count toward study time and do not qualify a streak day", () => {
  const credits = [completed(TODAY, 4)];
  assert.equal(totalStudyMinutes(credits), 4);
  assert.equal(minutesOnDay(credits, TODAY), 4);
  assert.equal(streakLength(credits, TODAY), 0);
});

test("five credited minutes qualify that study day", () => {
  const credits = [completed(TODAY, 5)];
  assert.equal(totalStudyMinutes(credits), 5);
  assert.equal(dayQualifies(credits, TODAY), true);
  assert.equal(streakLength(credits, TODAY), 1);
});

test("sessions on the same day combine toward the 5-minute streak", () => {
  const credits = [completed(TODAY, 4), completed(TODAY, 1)];
  assert.equal(totalStudyMinutes(credits), 5);
  assert.equal(minutesOnDay(credits, TODAY), 5);
  assert.equal(streakLength(credits, TODAY), 1);
});

test("sessions on different days do not combine toward one streak day", () => {
  const credits = [completed(TODAY, 4), completed(YESTERDAY, 1)];
  assert.equal(totalStudyMinutes(credits), 5);
  assert.equal(dayQualifies(credits, TODAY), false);
  assert.equal(dayQualifies(credits, YESTERDAY), false);
  assert.equal(streakLength(credits, TODAY), 0);
});

test("missed sessions and zero-minute finishes add no study time", () => {
  const credits = [
    { campusDate: TODAY, creditedMinutes: 30, outcome: "missed" as const },
    completed(TODAY, 0),
  ];
  assert.equal(totalStudyMinutes(credits), 0);
  assert.equal(streakLength(credits, TODAY), 0);
});

test("a booking and a personal check-in on the same day combine", () => {
  const credits = [completed(TODAY, 4, "course-1"), completed(TODAY, 1, "course-1")];
  assert.equal(totalStudyMinutes(credits), 5);
  assert.equal(minutesOnDay(credits, TODAY, "course-1"), 5);
  assert.equal(streakLength(credits, TODAY), 1);
  assert.equal(streakLength(credits, TODAY, "course-1"), 1);
});

test("check-in credit is 0, 1, 4, or 5 elapsed minutes and stops at expiry", () => {
  const started = new Date("2026-10-25T15:00:00.000Z");
  const expires = new Date(started.getTime() + 30 * 60_000);
  assert.equal(checkinCreditedMinutes(started, expires, new Date(started.getTime() + 59_000)), 0);
  assert.equal(checkinCreditedMinutes(started, expires, new Date(started.getTime() + 60_000)), 1);
  assert.equal(checkinCreditedMinutes(started, expires, new Date(started.getTime() + 4 * 60_000)), 4);
  assert.equal(checkinCreditedMinutes(started, expires, new Date(started.getTime() + 5 * 60_000)), 5);
  assert.equal(checkinCreditedMinutes(started, expires, new Date(started.getTime() + 90 * 60_000)), 30);
});

test("a check-in that crosses midnight keeps the Chicago start date", () => {
  const started = new Date("2026-10-26T04:50:00.000Z");
  const expires = new Date(started.getTime() + 30 * 60_000);
  const finished = new Date("2026-10-26T05:10:00.000Z");
  assert.equal(chicagoCampusDate(started), "2026-10-25");
  assert.equal(chicagoCampusDate(finished), "2026-10-26");
  assert.equal(checkinCreditedMinutes(started, expires, finished), 20);
  const checkin: OpenCheckin = {
    id: "checkin-1",
    userId: "student-1",
    startedAt: started.toISOString(),
    expiresAt: expires.toISOString(),
    checkedOutAt: null,
  };
  const first = applyCheckinFinish([checkin], [], checkin.id, checkin.userId, finished);
  assert.equal(first.record.campusDate, "2026-10-25");
  assert.equal(first.record.creditedMinutes, 20);
  assert.equal(first.records.length, 1);
  const bookings = [{ id: "booking-1", status: "scheduled" }];
  assert.deepEqual(bookings, [{ id: "booking-1", status: "scheduled" }]);
});

test("repeated finishes do not add minutes and a closed window records nothing", () => {
  const started = new Date("2026-10-25T15:00:00.000Z");
  const expires = new Date(started.getTime() + 30 * 60_000);
  const checkin: OpenCheckin = {
    id: "checkin-1",
    userId: "student-1",
    startedAt: started.toISOString(),
    expiresAt: expires.toISOString(),
    checkedOutAt: null,
  };
  const first = applyCheckinFinish([checkin], [], checkin.id, checkin.userId, new Date(started.getTime() + 5 * 60_000));
  const second = applyCheckinFinish(first.checkins, first.records, checkin.id, checkin.userId, new Date(started.getTime() + 20 * 60_000));
  assert.equal(second.records.length, 1);
  assert.equal(second.record.creditedMinutes, 5);
  assert.equal(second.record.finishedAt, first.record.finishedAt);
  const dismissed = { ...checkin, id: "checkin-2", checkedOutAt: started.toISOString() };
  assert.throws(
    () => applyCheckinFinish([dismissed], [], dismissed.id, dismissed.userId, new Date(started.getTime() + 10 * 60_000)),
    (error: unknown) => error instanceof StudyRuleError && error.code === "CONFLICT",
  );
  assert.throws(
    () => applyCheckinFinish([checkin], [], checkin.id, checkin.userId, new Date(expires.getTime() + CHECKIN_FINISH_GRACE_MS + 1)),
    (error: unknown) => error instanceof StudyRuleError && error.message === "the finish window has closed",
  );
  const atGraceEnd = applyCheckinFinish([checkin], [], checkin.id, checkin.userId, new Date(expires.getTime() + CHECKIN_FINISH_GRACE_MS));
  assert.equal(atGraceEnd.record.creditedMinutes, 30);
});

test("a gap ends the streak and yesterday can anchor it", () => {
  const credits = [completed(TODAY, 5), completed("2026-10-23", 5)];
  assert.equal(streakLength(credits, TODAY), 1);
  const throughYesterday = [completed(YESTERDAY, 3), completed(YESTERDAY, 2), completed("2026-10-23", 5)];
  assert.equal(streakLength(throughYesterday, TODAY), 2);
});
