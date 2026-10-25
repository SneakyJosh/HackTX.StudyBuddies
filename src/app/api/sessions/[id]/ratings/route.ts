import type { NextRequest } from "next/server";

import { requireAuthenticatedUser } from "@/server/auth";
import { dataResponse, handleApi } from "@/server/errors";
import { rateSession } from "@/server/sessions";
import { assertNoSearchParams, parsePathUuid, parsePostStudyRatingBody, readJsonObject } from "@/server/validation";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const { supabase, userId } = await requireAuthenticatedUser();
    assertNoSearchParams(request.nextUrl.searchParams);
    const { id } = await context.params;
    const body = parsePostStudyRatingBody(await readJsonObject(request), userId);
    return dataResponse(await rateSession(supabase, parsePathUuid(id, "id"), body), 201, supabase);
  });
}
