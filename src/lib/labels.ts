import type { AcademicYear, Availability, RequestStatus, StudyStyle } from "@/types/api";

export const ACADEMIC_YEARS = [
  "freshman",
  "sophomore",
  "junior",
  "senior",
  "graduate",
  "other",
] as const satisfies readonly AcademicYear[];

export const STUDY_STYLES = ["quiet", "collaborative", "flexible"] as const satisfies readonly StudyStyle[];

export const AVAILABILITIES = [
  "available",
  "questions_only",
  "focused",
] as const satisfies readonly Availability[];

type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type AssertTrue<T extends true> = T;

/** Compile-time check that the option lists cover the contract unions. */
export type FixtureOptionCoverage = AssertTrue<
  Equal<(typeof ACADEMIC_YEARS)[number], AcademicYear>
> &
  AssertTrue<Equal<(typeof STUDY_STYLES)[number], StudyStyle>> &
  AssertTrue<Equal<(typeof AVAILABILITIES)[number], Availability>>;

export const ACADEMIC_YEAR_LABELS: Record<AcademicYear, string> = {
  freshman: "Freshman",
  sophomore: "Sophomore",
  junior: "Junior",
  senior: "Senior",
  graduate: "Graduate",
  other: "Other",
};

export const STUDY_STYLE_LABELS: Record<StudyStyle, string> = {
  quiet: "Quiet",
  collaborative: "Collaborative",
  flexible: "Flexible",
};

export const AVAILABILITY_LABELS: Record<Availability, string> = {
  available: "Available",
  questions_only: "Questions only",
  focused: "Focused",
};

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  pending: "Pending",
  accepted: "Connected",
  declined: "Declined",
  cancelled: "Cancelled",
};

export function formatTimestamp(iso: string): string {
  const [date, time] = iso.split("T");
  if (!date || !time) return iso;
  return `${date} ${time.slice(0, 5)} UTC`;
}

export function formatPersonMeta(major: string | null, academicYear: AcademicYear | null): string {
  const parts = [major, academicYear ? ACADEMIC_YEAR_LABELS[academicYear] : null].filter(
    (part): part is string => typeof part === "string" && part.length > 0,
  );
  return parts.length > 0 ? parts.join(" · ") : "Major and year not set";
}
