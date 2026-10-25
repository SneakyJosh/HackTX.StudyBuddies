import type { NextRequest } from "next/server";

import { requireAuthenticatedUser } from "@/server/auth";
import { handleApi, listResponse } from "@/server/errors";
import { listOpenSessions } from "@/server/sessions";
import { parseOpenSessionQuery } from "@/server/validation";

export async function GET(request: NextRequest) {
  return handleApi(async () => {
    const { supabase } = await requireAuthenticatedUser();
    const query = parseOpenSessionQuery(request.nextUrl.searchParams);
    return listResponse(await listOpenSessions(supabase, query.courseId, query.today), supabase);
  });
}
