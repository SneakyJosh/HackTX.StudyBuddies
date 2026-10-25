import { assertCohortIdentity, listAuthUsers } from "./accounts.mjs";
import { isDirectRun, readConfirmedEnv, serviceClient, throwOn } from "./guard.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertIds(ids) {
  if (!ids.every((id) => UUID.test(id))) throw new Error("Refusing an unexpected id. Nothing was deleted.");
  return ids;
}

async function rows(env, service, table, columns, filter) {
  let query = service.from(table).select(columns);
  query = filter(query);
  const result = await query;
  throwOn(env, result.error, `read ${table}`);
  return result.data ?? [];
}

function outsiders(records, columns, allowed) {
  for (const record of records) {
    for (const column of columns) {
      const value = record[column];
      if (value && !allowed.has(value)) return true;
    }
  }
  return false;
}

async function cleanup(env) {
  const service = serviceClient(env);
  const tagged = assertCohortIdentity(await listAuthUsers(env, service));
  if (tagged.length === 0) {
    console.log("No hackathon-2026 auth users. No rows were deleted.");
    return;
  }
  const ids = assertIds(tagged.map((user) => user.id));
  const allowed = new Set(ids);
  const orList = ids.join(",");
  const requests = await rows(env, service, "study_requests", "id,sender_id,recipient_id", (query) =>
    query.or(`sender_id.in.(${orList}),recipient_id.in.(${orList})`),
  );
  const blocks = await rows(env, service, "blocks", "blocker_id,blocked_id", (query) =>
    query.or(`blocker_id.in.(${orList}),blocked_id.in.(${orList})`),
  );
  const reports = await rows(env, service, "reports", "id,reporter_id,reported_id", (query) =>
    query.or(`reporter_id.in.(${orList}),reported_id.in.(${orList})`),
  );
  const hosted = await rows(env, service, "study_sessions", "id,host_id", (query) => query.in("host_id", ids));
  const joined = await rows(env, service, "study_session_participants", "session_id,user_id", (query) => query.in("user_id", ids));
  const sessionIds = assertIds([...new Set([...hosted.map((row) => row.id), ...joined.map((row) => row.session_id)])]);
  const sessions = sessionIds.length === 0 ? [] : await rows(env, service, "study_sessions", "id,host_id", (query) => query.in("id", sessionIds));
  const participants = sessionIds.length === 0 ? [] : await rows(env, service, "study_session_participants", "session_id,user_id", (query) => query.in("session_id", sessionIds));
  const commitments = sessionIds.length === 0 ? [] : await rows(env, service, "study_session_commitments", "session_id,user_id", (query) => query.in("session_id", sessionIds));
  const attendance = sessionIds.length === 0 ? [] : await rows(env, service, "study_session_attendance", "session_id,user_id", (query) => query.in("session_id", sessionIds));
  const ratings = sessionIds.length === 0 ? [] : await rows(env, service, "study_session_ratings", "session_id,rater_id,subject_user_id", (query) => query.in("session_id", sessionIds));
  const raterRatings = await rows(env, service, "study_session_ratings", "session_id,rater_id,subject_user_id", (query) => query.in("rater_id", ids));
  const checkins = await rows(env, service, "checkins", "id,user_id", (query) => query.in("user_id", ids));
  const records = await rows(env, service, "checkin_study_records", "checkin_id,user_id", (query) => query.in("user_id", ids));
  const recordIds = records.map((row) => row.checkin_id);
  const personalRatings = recordIds.length === 0 ? [] : await rows(env, service, "checkin_study_ratings", "checkin_id,rater_id", (query) => query.in("checkin_id", recordIds));
  const courses = await rows(env, service, "profile_courses", "user_id,course_id", (query) => query.in("user_id", ids));
  const closed = [
    [requests, ["sender_id", "recipient_id"]],
    [blocks, ["blocker_id", "blocked_id"]],
    [reports, ["reporter_id", "reported_id"]],
    [sessions, ["host_id"]],
    [participants, ["user_id"]],
    [commitments, ["user_id"]],
    [attendance, ["user_id"]],
    [ratings, ["rater_id", "subject_user_id"]],
    [raterRatings, ["rater_id", "subject_user_id"]],
    [checkins, ["user_id"]],
    [records, ["user_id"]],
    [personalRatings, ["rater_id"]],
    [courses, ["user_id"]],
  ];
  if (closed.some(([recordsInSet, columns]) => outsiders(recordsInSet, columns, allowed))) {
    throw new Error("Refusing to clean up. A demo row touches someone outside the synthetic cohort. Nothing was deleted.");
  }
  if (raterRatings.some((row) => !sessionIds.includes(row.session_id))) {
    throw new Error("Refusing to clean up. A demo rating is attached to a session outside the cohort. Nothing was deleted.");
  }

  async function remove(table, column, values) {
    if (values.length === 0) return;
    throwOn(env, (await service.from(table).delete().in(column, assertIds(values))).error, `delete ${table}`);
  }
  await remove("checkin_study_ratings", "checkin_id", recordIds);
  await remove("checkin_study_records", "checkin_id", recordIds);
  await remove("study_session_ratings", "session_id", sessionIds);
  await remove("study_session_attendance", "session_id", sessionIds);
  await remove("study_session_commitments", "session_id", sessionIds);
  await remove("study_session_participants", "session_id", sessionIds);
  await remove("study_sessions", "id", sessionIds);
  await remove("study_requests", "id", requests.map((row) => row.id));
  await remove("blocks", "blocker_id", blocks.map((row) => row.blocker_id));
  await remove("reports", "id", reports.map((row) => row.id));
  await remove("checkins", "id", checkins.map((row) => row.id));
  if (courses.length > 0) throwOn(env, (await service.from("profile_courses").delete().in("user_id", ids)).error, "delete profile courses");
  for (const user of tagged) {
    throwOn(env, (await service.auth.admin.deleteUser(user.id)).error, `delete auth user ${user.email}`);
    console.log(`Deleted auth user ${user.email}.`);
  }
  console.log(`Cleanup removed ${tagged.length} hackathon-2026 auth users and their demo rows. Catalog data and other accounts were not changed.`);
}

if (isDirectRun(import.meta.url)) {
  cleanup(readConfirmedEnv(process.argv)).catch((error) => {
    const message = error instanceof Error ? error.message : "cleanup failed";
    console.error(`${message} Cleanup stopped before it could finish. Running it again still deletes only the tagged cohort.`);
    process.exitCode = 1;
  });
}
