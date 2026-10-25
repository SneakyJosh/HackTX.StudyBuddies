"use client";

import { useEffect, useRef, useState } from "react";
import { getCampusMap, isApiError } from "@/lib/api-client";
import { filterCampusPlaces, type CampusRankFilter } from "@/lib/campus-rank";
import { STUDY_STYLE_LABELS } from "@/lib/labels";
import type { CampusCategory, CampusMap, CampusPlace, CampusSuggestion } from "@/types/api";
import { CampusMapCanvas } from "@/components/campus-map-canvas";
import { useDemo } from "@/components/demo-provider";
import { EmptyBlock, ErrorBlock, LoadingBlock, cardClass, cx } from "@/components/ui";

const FILTERS: { id: CampusRankFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "library", label: "Libraries" },
  { id: "academic_center", label: "Academic centers" },
  { id: "student_hub", label: "Student hubs" },
  { id: "quiet", label: "Quiet zones" },
  { id: "coffee", label: "Coffee" },
];

const CATEGORY_LABELS: Record<CampusCategory, string> = {
  library: "Library",
  academic_center: "Academic center",
  student_hub: "Student hub",
};

const PIN_CLASS: Record<CampusCategory, string> = {
  library: "border-cool bg-surface text-foreground",
  academic_center: "border-accent-fill bg-accent-soft text-accent-ink",
  student_hub: "border-good bg-surface text-foreground",
};

const STREETS: { name: string; axis: "x" | "y"; at: number }[] = [
  { name: "Guadalupe", axis: "x", at: 16.75 },
  { name: "Speedway", axis: "x", at: 65.2 },
  { name: "Dean Keeton", axis: "y", at: 15.58 },
  { name: "24th", axis: "y", at: 44.19 },
  { name: "21st", axis: "y", at: 72.8 },
];

export function CampusMapBoard() {
  const demo = useDemo();
  const [phase, setPhase] = useState<"loading" | "error" | "ready">("loading");
  const [message, setMessage] = useState("Could not load the campus map.");
  const [reloadKey, setReloadKey] = useState(0);
  const [map, setMap] = useState<CampusMap | null>(null);
  const [filter, setFilter] = useState<CampusRankFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusToken, setFocusToken] = useState(0);
  const [streetMap, setStreetMap] = useState(true);
  const hasMap = useRef(false);

  useEffect(() => {
    if (!demo.ready || !demo.userId) return;
    let cancelled = false;
    void (async () => {
      if (!hasMap.current) setPhase("loading");
      const result = await getCampusMap();
      if (cancelled) return;
      if (isApiError(result)) {
        if (!hasMap.current) {
          setMessage(result.error.message);
          setPhase("error");
        }
        return;
      }
      setMap(result.data);
      hasMap.current = true;
      setPhase("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [demo.ready, demo.userId, demo.revision, reloadKey]);

  if (!demo.ready || phase === "loading") return <LoadingBlock label="Loading the campus map" />;
  if (phase === "error" || !map) {
    return (
      <ErrorBlock
        title="The campus map is unavailable"
        message={message}
        onRetry={() => setReloadKey((value) => value + 1)}
      />
    );
  }

  const visible = filterCampusPlaces(map.places, map.suggestions, filter);
  const selected =
    visible.places.find((place) => place.id === selectedId) ??
    visible.places.find((place) => place.id === visible.suggestions[0]?.placeId) ??
    null;
  const cards = visible.suggestions.flatMap((suggestion) => {
    const place = visible.places.find((item) => item.id === suggestion.placeId);
    return place ? [{ place, suggestion }] : [];
  });
  const anchorsReady = map.places.length > 0 && map.places.every((place) => place.anchorLat !== null && place.anchorLng !== null);
  const showStreetMap = anchorsReady && streetMap;
  const anchoredPlaces = visible.places.filter(hasAnchor);

  function selectMarker(id: string) {
    setSelectedId(id);
    document.getElementById(`campus-spot-${id}`)?.scrollIntoView({ block: "nearest" });
  }

  function selectCard(id: string) {
    setSelectedId(id);
    setFocusToken((value) => value + 1);
  }

  function moveCard(index: number, direction: 1 | -1) {
    const next = cards[index + direction];
    if (!next) return;
    selectCard(next.place.id);
    document.getElementById(`campus-spot-${next.place.id}`)?.focus();
  }

  return (
    <div className="grid gap-5">
      <header className="max-w-3xl">
        <h1 className="font-display text-[1.75rem] leading-none font-extrabold tracking-tight">Campus map</h1>
        <p className="mt-2 text-[15px] leading-6 text-muted">
          UT Austin streets, paths, and building footprints, with official abbreviations. Suggestions use your study style, verified quiet
          zones, and places you have already finished studying.
        </p>
      </header>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Map filters">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={filter === item.id}
            className={cx(
              "inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cool",
              filter === item.id ? "border-foreground bg-foreground text-background" : "border-line bg-surface text-foreground",
            )}
            onClick={() => setFilter(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <p className="text-sm leading-6 text-muted">
        A quiet zone is a specific floor or room. The rest of that building is not labeled quiet.
        {map.studyStyle ? ` Your study style is ${STUDY_STYLE_LABELS[map.studyStyle]}.` : " Add a study style on your profile to personalize this list."}
      </p>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
        <div className="relative h-[45vh] min-h-80 overflow-hidden rounded-[24px] border border-line bg-[#e7f4fb] lg:h-[36rem]">
          {showStreetMap ? (
            <CampusMapCanvas
              places={anchoredPlaces}
              selectedId={selected?.id ?? null}
              focusToken={focusToken}
              onSelect={selectMarker}
              onUnavailable={() => setStreetMap(false)}
            />
          ) : (
            <SchematicCampus
              places={visible.places}
              selectedId={selected?.id ?? null}
              onSelect={selectMarker}
              canRetry={anchorsReady}
              onRetry={() => setStreetMap(true)}
            />
          )}
        </div>

        <div className="grid gap-3">
          {filter === "coffee" ? (
            <EmptyBlock
              title="No confirmed coffee shop"
              body="A coffee shop appears here only when a public UT Austin page places it inside one of these buildings."
            />
          ) : cards.length === 0 ? (
            <EmptyBlock title="No buildings in this filter" body="Try another category to see the curated study buildings." />
          ) : (
            <>
              <PlaceDetail place={selected} />
              <h2 className="font-display text-xl font-bold">Suggested study spots</h2>
              <ol className="grid gap-2">
                {cards.map(({ place, suggestion }, index) => (
                  <li key={place.id}>
                    <PlaceCard
                      place={place}
                      suggestion={suggestion}
                      rank={index + 1}
                      selected={selected?.id === place.id}
                      onSelect={() => selectCard(place.id)}
                      onArrow={(direction) => moveCard(index, direction)}
                    />
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function PlaceDetail({ place }: { place: CampusPlace | null }) {
  if (!place) return null;
  return (
    <article id="campus-place-detail" aria-live="polite" className={cardClass}>
      <p className="text-xs font-bold tracking-wide text-muted uppercase">{place.abbreviation}</p>
      <h2 className="mt-1 font-display text-xl font-bold">{place.name}</h2>
      <p className="mt-2 text-sm">{CATEGORY_LABELS[place.category]}</p>
      <p className="mt-1 text-sm text-muted">
        {place.bookingAvailable
          ? "Available for check-in and booking."
          : "Map only. Check-in and booking stay on PCL, EER, and Texas Union."}
      </p>
      {place.quietZones.length > 0 ? (
        <div className="mt-3">
          <p className="text-sm font-bold">Quiet zones inside this building</p>
          <ul className="mt-1 grid gap-1">
            {place.quietZones.map((zone) => (
              <li key={zone.id} className="text-sm leading-6">
                <span className="font-bold">{zone.name}.</span> {zone.detail}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-sm leading-6 text-muted">Other floors and rooms in this building are not labeled quiet.</p>
        </div>
      ) : null}
    </article>
  );
}

function hasAnchor(place: CampusPlace): place is CampusPlace & { anchorLat: number; anchorLng: number } {
  return place.anchorLat !== null && place.anchorLng !== null;
}

function SchematicCampus({
  places,
  selectedId,
  onSelect,
  canRetry,
  onRetry,
}: {
  places: CampusPlace[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  canRetry: boolean;
  onRetry: () => void;
}) {
  return (
    <div className="absolute inset-0 bg-[#d7efc8]">
      <div className="absolute inset-x-3 top-3 z-20 grid gap-2">
        <p className="rounded-2xl bg-white/95 px-3 py-2 text-sm text-foreground shadow">
          The street map is unavailable. This illustrated campus keeps the same buildings and suggestions.
        </p>
        {canRetry ? (
          <button
            type="button"
            className="inline-flex min-h-11 w-fit items-center rounded-full bg-[#ff8a1f] px-4 text-sm font-bold text-[#2e1600]"
            onClick={onRetry}
          >
            Try the street map again
          </button>
        ) : null}
      </div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden="true">
        {STREETS.map((street) =>
          street.axis === "x" ? (
            <g key={street.name}>
              <rect x={street.at - 1.1} y="0" width="2.2" height="100" fill="#f7fbff" />
              <text x={street.at} y="5" textAnchor="middle" fontSize="3.1" fill="#55768f">
                {street.name}
              </text>
            </g>
          ) : (
            <g key={street.name}>
              <rect x="0" y={street.at - 0.9} width="100" height="1.8" fill="#f7fbff" />
              <text x="2" y={street.at - 1.6} fontSize="3.1" fill="#55768f">
                {street.name}
              </text>
            </g>
          ),
        )}
      </svg>
      <p className="sr-only">Illustrated campus fallback. The suggested list has the same places.</p>
      {places.map((place) => (
        <button
          key={place.id}
          type="button"
          aria-pressed={selectedId === place.id}
          aria-label={`${place.name}, ${place.abbreviation}`}
          className={cx(
            "absolute z-10 flex min-h-11 min-w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 px-2 text-xs font-extrabold shadow-[0_6px_16px_rgba(16,48,74,0.18)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cool",
            PIN_CLASS[place.category],
            selectedId === place.id && "z-20 ring-2 ring-foreground",
          )}
          style={{ left: `${place.mapX}%`, top: `${place.mapY}%` }}
          onClick={() => onSelect(place.id)}
        >
          {place.abbreviation}
        </button>
      ))}
    </div>
  );
}

function PlaceCard({
  place,
  suggestion,
  rank,
  selected,
  onSelect,
  onArrow,
}: {
  place: CampusPlace;
  suggestion: CampusSuggestion;
  rank: number;
  selected: boolean;
  onSelect: () => void;
  onArrow: (direction: 1 | -1) => void;
}) {
  return (
    <button
      id={`campus-spot-${place.id}`}
      type="button"
      aria-pressed={selected}
      aria-controls="campus-place-detail"
      className={cx(
        "w-full rounded-[18px] border px-4 py-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cool",
        selected ? "border-foreground bg-surface" : "border-line bg-surface",
      )}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          onArrow(1);
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          onArrow(-1);
        }
      }}
    >
      <span className="flex items-baseline justify-between gap-3">
        <span className="font-bold">
          {rank}. {place.abbreviation}
        </span>
        <span className="text-xs font-bold text-muted">{place.bookingAvailable ? "Check-in" : "Map only"}</span>
      </span>
      <span className="mt-1 block text-sm">{place.name}</span>
      {suggestion.reasons.length > 0 ? (
        <span className="mt-1 block text-sm leading-6 text-muted">{suggestion.reasons.join(" · ")}</span>
      ) : (
        <span className="mt-1 block text-sm text-muted">Catalog order</span>
      )}
    </button>
  );
}
