import type { SupabaseClient } from "@supabase/supabase-js";

import type { PostReportBody, ReportResult } from "@/types/api";

import { forbiddenError, throwMappedDbError } from "./errors";
import { asString } from "./json";
import { getProfile } from "./profile";

export async function createReport(
  supabase: SupabaseClient,
  userId: string,
  body: PostReportBody,
): Promise<ReportResult> {
  const profile = await getProfile(supabase, userId);
  if (!profile) throw forbiddenError("Profile is not completed");
  const { data, error } = await supabase.rpc("create_report", {
    p_reported_id: body.reportedUserId,
    p_reason: body.reason,
    p_details: body.details ?? null,
  });
  if (error) throwMappedDbError(error);
  return { id: asString(data) };
}
