import { DEMO_ACCOUNTS } from "@/types/api";
import { getBrowserSupabase } from "@/lib/browser-supabase";

type SessionSnapshot = {
  userId: string | null;
  email: string | null;
  revision: number;
};

let userId: string | null = null;
let email: string | null = null;
let revision = 0;
const listeners = new Set<() => void>();

export function getSessionSnapshot(): SessionSnapshot {
  return { userId, email, revision };
}

export function subscribeSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit(): void {
  for (const listener of listeners) listener();
}

/** Remember the verified auth user. Does not store tokens. */
export function noteAuthenticatedUser(nextUserId: string | null, nextEmail: string | null): void {
  if (userId === nextUserId && email === nextEmail) return;
  userId = nextUserId;
  email = nextEmail;
  revision += 1;
  emit();
}

/** Ask mounted screens to reload after a successful profile, check-in, or request write. */
export function bumpRevision(): void {
  revision += 1;
  emit();
}

export function labelForEmail(value: string | null): string | null {
  if (!value) return null;
  return DEMO_ACCOUNTS.find((account) => account.email === value)?.label ?? null;
}

export async function signInWithPassword(nextEmail: string, password: string): Promise<string | null> {
  const supabase = getBrowserSupabase();
  if (!supabase) return "StudySync is missing its public Supabase configuration.";
  const { data, error } = await supabase.auth.signInWithPassword({
    email: nextEmail.trim(),
    password,
  });
  if (error || !data.user) return "Those credentials were not accepted.";
  noteAuthenticatedUser(data.user.id, data.user.email ?? nextEmail.trim());
  return null;
}

export async function signOut(): Promise<void> {
  const supabase = getBrowserSupabase();
  if (supabase) await supabase.auth.signOut();
  noteAuthenticatedUser(null, null);
}
