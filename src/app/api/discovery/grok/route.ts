import type { NextRequest } from "next/server";

import { requireAuthenticatedUser } from "@/server/auth";
import { listCoursesForCaller } from "@/server/catalog";
import { discoverMatches } from "@/server/discovery";
import { ApiError, handleApi, listResponse } from "@/server/errors";
import { allowGrokRequest, scoreTopSuggestions } from "@/server/grok-compatibility";
import { getProfile } from "@/server/profile";
import { parseDiscoveryQuery } from "@/server/validation";

export async function GET(request: NextRequest) {
  return handleApi(async () => {
    const { supabase, userId } = await requireAuthenticatedUser();
    if (!allowGrokRequest(userId)) {
      throw new ApiError("RATE_LIMITED", "Grok is busy. Matching scores stay available.");
    }
    const query = parseDiscoveryQuery(request.nextUrl.searchParams);
    const [matches, profile, courses] = await Promise.all([
      discoverMatches(supabase, query.locationId, query.courseId),
      getProfile(supabase, userId),
      listCoursesForCaller(supabase, userId, null),
    ]);
    const scores = await scoreTopSuggestions(
      userId,
      query.locationId,
      query.courseId,
      profile,
      courses,
      matches,
      process.env.XAI_API_KEY,
    );
    return listResponse(scores, supabase);
  });
}
