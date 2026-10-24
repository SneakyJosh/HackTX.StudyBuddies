import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  AcademicYear,
  Course,
  PublicLocation,
  RequestCounterpart,
  StudyStyle,
} from "@/types/api";

import { mapCourse, mapLocation } from "./catalog";
import { internalError } from "./errors";
import { parseUuidList } from "./validation";

/**
 * Counterpart summaries for the Requests/Discovery surfaces, built on the
 * privileged server-only client (see admin.ts).
 *
 * Privacy contract: the only profile fields that ever leave this module
 * are the ones in `RequestCounterpart` (public name, major, year, profile
 * study style). Preferred duration, preferred group size, visibility,
 * course enrollments, email, and every other column are selected never —
 * note the explicit column list — and the mappers below construct fresh
 * objects so even an unexpectedly wide row cannot leak extra fields.
 * Check-in context is building + course only, and only while that
 * counterpart is actively checked in.
 */

type CounterpartProfileRow = {
  id: string;
  display_name: string;
  major: string | null;
  academic_year: AcademicYear | null;
  study_style: StudyStyle;
};

type ActiveCheckinContextRow = {
  user_id: string;
  course: { id: string; university_id: string; code: string; title: string } | null;
  location: {
    id: string;
    university_id: string;
    name: string;
    building_code: string;
    description: string | null;
  } | null;
};

export function mapRequestCounterpart(row: CounterpartProfileRow): RequestCounterpart {
  return {
    id: row.id,
    displayName: row.display_name,
    major: row.major,
    academicYear: row.academic_year,
    studyStyle: row.study_style,
  };
}

export type CounterpartSummary = {
  counterpart: RequestCounterpart;
  /** Counterpart's current active check-in course, or null after checkout/expiry. */
  course: Course | null;
  /** Counterpart's current building-level location, or null after checkout/expiry. */
  location: PublicLocation | null;
};

export function mapCheckinContext(row: ActiveCheckinContextRow): {
  course: Course | null;
  location: PublicLocation | null;
} {
  const course = row.course ? mapCourse(row.course) : null;
  const location = row.location
    ? (() => {
        const mapped = mapLocation(row.location);
        return { id: mapped.id, name: mapped.name, buildingCode: mapped.buildingCode };
      })()
    : null;
  return { course, location };
}

const MAX_COUNTERPART_IDS = 50;

/**
 * Fetch public summaries for the given counterpart user ids.
 *
 * The caller (a route handler) must already have authenticated the user
 * and established that they are entitled to see these counterparts (e.g.
 * they share a study request). This helper deliberately does not decide
 * entitlement; it only guarantees that, whatever it returns, contains
 * nothing beyond the contract's public fields.
 */
export async function fetchCounterpartSummaries(
  admin: SupabaseClient,
  counterpartIds: string[],
): Promise<CounterpartSummary[]> {
  const ids = parseUuidList(counterpartIds, MAX_COUNTERPART_IDS);
  if (ids.length === 0) {
    return [];
  }

  const { data: profiles, error: profilesError } = await admin
    .from("profiles")
    .select("id, display_name, major, academic_year, study_style")
    .in("id", ids);
  if (profilesError) {
    throw internalError();
  }

  const profileRows = (profiles ?? []) as CounterpartProfileRow[];
  if (profileRows.length === 0) {
    return [];
  }

  // Active = not checked out and not expired at database time. PostgREST
  // cannot compare a column to now() directly, so expiry is bounded by
  // the server's clock at query time and re-checked against the returned
  // expires_at below before anything is exposed.
  const nowIso = new Date().toISOString();
  const { data: checkins, error: checkinsError } = await admin
    .from("checkins")
    .select(
      "user_id, expires_at, course:courses(id, university_id, code, title), location:locations(id, university_id, name, building_code, description)",
    )
    .in(
      "user_id",
      profileRows.map((row) => row.id),
    )
    .is("checked_out_at", null)
    .gt("expires_at", nowIso);
  if (checkinsError) {
    throw internalError();
  }

  const contextByUser = new Map<string, { course: Course | null; location: PublicLocation | null }>();
  for (const row of (checkins ?? []) as unknown as Array<
    ActiveCheckinContextRow & { expires_at: string }
  >) {
    // Defence in depth against clock skew between this server and the DB.
    if (row.expires_at <= nowIso) {
      continue;
    }
    contextByUser.set(row.user_id, mapCheckinContext(row));
  }

  return profileRows.map((row) => {
    const context = contextByUser.get(row.id) ?? { course: null, location: null };
    return {
      counterpart: mapRequestCounterpart(row),
      course: context.course,
      location: context.location,
    };
  });
}
