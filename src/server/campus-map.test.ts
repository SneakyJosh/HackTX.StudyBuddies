import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { CAMPUS_PLACE_SCORE, filterCampusPlaces, rankCampusPlaces, type CampusRankPlace } from "../lib/campus-rank.ts";
import { parseCampusMapPayload } from "./campus-map-payload.ts";
import { DEMO_LOCATIONS, MATCH_POINTS } from "#api";

const PCL = "55555555-5555-4555-8555-555555555501";
const EER = "55555555-5555-4555-8555-555555555502";
const UNB = "55555555-5555-4555-8555-555555555503";
const WCP = "55555555-5555-4555-8555-555555555511";
const LAB = "55555555-5555-4555-8555-555555555520";

function place(overrides: Partial<CampusRankPlace> & Pick<CampusRankPlace, "id" | "abbreviation" | "category" | "sortOrder">): CampusRankPlace {
  return {
    locationId: null,
    quietZones: [],
    historyVisits: 0,
    ...overrides,
  };
}

const catalog: CampusRankPlace[] = [
  place({
    id: PCL,
    abbreviation: "PCL",
    category: "library",
    sortOrder: 1,
    locationId: DEMO_LOCATIONS[0].id,
    quietZones: [{ name: "Floors 3 and 4" }, { name: "Floor 6" }],
  }),
  place({
    id: EER,
    abbreviation: "EER",
    category: "academic_center",
    sortOrder: 2,
    locationId: DEMO_LOCATIONS[1].id,
  }),
  place({
    id: UNB,
    abbreviation: "UNB",
    category: "student_hub",
    sortOrder: 3,
    locationId: DEMO_LOCATIONS[2].id,
  }),
  place({ id: WCP, abbreviation: "WCP", category: "student_hub", sortOrder: 11 }),
  place({
    id: LAB,
    abbreviation: "LAB",
    category: "academic_center",
    sortOrder: 8,
    quietZones: [{ name: "Floor 2 reading room" }],
  }),
];

test("quiet study ranks a verified zone without calling the whole building quiet", () => {
  const ranked = rankCampusPlaces(catalog, "quiet");
  assert.equal(ranked[0]?.placeId, PCL);
  assert.equal(ranked[0]?.placeScore, CAMPUS_PLACE_SCORE.verifiedQuietZoneWhenQuiet + CAMPUS_PLACE_SCORE.libraryWhenQuiet);
  const pcl = ranked[0];
  assert.match(pcl?.reasons.join(" ") ?? "", /Verified quiet zone: Floors 3 and 4, Floor 6/);
  assert.equal((pcl?.reasons.join(" ") ?? "").toLowerCase().includes("quiet building"), false);
  assert.equal((pcl?.reasons.join(" ") ?? "").toLowerCase().includes("quiet-only"), false);
  const lab = ranked.find((item) => item.placeId === LAB);
  const eer = ranked.find((item) => item.placeId === EER);
  assert.ok(lab && eer);
  assert.ok(lab.placeScore > eer.placeScore);
  assert.match(lab.reasons.join(" "), /Floor 2 reading room/);
  assert.equal(ranked.find((item) => item.placeId === UNB)?.reasons.some((reason) => reason.startsWith("Verified quiet zone")), false);
});

test("collaborative study ranks student hubs, then catalog order", () => {
  const ranked = rankCampusPlaces(catalog, "collaborative");
  assert.equal(ranked[0]?.placeId, UNB);
  assert.equal(ranked[1]?.placeId, WCP);
  assert.equal(ranked[0]?.placeScore, CAMPUS_PLACE_SCORE.studentHubWhenCollaborative);
  const eer = ranked.findIndex((item) => item.placeId === EER);
  const pcl = ranked.findIndex((item) => item.placeId === PCL);
  assert.ok(eer > 1);
  assert.ok(pcl > eer);
});

test("flexible study and a missing profile use style points, then catalog order", () => {
  const flexible = rankCampusPlaces(catalog, "flexible");
  assert.equal(flexible[0]?.placeId, EER);
  const cold = rankCampusPlaces(catalog, null);
  assert.deepEqual(
    cold.map((item) => item.placeId),
    [PCL, EER, UNB, LAB, WCP],
  );
  assert.ok(cold.every((item) => item.placeScore === 0));
});

test("only the caller's finished check-in locations get a familiarity boost", () => {
  const withHistory = catalog.map((item) =>
    item.id === EER ? { ...item, historyVisits: 3 } : item.id === WCP ? { ...item, historyVisits: 9 } : item,
  );
  const ranked = rankCampusPlaces(withHistory, null);
  assert.equal(ranked[0]?.placeId, EER);
  assert.equal(ranked[0]?.placeScore, CAMPUS_PLACE_SCORE.callerHistory);
  assert.equal(ranked.find((item) => item.placeId === WCP)?.placeScore, 0);
  assert.equal(ranked.find((item) => item.placeId === WCP)?.reasons.includes("You have finished studying here"), false);
});

test("the coffee filter is empty and quiet keeps only buildings with a zone", () => {
  const suggestions = rankCampusPlaces(catalog, "quiet");
  const coffee = filterCampusPlaces(catalog, suggestions, "coffee");
  assert.deepEqual(coffee, { places: [], suggestions: [] });
  const quiet = filterCampusPlaces(catalog, suggestions, "quiet");
  assert.deepEqual(
    quiet.places.map((item) => item.id),
    [PCL, LAB],
  );
  assert.equal(quiet.places.some((item) => item.category === "student_hub"), false);
});

function payload(extra: Record<string, unknown> = {}) {
  return {
    studyStyle: "quiet",
    places: [
      {
        id: PCL,
        locationId: DEMO_LOCATIONS[0].id,
        name: "Perry-Castañeda Library",
        abbreviation: "PCL",
        category: "library",
        bookingAvailable: true,
        mapX: 49.92,
        mapY: 76.76,
        sortOrder: 1,
        quietZones: [
          { id: "66666666-6666-4666-8666-666666666601", name: "Floors 3 and 4", detail: "Open stacks seating for quiet individual study." },
        ],
        historyVisits: 0,
        ...extra,
      },
    ],
  };
}

test("the campus map parser keeps schematic fields and drops nothing it does not know", () => {
  const parsed = parseCampusMapPayload(payload());
  assert.equal(parsed.studyStyle, "quiet");
  assert.equal(parsed.places[0]?.bookingAvailable, true);
  assert.equal(parsed.places[0]?.category, "library");
  assert.equal(parsed.places[0]?.quietZones.length, 1);
  const mapOnly = parseCampusMapPayload({
    studyStyle: null,
    places: [
      {
        id: LAB,
        locationId: null,
        name: "Sample Lab",
        abbreviation: "LAB",
        category: "academic_center",
        bookingAvailable: false,
        mapX: 10,
        mapY: 10,
        sortOrder: 4,
        quietZones: [{ id: "66666666-6666-4666-8666-666666666603", name: "Floor 2 reading room", detail: "One quiet room." }],
        historyVisits: 0,
      },
    ],
  });
  assert.equal(mapOnly.places[0]?.locationId, null);
  assert.equal(mapOnly.places[0]?.category, "academic_center");
});

test("the campus map parser rejects coordinates, ratings, occupancy, and a quiet-only flag", () => {
  for (const key of ["latitude", "longitude", "email", "noise", "occupancy", "rating", "stars", "compatibilityScore", "quietOnly"]) {
    const body = payload();
    (body.places[0] as Record<string, unknown>)[key] = key === "latitude" ? 30.28 : "hidden";
    assert.throws(() => parseCampusMapPayload(body), /Invalid campus map payload/, key);
  }
  const mismatched = payload();
  mismatched.places[0].bookingAvailable = false;
  assert.throws(() => parseCampusMapPayload(mismatched), /Invalid campus map payload/);
});

test("the campus map migration stays map-only and leaves check-in locations alone", () => {
  const sql = readFileSync("supabase/migrations/0010_campus_map.sql", "utf8");
  assert.equal(/insert into public\.locations/i.test(sql), false);
  assert.equal(/alter table public\.locations/i.test(sql), false);
  assert.equal(sql.includes("discovery_candidates"), false);
  assert.equal(/pg_catalog\.(least|greatest)\(new\./.test(sql), false);
  for (const forbidden of ["latitude", "email", "occupancy", "noise", "serpapi", "stars", "display_name", "roster", "is_quiet"]) {
    assert.equal(sql.toLowerCase().includes(forbidden), false, forbidden);
  }
  for (const retired of ["'RLM'", "'SAC'", "'UNION'"]) {
    assert.equal(sql.includes(retired), false, retired);
  }
  const locationIds = [...sql.matchAll(/11111111-1111-4111-8111-11111111111[123]/g)].map((match) => match[0]);
  assert.deepEqual(locationIds, [DEMO_LOCATIONS[0].id, DEMO_LOCATIONS[1].id, DEMO_LOCATIONS[2].id]);
  const zones = sql.slice(sql.indexOf("insert into public.campus_quiet_zones"));
  assert.match(zones, /Floors 3 and 4/);
  assert.match(zones, /Floor 6/);
  assert.equal(zones.includes("Floor 5"), false);
  assert.equal(zones.includes("55555555-5555-4555-8555-555555555501"), true);
  assert.equal(zones.includes("55555555-5555-4555-8555-555555555502"), false);
  assert.match(sql, /attendance_row\.user_id = uid/);
  assert.match(sql, /record_row\.user_id = uid/);
  assert.equal(sql.includes("study_session_ratings"), false);
  assert.equal(sql.includes("checkin_study_ratings"), false);
  assert.match(sql, /revoke all on public\.campus_places from public, anon, authenticated;/);
  assert.match(sql, /grant execute on function public\.campus_map_payload\(\) to authenticated;/);
  assert.match(sql, /'UNB'/);
  assert.match(sql, /'PMA'/);
  assert.match(sql, /'WCP'/);
  const catalogSource = readFileSync("src/server/catalog.ts", "utf8");
  assert.match(catalogSource, /select\("id, university_id, name, building_code, description"\)/);
  const matching = readFileSync("src/server/matching.ts", "utf8");
  assert.equal(matching.includes("campus_places"), false);
  assert.equal(matching.includes("placeScore"), false);
  assert.equal(MATCH_POINTS.sameActiveCourse, 40);
  assert.equal(MATCH_POINTS.studyStyle, 20);
  for (const file of ["src/components/schedule-sheet.tsx", "src/components/checkin-panel.tsx", "src/components/focus-sheet.tsx"]) {
    assert.equal(readFileSync(file, "utf8").includes("getCampusMap"), false, file);
  }
  const sessions = readFileSync("src/components/sessions-board.tsx", "utf8");
  assert.match(sessions, /href="\/map"/);
  assert.match(sessions, /Campus map/);
  const view = readFileSync("src/components/campus-map.tsx", "utf8");
  assert.match(view, /min-h-11/);
  assert.match(view, /aria-pressed/);
  assert.match(view, /Quiet zones inside this building/);
  for (const forbidden of ["serpapi", "occupancy", "latitude", "compatibilityScore"]) {
    assert.equal(view.toLowerCase().includes(forbidden), false, forbidden);
  }
});
