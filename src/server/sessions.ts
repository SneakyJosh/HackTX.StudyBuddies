import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { OpenSession, PostSessionBody, ScheduledSession, SessionWhen } from "#api";

import { internalError, throwMappedDbError } from "./errors";
import { parseOpenSessions, parseScheduledSession, parseScheduledSessions } from "./session-payload";

function readOne(data: unknown): ScheduledSession {
  try {
    return parseScheduledSession(data);
  } catch {
    throw internalError();
  }
}

function readMany(data: unknown): ScheduledSession[] {
  try {
    return parseScheduledSessions(data);
  } catch {
    throw internalError();
  }
}

function readOpen(data: unknown): OpenSession[] {
  try {
    return parseOpenSessions(data);
  } catch {
    throw internalError();
  }
}

export async function listMySessions(supabase: SupabaseClient, when: SessionWhen): Promise<ScheduledSession[]> {
  const { data, error } = await supabase.rpc("list_my_study_sessions", { p_when: when });
  if (error) throwMappedDbError(error);
  return readMany(data);
}

export async function listOpenSessions(
  supabase: SupabaseClient,
  courseId: string | null,
  today: boolean,
): Promise<OpenSession[]> {
  const { data, error } = await supabase.rpc("list_open_study_sessions", {
    p_course_id: courseId,
    p_today: today,
  });
  if (error) throwMappedDbError(error);
  return readOpen(data);
}

export async function getSession(supabase: SupabaseClient, sessionId: string): Promise<ScheduledSession> {
  const { data, error } = await supabase.rpc("get_study_session", { p_session_id: sessionId });
  if (error) throwMappedDbError(error);
  return readOne(data);
}

export async function createSession(supabase: SupabaseClient, body: PostSessionBody): Promise<ScheduledSession> {
  const { data, error } = await supabase.rpc("create_study_session", {
    p_title: body.title,
    p_course_id: body.courseId,
    p_location_id: body.locationId,
    p_local_date: body.localDate,
    p_local_time: body.localTime,
    p_duration_minutes: body.durationMinutes,
    p_visibility: body.visibility,
    p_seat_limit: body.seatLimit,
    p_invitee_ids: body.inviteeIds,
  });
  if (error) throwMappedDbError(error);
  return readOne(data);
}

export async function inviteToSession(
  supabase: SupabaseClient,
  sessionId: string,
  inviteeId: string,
): Promise<ScheduledSession> {
  const { data, error } = await supabase.rpc("invite_to_study_session", {
    p_session_id: sessionId,
    p_invitee_id: inviteeId,
  });
  if (error) throwMappedDbError(error);
  return readOne(data);
}

export async function respondToInvite(
  supabase: SupabaseClient,
  sessionId: string,
  status: "accepted" | "declined",
): Promise<ScheduledSession> {
  const { data, error } = await supabase.rpc("respond_study_session_invite", {
    p_session_id: sessionId,
    p_status: status,
  });
  if (error) throwMappedDbError(error);
  return readOne(data);
}

export async function requestJoin(supabase: SupabaseClient, sessionId: string): Promise<ScheduledSession> {
  const { data, error } = await supabase.rpc("request_join_study_session", { p_session_id: sessionId });
  if (error) throwMappedDbError(error);
  return readOne(data);
}

export async function respondToJoin(
  supabase: SupabaseClient,
  sessionId: string,
  userId: string,
  status: "accepted" | "declined",
): Promise<ScheduledSession> {
  const { data, error } = await supabase.rpc("respond_study_session_join", {
    p_session_id: sessionId,
    p_user_id: userId,
    p_status: status,
  });
  if (error) throwMappedDbError(error);
  return readOne(data);
}

export async function leaveSession(supabase: SupabaseClient, sessionId: string): Promise<ScheduledSession> {
  const { data, error } = await supabase.rpc("leave_study_session", { p_session_id: sessionId });
  if (error) throwMappedDbError(error);
  return readOne(data);
}

export async function cancelSession(supabase: SupabaseClient, sessionId: string): Promise<ScheduledSession> {
  const { data, error } = await supabase.rpc("cancel_study_session", { p_session_id: sessionId });
  if (error) throwMappedDbError(error);
  return readOne(data);
}
