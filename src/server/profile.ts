import type { SupabaseClient } from "@supabase/supabase-js";

import type { AcademicYear, Profile, PutProfileBody, StudyStyle } from "@/types/api";

import { internalError, throwMappedDbError } from "./errors";

const ACADEMIC_YEARS = new Set(["freshman", "sophomore", "junior", "senior", "graduate", "other"]);
const STUDY_STYLES = new Set(["quiet", "collaborative", "flexible"]);

function asAcademicYear(value: string | null): AcademicYear | null {
  if (value === null) return null;
  if (!ACADEMIC_YEARS.has(value)) throw internalError();
  return value as AcademicYear;
}

function asStudyStyle(value: string): StudyStyle {
  if (!STUDY_STYLES.has(value)) throw internalError();
  return value as StudyStyle;
}

type ProfileRow = {
  id: string;
  university_id: string;
  display_name: string;
  major: string | null;
  academic_year: string | null;
  study_style: string;
  preferred_duration_minutes: number;
  preferred_group_size: number;
  visible: boolean;
};

export async function getProfile(supabase: SupabaseClient, userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, university_id, display_name, major, academic_year, study_style, preferred_duration_minutes, preferred_group_size, visible")
    .eq("id", userId)
    .maybeSingle();
  if (error) throwMappedDbError(error);
  if (!data) return null;
  const row = data as ProfileRow;

  const courses = await supabase
    .from("profile_courses")
    .select("course_id")
    .eq("user_id", userId)
    .order("course_id", { ascending: true });
  if (courses.error) throwMappedDbError(courses.error);

  return {
    id: row.id,
    displayName: row.display_name,
    universityId: row.university_id,
    major: row.major,
    academicYear: asAcademicYear(row.academic_year),
    courseIds: ((courses.data ?? []) as { course_id: string }[]).map((course) => course.course_id),
    studyStyle: asStudyStyle(row.study_style),
    preferredDurationMinutes: row.preferred_duration_minutes,
    preferredGroupSize: row.preferred_group_size,
    visible: row.visible,
  };
}

export async function saveProfile(
  supabase: SupabaseClient,
  userId: string,
  body: PutProfileBody,
): Promise<Profile> {
  const { error } = await supabase.rpc("save_profile", {
    p_display_name: body.displayName,
    p_university_id: body.universityId,
    p_major: body.major,
    p_academic_year: body.academicYear,
    p_course_ids: body.courseIds,
    p_study_style: body.studyStyle,
    p_preferred_duration_minutes: body.preferredDurationMinutes,
    p_preferred_group_size: body.preferredGroupSize,
    p_visible: body.visible ?? false,
  });
  if (error) throwMappedDbError(error);
  const profile = await getProfile(supabase, userId);
  if (!profile) throw internalError();
  return profile;
}
