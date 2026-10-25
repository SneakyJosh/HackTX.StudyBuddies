import type { NextRequest } from "next/server";

import { requireAuthenticatedUser } from "@/server/auth";
import { finishCheckin } from "@/server/checkins";
import { dataResponse, handleApi } from "@/server/errors";
import { assertNoSearchParams, parsePathUuid } from "@/server/validation";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const { supabase } = await requireAuthenticatedUser();
    assertNoSearchParams(request.nextUrl.searchParams);
    const { id } = await context.params;
    return dataResponse(await finishCheckin(supabase, parsePathUuid(id, "id")), 200, supabase);
  });
}
