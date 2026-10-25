"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  deleteCheckin,
  getCheckin,
  getCourses,
  getLocations,
  getProfile,
  isApiError,
  postCheckin,
  postFinishCheckin,
} from "@/lib/api-client";
import { CHECKIN_FINISH_GRACE_MS } from "@/lib/study-time";
import { AVAILABILITY_LABELS, AVAILABILITIES, STUDY_STYLE_LABELS, STUDY_STYLES, formatTimestamp } from "@/lib/labels";
import {
  VALIDATION,
  type Availability,
  type Checkin,
  type CheckinStudyRecord,
  type Course,
  type Location,
  type PostCheckinBody,
  type Profile,
  type StudyStyle,
} from "@/types/api";
import { useDemo } from "@/components/demo-provider";
import { CheckinFeedback } from "@/components/study-feedback";
import { Button, ErrorBlock, FieldError, Sheet, errorLines, fieldClass, inputClass } from "@/components/ui";

type Draft = {
  courseId: string;
  locationId: string;
  durationMinutes: number;
  availability: Availability;
  studyStyle: StudyStyle;
};

export function FocusSheet({
  open,
  onClose,
  preset,
}: {
  open: boolean;
  onClose: () => void;
  preset?: { courseId: string; locationId: string; durationMinutes: number } | null;
}) {
  const demo = useDemo();
  const formId = useId();
  const [phase, setPhase] = useState<"loading" | "error" | "ready">("loading");
  const [loadError, setLoadError] = useState("Could not load check-in.");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [active, setActive] = useState<Checkin | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [messages, setMessages] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [confirmCheckout, setConfirmCheckout] = useState(false);
  const [saved, setSaved] = useState<CheckinStudyRecord | null>(null);
  const savedHold = useRef<CheckinStudyRecord | null>(null);
  const [now, setNow] = useState<number | null>(null);

  function closeSheet() {
    savedHold.current = null;
    setSaved(null);
    setConfirmCheckout(false);
    onClose();
  }

  useEffect(() => {
    if (!open || !demo.ready || !demo.userId || savedHold.current) return;
    let cancelled = false;
    void (async () => {
      setPhase("loading");
      const [profileResult, courseResult, locationResult, checkinResult] = await Promise.all([
        getProfile(),
        getCourses(),
        getLocations(),
        getCheckin(),
      ]);
      if (cancelled || savedHold.current) return;
      const failure = [profileResult, courseResult, locationResult, checkinResult].find(isApiError);
      if (failure && isApiError(failure)) {
        setLoadError(failure.error.message);
        setPhase("error");
        return;
      }
      if (isApiError(profileResult) || isApiError(courseResult) || isApiError(locationResult) || isApiError(checkinResult)) {
        return;
      }
      const nextProfile = profileResult.data;
      const profileCourses = courseResult.data.filter((course) => nextProfile?.courseIds.includes(course.id));
      setProfile(nextProfile);
      setCourses(courseResult.data);
      setLocations(locationResult.data);
      setActive(checkinResult.data);
      const presetCourse = preset?.courseId && profileCourses.some((course) => course.id === preset.courseId)
        ? preset.courseId
        : profileCourses[0]?.id ?? "";
      const presetLocation = preset?.locationId && locationResult.data.some((location) => location.id === preset.locationId)
        ? preset.locationId
        : locationResult.data[0]?.id ?? "";
      setDraft({
        courseId: presetCourse,
        locationId: presetLocation,
        durationMinutes: preset?.durationMinutes ?? nextProfile?.preferredDurationMinutes ?? VALIDATION.durationMinutes.min,
        availability: "available",
        studyStyle: nextProfile?.studyStyle ?? "collaborative",
      });
      setPhase("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [open, demo.ready, demo.userId, demo.revision, preset?.courseId, preset?.locationId, preset?.durationMinutes]);

  useEffect(() => {
    if (!open || !active || saved) return;
    const tick = () => setNow(Date.now());
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [open, active, saved]);

  const profileCourses = courses.filter((course) => profile?.courseIds.includes(course.id));
  const activeCourse = courses.find((course) => course.id === active?.courseId);
  const activeLocation = locations.find((location) => location.id === active?.locationId);
  const expiresAtMs = active ? new Date(active.expiresAt).getTime() : null;
  const remaining = active && now !== null && expiresAtMs !== null ? Math.max(0, expiresAtMs - now) : null;
  const plannedEnded = expiresAtMs !== null && now !== null && now >= expiresAtMs;
  const windowClosed = expiresAtMs !== null && now !== null && now > expiresAtMs + CHECKIN_FINISH_GRACE_MS;

  async function submit() {
    if (!draft) return;
    setSaving(true);
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
    setActive(result.data);
  }

  async function finish() {
    if (!active) return;
    setFinishing(true);
    setMessages([]);
    const result = await postFinishCheckin(active.id);
    setFinishing(false);
    if (isApiError(result)) {
      setMessages(errorLines(result));
      return;
    }
    savedHold.current = result.data;
    setSaved(result.data);
    setActive(null);
    setConfirmCheckout(false);
  }

  async function checkoutWithoutSaving() {
    setCheckingOut(true);
    setMessages([]);
    const result = await deleteCheckin();
    setCheckingOut(false);
    if (isApiError(result)) {
      setMessages(errorLines(result));
      return;
    }
    savedHold.current = null;
    setActive(null);
    setConfirmCheckout(false);
    onClose();
  }

  return (
    <Sheet open={open} title={saved ? "Study saved" : active ? "Studying" : "Start focusing"} onClose={closeSheet}>
      {phase === "loading" ? <p role="status">Loading check-in</p> : null}
      {phase === "error" ? <ErrorBlock title="Check-in unavailable" message={loadError} /> : null}
      {phase === "ready" && !profile ? (
        <p className="text-sm leading-6 text-muted">Save a profile before starting a check-in.</p>
      ) : null}
      {phase === "ready" && profile && !profile.visible ? (
        <p className="rounded-[14px] bg-warning-soft px-4 py-3 text-sm leading-6 text-warning">
          Turn on discovery visibility in your profile before checking in.
        </p>
      ) : null}
      {phase === "ready" && saved ? (
        <div className="grid gap-4">
          <div className="grid gap-2 text-center">
            <p className="font-display text-2xl font-extrabold">Study session saved</p>
            <p className="text-sm leading-6">
              {saved.creditedMinutes} self-reported minute{saved.creditedMinutes === 1 ? "" : "s"}. This time is not independently verified.
            </p>
            <p className="text-sm leading-6 text-muted">
              {saved.creditedMinutes < 1
                ? "No full minute was completed, so this does not add study time."
                : "Home, Profile, and History now include this personal study session."}
            </p>
          </div>
          <CheckinFeedback
            key={saved.checkinId}
            record={saved}
            onSkip={closeSheet}
            onSaved={(next) => {
              savedHold.current = next;
              setSaved(next);
            }}
          />
        </div>
      ) : null}
      {phase === "ready" && profile && active && !saved ? (
        <div className="grid justify-items-center gap-4 text-center">
          <TimerRing remaining={remaining} startedAt={active.startedAt} expiresAt={active.expiresAt} />
          <p className="font-display text-3xl font-extrabold tabular-nums">
            {remaining === null ? formatTimestamp(active.expiresAt) : formatClock(remaining)}
          </p>
          <p className="text-sm leading-6">
            {activeCourse ? `${activeCourse.code} · ${activeCourse.title}` : "Course"}
          </p>
          <p className="text-sm leading-6">{activeLocation?.name ?? "Building"}</p>
          <p className="text-sm leading-6 text-muted">
            {AVAILABILITY_LABELS[active.availability]} · {STUDY_STYLE_LABELS[active.studyStyle]} · until{" "}
            {formatTimestamp(active.expiresAt)}
          </p>
          {plannedEnded ? (
            <p className="rounded-[14px] bg-warning-soft px-4 py-3 text-sm leading-6 text-warning">
              Planned time ended. Finish studying saves the minutes through {formatTimestamp(active.expiresAt)}. Time after that is not counted.
            </p>
          ) : active.availability === "focused" || !active.live ? (
            <p className="rounded-[14px] bg-warning-soft px-4 py-3 text-sm leading-6 text-warning">
              {active.availability === "focused"
                ? "Focus mode hides you from discovery. Other students cannot see this check-in."
                : "This check-in is no longer visible in discovery."}
            </p>
          ) : (
            <p className="text-sm leading-6 text-muted">
              You are visible at this public building. Closing this window keeps the timer running.
            </p>
          )}
          <FieldError messages={messages} />
          {confirmCheckout ? (
            <div className="grid w-full gap-3 rounded-[14px] bg-surface-muted p-4 text-left">
              <p className="text-sm leading-6">
                Check out without saving study time? This leaves discovery and does not update History or your streak.
              </p>
              <Button variant="danger" disabled={checkingOut || finishing} onClick={() => void checkoutWithoutSaving()}>
                {checkingOut ? "Checking out…" : "Check out without saving"}
              </Button>
              <Button variant="secondary" disabled={checkingOut} onClick={() => setConfirmCheckout(false)}>
                Keep studying
              </Button>
            </div>
          ) : windowClosed ? (
            <p className="text-sm leading-6 text-muted">
              The finish window has closed. No study time was saved. Close this window and start a new check-in when you are ready.
            </p>
          ) : (
            <div className="grid w-full gap-3">
              <Button disabled={finishing || checkingOut} onClick={() => void finish()}>
                {finishing ? "Saving…" : "Finish studying"}
              </Button>
              <Button variant="secondary" disabled={finishing || checkingOut} onClick={() => setConfirmCheckout(true)}>
                Check out without saving
              </Button>
            </div>
          )}
        </div>
      ) : null}
      {phase === "ready" && profile && draft && !active && !saved ? (
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <label className={fieldClass} htmlFor={`${formId}-course`}>
            Class
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
          <label className={fieldClass} htmlFor={`${formId}-duration`}>
            Length, {draft.durationMinutes} minutes
            <input
              id={`${formId}-duration`}
              className="w-full accent-[var(--accent-fill)]"
              type="range"
              min={VALIDATION.durationMinutes.min}
              max={VALIDATION.durationMinutes.max}
              step={1}
              value={draft.durationMinutes}
              onChange={(event) => setDraft({ ...draft, durationMinutes: Number(event.target.value) })}
            />
            <span className="font-semibold text-muted">30 to 180 minutes. That is the range this campus accepts.</span>
          </label>
          <fieldset className="grid gap-2">
            <legend className="text-[13px] font-bold">Who can see you</legend>
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
            <p className="text-sm leading-6 text-muted">
              Available and Questions only stay in discovery. Focused hides this check-in from other students.
            </p>
          </fieldset>
          <fieldset className="grid gap-2">
            <legend className="text-[13px] font-bold">Check-in study style</legend>
            <div className="flex flex-wrap gap-2">
              {STUDY_STYLES.map((style) => (
                <label
                  key={style}
                  className="inline-flex min-h-11 items-center rounded-full bg-surface-muted px-3 text-sm font-bold has-[:checked]:bg-accent-fill has-[:checked]:text-accent-ink"
                >
                  <input
                    type="radio"
                    name={`${formId}-style`}
                    className="sr-only"
                    checked={draft.studyStyle === style}
                    onChange={() => setDraft({ ...draft, studyStyle: style })}
                  />
                  {STUDY_STYLE_LABELS[style]}
                </label>
              ))}
            </div>
          </fieldset>
          <FieldError messages={messages} />
          <Button type="submit" disabled={!profile.visible || profileCourses.length === 0 || saving}>
            {saving ? "Starting…" : `Start ${draft.durationMinutes} min session`}
          </Button>
        </form>
      ) : null}
    </Sheet>
  );
}

function TimerRing({
  remaining,
  startedAt,
  expiresAt,
}: {
  remaining: number | null;
  startedAt: string;
  expiresAt: string;
}) {
  const start = new Date(startedAt).getTime();
  const end = new Date(expiresAt).getTime();
  const span = end - start;
  const elapsed = remaining === null || span <= 0 ? 0 : Math.min(1, Math.max(0, 1 - remaining / span));
  const circumference = 2 * Math.PI * 108;
  return (
    <svg width="220" height="220" viewBox="0 0 250 250" aria-hidden="true">
      <circle cx="125" cy="125" r="108" fill="none" stroke="rgba(16,48,74,0.12)" strokeWidth="10" />
      <circle
        cx="125"
        cy="125"
        r="108"
        fill="none"
        stroke="#FF9A3D"
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={`${elapsed * circumference} ${circumference}`}
        transform="rotate(-90 125 125)"
      />
    </svg>
  );
}

function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
