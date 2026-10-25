import type { NextRequest } from "next/server";

import { requireAuthenticatedUser } from "@/server/auth";
import { loadCampusMap } from "@/server/campus-map";
import { dataResponse, handleApi } from "@/server/errors";
import { assertNoSearchParams } from "@/server/validation";

// No `dynamic` export: it was removed in Next 16 with Cache Components
// enabled. Accessing cookies() via the auth check makes this request-time.

/**
 * GET /api/campus-map — curated illustrated campus catalog for the caller.
 * Ranking uses study style, verified quiet zones, and the caller's own
 * finished sessions. It does not read other students or change discovery.
 */
export async function GET(request: NextRequest) {
  return handleApi(async () => {
    const { supabase } = await requireAuthenticatedUser();
    assertNoSearchParams(request.nextUrl.searchParams);
    const map = await loadCampusMap(supabase);
    return dataResponse(map, 200, supabase);
  });
}
