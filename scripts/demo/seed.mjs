import { assertCohortIdentity, listAuthUsers } from "./accounts.mjs";
import { buildPlan, connectCandidates, COURSES, expectedFriends, LOCATIONS, rosterFor, UNIVERSITY_ID } from "./cohort.mjs";
import { isDirectRun, PROTECTED_EMAILS, readConfirmedEnv, serviceClient, throwOn, withUser } from "./guard.mjs";
import { assertDemoSchema } from "./schema.mjs";

async function rpc(env, client, name, args) {
  const result = await client.rpc(name, args);
  throwOn(env, result.error, name);
  return result.data;
}

function asList(value) {
  if (typeof value === "string") return JSON.parse(value);
  return value ?? [];
}

async function requireFreshCohort(env, plan) {
  const service = serviceClient(env);
  await assertDemoSchema(env, service);
  const users = await listAuthUsers(env, service);
  assertCohortIdentity(users);
  const byEmail = new Map(users.map((user) => [user.email, user]));
  for (const person of plan.people) {
    const user = byEmail.get(person.email);
    if (!user || user.id !== person.id || user.app_metadata?.demoCohort !== "hackathon-2026") {
      throw new Error(`Missing demo auth account for ${person.email}. Run create-users first. No profile data was written.`);
    }
  }
  const existing = await service.from("profiles").select("id").in("id", plan.people.map((person) => person.id));
  throwOn(env, existing.error, "check existing demo profiles");
  if ((existing.data ?? []).length > 0) {
    throw new Error("Demo profiles already exist. Refusing to seed again. Run cleanup before a fresh seed.");
  }
  return { service, users };
}

async function saveProfiles(env, plan) {
  for (const person of plan.people) {
    await withUser(env, person.email, async (client, user) => {
      if (user.id !== person.id) throw new Error(`Signed-in account did not match ${person.email}.`);
      await rpc(env, client, "save_profile", {
        p_display_name: person.name,
        p_university_id: UNIVERSITY_ID,
        p_major: person.major,
        p_academic_year: person.year,
        p_course_ids: person.courses.map((code) => COURSES[code]),
        p_study_style: person.style,
        p_preferred_duration_minutes: person.duration,
        p_preferred_group_size: person.groupSize,
        p_visible: person.visible,
      });
    });
  }
  console.log("Saved 20 profiles through save_profile.");
}

async function startCheckins(env, plan) {
  for (const person of plan.people.filter((candidate) => candidate.checkin)) {
    await withUser(env, person.email, async (client, user) => {
      if (user.id !== person.id) throw new Error(`Signed-in account did not match ${person.email}.`);
      await rpc(env, client, "replace_checkin", {
        p_location_id: LOCATIONS[person.checkin.location],
        p_course_id: COURSES[person.checkin.course],
        p_duration_minutes: person.checkin.duration,
        p_availability: person.checkin.availability,
        p_study_style: person.style,
      });
    });
  }
  console.log("Started 8 check-ins through replace_checkin.");
}

async function connectRequests(env, plan) {
  const sent = [];
  const bySender = new Map();
  for (const request of plan.requests) {
    const bucket = bySender.get(request.from) ?? [];
    bucket.push(request);
    bySender.set(request.from, bucket);
  }
  for (const [key, requests] of bySender) {
    const sender = plan.people.find((person) => person.key === key);
    await withUser(env, sender.email, async (client, user) => {
      if (user.id !== sender.id) throw new Error(`Signed-in account did not match ${sender.email}.`);
      for (const request of requests) {
        const recipient = plan.people.find((person) => person.key === request.to);
        const payload = await rpc(env, client, "send_study_request", { p_recipient_id: recipient.id });
        if (!payload?.id) throw new Error(`send_study_request did not return an id for ${sender.email}.`);
        sent.push({ ...request, id: payload.id });
      }
    });
  }
  const byRecipient = new Map();
  for (const request of sent.filter((request) => request.accept)) {
    const bucket = byRecipient.get(request.to) ?? [];
    bucket.push(request);
    byRecipient.set(request.to, bucket);
  }
  for (const [key, requests] of byRecipient) {
    const recipient = plan.people.find((person) => person.key === key);
    await withUser(env, recipient.email, async (client, user) => {
      if (user.id !== recipient.id) throw new Error(`Signed-in account did not match ${recipient.email}.`);
      for (const request of requests) {
        const updated = await client
          .from("study_requests")
          .update({ status: "accepted" })
          .eq("id", request.id)
          .eq("recipient_id", user.id)
          .select("id,status")
          .single();
        throwOn(env, updated.error, `accept request for ${recipient.email}`);
        if (updated.data?.status !== "accepted") throw new Error(`The recipient session did not accept a request for ${recipient.email}.`);
      }
    });
  }
  console.log("Created 12 accepted connections and left 2 requests pending.");
}

async function scheduleFuture(env, plan) {
  for (const item of plan.future) {
    const host = plan.people.find((person) => person.key === item.host);
    await withUser(env, host.email, async (client, user) => {
      if (user.id !== host.id) throw new Error(`Signed-in account did not match ${host.email}.`);
      const payload = await rpc(env, client, "create_study_session", {
        p_title: item.title,
        p_course_id: COURSES[item.course],
        p_location_id: LOCATIONS[item.location],
        p_local_date: item.localDate,
        p_local_time: item.localTime,
        p_duration_minutes: item.durationMinutes,
        p_visibility: item.visibility,
        p_seat_limit: item.seatLimit,
        p_invitee_ids: item.invitees.map((key) => plan.people.find((person) => person.key === key).id),
      });
      if (!payload?.id) throw new Error(`create_study_session did not return an id for ${item.title}.`);
    });
  }
  console.log("Scheduled 5 future groups through create_study_session.");
}

function historyShape(item) {
  const solo = item.participants.length === 1;
  return { visibility: solo ? "solo" : "open", seat_limit: solo ? 1 : item.participants.length };
}

async function insertBookedHistory(env, service, plan) {
  const people = new Map(plan.people.map((person) => [person.key, person]));
  const sprint = plan.liveSprint;
  const booked = [
    ...plan.history.map((item) => ({ ...item, ...historyShape(item), accepted: item.participants.map((row) => row.key) })),
    {
      id: sprint.id,
      host: sprint.host,
      course: sprint.course,
      location: sprint.location,
      title: sprint.title,
      visibility: sprint.visibility,
      seat_limit: sprint.seatLimit,
      startsAt: sprint.startsAt,
      endsAt: sprint.endsAt,
      accepted: sprint.accepted,
      participants: sprint.accepted.map((key) => ({
        key,
        role: key === sprint.host ? "host" : "joiner",
        status: "accepted",
      })),
    },
  ];
  const sessions = booked.map((item) => ({
    id: item.id,
    host_id: people.get(item.host).id,
    university_id: UNIVERSITY_ID,
    course_id: COURSES[item.course],
    location_id: LOCATIONS[item.location],
    title: item.title,
    visibility: item.visibility,
    seat_limit: item.seat_limit,
    starts_at: item.startsAt.toISOString(),
    ends_at: item.endsAt.toISOString(),
    status: "scheduled",
  }));
  throwOn(env, (await service.from("study_sessions").insert(sessions)).error, "insert booked sessions");
  const participants = booked.flatMap((item) =>
    item.participants.map((row) => ({
      session_id: item.id,
      user_id: people.get(row.key).id,
      role: row.role,
      status: "accepted",
    })),
  );
  throwOn(env, (await service.from("study_session_participants").insert(participants)).error, "insert booked participants");
  const commitments = booked.flatMap((item) =>
    item.accepted.map((key) => ({
      user_id: people.get(key).id,
      session_id: item.id,
      starts_at: item.startsAt.toISOString(),
      ends_at: item.endsAt.toISOString(),
    })),
  );
  throwOn(env, (await service.from("study_session_commitments").insert(commitments)).error, "insert commitments");
  const attendance = plan.history.flatMap((item) => {
    const personRow = (key) => people.get(key);
    return item.participants.map((row) => ({
      session_id: item.id,
      user_id: personRow(row.key).id,
      outcome: "completed",
      credited_minutes: row.creditedMinutes,
      counts_toward_stats: row.creditedMinutes >= 1,
      campus_date: item.campusDate,
      display_name: personRow(row.key).name,
      major: personRow(row.key).major,
      academic_year: personRow(row.key).year,
      roster: rosterFor(item, plan.people),
    }));
  });
  throwOn(env, (await service.from("study_session_attendance").insert(attendance)).error, "insert attendance");
  console.log("Inserted 8 completed sessions, 12 attendance rows, and the in-progress PCL sprint.");
}

async function submitRatings(env, plan) {
  for (const item of plan.history) {
    for (const row of item.participants) {
      if (row.studyTime === null) continue;
      const rater = plan.people.find((person) => person.key === row.key);
      await withUser(env, rater.email, async (client, user) => {
        if (user.id !== rater.id) throw new Error(`Signed-in account did not match ${rater.email}.`);
        await rpc(env, client, "submit_study_ratings", {
          p_session_id: item.id,
          p_study_time: row.studyTime,
          p_environment: row.environment,
          p_chemistry: row.chemistry.map((rating) => ({
            userId: plan.people.find((person) => person.key === rating.key).id,
            stars: rating.stars,
          })),
        });
      });
    }
  }
  console.log("Submitted private ratings through submit_study_ratings.");
}

async function verifyDemo(env, service, users, plan) {
  const avery = plan.people.find((person) => person.key === "avery");
  const riley = plan.people.find((person) => person.key === "riley");
  const marcus = plan.people.find((person) => person.key === "marcus");
  await withUser(env, avery.email, async (client, user) => {
    if (user.id !== avery.id) throw new Error("Verification signed in as the wrong account.");
    const matches = asList(await rpc(env, client, "discovery_candidates", { p_location_id: null, p_course_id: null }));
    const expected = connectCandidates("avery", plan);
    if (matches.length !== expected.length) throw new Error(`Connect returned ${matches.length} students, expected ${expected.length}.`);
    for (const row of expected) {
      const found = matches.find((match) => match.user?.id?.toLowerCase() === row.person.id);
      if (!found || Number(found.compatibilityScore) !== row.compatibilityScore) {
        throw new Error(`Compatibility score mismatch for ${row.person.name}.`);
      }
    }
    const names = matches.map((match) => match.user.displayName);
    if (names.includes("Sam Patel") || names.includes("Jonah Blake")) throw new Error("A focused or hidden student appeared in Connect.");
    const friends = asList(await rpc(env, client, "list_studying_connections"));
    const friendIds = new Set(friends.map((row) => row.user.id.toLowerCase()));
    for (const friend of expectedFriends(plan, "avery")) {
      if (!friendIds.has(friend.id)) throw new Error(`Friends studying now is missing ${friend.name}.`);
    }
    if (friendIds.has(marcus.id) || friendIds.size !== expectedFriends(plan, "avery").length) {
      throw new Error("Friends studying now includes a student who should only be a suggestion.");
    }
    const stats = await rpc(env, client, "study_self_report");
    if (Number(stats?.streakDays) !== 6) throw new Error(`Expected Avery's streak to be 6 days, saw ${stats?.streakDays}.`);
    const records = asList(await rpc(env, client, "list_study_records", { p_outcome: "completed" }));
    if (records.length !== 6 || JSON.stringify(records).includes("@")) throw new Error("Avery's private history did not validate.");
    if (records.filter((record) => (record.myRatings?.chemistry ?? []).length > 0).length !== 2) {
      throw new Error("Avery's chemistry ratings were not private to the expected sessions.");
    }
    const upcoming = asList(await rpc(env, client, "list_my_study_sessions", { p_when: "upcoming" }));
    if (!upcoming.some((session) => session.title === "PCL sprint")) throw new Error("Avery cannot see the in-progress sprint.");
  });
  await withUser(env, riley.email, async (client) => {
    const upcoming = asList(await rpc(env, client, "list_my_study_sessions", { p_when: "upcoming" }));
    const titles = upcoming.map((session) => session.title);
    if (!titles.includes("PCL sprint") || !titles.includes("BIO writeup")) throw new Error("Riley is missing the sprint or the invitation.");
    const open = asList(await rpc(env, client, "list_open_study_sessions", { p_course_id: null, p_today: false }));
    const openTitles = open.map((session) => session.title);
    if (!openTitles.includes("CS 314 problem set")) throw new Error("The open problem set is not visible.");
    if (openTitles.includes("BIO writeup") || openTitles.includes("Diagram review")) throw new Error("A private group appeared in the open list.");
    const records = asList(await rpc(env, client, "list_study_records", { p_outcome: "completed" }));
    if (records.length !== 1 || (records[0].myRatings?.chemistry ?? []).length !== 0) throw new Error("Riley's history is not limited to Riley's own unrated chemistry.");
  });
  const protectedIds = users.filter((user) => PROTECTED_EMAILS.includes(user.email ?? "")).map((user) => user.id);
  if (protectedIds.length > 0) {
    const requests = await service.from("study_requests").select("sender_id,recipient_id").or(`sender_id.in.(${protectedIds.join(",")}),recipient_id.in.(${protectedIds.join(",")})`);
    throwOn(env, requests.error, "check preserved accounts");
    const demoIds = new Set(plan.people.map((person) => person.id));
    for (const request of requests.data ?? []) {
      if (demoIds.has(request.sender_id) || demoIds.has(request.recipient_id)) {
        throw new Error("A demo connection touches a preserved test account.");
      }
    }
  }
  console.log("Verified Connect scores, privacy, Focused visibility, History, and group workflows.");
}

async function seed(env) {
  const plan = buildPlan(new Date());
  const { service, users } = await requireFreshCohort(env, plan);
  try {
    await saveProfiles(env, plan);
    await startCheckins(env, plan);
    await connectRequests(env, plan);
    await scheduleFuture(env, plan);
    await insertBookedHistory(env, service, plan);
    await submitRatings(env, plan);
    await verifyDemo(env, service, users, plan);
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : "Seed failed"} Seed stopped. No automatic rollback. Review the error, then run cleanup before trying again.`);
  }
  console.log("Demo seed completed and verified. No catalog rows were changed.");
}

if (isDirectRun(import.meta.url)) {
  seed(readConfirmedEnv(process.argv)).catch((error) => {
    console.error(error instanceof Error ? error.message : "seed failed");
    process.exitCode = 1;
  });
}
