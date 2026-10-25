export const POSITRON_STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

/** West, south, east, north. Keeps pan and zoom on main campus. */
export const CAMPUS_MAX_BOUNDS: [[number, number], [number, number]] = [
  [-97.748, 30.278],
  [-97.73, 30.292],
];

export const CAMPUS_CLUSTER_RADIUS = 56;
export const CAMPUS_CLUSTER_MAX_ZOOM = 16;

export const BASEMAP_PAINT: { layer: string; property: string; value: string }[] = [
  { layer: "background", property: "background-color", value: "#e7f4fb" },
  { layer: "park", property: "fill-color", value: "#d5efc4" },
  { layer: "landcover_wood", property: "fill-color", value: "#cfe8bc" },
  { layer: "water", property: "fill-color", value: "#b7dff5" },
  { layer: "waterway", property: "line-color", value: "#8ec8e6" },
  { layer: "building", property: "fill-color", value: "#f7fbff" },
  { layer: "building", property: "fill-outline-color", value: "#9ec3d8" },
  { layer: "highway_path", property: "line-color", value: "#7ea8c0" },
  { layer: "highway_minor", property: "line-color", value: "#ffffff" },
];

export type CampusAnchor = {
  id: string;
  name: string;
  abbreviation: string;
  category: "library" | "academic_center" | "student_hub" | "cafe";
  anchorLat: number;
  anchorLng: number;
};

export type CampusFeatureCollection = {
  type: "FeatureCollection";
  features: {
    type: "Feature";
    geometry: { type: "Point"; coordinates: [number, number] };
    properties: { id: string; name: string; abbreviation: string; category: CampusAnchor["category"] };
  }[];
};

export function placesToFeatures(places: readonly CampusAnchor[]): CampusFeatureCollection {
  return {
    type: "FeatureCollection",
    features: places.map((place) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [place.anchorLng, place.anchorLat] },
      properties: {
        id: place.id,
        name: place.name,
        abbreviation: place.abbreviation,
        category: place.category,
      },
    })),
  };
}

export function campusFitBounds(
  places: readonly { anchorLat: number; anchorLng: number }[],
): [[number, number], [number, number]] {
  if (places.length === 0) return CAMPUS_MAX_BOUNDS;
  let west = Number.POSITIVE_INFINITY;
  let south = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;
  for (const place of places) {
    west = Math.min(west, place.anchorLng);
    east = Math.max(east, place.anchorLng);
    south = Math.min(south, place.anchorLat);
    north = Math.max(north, place.anchorLat);
  }
  return [
    [west, south],
    [east, north],
  ];
}

/**
 * Screen markers use these coordinates directly. Zoom, pan, and overlap
 * never change them. Clustered ids stay in the cluster layer.
 */
export function anchoredMarkers(
  places: readonly { id: string; anchorLng: number; anchorLat: number }[],
  clusteredIds: ReadonlySet<string>,
): { id: string; lng: number; lat: number }[] {
  return places
    .filter((place) => !clusteredIds.has(place.id))
    .map((place) => ({ id: place.id, lng: place.anchorLng, lat: place.anchorLat }));
}

export function rememberDeviceFix(north: number, west: number): { north: number; west: number } | null {
  const [sw, ne] = CAMPUS_MAX_BOUNDS;
  const inside = north >= sw[1] && north <= ne[1] && west >= sw[0] && west <= ne[0];
  if (!inside) return null;
  return { north, west };
}

export function basemapFailure(styleLoaded: boolean, message: string, url = ""): boolean {
  if (styleLoaded) return false;
  const text = `${url} ${message}`.toLowerCase();
  return text.includes("/styles/positron") || (text.includes("style") && (text.includes("fail") || text.includes("ajax") || text.includes("network")));
}
