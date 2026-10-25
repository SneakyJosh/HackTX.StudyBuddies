import { allowList } from "./cohort.mjs";
import { DEMO_COHORT, PROTECTED_EMAILS, serviceClient, throwOn } from "./guard.mjs";

export async function listAuthUsers(env, service) {
  const users = [];
  for (let page = 1; page < 50; page += 1) {
    const listed = await service.auth.admin.listUsers({ page, perPage: 200 });
    throwOn(env, listed.error, "list auth users");
    const batch = listed.data?.users ?? [];
    users.push(...batch);
    if (batch.length < 200) break;
  }
  return users;
}

export function assertCohortIdentity(users) {
  const allow = new Set(allowList());
  const tagged = users.filter((user) => user.app_metadata?.demoCohort === DEMO_COHORT);
  if (tagged.length > 25) throw new Error("Refusing to continue. The demo tag is on more than 25 auth users.");
  for (const user of tagged) {
    const email = user.email ?? "";
    if (PROTECTED_EMAILS.includes(email)) {
      throw new Error("Refusing to continue. A preserved test account is tagged as demo data. Nothing was changed.");
    }
    if (!allow.has(email)) {
      throw new Error(`Refusing to continue. ${email} carries the demo tag but is not in the synthetic allow-list. Nothing was changed.`);
    }
  }
  return tagged;
}

export async function taggedCohort(env) {
  const service = serviceClient(env);
  const tagged = assertCohortIdentity(await listAuthUsers(env, service));
  return { service, tagged };
}
