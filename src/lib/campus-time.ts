import { CAMPUS_TIME_ZONE, VALIDATION } from "#api";

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Chicago observes UTC-6 (CST) and UTC-5 (CDT) only. */
const CHICAGO_OFFSETS_MS = [5 * 60 * 60 * 1000, 6 * 60 * 60 * 1000];

export type CampusTimeFailure =
  | "invalid-date"
  | "invalid-time"
  | "grid"
  | "nonexistent"
  | "ambiguous"
  | "past"
  | "too-far";

export type CampusTimeResult =
  | { ok: true; startsAt: string }
  | { ok: false; reason: CampusTimeFailure };

type WallClock = { year: number; month: number; day: number; hour: number; minute: number };

function wallClock(instant: Date): WallClock {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CAMPUS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: read("year"), month: read("month"), day: read("day"), hour: read("hour"), minute: read("minute") };
}

function sameWallClock(instantMs: number, target: WallClock): boolean {
  const actual = wallClock(new Date(instantMs));
  return (
    actual.year === target.year &&
    actual.month === target.month &&
    actual.day === target.day &&
    actual.hour === target.hour &&
    actual.minute === target.minute
  );
}

/**
 * Resolve a campus wall-clock time to one UTC instant.
 * A daylight-saving gap or overlap is a failure. Neither offset is chosen for the caller.
 */
export function resolveCampusStart(localDate: string, localTime: string, now: Date): CampusTimeResult {
  const dateMatch = DATE_RE.exec(localDate);
  const timeMatch = TIME_RE.exec(localTime);
  if (!dateMatch) return { ok: false, reason: "invalid-date" };
  if (!timeMatch) return { ok: false, reason: "invalid-time" };
  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  if (minute % VALIDATION.sessionMinuteStep !== 0) return { ok: false, reason: "grid" };
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
    return { ok: false, reason: "invalid-date" };
  }
  const target = { year, month, day, hour, minute };
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const hits = CHICAGO_OFFSETS_MS.filter((offset) => sameWallClock(asUtc + offset, target));
  if (hits.length === 0) return { ok: false, reason: "nonexistent" };
  if (hits.length > 1) return { ok: false, reason: "ambiguous" };
  const startsAtMs = asUtc + hits[0];
  if (startsAtMs <= now.getTime()) return { ok: false, reason: "past" };
  const horizon = now.getTime() + VALIDATION.sessionHorizonDays * 24 * 60 * 60 * 1000;
  if (startsAtMs > horizon) return { ok: false, reason: "too-far" };
  return { ok: true, startsAt: new Date(startsAtMs).toISOString() };
}

export function formatCampusTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: CAMPUS_TIME_ZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
  return formatted;
}

export const CAMPUS_TIME_MESSAGES: Record<CampusTimeFailure, string> = {
  "invalid-date": "Enter a real date as YYYY-MM-DD.",
  "invalid-time": "Enter a time as HH:MM.",
  grid: "Choose a time on a 5-minute grid.",
  nonexistent: "That time does not exist in America/Chicago.",
  ambiguous: "That time happens twice in America/Chicago. Choose a different time.",
  past: "That time has passed in America/Chicago.",
  "too-far": "Pick a time within the next 180 days.",
};
