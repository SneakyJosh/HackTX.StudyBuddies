/** A signed-in student with no profile stays on setup until that profile is saved. */
export function needsProfileSetup(hasProfile: boolean, pathname: string, search: string): boolean {
  if (hasProfile) return false;
  const query = search.startsWith("?") ? search.slice(1) : search;
  return !(pathname === "/profile" && new URLSearchParams(query).get("setup") === "1");
}
