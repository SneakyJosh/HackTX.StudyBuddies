import type { NextRequest } from "next/server";

import { requireAuthenticatedUser } from "@/server/auth";
import { discoverMatches } from "@/server/discovery";
import { handleApi, listResponse } from "@/server/errors";
import { parseDiscoveryQuery } from "@/server/validation";

export async function GET(request: NextRequest) {
  return handleApi(async () => {
    const { supabase, userId } = await requireAuthenticatedUser();
    const query = parseDiscoveryQuery(request.nextUrl.searchParams);
    const matches = await discoverMatches(supabase, userId, query.locationId, query.courseId);
    return listResponse(matches, supabase);
  });
}
