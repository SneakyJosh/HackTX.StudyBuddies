import type { NextRequest } from "next/server";

import { requireAuthenticatedUser } from "@/server/auth";
import { dataResponse, handleApi, listResponse } from "@/server/errors";
import { listRequests, sendRequest } from "@/server/requests";
import { assertNoSearchParams, parsePostRequestBody, parseRequestDirection, readJsonObject } from "@/server/validation";

export async function GET(request: NextRequest) {
  return handleApi(async () => {
    const { supabase } = await requireAuthenticatedUser();
    const direction = parseRequestDirection(request.nextUrl.searchParams);
    return listResponse(await listRequests(supabase, direction), supabase);
  });
}

export async function POST(request: NextRequest) {
  return handleApi(async () => {
    const { supabase, userId } = await requireAuthenticatedUser();
    assertNoSearchParams(request.nextUrl.searchParams);
    const body = parsePostRequestBody(await readJsonObject(request), userId);
    return dataResponse(await sendRequest(supabase, body.recipientId), 201, supabase);
  });
}
