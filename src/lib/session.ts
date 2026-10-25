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
  if (!supabase) return "StudyBuddie is missing its public Supabase configuration.";
  const { data, error } = await supabase.auth.signInWithPassword({
    email: nextEmail.trim(),
    password,
  });
  if (error || !data.user) return "Those credentials were not accepted.";
  noteAuthenticatedUser(data.user.id, data.user.email ?? nextEmail.trim());
  return null;
}

export type SignUpOutcome =
  | { status: "signed-in" }
  | { status: "confirm-email" }
  | { status: "error"; message: string };

/** Creates an account with the existing Supabase Auth client. The password is not stored. */
export async function signUpWithPassword(input: {
  displayName: string;
  email: string;
  password: string;
}): Promise<SignUpOutcome> {
  const supabase = getBrowserSupabase();
  if (!supabase) return { status: "error", message: "StudyBuddie is missing its public Supabase configuration." };
  const email = input.email.trim();
  const displayName = input.displayName.trim();
  const redirectTo = typeof window === "undefined" ? undefined : `${window.location.origin}/profile?setup=1`;
  const { data, error } = await supabase.auth.signUp({
    email,
    password: input.password,
    options: {
      data: { display_name: displayName },
      emailRedirectTo: redirectTo,
    },
  });
  if (error) {
    const text = error.message.toLowerCase();
    if (text.includes("already")) {
      return { status: "error", message: "An account with that email already exists. Sign in instead." };
    }
    if (text.includes("password")) return { status: "error", message: "Choose a password of at least 8 characters." };
    if (text.includes("invalid") && text.includes("email")) return { status: "error", message: "Enter a valid email address." };
    if (text.includes("redirect")) {
      return { status: "error", message: "Sign-up could not start from this address. Open the StudyBuddie site and try again." };
    }
    return { status: "error", message: "The account could not be created. Try again." };
  }
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    return { status: "error", message: "An account with that email already exists. Sign in instead." };
  }
  if (!data.session || !data.user) return { status: "confirm-email" };
  noteAuthenticatedUser(data.user.id, data.user.email ?? email);
  return { status: "signed-in" };
}

export async function signOut(): Promise<void> {
  const supabase = getBrowserSupabase();
  if (supabase) await supabase.auth.signOut();
  noteAuthenticatedUser(null, null);
}
