import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  AcademicYear,
  Course,
  PublicLocation,
  RequestStatus,
  StudyRequest,
  StudyStyle,
} from "@/types/api";

import { conflictError, forbiddenError, internalError, notFoundError, throwMappedDbError } from "./errors";
import { asArray, asIsoTimestamp, asNullableString, asRecord, asString } from "./json";

const YEARS = new Set(["freshman", "sophomore", "junior", "senior", "graduate", "other"]);
const STYLES = new Set(["quiet", "collaborative", "flexible"]);
const STATUSES = new Set(["pending", "accepted", "declined", "cancelled"]);

function parseStudyRequest(value: unknown): StudyRequest {
  const row = asRecord(value);
  const status = asString(row.status);
  if (!STATUSES.has(status)) throw internalError();
  const counterpart = asRecord(row.counterpart);
  const studyStyle = asString(counterpart.studyStyle);
  if (!STYLES.has(studyStyle)) throw internalError();
  const academicYear = counterpart.academicYear;
  if (academicYear !== null && (typeof academicYear !== "string" || !YEARS.has(academicYear))) {
    throw internalError();
  }
  return {
    id: asString(row.id),
    senderId: asString(row.senderId),
    recipientId: asString(row.recipientId),
    status: status as RequestStatus,
    createdAt: asIsoTimestamp(row.createdAt),
    updatedAt: asIsoTimestamp(row.updatedAt),
    counterpart: {
      id: asString(counterpart.id),
      displayName: asString(counterpart.displayName),
      major: asNullableString(counterpart.major),
      academicYear: academicYear as AcademicYear | null,
      studyStyle: studyStyle as StudyStyle,
    },
    course: parseCourse(row.course),
    location: parseLocation(row.location),
  };
}

function parseCourse(value: unknown): Course | null {
  if (value === null) return null;
  const row = asRecord(value);
  return {
    id: asString(row.id),
    universityId: asString(row.universityId),
    code: asString(row.code),
    title: asString(row.title),
  };
}

function parseLocation(value: unknown): PublicLocation | null {
  if (value === null) return null;
  const row = asRecord(value);
  return { id: asString(row.id), name: asString(row.name), buildingCode: asString(row.buildingCode) };
}

export async function listRequests(
  supabase: SupabaseClient,
  direction: "incoming" | "outgoing" | "all",
): Promise<StudyRequest[]> {
  const { data, error } = await supabase.rpc("list_my_requests", { p_direction: direction });
  if (error) throwMappedDbError(error);
  return asArray(data).map(parseStudyRequest);
}

export async function sendRequest(supabase: SupabaseClient, recipientId: string): Promise<StudyRequest> {
  const { data, error } = await supabase.rpc("send_study_request", { p_recipient_id: recipientId });
  if (error) throwMappedDbError(error);
  return parseStudyRequest(data);
}

export async function transitionRequest(
  supabase: SupabaseClient,
  userId: string,
  requestId: string,
  status: "accepted" | "declined" | "cancelled",
): Promise<StudyRequest> {
  const existing = await supabase
    .from("study_requests")
    .select("id, sender_id, recipient_id, status")
    .eq("id", requestId)
    .maybeSingle();
  if (existing.error) throwMappedDbError(existing.error);
  const row = existing.data as { sender_id: string; recipient_id: string; status: string } | null;
  if (!row || (row.sender_id !== userId && row.recipient_id !== userId)) {
    throw notFoundError("Request not found");
  }
  if (row.status !== "pending") throw conflictError("Request is no longer pending");
  if (row.sender_id === userId && status !== "cancelled") {
    throw forbiddenError("Only the recipient can accept or decline");
  }
  if (row.recipient_id === userId && status === "cancelled") {
    throw forbiddenError("Only the sender can cancel a pending request");
  }

  const updated = await supabase
    .from("study_requests")
    .update({ status })
    .eq("id", requestId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (updated.error) throwMappedDbError(updated.error);
  if (!updated.data) throw conflictError("Request is no longer pending");

  // study_request_payload is an internal DB helper and is not callable by
  // clients directly; read the updated row back through the block-filtered
  // list path instead. A request that went invisible in between (e.g. a
  // block landed in parallel) is reported as not found.
  const requests = await listRequests(supabase, "all");
  const updatedRequest = requests.find((request) => request.id === requestId);
  if (!updatedRequest) throw notFoundError("Request not found");
  return updatedRequest;
}
