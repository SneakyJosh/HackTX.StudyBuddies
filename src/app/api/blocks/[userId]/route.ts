import type { NextRequest } from "next/server";

import { requireAuthenticatedUser } from "@/server/auth";
import { unblockUser } from "@/server/blocks";
import { dataResponse, handleApi } from "@/server/errors";
import { assertNoSearchParams, parsePathUuid } from "@/server/validation";

export async function DELETE(request: NextRequest, context: { params: Promise<{ userId: string }> }) {
  return handleApi(async () => {
    const { supabase, userId } = await requireAuthenticatedUser();
    assertNoSearchParams(request.nextUrl.searchParams);
    const { userId: blockedUserId } = await context.params;
    await unblockUser(supabase, userId, parsePathUuid(blockedUserId, "userId"));
    return dataResponse({ unblocked: true }, 200, supabase);
  });
}
