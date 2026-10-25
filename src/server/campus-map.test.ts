import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { CAMPUS_PLACE_SCORE, filterCampusPlaces, rankCampusPlaces, type CampusRankPlace } from "../lib/campus-rank.ts";
import {
  POSITRON_STYLE_URL,
  basemapFailure,
  campusFitBounds,
  collisionOffsets,
  placesToFeatures,
  rememberDeviceFix,
} from "../lib/campus-map-geo.ts";
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

test("the coffee filter returns cafes and quiet keeps only buildings with a zone", () => {
  const suggestions = rankCampusPlaces(catalog, "quiet");
  const coffee = filterCampusPlaces(catalog, suggestions, "coffee");
  assert.deepEqual(coffee, { places: [], suggestions: [] });
  const cafeId = "55555555-5555-4555-8555-555555555513";
  const withCafe = [...catalog, place({ id: cafeId, abbreviation: "LPC", category: "cafe", sortOrder: 13, locationId: "11111111-1111-4111-8111-11111111111e" })];
  const cafeSuggestions = rankCampusPlaces(withCafe, "quiet");
  const cafes = filterCampusPlaces(withCafe, cafeSuggestions, "coffee");
  assert.deepEqual(cafes.places.map((item) => item.id), [cafeId]);
  assert.equal(cafes.places[0]?.quietZones.length, 0);
  const cafeScore = cafeSuggestions.find((item) => item.placeId === cafeId);
  assert.equal(cafeScore?.placeScore, 0);
  assert.equal(cafeScore?.reasons.some((reason) => reason.toLowerCase().includes("quiet")), false);
  const quiet = filterCampusPlaces(withCafe, cafeSuggestions, "quiet");
  assert.deepEqual(
    quiet.places.map((item) => item.id),
    [PCL, LAB],
  );
  assert.equal(quiet.places.some((item) => item.category === "cafe"), false);
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
  assert.equal(parsed.places[0]?.anchorLat, null);
  assert.equal(parsed.places[0]?.anchorLng, null);
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
  const anchored = payload();
  Object.assign(anchored.places[0], { anchorLat: 30.282757, anchorLng: -97.738208 });
  const parsed = parseCampusMapPayload(anchored);
  assert.equal(parsed.places[0]?.anchorLat, 30.282757);
  assert.equal(parsed.places[0]?.anchorLng, -97.738208);
  const outside = payload();
  Object.assign(outside.places[0], { anchorLat: 40, anchorLng: -97.738208 });
  assert.throws(() => parseCampusMapPayload(outside), /Invalid campus map payload/);
  const half = payload();
  Object.assign(half.places[0], { anchorLat: 30.282757 });
  assert.throws(() => parseCampusMapPayload(half), /Invalid campus map payload/);
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
  assert.equal(sql.includes("anchor_lat"), false);
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
  assert.match(view, /mapX/);
  assert.match(view, /Try the street map again/);
  assert.match(view, /studyLocation=/);
  assert.match(view, /scheduleLocation=/);
});

test("street map anchors stay public building positions and do not carry a device fix", () => {
  const anchors = placesToFeatures([
    {
      id: PCL,
      name: "Perry-Castañeda Library",
      abbreviation: "PCL",
      category: "library",
      anchorLat: 30.282757,
      anchorLng: -97.738208,
    },
    {
      id: UNB,
      name: "Union Building",
      abbreviation: "UNB",
      category: "student_hub",
      anchorLat: 30.28663,
      anchorLng: -97.74116,
    },
  ]);
  assert.equal(anchors.features.length, 2);
  assert.deepEqual(anchors.features[0]?.geometry.coordinates, [-97.738208, 30.282757]);
  assert.equal(JSON.stringify(anchors).includes("historyVisits"), false);
  const bounds = campusFitBounds(anchors.features.map((feature) => ({
    anchorLng: feature.geometry.coordinates[0],
    anchorLat: feature.geometry.coordinates[1],
  })));
  assert.equal(bounds[0][0] < bounds[1][0], true);
  const offsets = collisionOffsets([
    { id: "a", x: 0, y: 0 },
    { id: "b", x: 10, y: 8 },
  ]);
  const moved = { x: 10 + (offsets.b?.x ?? 0), y: 8 + (offsets.b?.y ?? 0) };
  assert.equal(Math.hypot(moved.x, moved.y) >= 46, true);
  assert.equal(rememberDeviceFix(31, -97.74), null);
  assert.deepEqual(rememberDeviceFix(30.285, -97.738), { north: 30.285, west: -97.738 });
  assert.equal(basemapFailure(true, "Failed to fetch style"), false);
  assert.equal(basemapFailure(false, "Failed to fetch style"), true);
  assert.equal(basemapFailure(false, "Failed to fetch", "https://tiles.openfreemap.org/planet/14/0/0.pbf"), false);
  assert.equal(basemapFailure(false, "sprite missing"), false);
  const sql = readFileSync("supabase/migrations/0011_campus_map_anchors.sql", "utf8");
  const previous = readFileSync("supabase/migrations/0010_campus_map.sql", "utf8");
  assert.equal(previous.includes("anchor_lat"), false);
  assert.match(sql, /add column anchor_lat/);
  assert.match(sql, /place_row\.map_x/);
  assert.match(sql, /'anchorLat', place_row\.anchor_lat/);
  assert.match(sql, /attendance_row\.user_id = uid/);
  assert.match(sql, /record_row\.user_id = uid/);
  assert.equal(/insert into public\.locations/i.test(sql), false);
  assert.equal(/alter table public\.locations/i.test(sql), false);
  assert.equal(sql.includes("discovery_candidates"), false);
  assert.equal(sql.includes("email"), false);
  for (const pair of ["30.282757", "-97.738208", "30.286630", "-97.741160", "30.288824", "-97.736097"]) {
    assert.equal(sql.includes(pair), true, pair);
  }
  const canvas = readFileSync("src/components/campus-map-canvas.tsx", "utf8");
  assert.equal(POSITRON_STYLE_URL, "https://tiles.openfreemap.org/styles/positron");
  assert.match(canvas, /style: POSITRON_STYLE_URL/);
  assert.match(canvas, /compact: false/);
  assert.match(canvas, /Reset to campus/);
  assert.match(canvas, /getCurrentPosition/);
  assert.equal(canvas.includes("watchPosition"), false);
  assert.equal(canvas.includes("localStorage"), false);
  assert.equal(canvas.includes("getCampusMap"), false);
  assert.equal(canvas.includes("fetch("), false);
  assert.match(canvas, /rememberDeviceFix/);
  const matching = readFileSync("src/server/matching.ts", "utf8");
  assert.equal(matching.includes("anchor_lat"), false);
  assert.equal(MATCH_POINTS.sameLocation, 20);
});

test("study locations keep the original three ids and reject a non-bookable parent", () => {
  const sql = readFileSync("supabase/migrations/0012_study_locations.sql", "utf8");
  const earlier = ["0010_campus_map.sql", "0011_campus_map_anchors.sql"];
  for (const file of earlier) {
    const source = readFileSync(`supabase/migrations/${file}`, "utf8");
    assert.equal(/kind text/i.test(source), false, file);
    assert.equal(source.includes("Littlefield Patio Cafe"), false, file);
  }
  assert.equal(sql.includes("11111111-1111-4111-8111-111111111111"), false);
  assert.equal(sql.includes("11111111-1111-4111-8111-111111111112"), false);
  assert.equal(sql.includes("11111111-1111-4111-8111-111111111113"), false);
  assert.match(sql, /and place_row\.location_id is null/);
  assert.match(sql, /on conflict \(id\) do nothing/);
  assert.match(sql, /'Littlefield Patio Cafe'/);
  assert.match(sql, /'Up and Atom'/);
  assert.match(sql, /'Medici Roasting'/);
  assert.match(sql, /'11111111-1111-4111-8111-11111111111d'/);
  assert.match(sql, /and is_active and bookable/);
  assert.match(sql, /and l\.is_active and l\.bookable/);
  assert.equal(sql.includes("discovery_candidates"), false);
  assert.equal(/pg_catalog\.(least|greatest)\(new\./.test(sql), false);
  for (const forbidden of ["latitude", "email", "occupancy", "noise", "serpapi", "stars", "display_name", "roster", "is_quiet"]) {
    assert.equal(sql.toLowerCase().includes(forbidden), false, forbidden);
  }
  const catalogSource = readFileSync("src/server/catalog.ts", "utf8");
  assert.match(catalogSource, /eq\("bookable", true\)/);
  const matching = readFileSync("src/server/matching.ts", "utf8");
  assert.equal(matching.includes("parent_location_id"), false);
  assert.equal(MATCH_POINTS.sameLocation, 20);
  const parsed = parseCampusMapPayload(payload({
    category: "cafe",
    quietZones: [],
    parent: { name: "Robert A. Welch Hall", buildingCode: "WEL" },
    detail: "Coffee shop inside Welch Hall, 105 E 24th St.",
  }));
  assert.equal(parsed.places[0]?.category, "cafe");
  assert.equal(parsed.places[0]?.parent?.buildingCode, "WEL");
  assert.equal(parsed.places[0]?.detail?.includes("105 E 24th St"), true);
  const legacy = parseCampusMapPayload(payload());
  assert.equal(legacy.places[0]?.parent, null);
  assert.equal(legacy.places[0]?.detail, null);
});
