import type { NextRequest } from "next/server";

import { requireAuthenticatedUser } from "@/server/auth";
import { dataResponse, handleApi } from "@/server/errors";
import { transitionRequest } from "@/server/requests";
import { assertNoSearchParams, parsePatchRequestBody, parsePathUuid, readJsonObject } from "@/server/validation";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const { supabase, userId } = await requireAuthenticatedUser();
    assertNoSearchParams(request.nextUrl.searchParams);
    const { id } = await context.params;
    const requestId = parsePathUuid(id, "id");
    const body = parsePatchRequestBody(await readJsonObject(request));
    return dataResponse(await transitionRequest(supabase, userId, requestId, body.status), 200, supabase);
  });
}
