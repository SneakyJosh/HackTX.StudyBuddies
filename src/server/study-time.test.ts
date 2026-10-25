import assert from "node:assert/strict";
import test from "node:test";

import { VALIDATION } from "#api";

import {
  creditedMinutes,
  dayQualifies,
  minutesOnDay,
  streakLength,
  totalStudyMinutes,
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

test("a gap ends the streak and yesterday can anchor it", () => {
  const credits = [completed(TODAY, 5), completed("2026-10-23", 5)];
  assert.equal(streakLength(credits, TODAY), 1);
  const throughYesterday = [completed(YESTERDAY, 3), completed(YESTERDAY, 2), completed("2026-10-23", 5)];
  assert.equal(streakLength(throughYesterday, TODAY), 2);
});
