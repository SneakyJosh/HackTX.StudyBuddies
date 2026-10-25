import type { SupabaseClient } from "@supabase/supabase-js";

import type { Availability, Checkin, PostCheckinBody, StudyStyle } from "@/types/api";

import { forbiddenError, internalError, throwMappedDbError, validationError } from "./errors";
import { asIsoTimestamp, asRecord, asString } from "./json";
import { getProfile } from "./profile";

const AVAILABILITIES = new Set(["available", "questions_only", "focused"]);
const STUDY_STYLES = new Set(["quiet", "collaborative", "flexible"]);

export function parseCheckin(value: unknown): Checkin {
  const row = asRecord(value);
  const availability = asString(row.availability);
  const studyStyle = asString(row.studyStyle);
  if (!AVAILABILITIES.has(availability) || !STUDY_STYLES.has(studyStyle)) throw internalError();
  return {
    id: asString(row.id),
    locationId: asString(row.locationId),
    courseId: asString(row.courseId),
    availability: availability as Availability,
    studyStyle: studyStyle as StudyStyle,
    startedAt: asIsoTimestamp(row.startedAt),
    expiresAt: asIsoTimestamp(row.expiresAt),
  };
}

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

  const location = await supabase
    .from("locations")
    .select("id, university_id, is_active")
    .eq("id", body.locationId)
    .maybeSingle();
  if (location.error) throwMappedDbError(location.error);
  const locationRow = location.data as { university_id: string; is_active: boolean } | null;
  if (!locationRow || !locationRow.is_active || locationRow.university_id !== profile.universityId) {
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
