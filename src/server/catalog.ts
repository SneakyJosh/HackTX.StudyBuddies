import type { SupabaseClient } from "@supabase/supabase-js";

import type { Course, Location, University } from "@/types/api";

import { internalError } from "./errors";

/**
 * Catalog reads for GET /api/universities, /api/locations, /api/courses.
 *
 * Rows are mapped explicitly onto the contract types so no extra database
 * column (timestamps, is_active, ...) can leak into a response.
 */

type UniversityRow = { id: string; name: string; slug: string };
type LocationParentRow = {
  id: string;
  name: string;
  building_code: string;
};

type LocationRow = {
  id: string;
  university_id: string;
  name: string;
  building_code: string;
  description: string | null;
  kind?: string | null;
  parent?: LocationParentRow | LocationParentRow[] | null;
};
type CourseRow = { id: string; university_id: string; code: string; title: string };

export function mapUniversity(row: UniversityRow): University {
  return { id: row.id, name: row.name, slug: row.slug };
}

export function mapLocation(row: LocationRow): Location {
  const parent = Array.isArray(row.parent) ? row.parent[0] ?? null : row.parent ?? null;
  return {
    id: row.id,
    universityId: row.university_id,
    name: row.name,
    buildingCode: row.building_code,
    description: row.description,
    kind: row.kind === "cafe" ? "cafe" : "building",
    parent: parent ? { id: parent.id, name: parent.name, buildingCode: parent.building_code } : null,
  };
}

export function mapCourse(row: CourseRow): Course {
  return { id: row.id, universityId: row.university_id, code: row.code, title: row.title };
}

export async function listUniversities(supabase: SupabaseClient): Promise<University[]> {
  const { data, error } = await supabase
    .from("universities")
    .select("id, name, slug")
    .order("name", { ascending: true });

  if (error) {
    throw internalError();
  }
  return ((data ?? []) as UniversityRow[]).map(mapUniversity);
}

/**
 * The university whose catalog a caller sees: their profile's university
 * when a profile exists, otherwise the sole configured university (the
 * pre-profile onboarding rule in the contract). Returns null when there is
 * no usable university, in which case catalog lists are simply empty.
 */
export async function resolveCallerUniversityId(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("university_id")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) {
    throw internalError();
  }
  if (profile) {
    return (profile as { university_id: string }).university_id;
  }

  const { data: universities, error: universitiesError } = await supabase
    .from("universities")
    .select("id")
    .order("name", { ascending: true })
    .limit(2);

  if (universitiesError) {
    throw internalError();
  }
  if (!universities || universities.length !== 1) {
    return null;
  }
  return (universities[0] as { id: string }).id;
}

export async function listLocationsForCaller(
  supabase: SupabaseClient,
  userId: string,
): Promise<Location[]> {
  const universityId = await resolveCallerUniversityId(supabase, userId);
  if (!universityId) {
    return [];
  }

  const rich = await supabase
    .from("locations")
    .select("id, university_id, name, building_code, description, kind, parent:parent_location_id(id, name, building_code)")
    .eq("university_id", universityId)
    .eq("is_active", true)
    .eq("bookable", true)
    .order("name", { ascending: true });

  if (!rich.error) {
    return ((rich.data ?? []) as LocationRow[]).map(mapLocation);
  }

  const missingCatalogColumns = /bookable|parent_location_id|kind/i.test(rich.error.message);
  if (!missingCatalogColumns) {
    throw internalError();
  }

  const { data, error } = await supabase
    .from("locations")
    .select("id, university_id, name, building_code, description")
    .eq("university_id", universityId)
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) {
    throw internalError();
  }
  return ((data ?? []) as LocationRow[]).map(mapLocation);
}

export async function listCoursesForCaller(
  supabase: SupabaseClient,
  userId: string,
  q: string | null,
): Promise<Course[]> {
  const universityId = await resolveCallerUniversityId(supabase, userId);
  if (!universityId) {
    return [];
  }

  const { data, error } = await supabase
    .from("courses")
    .select("id, university_id, code, title")
    .eq("university_id", universityId)
    .order("code", { ascending: true });

  if (error) {
    throw internalError();
  }

  const courses = ((data ?? []) as CourseRow[]).map(mapCourse);
  if (!q) {
    return courses;
  }

  // Literal case-insensitive substring match on code or title (contract).
  // Filtering here avoids embedding raw user input in a PostgREST filter
  // string, where commas/parentheses/wildcards would change its meaning.
  const needle = q.toLowerCase();
  return courses.filter(
    (course) =>
      course.code.toLowerCase().includes(needle) ||
      course.title.toLowerCase().includes(needle),
  );
}
