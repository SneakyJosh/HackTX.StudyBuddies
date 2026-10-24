import { describe, expect, it } from "vitest";

import { mapCourse, mapLocation, mapUniversity } from "./catalog";
import {
  mapCheckinContext,
  mapRequestCounterpart,
} from "./public-profiles";

const UNIVERSITY_ID = "22222222-2222-4222-8222-222222222222";
const LOCATION_ID = "11111111-1111-4111-8111-111111111111";
const COURSE_ID = "33333333-3333-4333-8333-333333333331";

describe("catalog mappers strip non-contract columns", () => {
  it("mapUniversity returns exactly id/name/slug", () => {
    const row = {
      id: UNIVERSITY_ID,
      name: "University of Texas at Austin",
      slug: "ut-austin",
      created_at: "2026-01-01T00:00:00Z",
    } as Parameters<typeof mapUniversity>[0] & Record<string, unknown>;

    expect(mapUniversity(row)).toEqual({
      id: UNIVERSITY_ID,
      name: "University of Texas at Austin",
      slug: "ut-austin",
    });
    expect(Object.keys(mapUniversity(row)).sort()).toEqual(["id", "name", "slug"]);
  });

  it("mapLocation and mapCourse return exactly the contract fields", () => {
    expect(
      Object.keys(
        mapLocation({
          id: LOCATION_ID,
          university_id: UNIVERSITY_ID,
          name: "Perry-Castañeda Library",
          building_code: "PCL",
          description: "Public library study spaces",
        }),
      ).sort(),
    ).toEqual(["buildingCode", "description", "id", "name", "universityId"]);

    expect(
      mapCourse({
        id: COURSE_ID,
        university_id: UNIVERSITY_ID,
        code: "M408C",
        title: "Differential and Integral Calculus",
      }),
    ).toEqual({
      id: COURSE_ID,
      universityId: UNIVERSITY_ID,
      code: "M408C",
      title: "Differential and Integral Calculus",
    });
  });
});

describe("counterpart mappers never leak private profile fields", () => {
  it("mapRequestCounterpart returns only the public summary fields", () => {
    // Simulate an unexpectedly wide row (e.g. a future select *): the
    // mapper must still emit exactly the RequestCounterpart shape.
    const wideRow = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      display_name: "Demo Student A",
      major: "Engineering",
      academic_year: "freshman",
      study_style: "collaborative",
      preferred_duration_minutes: 120,
      preferred_group_size: 2,
      visible: true,
      email: "demo-student-a@studysync.example",
      university_id: UNIVERSITY_ID,
    } as Parameters<typeof mapRequestCounterpart>[0] & Record<string, unknown>;

    const counterpart = mapRequestCounterpart(wideRow);
    expect(counterpart).toEqual({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      displayName: "Demo Student A",
      major: "Engineering",
      academicYear: "freshman",
      studyStyle: "collaborative",
    });
    expect(JSON.stringify(counterpart)).not.toContain("studysync.example");
    expect(JSON.stringify(counterpart)).not.toContain("preferred");
  });

  it("mapCheckinContext exposes building-level location only", () => {
    const context = mapCheckinContext({
      user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      course: {
        id: COURSE_ID,
        university_id: UNIVERSITY_ID,
        code: "M408C",
        title: "Differential and Integral Calculus",
      },
      location: {
        id: LOCATION_ID,
        university_id: UNIVERSITY_ID,
        name: "Perry-Castañeda Library",
        building_code: "PCL",
        description: "Public library study spaces",
      },
    });

    expect(context.location).toEqual({
      id: LOCATION_ID,
      name: "Perry-Castañeda Library",
      buildingCode: "PCL",
    });
    // PublicLocation must not carry the description or university id.
    expect(Object.keys(context.location ?? {}).sort()).toEqual([
      "buildingCode",
      "id",
      "name",
    ]);
  });

  it("mapCheckinContext maps missing course/location to null", () => {
    expect(
      mapCheckinContext({
        user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        course: null,
        location: null,
      }),
    ).toEqual({ course: null, location: null });
  });
});
