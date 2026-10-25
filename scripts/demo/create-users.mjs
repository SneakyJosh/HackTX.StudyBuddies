import { assertCohortIdentity, listAuthUsers } from "./accounts.mjs";
import { buildPlan } from "./cohort.mjs";
import { DEMO_COHORT, isDirectRun, readConfirmedEnv, serviceClient, throwOn } from "./guard.mjs";
import { assertDemoSchema } from "./schema.mjs";

async function createUsers(env) {
  const plan = buildPlan(new Date());
  const service = serviceClient(env);
  await assertDemoSchema(env, service);
  const all = new Map((await listAuthUsers(env, service)).map((user) => [user.email, user]));
  assertCohortIdentity([...all.values()]);
  let created = 0;
  let reused = 0;
  for (const person of plan.people) {
    const found = all.get(person.email);
    if (found) {
      if (found.app_metadata?.demoCohort !== DEMO_COHORT || found.id !== person.id) {
        throw new Error(`Refusing to continue. ${person.email} already exists and is not this demo cohort. Nothing else was created.`);
      }
      reused += 1;
      continue;
    }
    const result = await service.auth.admin.createUser({
      id: person.id,
      email: person.email,
      password: env.password,
      email_confirm: true,
      app_metadata: { demoCohort: DEMO_COHORT },
    });
    throwOn(env, result.error, `create ${person.email}`);
    if (result.data.user?.id !== person.id || result.data.user.app_metadata?.demoCohort !== DEMO_COHORT) {
      throw new Error(`Auth did not keep the demo id and cohort tag for ${person.email}. Stop and run cleanup before retrying.`);
    }
    created += 1;
    console.log(`created ${person.email}`);
  }
  console.log(`Demo auth accounts are ready. Created ${created}, reused ${reused}. No profiles were written.`);
}

if (isDirectRun(import.meta.url)) {
  createUsers(readConfirmedEnv(process.argv)).catch((error) => {
    console.error(error instanceof Error ? error.message : "create-users failed");
    process.exitCode = 1;
  });
}
