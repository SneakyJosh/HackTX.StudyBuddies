"use client";

import { useEffect, useRef, useState } from "react";
import type { GeoJSONSource, Map as MapLibreMap, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  BASEMAP_PAINT,
  CAMPUS_CLUSTER_MAX_ZOOM,
  CAMPUS_CLUSTER_RADIUS,
  CAMPUS_MAX_BOUNDS,
  POSITRON_STYLE_URL,
  basemapFailure,
  anchoredMarkers,
  campusFitBounds,
  placesToFeatures,
  rememberDeviceFix,
  type CampusAnchor,
} from "@/lib/campus-map-geo";

const PIN_TONE = {
  library: "border-[#2b9be0] bg-[#e7f6ff] text-[#10304a]",
  academic_center: "border-[#ff8a1f] bg-[#fff1e4] text-[#2e1600]",
  student_hub: "border-[#1e9e6e] bg-[#e7fff4] text-[#10304a]",
  cafe: "border-[#c47b4a] bg-[#fff4ea] text-[#3a2416]",
} as const;

type Props = {
  places: readonly CampusAnchor[];
  selectedId: string | null;
  focusToken: number;
  onSelect: (id: string) => void;
  onUnavailable: () => void;
};

export function CampusMapCanvas({ places, selectedId, focusToken, onSelect, onUnavailable }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Map<string, { marker: Marker; button: HTMLButtonElement }>>(new Map());
  const fixMarkerRef = useRef<Marker | null>(null);
  const placesRef = useRef(places);
  const selectedRef = useRef(selectedId);
  const onSelectRef = useRef(onSelect);
  const onUnavailableRef = useRef(onUnavailable);
  const [locationNote, setLocationNote] = useState<string | null>(null);
  const [showingFix, setShowingFix] = useState(false);

  useEffect(() => {
    placesRef.current = places;
    selectedRef.current = selectedId;
    onSelectRef.current = onSelect;
    onUnavailableRef.current = onUnavailable;
  }, [onSelect, onUnavailable, places, selectedId]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;
    let styleLoaded = false;
    let placesReady = false;
    const timer = window.setTimeout(() => {
      if (!styleLoaded && !disposed) onUnavailableRef.current();
    }, 12000);

    void import("maplibre-gl")
      .then((maplibre) => {
        if (disposed || !containerRef.current) return;
        maplibre.setWorkerUrl("/maplibre-gl-worker.mjs");
        const map = new maplibre.Map({
          container: containerRef.current,
          style: POSITRON_STYLE_URL,
          bounds: campusFitBounds(placesRef.current),
          fitBoundsOptions: { padding: 64, maxZoom: 16 },
          maxBounds: CAMPUS_MAX_BOUNDS,
          minZoom: 14,
          maxZoom: 18,
          attributionControl: { compact: false },
          dragRotate: false,
          pitchWithRotate: false,
        });
        map.addControl(new maplibre.NavigationControl({ showCompass: false, visualizePitch: false }), "top-right");
        map.on("style.load", () => {
          styleLoaded = true;
          window.clearTimeout(timer);
          if (placesReady) return;
          placesReady = true;
          map.resize();
          for (const paint of BASEMAP_PAINT) {
            if (!map.getLayer(paint.layer)) continue;
            try {
              map.setPaintProperty(paint.layer, paint.property as "fill-color", paint.value);
            } catch {
              // A missing Positron layer keeps the default paint.
            }
          }
          map.addSource("places", {
            type: "geojson",
            data: placesToFeatures(placesRef.current),
            cluster: true,
            clusterRadius: CAMPUS_CLUSTER_RADIUS,
            clusterMaxZoom: CAMPUS_CLUSTER_MAX_ZOOM,
          });
          map.addLayer({
            id: "clusters",
            type: "circle",
            source: "places",
            filter: ["has", "point_count"],
            paint: {
              "circle-color": "#fff7ef",
              "circle-radius": 22,
              "circle-stroke-color": "#ff8a1f",
              "circle-stroke-width": 3,
            },
          });
          map.addLayer({
            id: "cluster-count",
            type: "symbol",
            source: "places",
            filter: ["has", "point_count"],
            layout: {
              "text-field": ["get", "point_count_abbreviated"],
              "text-font": ["Noto Sans Bold"],
              "text-size": 14,
            },
            paint: { "text-color": "#2e1600" },
          });
          map.on("click", "clusters", (event) => {
            const feature = event.features?.[0];
            const source = map.getSource("places");
            if (!feature || feature.geometry.type !== "Point" || !isClusterSource(source)) return;
            const clusterId = Number(feature.properties?.cluster_id);
            if (!Number.isInteger(clusterId)) return;
            const coordinates = feature.geometry.coordinates as [number, number];
            void source.getClusterExpansionZoom(clusterId).then((zoom) => {
              map.easeTo({ center: coordinates, zoom });
            });
          });
          map.on("mouseenter", "clusters", () => {
            map.getCanvas().style.cursor = "pointer";
          });
          map.on("mouseleave", "clusters", () => {
            map.getCanvas().style.cursor = "";
          });
          const sync = () => syncMarkers(map, maplibre.Marker);
          map.on("move", sync);
          map.on("idle", sync);
          map.on("sourcedata", (event) => {
            if (event.sourceId === "places" && event.isSourceLoaded) sync();
          });
          sync();
        });
        map.on("error", (event) => {
          const message = event.error instanceof Error ? event.error.message : "";
          const url = "url" in event.error && typeof event.error.url === "string" ? event.error.url : "";
          if (basemapFailure(styleLoaded, message, url)) {
            window.clearTimeout(timer);
            onUnavailableRef.current();
          }
        });
        mapRef.current = map;
      })
      .catch(() => {
        window.clearTimeout(timer);
        if (!disposed) onUnavailableRef.current();
      });

    const markers = markersRef.current;
    return () => {
      disposed = true;
      window.clearTimeout(timer);
      markers.forEach((entry) => entry.marker.remove());
      markers.clear();
      fixMarkerRef.current?.remove();
      fixMarkerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const source = map?.getSource("places");
    if (!map || !isClusterSource(source) || !map.isStyleLoaded()) return;
    source.setData(placesToFeatures(places));
  }, [places]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || focusToken === 0) return;
    const place = places.find((item) => item.id === selectedId);
    if (!place) return;
    map.easeTo({
      center: [place.anchorLng, place.anchorLat],
      zoom: Math.max(map.getZoom(), 17),
      duration: 700,
      padding: { top: 48, bottom: 48, left: 48, right: 48 },
    });
  }, [focusToken, places, selectedId]);

  useEffect(() => {
    for (const [id, entry] of markersRef.current) {
      paintPin(entry.button, places.find((place) => place.id === id), id === selectedId);
      entry.marker.getElement().style.zIndex = id === selectedId ? "3" : "1";
    }
  }, [places, selectedId]);

  function resetCampus() {
    const map = mapRef.current;
    if (!map) return;
    map.fitBounds(campusFitBounds(placesRef.current), { padding: 64, maxZoom: 16, duration: 700 });
  }

  function toggleLocation() {
    if (showingFix) {
      fixMarkerRef.current?.remove();
      fixMarkerRef.current = null;
      setShowingFix(false);
      setLocationNote(null);
      return;
    }
    if (!navigator.geolocation) {
      setLocationNote("This browser cannot share a location.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const kept = rememberDeviceFix(position.coords.latitude, position.coords.longitude);
        const map = mapRef.current;
        if (!kept || !map) {
          setLocationNote("That location is outside the campus map.");
          return;
        }
        void import("maplibre-gl").then((maplibre) => {
          fixMarkerRef.current?.remove();
          const dot = document.createElement("span");
          dot.className = "block h-4 w-4 rounded-full border-2 border-white bg-[#2b9be0] shadow";
          dot.setAttribute("aria-hidden", "true");
          fixMarkerRef.current = new maplibre.Marker({ element: dot }).setLngLat([kept.west, kept.north]).addTo(map);
          setShowingFix(true);
          setLocationNote(null);
        });
      },
      () => {
        setLocationNote("Location stayed off.");
      },
      { enableHighAccuracy: false, maximumAge: 60000, timeout: 8000 },
    );
  }

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="h-full w-full" aria-label="UT Austin street map" />
      <div className="absolute top-3 left-3 z-20 flex max-w-[14rem] flex-col gap-2">
        <button
          type="button"
          className="inline-flex min-h-11 items-center rounded-full bg-[#ff8a1f] px-4 text-sm font-bold text-[#2e1600] shadow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2b9be0]"
          onClick={resetCampus}
        >
          Reset to campus
        </button>
        <button
          type="button"
          aria-pressed={showingFix}
          className="inline-flex min-h-11 items-center rounded-full border border-[#c9e3f5] bg-white px-4 text-sm font-bold text-[#10304a] shadow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2b9be0]"
          onClick={toggleLocation}
        >
          {showingFix ? "Hide my location" : "Show my location"}
        </button>
        {locationNote ? <p className="rounded-2xl bg-white/95 px-3 py-2 text-sm text-[#10304a] shadow">{locationNote}</p> : null}
      </div>
    </div>
  );

  function syncMarkers(map: MapLibreMap, MarkerType: typeof Marker) {
    if (!map.isStyleLoaded() || !map.getSource("places")) return;
    const clusteredIds = new Set(placesRef.current.map((place) => place.id));
    for (const feature of map.querySourceFeatures("places")) {
      if (feature.properties?.point_count) continue;
      const id = String(feature.properties?.id ?? "");
      if (id) clusteredIds.delete(id);
    }
    const revealed = clusteredIds.size < placesRef.current.length;
    if (!revealed && placesRef.current.length > 0 && map.isMoving()) return;
    const visible = new Set(anchoredMarkers(placesRef.current, clusteredIds).map((place) => place.id));
    for (const [id, entry] of markersRef.current) {
      if (!visible.has(id)) {
        entry.marker.remove();
        markersRef.current.delete(id);
      }
    }
    for (const place of anchoredMarkers(placesRef.current, clusteredIds)) {
      const sourcePlace = placesRef.current.find((item) => item.id === place.id);
      if (!sourcePlace) continue;
      const existing = markersRef.current.get(place.id);
      if (existing) continue;
      const button = document.createElement("button");
      button.type = "button";
      button.style.position = "absolute";
      button.style.top = "0";
      button.style.left = "0";
      button.style.zIndex = selectedRef.current === place.id ? "3" : "1";
      paintPin(button, sourcePlace, selectedRef.current === place.id);
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        onSelectRef.current(place.id);
      });
      const marker = new MarkerType({ element: button, anchor: "center" })
        .setLngLat([place.lng, place.lat])
        .addTo(map);
      markersRef.current.set(place.id, { marker, button });
    }
  }
}

function isClusterSource(source: unknown): source is GeoJSONSource {
  return typeof source === "object" && source !== null && "setData" in source && "getClusterExpansionZoom" in source;
}

function paintPin(button: HTMLButtonElement, place: CampusAnchor | undefined, selected: boolean) {
  if (!place) return;
  button.className = [
    "maplibregl-marker inline-flex min-h-11 min-w-11 items-center gap-1 rounded-full border-2 px-2 text-xs font-extrabold shadow-[0_6px_16px_rgba(16,48,74,0.18)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2b9be0]",
    PIN_TONE[place.category],
    selected ? "ring-4 ring-[#ff8a1f]" : "",
  ].join(" ");
  button.setAttribute("aria-pressed", selected ? "true" : "false");
  button.setAttribute("aria-label", `${place.name}, ${place.abbreviation}`);
  if (button.dataset.abbreviation !== place.abbreviation || button.dataset.category !== place.category) {
    button.dataset.abbreviation = place.abbreviation;
    button.dataset.category = place.category;
    button.replaceChildren(pinIcon(place.category), labelNode(place.abbreviation));
  }
}

function labelNode(abbreviation: string): HTMLSpanElement {
  const label = document.createElement("span");
  label.textContent = abbreviation;
  return label;
}

function pinIcon(category: CampusAnchor["category"]): SVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", "h-4 w-4 shrink-0");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("fill", "currentColor");
  path.setAttribute(
    "d",
    category === "library" ? BOOK_ICON : category === "student_hub" ? HUB_ICON : category === "cafe" ? COFFEE_ICON : BUILDING_ICON,
  );
  svg.append(path);
  return svg;
}

const BOOK_ICON = "M5 4.5A2.5 2.5 0 0 1 7.5 2H20v16H7.5A2.5 2.5 0 0 0 5 20.5V4.5Zm2.5-.5a.5.5 0 0 0-.5.5V18h11V4H7.5Z";
const BUILDING_ICON = "M4 20V8l8-5 8 5v12h-5v-6H9v6H4Zm2-2h2v-4h8v4h2V9.2L12 5.3 6 9.2V18Z";
const HUB_ICON = "M8 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6Zm8 1a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5ZM3 19c0-2.8 2.2-4.5 5-4.5s5 1.7 5 4.5v1H3v-1Zm10 .5V19c0-1.2-.4-2.2-1.1-3.1 1.4-.5 3-.8 4.6-.8 2.4 0 4.5 1.4 4.5 3.8V20h-8v-.5Z";
const COFFEE_ICON = "M6 4h9v2h2.2A2.8 2.8 0 0 1 20 8.8 2.8 2.8 0 0 1 17.2 11.6H15V14a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8a4 4 0 0 1 4-4Zm0 2a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h3a2 2 0 0 0 2-2V6H6Zm9 2v1.6h2.2a.8.8 0 0 0 0-1.6H15ZM7 20h7v1.2H7V20Z";
