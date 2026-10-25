import type { NextRequest } from "next/server";

import { requireAuthenticatedUser } from "@/server/auth";
import { dataResponse, handleApi } from "@/server/errors";
import { getProfile, saveProfile } from "@/server/profile";
import { assertNoSearchParams, parsePutProfileBody, readJsonObject } from "@/server/validation";

export async function GET(request: NextRequest) {
  return handleApi(async () => {
    const { supabase, userId } = await requireAuthenticatedUser();
    assertNoSearchParams(request.nextUrl.searchParams);
    return dataResponse(await getProfile(supabase, userId), 200, supabase);
  });
}

export async function PUT(request: NextRequest) {
  return handleApi(async () => {
    const { supabase, userId } = await requireAuthenticatedUser();
    assertNoSearchParams(request.nextUrl.searchParams);
    const body = parsePutProfileBody(await readJsonObject(request));
    return dataResponse(await saveProfile(supabase, userId, body), 200, supabase);
  });
}
