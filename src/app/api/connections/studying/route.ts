import type { NextRequest } from "next/server";

import { requireAuthenticatedUser } from "@/server/auth";
import { listStudyingConnections } from "@/server/connections";
import { handleApi, listResponse } from "@/server/errors";
import { assertNoSearchParams } from "@/server/validation";

export async function GET(request: NextRequest) {
  return handleApi(async () => {
    const { supabase } = await requireAuthenticatedUser();
    assertNoSearchParams(request.nextUrl.searchParams);
    return listResponse(await listStudyingConnections(supabase), supabase);
  });
}
