import type { SupabaseClient } from "@supabase/supabase-js";
import { unstable_rethrow } from "next/navigation";
import { NextResponse } from "next/server";

import { API_ERROR_STATUS, type ApiErrorCode } from "@/types/api";

import { copyAuthHeaders } from "./supabase";
import { ContractValidationError } from "./validation";

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly details: Record<string, unknown>;

  constructor(code: ApiErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.details = details;
  }

  get status(): number {
    return API_ERROR_STATUS[this.code];
  }
}

export function validationError(message: string, details: Record<string, unknown> = {}): ApiError {
  return new ApiError("VALIDATION_ERROR", message, details);
}

export function unauthenticatedError(): ApiError {
  return new ApiError("UNAUTHENTICATED", "Authentication required");
}

export function forbiddenError(message: string, details: Record<string, unknown> = {}): ApiError {
  return new ApiError("FORBIDDEN", message, details);
}

export function notFoundError(message: string, details: Record<string, unknown> = {}): ApiError {
  return new ApiError("NOT_FOUND", message, details);
}

export function conflictError(message: string, details: Record<string, unknown> = {}): ApiError {
  return new ApiError("CONFLICT", message, details);
}

export function internalError(message = "Internal server error"): ApiError {
  return new ApiError("INTERNAL_ERROR", message);
}

const CODED_DB_ERROR = /^(VALIDATION|FORBIDDEN|NOT_FOUND|CONFLICT|UNAUTHENTICATED): (.*)$/;

export function throwMappedDbError(error: { code?: string; message?: string }): never {
  const match = CODED_DB_ERROR.exec(error.message ?? "");
  if (match) {
    const [, code, text] = match;
    if (code === "VALIDATION") throw new ApiError("VALIDATION_ERROR", text || "Validation failed");
    if (code === "FORBIDDEN") throw new ApiError("FORBIDDEN", text || "Forbidden");
    if (code === "NOT_FOUND") throw new ApiError("NOT_FOUND", text || "Not found");
    if (code === "CONFLICT") throw new ApiError("CONFLICT", text || "Conflict");
    throw new ApiError("UNAUTHENTICATED", "Authentication required");
  }
  if (error.code === "P0001") throw new ApiError("CONFLICT", "Conflict");
  if (error.code === "P0002") throw new ApiError("NOT_FOUND", "Not found");
  if (error.code === "28000") throw new ApiError("UNAUTHENTICATED", "Authentication required");
  if (error.code === "23505") {
    throw new ApiError("CONFLICT", "A pending or accepted request already exists");
  }
  if (error.code === "23514") throw new ApiError("VALIDATION_ERROR", "Validation failed");
  if (error.code === "42501") throw new ApiError("FORBIDDEN", "Forbidden");
  if (error.code === "23503") throw new ApiError("NOT_FOUND", "Resource not found");
  console.error("Database error:", error.code ?? "unknown");
  throw new ApiError("INTERNAL_ERROR", "Internal server error");
}

export function apiErrorResponse(error: unknown): NextResponse {
  if (error instanceof ContractValidationError) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: error.message, details: error.details } },
      { status: API_ERROR_STATUS.VALIDATION_ERROR },
    );
  }
  if (error instanceof ApiError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message, details: error.details } },
      { status: error.status },
    );
  }
  console.error("Unhandled API error:", error instanceof Error ? error.message : "unknown error");
  const fallback = internalError();
  return NextResponse.json(
    { error: { code: fallback.code, message: fallback.message, details: {} } },
    { status: fallback.status },
  );
}

function isNextControlFlowError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("digest" in error)) return false;
  const { digest } = error as { digest: unknown };
  return typeof digest === "string" && digest.startsWith("NEXT_");
}

export async function handleApi(handler: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await handler();
  } catch (error) {
    // cookies() rejects when a prerender finishes. Catching that rejection
    // turns it into a logged 500. Give it back to Next.js, along with
    // redirect and notFound control flow.
    unstable_rethrow(error);
    if (isNextControlFlowError(error)) throw error;
    return apiErrorResponse(error);
  }
}

export function listResponse<T>(data: T[], client?: SupabaseClient): NextResponse {
  const response = NextResponse.json({ data, meta: { count: data.length } });
  return client ? copyAuthHeaders(client, response) : response;
}

export function dataResponse<T>(data: T, status = 200, client?: SupabaseClient): NextResponse {
  const response = NextResponse.json({ data }, { status });
  return client ? copyAuthHeaders(client, response) : response;
}
