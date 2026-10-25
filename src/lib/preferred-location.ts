const STORAGE_KEY = "studybuddie.preferredLocationId";

export function readPreferredLocationId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

export function writePreferredLocationId(locationId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, locationId);
  } catch {
    // The profile still saves. The next check-in can choose a building.
  }
}
