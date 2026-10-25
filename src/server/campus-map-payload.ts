import type { CampusCategory, CampusPlace, CampusQuietZone, StudyStyle } from "#api";

const CATEGORIES = new Set<CampusCategory>(["library", "academic_center", "student_hub"]);
const STUDY_STYLES = new Set<StudyStyle>(["quiet", "collaborative", "flexible"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FORBIDDEN = new Set([
  "latitude",
  "longitude",
  "lat",
  "lng",
  "email",
  "noise",
  "noiseLevel",
  "occupancy",
  "rating",
  "ratings",
  "stars",
  "compatibilityScore",
  "friends",
  "userId",
  "quietOnly",
  "isQuiet",
]);

export type CampusPlaceRecord = CampusPlace & { sortOrder: number };

export type CampusMapPayload = {
  studyStyle: StudyStyle | null;
  places: CampusPlaceRecord[];
};

function badPayload(): never {
  throw new Error("Invalid campus map payload");
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) badPayload();
  return value as Record<string, unknown>;
}

function exactKeys(row: Record<string, unknown>, keys: readonly string[]): void {
  const actual = Object.keys(row);
  if (actual.length !== keys.length || keys.some((key) => !Object.prototype.hasOwnProperty.call(row, key))) {
    badPayload();
  }
}

function rejectForbidden(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) rejectForbidden(item);
    return;
  }
  if (typeof value !== "object" || value === null) return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN.has(key)) badPayload();
    rejectForbidden(child);
  }
}

function asUuid(value: unknown): string {
  if (typeof value !== "string" || !UUID.test(value)) badPayload();
  return value;
}

function asText(value: unknown, max: number): string {
  if (typeof value !== "string") badPayload();
  const trimmed = value.trim();
  if (trimmed.length < 1 || trimmed.length > max) badPayload();
  return trimmed;
}

function asPercent(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) badPayload();
  return value;
}

function asAnchor(value: unknown, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) badPayload();
  return value;
}

function sameKeys(row: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(row);
  return actual.length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(row, key));
}

function asCount(value: unknown, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > max) badPayload();
  return value;
}

function asZone(value: unknown): CampusQuietZone {
  const row = asRecord(value);
  exactKeys(row, ["id", "name", "detail"]);
  return {
    id: asUuid(row.id),
    name: asText(row.name, 80),
    detail: asText(row.detail, 240),
  };
}

const PLACE_KEYS = [
  "id",
  "locationId",
  "name",
  "abbreviation",
  "category",
  "bookingAvailable",
  "mapX",
  "mapY",
  "sortOrder",
  "quietZones",
  "historyVisits",
] as const;

function asPlace(value: unknown): CampusPlaceRecord {
  const row = asRecord(value);
  const withAnchors = sameKeys(row, [...PLACE_KEYS, "anchorLat", "anchorLng"]);
  if (!withAnchors && !sameKeys(row, PLACE_KEYS)) badPayload();
  const category = row.category;
  if (typeof category !== "string" || !CATEGORIES.has(category as CampusCategory)) badPayload();
  const abbreviation = asText(row.abbreviation, 6);
  if (!/^[A-Z0-9]{2,6}$/.test(abbreviation)) badPayload();
  const locationId = row.locationId === null ? null : asUuid(row.locationId);
  const bookingAvailable = row.bookingAvailable;
  if (typeof bookingAvailable !== "boolean" || bookingAvailable !== (locationId !== null)) badPayload();
  if (!Array.isArray(row.quietZones) || row.quietZones.length > 12) badPayload();
  const quietZones = row.quietZones.map(asZone);
  return {
    id: asUuid(row.id),
    locationId,
    name: asText(row.name, 120),
    abbreviation,
    category: category as CampusCategory,
    bookingAvailable,
    mapX: asPercent(row.mapX),
    mapY: asPercent(row.mapY),
    anchorLat: withAnchors ? asAnchor(row.anchorLat, 30.27, 30.3) : null,
    anchorLng: withAnchors ? asAnchor(row.anchorLng, -97.75, -97.72) : null,
    sortOrder: asCount(row.sortOrder, 1000),
    quietZones,
    historyVisits: asCount(row.historyVisits, 1000),
  };
}

export function parseCampusMapPayload(value: unknown): CampusMapPayload {
  rejectForbidden(value);
  const row = asRecord(value);
  exactKeys(row, ["studyStyle", "places"]);
  let studyStyle: StudyStyle | null = null;
  if (row.studyStyle !== null) {
    if (typeof row.studyStyle !== "string" || !STUDY_STYLES.has(row.studyStyle as StudyStyle)) badPayload();
    studyStyle = row.studyStyle as StudyStyle;
  }
  if (!Array.isArray(row.places) || row.places.length > 100) badPayload();
  const places = row.places.map(asPlace);
  const ids = new Set(places.map((place) => place.id));
  if (ids.size !== places.length) badPayload();
  return { studyStyle, places };
}
