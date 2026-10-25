import type { NextRequest } from "next/server";

import { requireAuthenticatedUser } from "@/server/auth";
import { listCoursesForCaller } from "@/server/catalog";
import { handleApi, listResponse } from "@/server/errors";
import { parseCourseSearchParams } from "@/server/validation";

// No `dynamic` export: it was removed in Next 16 with Cache Components
// enabled. Accessing cookies() via the auth check makes this request-time.

/**
 * GET /api/courses?q=M408 — courses for the caller's university (profile
 * university, or the sole configured university before a profile exists).
 * `q` is an optional case-insensitive substring on code or title.
 */
export async function GET(request: NextRequest) {
  return handleApi(async () => {
    const { supabase, userId } = await requireAuthenticatedUser();
    const { q } = parseCourseSearchParams(request.nextUrl.searchParams);
    const courses = await listCoursesForCaller(supabase, userId, q);
    return listResponse(courses, supabase);
  });
}
