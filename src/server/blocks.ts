import type { SupabaseClient } from "@supabase/supabase-js";

import type { Block } from "@/types/api";

import { throwMappedDbError } from "./errors";
import { asArray, asBoolean, asIsoTimestamp, asNullableString, asRecord, asString } from "./json";

export type BlockResult = { block: Block; created: boolean };

function parseBlock(value: unknown): BlockResult {
  const row = asRecord(value);
  return {
    created: asBoolean(row.created),
    block: {
      blockedUserId: asString(row.blockedUserId),
      displayName: asNullableString(row.displayName),
      createdAt: asIsoTimestamp(row.createdAt),
    },
  };
}

export async function listBlocks(supabase: SupabaseClient): Promise<Block[]> {
  const { data, error } = await supabase.rpc("list_my_blocks");
  if (error) throwMappedDbError(error);
  return asArray(data).map((entry) => {
    const row = asRecord(entry);
    return {
      blockedUserId: asString(row.blockedUserId),
      displayName: asNullableString(row.displayName),
      createdAt: asIsoTimestamp(row.createdAt),
    };
  });
}

export async function blockUser(supabase: SupabaseClient, blockedUserId: string): Promise<BlockResult> {
  const { data, error } = await supabase.rpc("block_user", { p_blocked_id: blockedUserId });
  if (error) throwMappedDbError(error);
  return parseBlock(data);
}

export async function unblockUser(supabase: SupabaseClient, userId: string, blockedUserId: string): Promise<void> {
  const { error } = await supabase.from("blocks").delete().eq("blocker_id", userId).eq("blocked_id", blockedUserId);
  if (error) throwMappedDbError(error);
}
