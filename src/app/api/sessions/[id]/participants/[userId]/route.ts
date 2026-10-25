import type { NextRequest } from "next/server";

import { requireAuthenticatedUser } from "@/server/auth";
import { dataResponse, handleApi } from "@/server/errors";
import { respondToJoin } from "@/server/sessions";
import { assertNoSearchParams, parsePatchSessionParticipantBody, parsePathUuid, readJsonObject } from "@/server/validation";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; userId: string }> },
) {
  return handleApi(async () => {
    const { supabase } = await requireAuthenticatedUser();
    assertNoSearchParams(request.nextUrl.searchParams);
    const { id, userId } = await context.params;
    const body = parsePatchSessionParticipantBody(await readJsonObject(request));
    return dataResponse(
      await respondToJoin(supabase, parsePathUuid(id, "id"), parsePathUuid(userId, "userId"), body.status),
      200,
      supabase,
    );
  });
}
