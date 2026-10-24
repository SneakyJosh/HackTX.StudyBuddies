import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { internalError } from "./errors";

/**
 * Server-only Supabase client bound to the caller's session cookie.
 *
 * Uses the publishable/anon key, so every query runs as the signed-in user
 * and Row Level Security applies. The service-role key is never used here.
 * Env values are read lazily so importing this module never throws and no
 * credential is ever sent to the browser (this file is only imported by
 * route handlers under src/app/api).
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw internalError("Supabase is not configured on the server");
  }

  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Called from a Server Component context where cookies are
          // read-only; the route handler's own response still applies.
        }
      },
    },
  });
}
