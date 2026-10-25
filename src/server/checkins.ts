import type { SupabaseClient } from "@supabase/supabase-js";

import type { Checkin, CheckinStudyRecord, PostCheckinBody, PostCheckinRatingBody } from "@/types/api";

import { parseCheckin, parseCheckinStudyRecord, parseCheckinStudyRecords } from "./checkin-payload";
import { forbiddenError, throwMappedDbError, validationError } from "./errors";
import { getProfile } from "./profile";

export { parseCheckin, parseCheckinStudyRecord, parseCheckinStudyRecords };

export async function getActiveCheckin(supabase: SupabaseClient): Promise<Checkin | null> {
  const { data, error } = await supabase.rpc("current_checkin");
  if (error) throwMappedDbError(error);
  if (data === null) return null;
  return parseCheckin(data);
}

export async function replaceCheckin(
  supabase: SupabaseClient,
  userId: string,
  body: PostCheckinBody,
): Promise<Checkin> {
  const profile = await getProfile(supabase, userId);
  if (!profile) throw forbiddenError("Profile is not completed");
  if (!profile.visible) throw forbiddenError("Visibility is off");
  if (!profile.courseIds.includes(body.courseId)) {
    throw validationError("Course is not on the caller profile", { courseId: "Course is not on the caller profile" });
  }

  const rich = await supabase
    .from("locations")
    .select("id, university_id, is_active, bookable")
    .eq("id", body.locationId)
    .maybeSingle();
  let locationRow: { university_id: string; is_active: boolean; bookable?: boolean } | null = null;
  if (rich.error && /bookable/i.test(rich.error.message)) {
    const fallback = await supabase
      .from("locations")
      .select("id, university_id, is_active")
      .eq("id", body.locationId)
      .maybeSingle();
    if (fallback.error) throwMappedDbError(fallback.error);
    locationRow = fallback.data as { university_id: string; is_active: boolean } | null;
  } else {
    if (rich.error) throwMappedDbError(rich.error);
    locationRow = rich.data as { university_id: string; is_active: boolean; bookable: boolean } | null;
  }
  if (!locationRow || !locationRow.is_active || locationRow.bookable === false || locationRow.university_id !== profile.universityId) {
    throw validationError("Location is not available for this university", {
      locationId: "Location is not available for this university",
    });
  }

  const { data, error } = await supabase.rpc("replace_checkin", {
    p_location_id: body.locationId,
    p_course_id: body.courseId,
    p_duration_minutes: body.durationMinutes,
    p_availability: body.availability,
    p_study_style: body.studyStyle,
  });
  if (error) throwMappedDbError(error);
  return parseCheckin(data);
}

export async function checkoutActive(supabase: SupabaseClient): Promise<void> {
  const { error } = await supabase.rpc("checkout_active");
  if (error) throwMappedDbError(error);
}

export async function finishCheckin(supabase: SupabaseClient, checkinId: string): Promise<CheckinStudyRecord> {
  const { data, error } = await supabase.rpc("finish_checkin_study", { p_checkin_id: checkinId });
  if (error) throwMappedDbError(error);
  return parseCheckinStudyRecord(data);
}

export async function listCheckinStudyRecords(supabase: SupabaseClient): Promise<CheckinStudyRecord[]> {
  const { data, error } = await supabase.rpc("list_checkin_study_records");
  if (error) throwMappedDbError(error);
  return parseCheckinStudyRecords(data);
}

export async function rateCheckin(
  supabase: SupabaseClient,
  checkinId: string,
  body: PostCheckinRatingBody,
): Promise<CheckinStudyRecord> {
  const { data, error } = await supabase.rpc("submit_checkin_ratings", {
    p_checkin_id: checkinId,
    p_study_time: body.studyTime ?? null,
    p_environment: body.environment ?? null,
  });
  if (error) throwMappedDbError(error);
  return parseCheckinStudyRecord(data);
}
