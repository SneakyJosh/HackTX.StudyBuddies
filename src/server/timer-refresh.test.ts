import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("a participant join does not change credited minutes, and a refresh keeps the timer", () => {
  const sessions = readFileSync("supabase/migrations/0003_study_sessions.sql", "utf8");
  const joinStart = sessions.indexOf("function public.request_join_study_session");
  const respondStart = sessions.indexOf("function public.respond_study_session_join");
  const leaveStart = sessions.indexOf("function public.leave_study_session");
  const join = sessions.slice(joinStart, respondStart);
  const respond = sessions.slice(respondStart, leaveStart);
  assert.equal(join.includes("credited_minutes"), false);
  assert.equal(join.includes("checkins"), false);
  assert.equal(join.includes("study_session_attendance"), false);
  assert.equal(respond.includes("credited_minutes"), false);
  assert.equal(respond.includes("checkins"), false);
  assert.equal(respond.includes("study_session_attendance"), false);

  const finish = readFileSync("supabase/migrations/0006_study_time_streak_days.sql", "utf8");
  const finishStart = finish.indexOf("function public.finish_study_session");
  const finishBody = finish.slice(finishStart, finish.indexOf("function public.study_day_minutes"));
  assert.match(finishBody, /credited := least\(booked_minutes, elapsed_minutes\)/);
  assert.equal(finishBody.includes("seat_limit"), false);
  assert.equal(finishBody.includes("participant count"), false);

  const stats = readFileSync("supabase/migrations/0007_checkin_study_records.sql", "utf8");
  const reportStart = stats.indexOf("function public.study_self_report");
  const report = stats.slice(reportStart, stats.indexOf("revoke all on function public.enforce_checkin_study_record"));
  assert.match(report, /where a\.user_id = uid and a\.counts_toward_stats/);
  assert.match(report, /where r\.user_id = uid and r\.counts_toward_stats/);
  assert.equal(report.includes("study_session_participants"), false);

  for (const file of [
    "src/components/sessions-board.tsx",
    "src/components/home-dashboard.tsx",
    "src/components/study-stats-card.tsx",
    "src/components/focus-sheet.tsx",
  ]) {
    const source = readFileSync(file, "utf8");
    const calls = source.split("\n").filter((line) => line.includes('setPhase("loading")'));
    assert.ok(calls.length > 0, file);
    for (const line of calls) assert.match(line, /if \(!\w+\.current\) setPhase\("loading"\)/, file);
  }
  const focus = readFileSync("src/components/focus-sheet.tsx", "utf8");
  assert.match(focus, /sameCheckin/);
});
