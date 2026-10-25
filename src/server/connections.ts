import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { StudyingConnection } from "#api";

import { parseStudyingConnections } from "./connection-payload";
import { throwMappedDbError } from "./errors";

export async function listStudyingConnections(supabase: SupabaseClient): Promise<StudyingConnection[]> {
  const { data, error } = await supabase.rpc("list_studying_connections");
  if (error) throwMappedDbError(error);
  return parseStudyingConnections(data);
}
