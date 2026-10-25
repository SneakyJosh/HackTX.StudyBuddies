import type { NextRequest } from "next/server";

import { requireAuthenticatedUser } from "@/server/auth";
import { blockUser, listBlocks } from "@/server/blocks";
import { dataResponse, handleApi, listResponse } from "@/server/errors";
import { assertNoSearchParams, parsePostBlockBody, readJsonObject } from "@/server/validation";

export async function GET(request: NextRequest) {
  return handleApi(async () => {
    const { supabase } = await requireAuthenticatedUser();
    assertNoSearchParams(request.nextUrl.searchParams);
    return listResponse(await listBlocks(supabase), supabase);
  });
}

export async function POST(request: NextRequest) {
  return handleApi(async () => {
    const { supabase, userId } = await requireAuthenticatedUser();
    assertNoSearchParams(request.nextUrl.searchParams);
    const body = parsePostBlockBody(await readJsonObject(request), userId);
    const result = await blockUser(supabase, body.blockedUserId);
    return dataResponse(result.block, result.created ? 201 : 200, supabase);
  });
}
