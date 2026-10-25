import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { DiscoveryMatch } from "#api";

import { parseDiscoveryMatches } from "./discovery-payload";
import { throwMappedDbError } from "./errors";

/**
 * Authorized discovery read path (server-only).
 *
 * This module must never be imported by client code: the `server-only`
 * import makes such an import a build error, so no privileged read logic
 * (and no credential, if one is ever introduced here) can reach the
 * browser bundle. There is deliberately no service-role client in the
 * codebase: the caller is authenticated by the route handler from the
 * session cookie, and the `discovery_candidates` SECURITY DEFINER
 * function re-checks auth.uid() and enforces same-campus eligibility,
 * visibility, active check-in, focused exclusion, and blocks in the
 * database before computing scores and returning only public fields.
 */
export async function discoverMatches(
  supabase: SupabaseClient,
  locationId: string | null,
  courseId: string | null,
): Promise<DiscoveryMatch[]> {
  const { data, error } = await supabase.rpc("discovery_candidates", {
    p_location_id: locationId,
    p_course_id: courseId,
  });
  if (error) throwMappedDbError(error);
  return parseDiscoveryMatches(data);
}
