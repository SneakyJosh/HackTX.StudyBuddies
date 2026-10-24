"use client";

import { useEffect, useId, useState } from "react";
import {
  deleteCheckin,
  getCheckin,
  getCourses,
  getLocations,
  getProfile,
  isApiError,
  postCheckin,
} from "@/lib/api-client";
import { AVAILABILITY_LABELS, AVAILABILITIES, STUDY_STYLE_LABELS, STUDY_STYLES, formatTimestamp } from "@/lib/labels";
import {
  VALIDATION,
  type Availability,
  type Checkin,
  type Course,
  type Location,
  type PostCheckinBody,
  type Profile,
  type StudyStyle,
} from "@/types/api";
import { useHydratedDemo } from "@/components/demo-provider";
import {
  Button,
  EmptyBlock,
  ErrorBlock,
  FieldError,
  LinkButton,
  LoadingBlock,
  PageHeader,
  errorLines,
  fieldClass,
  inputClass,
} from "@/components/ui";

type CheckinDraft = {
  courseId: string;
  locationId: string;
  durationMinutes: number;
  availability: Availability;
  studyStyle: StudyStyle;
};

export function CheckinPanel() {
  const demo = useHydratedDemo();
  const formId = useId();
  const [phase, setPhase] = useState<"loading" | "error" | "ready">("loading");
  const [loadError, setLoadError] = useState("Could not load check-in.");
  const [reloadKey, setReloadKey] = useState(0);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [active, setActive] = useState<Checkin | null>(null);
  const [draft, setDraft] = useState<CheckinDraft | null>(null);
  const [messages, setMessages] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);

  useEffect(() => {
    if (!demo.hydrated || !demo.userId) return;
    let cancelled = false;
    void (async () => {
      setPhase("loading");
      const [profileResult, courseResult, locationResult, checkinResult] = await Promise.all([
        getProfile(),
        getCourses(),
        getLocations(),
        getCheckin(),
      ]);
      if (cancelled) return;
      if (isApiError(profileResult)) {
        setLoadError(profileResult.error.message);
        setPhase("error");
        return;
      }
      if (isApiError(courseResult)) {
        setLoadError(courseResult.error.message);
        setPhase("error");
        return;
      }
      if (isApiError(locationResult)) {
        setLoadError(locationResult.error.message);
        setPhase("error");
        return;
      }
      if (isApiError(checkinResult)) {
        setLoadError(checkinResult.error.message);
        setPhase("error");
        return;
      }
      const nextProfile = profileResult.data;
      const profileCourses = courseResult.data.filter((course) =>
        nextProfile?.courseIds.includes(course.id),
      );
      setProfile(nextProfile);
      setCourses(courseResult.data);
      setLocations(locationResult.data);
      setActive(checkinResult.data);
      setDraft({
        courseId: profileCourses[0]?.id ?? "",
        locationId: locationResult.data[0]?.id ?? "",
        durationMinutes: nextProfile?.preferredDurationMinutes ?? VALIDATION.durationMinutes.min,
        availability: "available",
        studyStyle: nextProfile?.studyStyle ?? "collaborative",
      });
      setPhase("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [demo.hydrated, demo.userId, demo.revision, reloadKey]);

  if (!demo.hydrated || phase === "loading") return <LoadingBlock label="Loading check-in" />;
  if (phase === "error") {
    return (
      <ErrorBlock title="Check-in unavailable" message={loadError} onRetry={() => setReloadKey((value) => value + 1)} />
    );
  }
  if (!profile || !draft) {
    return (
      <div className="mx-auto grid w-full max-w-2xl gap-5">
        <PageHeader
          title="Check-in"
          description="Check in at a public campus building for a limited time."
        />
        <EmptyBlock
          title="Profile needed"
          body="Finish your profile and opt in before you check in. Focused hides the student from discovery."
        />
        <LinkButton href="/profile" className="w-full sm:w-auto">
          Go to profile
        </LinkButton>
      </div>
    );
  }

  const profileCourses = courses.filter((course) => profile.courseIds.includes(course.id));
  const activeCourse = courses.find((course) => course.id === active?.courseId);
  const activeLocation = locations.find((location) => location.id === active?.locationId);
  const canSubmit = profile.visible && profileCourses.length > 0 && draft.locationId !== "";

  async function submit() {
    if (!draft) return;
    setSaving(true);
    setNotice("");
    setMessages([]);
    const body: PostCheckinBody = {
      locationId: draft.locationId,
      courseId: draft.courseId,
      durationMinutes: draft.durationMinutes,
      availability: draft.availability,
      studyStyle: draft.studyStyle,
    };
    const result = await postCheckin(body);
    setSaving(false);
    if (isApiError(result)) {
      setMessages(errorLines(result));
      return;
    }
    setNotice(
      result.data.availability === "focused"
        ? "Checked in. Focused hides the student from discovery."
        : "Checked in. Students on this campus can see this public building.",
    );
  }

  async function checkout() {
    setCheckingOut(true);
    setMessages([]);
    const result = await deleteCheckin();
    setCheckingOut(false);
    if (isApiError(result)) {
      setMessages(errorLines(result));
      return;
    }
    setNotice("Checked out. You no longer appear in discovery.");
  }

  return (
    <div className="mx-auto grid w-full max-w-2xl gap-5">
      <PageHeader
        title="Check-in"
        description="Pick one of your courses, a public building, and how long you plan to stay."
      />
      {active ? (
        <section className="rounded-2xl border border-line bg-surface p-4">
          <h2 className="text-lg font-semibold">Current check-in</h2>
          <p className="mt-2 text-sm leading-6">
            {activeCourse ? `${activeCourse.code} · ${activeCourse.title}` : "Course"}
          </p>
          <p className="text-sm leading-6">
            {activeLocation ? `${activeLocation.name} (${activeLocation.buildingCode})` : "Building"}
          </p>
          <p className="text-sm leading-6 text-muted">
            {AVAILABILITY_LABELS[active.availability]} · {STUDY_STYLE_LABELS[active.studyStyle]} · until{" "}
            {formatTimestamp(active.expiresAt)}
          </p>
          {active.availability === "focused" ? (
            <p className="mt-2 text-sm leading-6 text-warning">
              Focused hides the student from discovery.
            </p>
          ) : null}
          <Button variant="danger" className="mt-4" disabled={checkingOut} onClick={() => void checkout()}>
            {checkingOut ? "Checking out…" : "Check out"}
          </Button>
        </section>
      ) : (
        <EmptyBlock title="You are checked out" body="Start a check-in when you are at a public study building." />
      )}

      {!profile.visible ? (
        <div className="rounded-2xl bg-warning-soft px-4 py-3 text-sm leading-6 text-warning">
          Turn on discovery visibility in your profile before checking in. A hidden profile cannot
          start a check-in.
        </div>
      ) : null}

      <form
        className="grid gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <FieldError messages={messages} />
        {notice ? (
          <p role="status" className="rounded-2xl bg-accent-soft px-4 py-3 text-sm text-accent">
            {notice}
          </p>
        ) : null}

        <label className={fieldClass} htmlFor={`${formId}-course`}>
          Course
          <select
            id={`${formId}-course`}
            className={inputClass}
            value={draft.courseId}
            onChange={(event) => setDraft({ ...draft, courseId: event.target.value })}
          >
            {profileCourses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.code} · {course.title}
              </option>
            ))}
          </select>
        </label>

        <label className={fieldClass} htmlFor={`${formId}-location`}>
          Public building
          <select
            id={`${formId}-location`}
            className={inputClass}
            value={draft.locationId}
            onChange={(event) => setDraft({ ...draft, locationId: event.target.value })}
          >
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name} ({location.buildingCode})
              </option>
            ))}
          </select>
        </label>
        {locations.length > 0 ? (
          <ul className="grid gap-1 text-sm text-muted">
            {locations.map((location) => (
              <li key={location.id}>
                {location.buildingCode}: {location.description}
              </li>
            ))}
          </ul>
        ) : null}

        <label className={fieldClass} htmlFor={`${formId}-duration`}>
          Duration, {draft.durationMinutes} minutes
          <input
            id={`${formId}-duration`}
            type="range"
            min={VALIDATION.durationMinutes.min}
            max={VALIDATION.durationMinutes.max}
            step={1}
            value={draft.durationMinutes}
            onChange={(event) => setDraft({ ...draft, durationMinutes: Number(event.target.value) })}
          />
        </label>

        <fieldset className="grid gap-2" aria-describedby={`${formId}-focused`}>
          <legend className="text-sm font-medium">Availability</legend>
          {AVAILABILITIES.map((availability) => (
            <label key={availability} className="flex min-h-11 items-center gap-3 text-sm">
              <input
                type="radio"
                name={`${formId}-availability`}
                className="h-5 w-5"
                checked={draft.availability === availability}
                onChange={() => setDraft({ ...draft, availability })}
              />
              {AVAILABILITY_LABELS[availability]}
            </label>
          ))}
          <p id={`${formId}-focused`} className="text-sm leading-6 text-muted">
            Focused hides the student from discovery. Other students will not see a Focused check-in.
          </p>
        </fieldset>

        <fieldset className="grid gap-2">
          <legend className="text-sm font-medium">Check-in study style</legend>
          <p className="text-sm text-muted">Matching uses this check-in study style.</p>
          {STUDY_STYLES.map((style) => (
            <label key={style} className="flex min-h-11 items-center gap-3 text-sm">
              <input
                type="radio"
                name={`${formId}-style`}
                className="h-5 w-5"
                checked={draft.studyStyle === style}
                onChange={() => setDraft({ ...draft, studyStyle: style })}
              />
              {STUDY_STYLE_LABELS[style]}
            </label>
          ))}
        </fieldset>

        {active ? (
          <p className="text-sm text-muted">Submitting replaces your current check-in.</p>
        ) : null}
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button type="submit" disabled={!canSubmit || saving}>
            {saving ? "Checking in…" : "Check in"}
          </Button>
          <LinkButton href="/discover" variant="secondary">
            See matches
          </LinkButton>
        </div>
      </form>
    </div>
  );
}
