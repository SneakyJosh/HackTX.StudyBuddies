"use client";

import { useEffect, useId, useState } from "react";
import { getCourses, getProfile, getUniversities, isApiError, putProfile } from "@/lib/api-client";
import { labelForEmail } from "@/lib/session";
import { ACADEMIC_YEAR_LABELS, ACADEMIC_YEARS, STUDY_STYLE_LABELS, STUDY_STYLES } from "@/lib/labels";
import {
  VALIDATION,
  type AcademicYear,
  type Course,
  type Profile,
  type PutProfileBody,
  type StudyStyle,
  type University,
} from "@/types/api";
import { useHydratedDemo } from "@/components/demo-provider";
import {
  Button,
  EmptyBlock,
  ErrorBlock,
  FieldError,
  LoadingBlock,
  PageHeader,
  errorLines,
  fieldClass,
  inputClass,
} from "@/components/ui";

type ProfileFormState = {
  displayName: string;
  universityId: string;
  major: string;
  academicYear: AcademicYear | "";
  courseIds: string[];
  studyStyle: StudyStyle;
  preferredDurationMinutes: number;
  preferredGroupSize: number;
  visible: boolean;
};

function emptyForm(universityId: string, displayName: string): ProfileFormState {
  return {
    displayName,
    universityId,
    major: "",
    academicYear: "",
    courseIds: [],
    studyStyle: "collaborative",
    preferredDurationMinutes: 60,
    preferredGroupSize: 2,
    visible: false,
  };
}

function formFromProfile(profile: Profile): ProfileFormState {
  return {
    displayName: profile.displayName,
    universityId: profile.universityId,
    major: profile.major ?? "",
    academicYear: profile.academicYear ?? "",
    courseIds: [...profile.courseIds],
    studyStyle: profile.studyStyle,
    preferredDurationMinutes: profile.preferredDurationMinutes,
    preferredGroupSize: profile.preferredGroupSize,
    visible: profile.visible,
  };
}

export function ProfileForm() {
  const demo = useHydratedDemo();
  const formId = useId();
  const [phase, setPhase] = useState<"loading" | "error" | "ready">("loading");
  const [loadError, setLoadError] = useState("Could not load the profile form.");
  const [reloadKey, setReloadKey] = useState(0);
  const [universities, setUniversities] = useState<University[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [form, setForm] = useState<ProfileFormState | null>(null);
  const [messages, setMessages] = useState<string[]>([]);
  const [saved, setSaved] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!demo.hydrated || !demo.userId) return;
    let cancelled = false;
    void (async () => {
      setPhase("loading");
      const [universityResult, courseResult, profileResult] = await Promise.all([
        getUniversities(),
        getCourses(),
        getProfile(),
      ]);
      if (cancelled) return;
      if (isApiError(universityResult) || isApiError(courseResult) || isApiError(profileResult)) {
        const failure = isApiError(universityResult)
          ? universityResult
          : isApiError(courseResult)
            ? courseResult
            : profileResult;
        setLoadError(isApiError(failure) ? failure.error.message : "Could not load the profile form.");
        setPhase("error");
        return;
      }
      setUniversities(universityResult.data);
      setCourses(courseResult.data);
      setForm(
        profileResult.data
          ? formFromProfile(profileResult.data)
          : emptyForm(universityResult.data[0]?.id ?? "", labelForEmail(demo.email) ?? ""),
      );
      setPhase("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [demo.hydrated, demo.userId, demo.email, reloadKey]);

  if (!demo.hydrated || phase === "loading") return <LoadingBlock label="Loading profile" />;
  if (phase === "error") {
    return (
      <ErrorBlock title="Profile unavailable" message={loadError} onRetry={() => setReloadKey((value) => value + 1)} />
    );
  }
  if (!form || universities.length === 0) {
    return <EmptyBlock title="No campus is available" body="The demo campus list did not load." />;
  }

  const groupSizes: number[] = [];
  for (let size = VALIDATION.preferredGroupSize.min; size <= VALIDATION.preferredGroupSize.max; size += 1) {
    groupSizes.push(size);
  }

  function toggleCourse(courseId: string) {
    setForm((current) => {
      if (!current) return current;
      if (current.courseIds.includes(courseId)) {
        return { ...current, courseIds: current.courseIds.filter((id) => id !== courseId) };
      }
      if (current.courseIds.length >= VALIDATION.courseIds.max) return current;
      return { ...current, courseIds: [...current.courseIds, courseId] };
    });
  }

  async function save() {
    if (!form) return;
    setSaving(true);
    setSaved("");
    setMessages([]);
    const body: PutProfileBody = {
      displayName: form.displayName,
      universityId: form.universityId,
      major: form.major.trim() === "" ? null : form.major.trim(),
      academicYear: form.academicYear === "" ? null : form.academicYear,
      courseIds: form.courseIds,
      studyStyle: form.studyStyle,
      preferredDurationMinutes: form.preferredDurationMinutes,
      preferredGroupSize: form.preferredGroupSize,
      visible: form.visible,
    };
    const result = await putProfile(body);
    setSaving(false);
    if (isApiError(result)) {
      setMessages(errorLines(result));
      return;
    }
    setForm(formFromProfile(result.data));
    setSaved(result.data.visible ? "Profile saved. You are opted in to discovery." : "Profile saved. Visibility stays off until you opt in.");
  }

  return (
    <div className="grid w-full gap-5">
      <PageHeader
        title="Profile"
        description="Tell StudySync how you like to study. Visibility stays off until you opt in. Saving updates your account on this campus."
      />
      <form
        className="grid items-start gap-5 lg:grid-cols-2"
        autoComplete="off"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        {messages.length > 0 || saved ? (
          <div className="grid gap-5 lg:col-span-2">
            <FieldError messages={messages} />
            {saved ? (
              <p role="status" className="rounded-2xl bg-accent-soft px-4 py-3 text-sm text-accent">
                {saved}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="grid gap-5">
        <label className={fieldClass} htmlFor={`${formId}-name`}>
          Display name
          <input
            id={`${formId}-name`}
            className={inputClass}
            value={form.displayName}
            maxLength={VALIDATION.displayName.max}
            autoComplete="off"
            onChange={(event) => setForm({ ...form, displayName: event.target.value })}
          />
        </label>

        <label className={fieldClass} htmlFor={`${formId}-university`}>
          University
          <select
            id={`${formId}-university`}
            className={inputClass}
            value={form.universityId}
            onChange={(event) => setForm({ ...form, universityId: event.target.value })}
          >
            {universities.map((university) => (
              <option key={university.id} value={university.id}>
                {university.name}
              </option>
            ))}
          </select>
        </label>

        <div className="grid gap-4 md:grid-cols-2">
          <label className={fieldClass} htmlFor={`${formId}-major`}>
            Major
            <input
              id={`${formId}-major`}
              className={inputClass}
              value={form.major}
              maxLength={VALIDATION.major.max}
              placeholder="Optional"
              onChange={(event) => setForm({ ...form, major: event.target.value })}
            />
          </label>
          <label className={fieldClass} htmlFor={`${formId}-year`}>
            Academic year
            <select
              id={`${formId}-year`}
              className={inputClass}
              value={form.academicYear}
              onChange={(event) =>
                setForm({ ...form, academicYear: event.target.value as AcademicYear | "" })
              }
            >
              <option value="">Not set</option>
              {ACADEMIC_YEARS.map((year) => (
                <option key={year} value={year}>
                  {ACADEMIC_YEAR_LABELS[year]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <fieldset className="grid gap-2">
          <legend className="text-sm font-medium">Courses</legend>
          <p className="text-sm text-muted">
            Choose {VALIDATION.courseIds.min}–{VALIDATION.courseIds.max} seeded courses.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {courses.map((course) => {
              const checked = form.courseIds.includes(course.id);
              return (
                <label
                  key={course.id}
                  className="flex min-h-11 items-start gap-3 rounded-2xl border border-line bg-surface px-3 py-3"
                >
                  <input
                    type="checkbox"
                    className="mt-1 h-5 w-5"
                    checked={checked}
                    onChange={() => toggleCourse(course.id)}
                  />
                  <span>
                    <span className="block font-semibold">{course.code}</span>
                    <span className="block text-sm text-muted">{course.title}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
        </div>

        <div className="grid content-start gap-5">
        <fieldset className="grid gap-2">
          <legend className="text-sm font-medium">Study style</legend>
          {STUDY_STYLES.map((style) => (
            <label key={style} className="flex min-h-11 items-center gap-3 text-sm">
              <input
                type="radio"
                name={`${formId}-style`}
                className="h-5 w-5"
                checked={form.studyStyle === style}
                onChange={() => setForm({ ...form, studyStyle: style })}
              />
              {STUDY_STYLE_LABELS[style]}
            </label>
          ))}
        </fieldset>

        <label className={fieldClass} htmlFor={`${formId}-duration`}>
          Preferred duration, {form.preferredDurationMinutes} minutes
          <input
            id={`${formId}-duration`}
            className="w-full"
            type="range"
            min={VALIDATION.preferredDurationMinutes.min}
            max={VALIDATION.preferredDurationMinutes.max}
            step={1}
            value={form.preferredDurationMinutes}
            onChange={(event) =>
              setForm({ ...form, preferredDurationMinutes: Number(event.target.value) })
            }
          />
        </label>

        <fieldset className="grid gap-2">
          <legend className="text-sm font-medium">Preferred group size</legend>
          <div className="flex flex-wrap gap-2">
            {groupSizes.map((size) => (
              <label
                key={size}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-line bg-surface px-3 has-[:checked]:border-accent has-[:checked]:bg-accent has-[:checked]:text-accent-foreground"
              >
                <input
                  type="radio"
                  name={`${formId}-group`}
                  className="sr-only"
                  checked={form.preferredGroupSize === size}
                  onChange={() => setForm({ ...form, preferredGroupSize: size })}
                />
                {size}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="flex items-start gap-3 rounded-2xl border border-line bg-surface-muted p-4">
          <input
            type="checkbox"
            className="mt-1 h-5 w-5"
            checked={form.visible}
            onChange={(event) => setForm({ ...form, visible: event.target.checked })}
          />
          <span>
            <span className="block font-medium">Opt in to discovery</span>
            <span className="mt-1 block text-sm leading-6 text-muted">
              This stays off until you choose it. Other students only see you after you opt in and
              check in with an availability other than Focused.
            </span>
          </span>
        </label>

        <Button type="submit" disabled={saving} className="w-full sm:w-auto">
          {saving ? "Saving…" : "Save profile"}
        </Button>
        </div>
      </form>
    </div>
  );
}
