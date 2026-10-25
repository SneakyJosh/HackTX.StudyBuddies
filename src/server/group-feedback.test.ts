import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  GROUP_FINISH_GRACE_MS,
  canFinishGroupSession,
  chemistryQuestions,
  ratingsForAuthor,
  type GroupSessionRef,
} from "../lib/group-feedback.ts";

const START = "2026-10-25T15:00:00.000Z";
const END = "2026-10-25T16:00:00.000Z";
const DURING = Date.parse("2026-10-25T15:30:00.000Z");
const BEFORE = Date.parse("2026-10-25T14:59:00.000Z");
const WITHIN_GRACE = Date.parse(END) + GROUP_FINISH_GRACE_MS;
const AFTER_GRACE = WITHIN_GRACE + 1;

function session(role: string, status: string): GroupSessionRef {
  return { id: "session-1", myRole: role, myStatus: status, startsAt: START, endsAt: END };
}

test("host and accepted guest can finish a group session, and a request cannot", () => {
  assert.equal(canFinishGroupSession(session("host", "accepted"), DURING), true);
  assert.equal(canFinishGroupSession(session("joiner", "accepted"), DURING), true);
  assert.equal(canFinishGroupSession(session("invitee", "accepted"), DURING), true);
  assert.equal(canFinishGroupSession(session("joiner", "requested"), DURING), false);
  assert.equal(canFinishGroupSession(session("joiner", "invited"), DURING), false);
  assert.equal(canFinishGroupSession(session("joiner", "accepted"), BEFORE), false);
  assert.equal(canFinishGroupSession(session("host", "accepted"), BEFORE), false);
  assert.equal(canFinishGroupSession(session("joiner", "accepted"), WITHIN_GRACE), true);
  assert.equal(canFinishGroupSession(session("joiner", "accepted"), AFTER_GRACE), false);
});

test("chemistry questions name each other accepted participant on that student's roster", () => {
  const guestRoster = [
    { id: "host-a", displayName: "Avery" },
    { id: "guest-c", displayName: "Casey" },
  ];
  const hostRoster = [
    { id: "guest-b", displayName: "Blair" },
    { id: "guest-c", displayName: "Casey" },
  ];
  assert.deepEqual(
    chemistryQuestions(guestRoster).map((question) => question.label),
    ["How well did you study with Avery?", "How well did you study with Casey?"],
  );
  assert.deepEqual(
    chemistryQuestions(hostRoster).map((question) => question.userId),
    ["guest-b", "guest-c"],
  );
  assert.deepEqual(chemistryQuestions([]), []);
});

test("a student sees only ratings they authored", () => {
  const rows = [
    { raterId: "student-a", subjectUserId: "student-b", stars: 5 },
    { raterId: "student-b", subjectUserId: "student-a", stars: 2 },
  ];
  assert.deepEqual(ratingsForAuthor("student-a", rows), [rows[0]]);
  assert.deepEqual(ratingsForAuthor("student-b", rows), [rows[1]]);
});

test("group finish opens the booking survey for host and guest, and a personal check-in does not invent partners", () => {
  const board = readFileSync("src/components/sessions-board.tsx", "utf8");
  assert.match(board, /const tick = \(\) => setAsOf\(Date\.now\(\)\)/);
  assert.match(board, /window\.setInterval\(tick, 1000\)/);
  assert.match(board, /onFinished=\{setRating\}/);
  assert.match(board, /onGroupFinished=\{setRating\}/);
  assert.match(board, /groupSession: \{/);
  assert.match(board, /if \(action === "finish"\) onFinished\(result\.data\)/);
  assert.match(board, /Finish group session/);

  const focus = readFileSync("src/components/focus-sheet.tsx", "utf8");
  const personalFinish = focus.slice(focus.indexOf("async function finish("), focus.indexOf("async function finishGroup("));
  assert.match(personalFinish, /postFinishCheckin\(active\.id\)/);
  assert.equal(personalFinish.includes("onGroupFinished"), false);
  assert.equal(personalFinish.includes("postFinish("), false);
  assert.match(focus, /const result = await postFinish\(groupSession\.id\)/);
  assert.match(focus, /onGroupFinished\(result\.data\)/);
  assert.match(focus, /Finish group session/);

  const feedback = readFileSync("src/components/study-feedback.tsx", "utf8");
  const checkinFeedback = feedback.slice(feedback.indexOf("export function CheckinFeedback"));
  assert.equal(checkinFeedback.includes("How well did you study with"), false);
  assert.equal(checkinFeedback.includes("participants"), false);

  const history = readFileSync("src/components/session-history.tsx", "utf8");
  assert.match(history, /chemistryQuestions\(record\.participants\)/);
  assert.match(history, /onClick=\{\(\) => setRating\(card\.record\)\}/);
  assert.match(history, /onClick=\{onClose\}/);
  assert.match(history, />\s*Skip\s*</);

  const record = readFileSync("supabase/migrations/0005_study_history.sql", "utf8");
  const payload = record.slice(record.indexOf("function public.study_record_payload"), record.indexOf("function public.assert_session_recorder"));
  assert.match(payload, /person->>'id' <> uid::text/);
  assert.match(payload, /r\.rater_id = uid and r\.category = 'chemistry'/);

  const finish = readFileSync("supabase/migrations/0006_study_time_streak_days.sql", "utf8");
  const finishBody = finish.slice(finish.indexOf("function public.finish_study_session"), finish.indexOf("function public.study_day_minutes"));
  assert.match(finishBody, /participant\.status = 'accepted'/);
  assert.equal(finishBody.includes("participant.role = 'host'"), false);
  assert.match(finishBody, /return public\.study_record_payload\(s\.id, uid\)/);
});
