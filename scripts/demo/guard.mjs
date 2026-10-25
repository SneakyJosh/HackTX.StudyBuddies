import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const EXPECTED_PROJECT_REF = "pmzxxdbdvqdnlmecsgcn";
export const DEMO_COHORT = "hackathon-2026";
export const PROTECTED_EMAILS = [
  "demo-student-a@studysync.example",
  "demo-student-b@studysync.example",
];

export function isDirectRun(metaUrl) {
  const entry = process.argv[1];
  if (!entry) return false;
  const expected = fileURLToPath(metaUrl);
  const actual = path.resolve(entry);
  return process.platform === "win32" ? actual.toLowerCase() === expected.toLowerCase() : actual === expected;
}

function findRefFile() {
  const starts = [process.cwd()];
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let hop = 0; hop < 4; hop += 1) {
    starts.push(dir);
    dir = path.dirname(dir);
  }
  const candidates = [];
  for (const start of starts) {
    let current = start;
    for (let hop = 0; hop < 6; hop += 1) {
      candidates.push(path.join(current, "supabase", ".temp", "project-ref"));
      candidates.push(path.join(current, "hackathon-backend", "supabase", ".temp", "project-ref"));
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

export function redact(env, value) {
  let text = String(value);
  for (const secret of [env?.serviceKey, env?.anonKey, env?.password]) {
    if (secret && secret.length > 0) text = text.split(secret).join("[redacted]");
  }
  return text;
}

export function readConfirmedEnv(argv) {
  const flags = argv.filter((arg) => arg.startsWith("--confirm-project="));
  if (flags.length !== 1 || flags[0] !== `--confirm-project=${EXPECTED_PROJECT_REF}`) {
    throw new Error(
      `Refusing to continue. Re-run with --confirm-project=${EXPECTED_PROJECT_REF} and only against that linked project.`,
    );
  }
  const refFile = findRefFile();
  if (!refFile) {
    throw new Error("Refusing to continue. The linked supabase/.temp/project-ref file was not found. Run from the linked backend checkout.");
  }
  const linked = readFileSync(refFile, "utf8").trim();
  if (linked !== EXPECTED_PROJECT_REF) {
    throw new Error("Refusing to continue. The linked project does not match the confirmed StudySync dev project.");
  }
  const url = process.env.SUPABASE_URL ?? "";
  const anonKey = process.env.SUPABASE_ANON_KEY ?? "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const password = process.env.DEMO_PASSWORD ?? "";
  if (url !== `https://${EXPECTED_PROJECT_REF}.supabase.co`) {
    throw new Error("Refusing to continue. SUPABASE_URL must be the confirmed project URL.");
  }
  if (!anonKey || !serviceKey) {
    throw new Error("Refusing to continue. SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY must be set in the environment.");
  }
  if (password.length < 12 || /\s/.test(password)) {
    throw new Error("Refusing to continue. DEMO_PASSWORD must be at least 12 characters and contain no whitespace.");
  }
  return { url, anonKey, serviceKey, password, ref: linked };
}

export function serviceClient(env) {
  return createClient(env.url, env.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function withUser(env, email, fn) {
  if (PROTECTED_EMAILS.includes(email)) throw new Error("Refusing to sign in as a preserved test account.");
  const client = createClient(env.url, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signed = await client.auth.signInWithPassword({ email, password: env.password });
  if (signed.error || !signed.data.session || !signed.data.user) {
    throw new Error(`Sign-in failed for ${email}: ${redact(env, signed.error?.message ?? "no session")}`);
  }
  try {
    return await fn(client, signed.data.user);
  } finally {
    await client.auth.signOut();
  }
}

export function throwOn(env, error, context) {
  if (!error) return;
  throw new Error(`${context}: ${redact(env, error.message ?? "request failed")}`);
}
