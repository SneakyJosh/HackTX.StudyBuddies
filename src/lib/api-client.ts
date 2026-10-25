import { bumpRevision } from "@/lib/session";
import type {
  ApiData,
  ApiError,
  ApiErrorCode,
  ApiList,
  Checkin,
  CheckinStudyRecord,
  CheckoutResult,
  Course,
  DiscoveryMatch,
  Location,
  PatchRequestBody,
  PostCheckinBody,
  PostRequestBody,
  Profile,
  PutProfileBody,
  RequestDirection,
  OpenSession,
  PatchInvitationBody,
  PatchSessionParticipantBody,
  PostInvitationBody,
  PostSessionBody,
  PostStudyRatingBody,
  ScheduledSession,
  SessionWhen,
  StudyRecord,
  StudyRequest,
  StudyStats,
  University,
} from "@/types/api";

/**
 * Live StudySync client. Calls the same-origin API with the Supabase session
 * cookie. Discovery scores and order come from the server unchanged.
 */

export type DiscoveryFilters = {
  locationId?: string;
  courseId?: string;
};

export function isApiError(value: object): value is ApiError {
  return "error" in value;
}

function apiError(code: ApiErrorCode, message: string, details: Record<string, unknown> = {}): ApiError {
  return { error: { code, message, details } };
}

function isApiErrorBody(value: unknown): value is ApiError {
  if (typeof value !== "object" || value === null || !("error" in value)) return false;
  const error = (value as { error?: unknown }).error;
  if (typeof error !== "object" || error === null) return false;
  const record = error as { code?: unknown; message?: unknown; details?: unknown };
  return (
    typeof record.code === "string" &&
    typeof record.message === "string" &&
    typeof record.details === "object" &&
    record.details !== null
  );
}

async function request<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T | ApiError> {
  try {
    const response = await fetch(path, {
      method: init?.method ?? "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        accept: "application/json",
        ...(init?.body !== undefined ? { "content-type": "application/json" } : {}),
      },
      ...(init?.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    });
    const text = await response.text();
    let parsed: unknown = null;
    if (text) {
      try {
        parsed = JSON.parse(text) as unknown;
      } catch {
        return apiError("INTERNAL_ERROR", "The server returned an unreadable response.");
      }
    }
    if (isApiErrorBody(parsed)) return parsed;
    if (!response.ok || parsed === null) {
      return apiError("INTERNAL_ERROR", "The request failed.");
    }
    return parsed as T;
  } catch {
    return apiError("INTERNAL_ERROR", "The request could not reach StudySync.");
  }
}

function publishWrite<T extends object>(result: T | ApiError): T | ApiError {
  if (!isApiError(result)) bumpRevision();
  return result;
}

export async function getUniversities(): Promise<ApiList<University> | ApiError> {
  return request<ApiList<University>>("/api/universities");
}

export async function getLocations(): Promise<ApiList<Location> | ApiError> {
  return request<ApiList<Location>>("/api/locations");
}

export async function getCourses(query?: string): Promise<ApiList<Course> | ApiError> {
  const params = new URLSearchParams();
  if (query !== undefined && query.trim() !== "") params.set("q", query.trim());
  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  return request<ApiList<Course>>(`/api/courses${suffix}`);
}

export async function getProfile(): Promise<ApiData<Profile | null> | ApiError> {
  return request<ApiData<Profile | null>>("/api/profile");
}

export async function putProfile(body: PutProfileBody): Promise<ApiData<Profile> | ApiError> {
  return publishWrite(await request<ApiData<Profile>>("/api/profile", { method: "PUT", body }));
}

export async function getCheckin(): Promise<ApiData<Checkin | null> | ApiError> {
  return request<ApiData<Checkin | null>>("/api/checkin");
}

export async function postCheckin(body: PostCheckinBody): Promise<ApiData<Checkin> | ApiError> {
  return publishWrite(await request<ApiData<Checkin>>("/api/checkin", { method: "POST", body }));
}

export async function deleteCheckin(): Promise<ApiData<CheckoutResult> | ApiError> {
  return publishWrite(await request<ApiData<CheckoutResult>>("/api/checkin", { method: "DELETE" }));
}

export async function postFinishCheckin(checkinId: string): Promise<ApiData<CheckinStudyRecord> | ApiError> {
  return publishWrite(
    await request<ApiData<CheckinStudyRecord>>(`/api/checkin/${encodeURIComponent(checkinId)}/finish`, { method: "POST" }),
  );
}

export async function getCheckinHistory(): Promise<ApiList<CheckinStudyRecord> | ApiError> {
  return request<ApiList<CheckinStudyRecord>>("/api/checkin/history");
}

export async function getDiscovery(
  filters: DiscoveryFilters = {},
): Promise<ApiList<DiscoveryMatch> | ApiError> {
  const params = new URLSearchParams();
  if (filters.locationId) params.set("locationId", filters.locationId);
  if (filters.courseId) params.set("courseId", filters.courseId);
  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  return request<ApiList<DiscoveryMatch>>(`/api/discovery${suffix}`);
}

export async function getRequests(
  direction: RequestDirection = "all",
): Promise<ApiList<StudyRequest> | ApiError> {
  const params = new URLSearchParams({ direction });
  return request<ApiList<StudyRequest>>(`/api/requests?${params.toString()}`);
}

export async function postRequest(body: PostRequestBody): Promise<ApiData<StudyRequest> | ApiError> {
  return publishWrite(await request<ApiData<StudyRequest>>("/api/requests", { method: "POST", body }));
}

export async function getSessions(
  when: Exclude<SessionWhen, "history" | "missed"> = "upcoming",
): Promise<ApiList<ScheduledSession> | ApiError> {
  return request<ApiList<ScheduledSession>>(`/api/sessions?when=${when}`);
}

export async function getStudyRecords(when: "history" | "missed"): Promise<ApiList<StudyRecord> | ApiError> {
  return request<ApiList<StudyRecord>>(`/api/sessions?when=${when}`);
}

export async function getStudyStats(): Promise<ApiData<StudyStats> | ApiError> {
  return request<ApiData<StudyStats>>("/api/study-stats");
}

export async function getOpenSessions(filters: { courseId?: string; today?: boolean } = {}): Promise<ApiList<OpenSession> | ApiError> {
  const params = new URLSearchParams();
  if (filters.courseId) params.set("courseId", filters.courseId);
  if (filters.today) params.set("today", "true");
  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  return request<ApiList<OpenSession>>(`/api/sessions/open${suffix}`);
}

export async function postSession(body: PostSessionBody): Promise<ApiData<ScheduledSession> | ApiError> {
  return publishWrite(await request<ApiData<ScheduledSession>>("/api/sessions", { method: "POST", body }));
}

export async function postInvitation(
  sessionId: string,
  body: PostInvitationBody,
): Promise<ApiData<ScheduledSession> | ApiError> {
  return publishWrite(
    await request<ApiData<ScheduledSession>>(`/api/sessions/${encodeURIComponent(sessionId)}/invitations`, {
      method: "POST",
      body,
    }),
  );
}

export async function patchInvitation(
  sessionId: string,
  body: PatchInvitationBody,
): Promise<ApiData<ScheduledSession> | ApiError> {
  return publishWrite(
    await request<ApiData<ScheduledSession>>(`/api/sessions/${encodeURIComponent(sessionId)}/invitations`, {
      method: "PATCH",
      body,
    }),
  );
}

export async function postJoin(sessionId: string): Promise<ApiData<ScheduledSession> | ApiError> {
  return publishWrite(
    await request<ApiData<ScheduledSession>>(`/api/sessions/${encodeURIComponent(sessionId)}/join`, { method: "POST" }),
  );
}

export async function patchSessionParticipant(
  sessionId: string,
  userId: string,
  body: PatchSessionParticipantBody,
): Promise<ApiData<ScheduledSession> | ApiError> {
  return publishWrite(
    await request<ApiData<ScheduledSession>>(
      `/api/sessions/${encodeURIComponent(sessionId)}/participants/${encodeURIComponent(userId)}`,
      { method: "PATCH", body },
    ),
  );
}

export async function postLeave(sessionId: string): Promise<ApiData<ScheduledSession> | ApiError> {
  return publishWrite(
    await request<ApiData<ScheduledSession>>(`/api/sessions/${encodeURIComponent(sessionId)}/leave`, { method: "POST" }),
  );
}

export async function postFinish(sessionId: string): Promise<ApiData<StudyRecord> | ApiError> {
  return publishWrite(
    await request<ApiData<StudyRecord>>(`/api/sessions/${encodeURIComponent(sessionId)}/finish`, { method: "POST" }),
  );
}

export async function postMiss(sessionId: string): Promise<ApiData<StudyRecord> | ApiError> {
  return publishWrite(
    await request<ApiData<StudyRecord>>(`/api/sessions/${encodeURIComponent(sessionId)}/miss`, { method: "POST" }),
  );
}

export async function postStudyRating(
  sessionId: string,
  body: PostStudyRatingBody,
): Promise<ApiData<StudyRecord> | ApiError> {
  return publishWrite(
    await request<ApiData<StudyRecord>>(`/api/sessions/${encodeURIComponent(sessionId)}/ratings`, {
      method: "POST",
      body,
    }),
  );
}

export async function postCancelSession(sessionId: string): Promise<ApiData<ScheduledSession> | ApiError> {
  return publishWrite(
    await request<ApiData<ScheduledSession>>(`/api/sessions/${encodeURIComponent(sessionId)}/cancel`, { method: "POST" }),
  );
}

export async function patchRequest(
  id: string,
  body: PatchRequestBody,
): Promise<ApiData<StudyRequest> | ApiError> {
  return publishWrite(
    await request<ApiData<StudyRequest>>(`/api/requests/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body,
    }),
  );
}
