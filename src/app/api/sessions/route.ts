import type { NextRequest } from "next/server";

import { requireAuthenticatedUser } from "@/server/auth";
import { dataResponse, handleApi, listResponse } from "@/server/errors";
import { createSession, listMySessions } from "@/server/sessions";
import { assertNoSearchParams, parsePostSessionBody, parseSessionWhen, readJsonObject } from "@/server/validation";

export async function GET(request: NextRequest) {
  return handleApi(async () => {
    const { supabase } = await requireAuthenticatedUser();
    const when = parseSessionWhen(request.nextUrl.searchParams);
    return listResponse(await listMySessions(supabase, when), supabase);
  });
}

export async function POST(request: NextRequest) {
  return handleApi(async () => {
    const { supabase, userId } = await requireAuthenticatedUser();
    assertNoSearchParams(request.nextUrl.searchParams);
    const body = parsePostSessionBody(await readJsonObject(request), userId);
    return dataResponse(await createSession(supabase, body), 201, supabase);
  });
}
