import type { NextRequest } from "next/server";

import { requireAuthenticatedUser } from "@/server/auth";
import { dataResponse, handleApi } from "@/server/errors";
import { createReport } from "@/server/reports";
import { assertNoSearchParams, parsePostReportBody, readJsonObject } from "@/server/validation";

export async function POST(request: NextRequest) {
  return handleApi(async () => {
    const { supabase, userId } = await requireAuthenticatedUser();
    assertNoSearchParams(request.nextUrl.searchParams);
    const body = parsePostReportBody(await readJsonObject(request), userId);
    return dataResponse(await createReport(supabase, userId, body), 201, supabase);
  });
}
