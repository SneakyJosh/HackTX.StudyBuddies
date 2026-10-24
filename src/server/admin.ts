import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { internalError } from "./errors";

/**
 * Server-only privileged Supabase client (service role).
 *
 * Why this exists: profiles, check-ins, and blocks are owner-only under
 * RLS, so a signed-in user's own client can never read a counterpart's
 * rows. Discovery (B4) and request counterpart summaries therefore need a
 * privileged read path. This module is that path, with these rules:
 *
 * - It must only be imported by server code (route handlers / src/server).
 *   It reads SUPABASE_SERVICE_ROLE_KEY, which is never NEXT_PUBLIC_* and
 *   must never reach a browser bundle. The explicit window check turns an
 *   accidental client import into a loud failure.
 * - Callers must authenticate the user first (requireAuthenticatedUser)
 *   and must only query through the narrow helpers in this layer, which
 *   select explicit public columns and map rows onto contract types.
 *   Never return a raw row, and never pass a caller-supplied table or
 *   column name into a query built with this client.
 * - The key value is never logged or included in an error message.
 */
export function createSupabaseAdminClient(): SupabaseClient {
  if (typeof window !== "undefined") {
    throw internalError("Privileged database access is server-only");
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw internalError("Privileged database access is not configured");
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
