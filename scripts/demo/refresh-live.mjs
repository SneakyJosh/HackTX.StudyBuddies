import { assertCohortIdentity, listAuthUsers } from "./accounts.mjs";
import { buildPlan, COURSES, LOCATIONS } from "./cohort.mjs";
import { isDirectRun, readConfirmedEnv, serviceClient, throwOn, withUser } from "./guard.mjs";
import { assertDemoSchema } from "./schema.mjs";

async function refreshLive(env) {
  const plan = buildPlan(new Date());
  const service = serviceClient(env);
  await assertDemoSchema(env, service);
  const byEmail = new Map((await listAuthUsers(env, service)).map((user) => [user.email, user]));
  assertCohortIdentity([...byEmail.values()]);
  const live = plan.people.filter((person) => person.checkin);
  for (const person of live) {
    const account = byEmail.get(person.email);
    if (!account || account.id !== person.id) throw new Error(`Cannot refresh ${person.email}. The demo auth account is missing.`);
    await withUser(env, person.email, async (client, user) => {
      if (user.id !== person.id) throw new Error(`Signed-in account did not match ${person.email}.`);
      const result = await client.rpc("replace_checkin", {
        p_location_id: LOCATIONS[person.checkin.location],
        p_course_id: COURSES[person.checkin.course],
        p_duration_minutes: person.checkin.duration,
        p_availability: person.checkin.availability,
        p_study_style: person.style,
      });
      throwOn(env, result.error, `refresh ${person.email}`);
    });
    console.log(`Refreshed the check-in for ${person.name}.`);
  }
  console.log("Refreshed 8 demo-owned check-ins. Sessions, requests, catalog rows, and other accounts were not changed.");
}

if (isDirectRun(import.meta.url)) {
  refreshLive(readConfirmedEnv(process.argv)).catch((error) => {
    console.error(error instanceof Error ? error.message : "refresh failed");
    process.exitCode = 1;
  });
}
