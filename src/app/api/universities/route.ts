import type { NextRequest } from "next/server";

import { requireAuthenticatedUser } from "@/server/auth";
import { listUniversities } from "@/server/catalog";
import { handleApi, listResponse } from "@/server/errors";
import { assertNoSearchParams } from "@/server/validation";

// No `dynamic` export: it was removed in Next 16 with Cache Components
// enabled. Accessing cookies() via the auth check makes this request-time.

/** GET /api/universities — campuses the caller may join. Works pre-profile. */
export async function GET(request: NextRequest) {
  return handleApi(async () => {
    const { supabase } = await requireAuthenticatedUser();
    assertNoSearchParams(request.nextUrl.searchParams);
    const universities = await listUniversities(supabase);
    return listResponse(universities);
  });
}
