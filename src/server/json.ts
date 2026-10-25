import { ApiError } from "./errors";

export function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ApiError("INTERNAL_ERROR", "Internal server error");
  }
  return value as Record<string, unknown>;
}

export function asArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) {
    throw new ApiError("INTERNAL_ERROR", "Internal server error");
  }
  return value;
}

export function asString(value: unknown): string {
  if (typeof value !== "string") {
    throw new ApiError("INTERNAL_ERROR", "Internal server error");
  }
  return value;
}

export function asNullableString(value: unknown): string | null {
  if (value === null) return null;
  return asString(value);
}

export function asBoolean(value: unknown): boolean {
  if (typeof value !== "boolean") {
    throw new ApiError("INTERNAL_ERROR", "Internal server error");
  }
  return value;
}

export function asNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ApiError("INTERNAL_ERROR", "Internal server error");
  }
  return value;
}

export function asStringArray(value: unknown): string[] {
  return asArray(value).map((entry) => asString(entry));
}

export function asIsoTimestamp(value: unknown): string {
  const raw = asString(value);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new ApiError("INTERNAL_ERROR", "Internal server error");
  }
  return date.toISOString();
}
