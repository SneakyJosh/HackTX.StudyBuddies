export const CAMPUS_PLACE_SCORE = {
  verifiedQuietZoneWhenQuiet: 40,
  libraryWhenQuiet: 15,
  studentHubWhenCollaborative: 35,
  academicCenterWhenCollaborative: 15,
  libraryWhenCollaborative: 8,
  academicCenterWhenFlexible: 20,
  libraryWhenFlexible: 12,
  studentHubWhenFlexible: 12,
  callerHistory: 25,
} as const;

export type CampusRankCategory = "library" | "academic_center" | "student_hub";
export type CampusRankStyle = "quiet" | "collaborative" | "flexible";

export type CampusRankPlace = {
  id: string;
  locationId: string | null;
  abbreviation: string;
  category: CampusRankCategory;
  quietZones: { name: string }[];
  historyVisits: number;
  sortOrder: number;
};

export type CampusRankSuggestion = {
  placeId: string;
  placeScore: number;
  reasons: string[];
};

export type CampusRankFilter = "all" | CampusRankCategory | "quiet" | "coffee";

function familiar(place: CampusRankPlace): boolean {
  return place.locationId !== null && place.historyVisits > 0;
}

function scorePlace(place: CampusRankPlace, studyStyle: CampusRankStyle | null): CampusRankSuggestion {
  let placeScore = 0;
  const reasons: string[] = [];
  if (place.quietZones.length > 0) {
    reasons.push(`Verified quiet zone: ${place.quietZones.map((zone) => zone.name).join(", ")}`);
  }
  if (studyStyle === "quiet") {
    if (place.quietZones.length > 0) {
      placeScore += CAMPUS_PLACE_SCORE.verifiedQuietZoneWhenQuiet;
      reasons.push("Matches your quiet study style");
    }
    if (place.category === "library") {
      placeScore += CAMPUS_PLACE_SCORE.libraryWhenQuiet;
      reasons.push("Library study space");
    }
  } else if (studyStyle === "collaborative") {
    if (place.category === "student_hub") {
      placeScore += CAMPUS_PLACE_SCORE.studentHubWhenCollaborative;
      reasons.push("Matches your collaborative study style");
    } else if (place.category === "academic_center") {
      placeScore += CAMPUS_PLACE_SCORE.academicCenterWhenCollaborative;
      reasons.push("Academic center for group study");
    } else {
      placeScore += CAMPUS_PLACE_SCORE.libraryWhenCollaborative;
      reasons.push("Library study space");
    }
  } else if (studyStyle === "flexible") {
    if (place.category === "academic_center") {
      placeScore += CAMPUS_PLACE_SCORE.academicCenterWhenFlexible;
      reasons.push("Works for a flexible study style");
    } else if (place.category === "library") {
      placeScore += CAMPUS_PLACE_SCORE.libraryWhenFlexible;
      reasons.push("Library study space");
    } else {
      placeScore += CAMPUS_PLACE_SCORE.studentHubWhenFlexible;
      reasons.push("Student hub for a flexible study style");
    }
  }
  if (familiar(place)) {
    placeScore += CAMPUS_PLACE_SCORE.callerHistory;
    reasons.push("You have finished studying here");
  }
  return { placeId: place.id, placeScore, reasons };
}

export function rankCampusPlaces(
  places: readonly CampusRankPlace[],
  studyStyle: CampusRankStyle | null,
): CampusRankSuggestion[] {
  return places
    .map((place) => ({ place, suggestion: scorePlace(place, studyStyle) }))
    .sort((left, right) => {
      if (right.suggestion.placeScore !== left.suggestion.placeScore) {
        return right.suggestion.placeScore - left.suggestion.placeScore;
      }
      if (left.place.sortOrder !== right.place.sortOrder) return left.place.sortOrder - right.place.sortOrder;
      if (left.place.abbreviation !== right.place.abbreviation) {
        return left.place.abbreviation < right.place.abbreviation ? -1 : 1;
      }
      if (left.place.id === right.place.id) return 0;
      return left.place.id < right.place.id ? -1 : 1;
    })
    .map((entry) => entry.suggestion);
}

export function filterCampusPlaces<T extends { id: string; category: CampusRankCategory; quietZones: readonly unknown[] }>(
  places: readonly T[],
  suggestions: readonly CampusRankSuggestion[],
  filter: CampusRankFilter,
): { places: T[]; suggestions: CampusRankSuggestion[] } {
  if (filter === "coffee") return { places: [], suggestions: [] };
  const visible = places.filter((place) => {
    if (filter === "all") return true;
    if (filter === "quiet") return place.quietZones.length > 0;
    return place.category === filter;
  });
  const ids = new Set(visible.map((place) => place.id));
  return {
    places: visible,
    suggestions: suggestions.filter((suggestion) => ids.has(suggestion.placeId)),
  };
}
