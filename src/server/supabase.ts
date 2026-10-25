import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";

const responseHeaders = new WeakMap<SupabaseClient, Record<string, string>>();

function readPublicSupabaseEnv(): { url: string; anonKey: string } {
  const missing: string[] = [];
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!anonKey) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (missing.length > 0 || !url || !anonKey) {
    throw new Error(`Missing environment variable ${missing.join(", ")}`);
  }
  return { url, anonKey };
}

/**
 * Cookie-bound user client. Created inside the function so importing this
 * module does not connect to Supabase. The service-role key is never read.
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient> {
  const { url, anonKey } = readPublicSupabaseEnv();
  const cookieStore = await cookies();
  const headers: Record<string, string> = {};

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet, incomingHeaders) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot always write cookies. Middleware refreshes them.
        }
        Object.assign(headers, incomingHeaders);
      },
    },
  });

  responseHeaders.set(supabase, headers);
  return supabase;
}

export function copyAuthHeaders(client: SupabaseClient, response: NextResponse): NextResponse {
  const headers = responseHeaders.get(client);
  if (!headers) return response;
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }
  return response;
}
