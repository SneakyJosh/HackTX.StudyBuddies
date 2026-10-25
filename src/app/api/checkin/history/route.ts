import type { NextRequest } from "next/server";

import { requireAuthenticatedUser } from "@/server/auth";
import { listCheckinStudyRecords } from "@/server/checkins";
import { handleApi, listResponse } from "@/server/errors";
import { assertNoSearchParams } from "@/server/validation";

export async function GET(request: NextRequest) {
  return handleApi(async () => {
    const { supabase } = await requireAuthenticatedUser();
    assertNoSearchParams(request.nextUrl.searchParams);
    return listResponse(await listCheckinStudyRecords(supabase), supabase);
  });
}
