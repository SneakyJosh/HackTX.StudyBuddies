import type { NextRequest } from "next/server";

import { requireAuthenticatedUser } from "@/server/auth";
import { listLocationsForCaller } from "@/server/catalog";
import { handleApi, listResponse } from "@/server/errors";
import { assertNoSearchParams } from "@/server/validation";

// No `dynamic` export: it was removed in Next 16 with Cache Components
// enabled. Accessing cookies() via the auth check makes this request-time.

/**
 * GET /api/locations — predefined public locations for the caller's
 * university (profile university, or the sole configured university
 * before a profile exists). Inactive locations are omitted.
 */
export async function GET(request: NextRequest) {
  return handleApi(async () => {
    const { supabase, userId } = await requireAuthenticatedUser();
    assertNoSearchParams(request.nextUrl.searchParams);
    const locations = await listLocationsForCaller(supabase, userId);
    return listResponse(locations, supabase);
  });
}
