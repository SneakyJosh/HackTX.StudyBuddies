import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { rankCampusPlaces } from "@/lib/campus-rank";
import type { CampusMap, CampusPlace } from "#api";

import { parseCampusMapPayload } from "./campus-map-payload";
import { throwMappedDbError } from "./errors";

function publicPlace(place: CampusPlace & { sortOrder: number }): CampusPlace {
  return {
    id: place.id,
    locationId: place.locationId,
    name: place.name,
    abbreviation: place.abbreviation,
    category: place.category,
    bookingAvailable: place.bookingAvailable,
    mapX: place.mapX,
    mapY: place.mapY,
    anchorLat: place.anchorLat,
    anchorLng: place.anchorLng,
    quietZones: place.quietZones,
    historyVisits: place.historyVisits,
  };
}

export async function loadCampusMap(supabase: SupabaseClient): Promise<CampusMap> {
  const { data, error } = await supabase.rpc("campus_map_payload");
  if (error) throwMappedDbError(error);
  const payload = parseCampusMapPayload(data);
  return {
    studyStyle: payload.studyStyle,
    places: payload.places.map(publicPlace),
    suggestions: rankCampusPlaces(payload.places, payload.studyStyle),
  };
}
