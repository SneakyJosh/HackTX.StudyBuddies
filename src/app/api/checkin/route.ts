import type { NextRequest } from "next/server";

import { requireAuthenticatedUser } from "@/server/auth";
import { checkoutActive, getActiveCheckin, replaceCheckin } from "@/server/checkins";
import { dataResponse, handleApi } from "@/server/errors";
import { assertNoSearchParams, parsePostCheckinBody, readJsonObject } from "@/server/validation";

export async function GET(request: NextRequest) {
  return handleApi(async () => {
    const { supabase } = await requireAuthenticatedUser();
    assertNoSearchParams(request.nextUrl.searchParams);
    return dataResponse(await getActiveCheckin(supabase), 200, supabase);
  });
}

export async function POST(request: NextRequest) {
  return handleApi(async () => {
    const { supabase, userId } = await requireAuthenticatedUser();
    assertNoSearchParams(request.nextUrl.searchParams);
    const body = parsePostCheckinBody(await readJsonObject(request));
    return dataResponse(await replaceCheckin(supabase, userId, body), 201, supabase);
  });
}

export async function DELETE(request: NextRequest) {
  return handleApi(async () => {
    const { supabase } = await requireAuthenticatedUser();
    assertNoSearchParams(request.nextUrl.searchParams);
    await checkoutActive(supabase);
    return dataResponse({ checkedOut: true }, 200, supabase);
  });
}
