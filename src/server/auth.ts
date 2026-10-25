import type { SupabaseClient, User } from "@supabase/supabase-js";

import { unauthenticatedError } from "./errors";
import { createSupabaseServerClient } from "./supabase";

export type AuthenticatedContext = {
  supabase: SupabaseClient;
  user: User;
  /** Derived from the verified session. Never read a user id from a body. */
  userId: string;
};

/**
 * Verify the Supabase session cookie on the server.
 * Throws 401 UNAUTHENTICATED when the session is missing or invalid.
 */
export async function requireAuthenticatedUser(): Promise<AuthenticatedContext> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw unauthenticatedError();
  }

  return { supabase, user, userId: user.id };
}
