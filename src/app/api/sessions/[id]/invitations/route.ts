import type { NextRequest } from "next/server";

import { requireAuthenticatedUser } from "@/server/auth";
import { dataResponse, handleApi } from "@/server/errors";
import { inviteToSession, respondToInvite } from "@/server/sessions";
import {
  assertNoSearchParams,
  parsePatchInvitationBody,
  parsePathUuid,
  parsePostInvitationBody,
  readJsonObject,
} from "@/server/validation";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const { supabase, userId } = await requireAuthenticatedUser();
    assertNoSearchParams(request.nextUrl.searchParams);
    const { id } = await context.params;
    const body = parsePostInvitationBody(await readJsonObject(request), userId);
    return dataResponse(await inviteToSession(supabase, parsePathUuid(id, "id"), body.inviteeId), 201, supabase);
  });
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const { supabase } = await requireAuthenticatedUser();
    assertNoSearchParams(request.nextUrl.searchParams);
    const { id } = await context.params;
    const body = parsePatchInvitationBody(await readJsonObject(request));
    return dataResponse(await respondToInvite(supabase, parsePathUuid(id, "id"), body.status), 200, supabase);
  });
}
