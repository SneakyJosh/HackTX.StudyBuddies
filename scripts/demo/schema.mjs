import { BOOKABLE_LOCATION_IDS, COURSES, LOCATIONS } from "./cohort.mjs";
import { throwOn } from "./guard.mjs";

export async function assertDemoSchema(env, service) {
  const locations = await service.from("locations").select("id,bookable,is_active");
  throwOn(env, locations.error, "schema check for locations");
  const rows = locations.data ?? [];
  const bookable = rows.filter((row) => row.bookable === true);
  if (bookable.length !== 15) {
    throw new Error("Refusing to continue. Expected 15 bookable locations. Apply migration 0012 and do not add another migration.");
  }
  const ltd = rows.find((row) => row.id === LOCATIONS.LTD);
  if (!ltd || ltd.bookable !== false || ltd.is_active !== true) {
    throw new Error("Refusing to continue. Littlefield Residence Hall must stay active and not bookable.");
  }
  for (const id of BOOKABLE_LOCATION_IDS) {
    if (!bookable.some((row) => row.id === id)) throw new Error("Refusing to continue. A catalog location id is missing.");
  }
  const courses = await service.from("courses").select("id").in("id", Object.values(COURSES));
  throwOn(env, courses.error, "schema check for courses");
  if ((courses.data ?? []).length !== 3) throw new Error("Refusing to continue. The three existing courses were not found.");
}
