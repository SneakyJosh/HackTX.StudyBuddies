import type { NextRequest } from "next/server";

import { requireAuthenticatedUser } from "@/server/auth";
import { rateCheckin } from "@/server/checkins";
import { dataResponse, handleApi } from "@/server/errors";
import { assertNoSearchParams, parsePathUuid, parsePostCheckinRatingBody, readJsonObject } from "@/server/validation";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const { supabase } = await requireAuthenticatedUser();
    assertNoSearchParams(request.nextUrl.searchParams);
    const { id } = await context.params;
    const body = parsePostCheckinRatingBody(await readJsonObject(request));
    return dataResponse(await rateCheckin(supabase, parsePathUuid(id, "id"), body), 201, supabase);
  });
}
