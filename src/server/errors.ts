import { NextResponse } from "next/server";

import { API_ERROR_STATUS, type ApiErrorCode } from "@/types/api";

/** An error that maps directly onto the contract's error envelope. */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly details: Record<string, unknown>;

  constructor(
    code: ApiErrorCode,
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.details = details;
  }

  get status(): number {
    return API_ERROR_STATUS[this.code];
  }
}

export function validationError(
  message: string,
  details: Record<string, unknown> = {},
): ApiError {
  return new ApiError("VALIDATION_ERROR", message, details);
}

export function unauthenticatedError(): ApiError {
  return new ApiError("UNAUTHENTICATED", "Authentication required");
}

export function internalError(message = "Internal server error"): ApiError {
  return new ApiError("INTERNAL_ERROR", message);
}

/**
 * Convert any thrown value into the contract error response.
 * Unexpected failures are logged server-side (message only, never request
 * data or credentials) and reported as a generic 500.
 */
export function apiErrorResponse(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message, details: error.details } },
      { status: error.status },
    );
  }

  console.error(
    "Unhandled API error:",
    error instanceof Error ? error.message : "unknown error",
  );
  const fallback = internalError();
  return NextResponse.json(
    { error: { code: fallback.code, message: fallback.message, details: {} } },
    { status: fallback.status },
  );
}

/**
 * Next.js control-flow signals (prerender bailout, redirect, not-found)
 * are thrown as errors with a NEXT_* digest. They are not API failures and
 * must propagate, otherwise a route that touches runtime data such as
 * searchParams or cookies cannot bail out of prerendering correctly.
 */
function isNextControlFlowError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("digest" in error)) {
    return false;
  }
  const { digest } = error as { digest: unknown };
  return typeof digest === "string" && digest.startsWith("NEXT_");
}

/** Run a route handler, normalizing every failure to the error envelope. */
export async function handleApi(
  handler: () => Promise<NextResponse>,
): Promise<NextResponse> {
  try {
    return await handler();
  } catch (error) {
    if (isNextControlFlowError(error)) {
      throw error;
    }
    return apiErrorResponse(error);
  }
}

export function listResponse<T>(data: T[]): NextResponse {
  return NextResponse.json({ data, meta: { count: data.length } });
}
