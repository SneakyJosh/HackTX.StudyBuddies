"use client";

import { useEffect, useId, useState } from "react";
import { getCourses, getLocations, getProfile, getRequests, isApiError, postSession } from "@/lib/api-client";
import { CAMPUS_TIME_MESSAGES, resolveCampusStart } from "@/lib/campus-time";
import { formatPersonMeta } from "@/lib/labels";
import { CAMPUS_TIME_ZONE, VALIDATION, type Course, type Location, type PostSessionBody, type SessionVisibility, type StudyRequest } from "@/types/api";
import { useDemo } from "@/components/demo-provider";
import { Button, ErrorBlock, FieldError, Sheet, errorLines, fieldClass, inputClass } from "@/components/ui";

const VISIBILITIES: { value: SessionVisibility; label: string; detail: string }[] = [
  { value: "solo", label: "Solo", detail: "Just you. This stays off the open list." },
  { value: "open", label: "Open", detail: "Students on your campus can request a seat. You approve each request." },
  { value: "invite_only", label: "Invite-only", detail: "Only accepted study partners you invite can join." },
];

function campusDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CAMPUS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function timeOptions(): string[] {
  const options: string[] = [];
  for (let hour = 0; hour < 24; hour += 1) {
    for (let minute = 0; minute < 60; minute += VALIDATION.sessionMinuteStep) {
      options.push(`${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
    }
  }
  return options;
}

const TIMES = timeOptions();

export function ScheduleSheet({
  open,
  onClose,
  presetLocationId = null,
}: {
  open: boolean;
  onClose: () => void;
  presetLocationId?: string | null;
}) {
  const demo = useDemo();
  const formId = useId();
  const [step, setStep] = useState(1);
  const [phase, setPhase] = useState<"loading" | "error" | "ready">("loading");
  const [loadError, setLoadError] = useState("Could not load the scheduler.");
  const [courses, setCourses] = useState<Course[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [partners, setPartners] = useState<StudyRequest["counterpart"][]>([]);
  const [title, setTitle] = useState("");
  const [courseId, setCourseId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [localDate, setLocalDate] = useState("");
  const [localTime, setLocalTime] = useState("16:00");
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [visibility, setVisibility] = useState<SessionVisibility>("open");
  const [seatLimit, setSeatLimit] = useState(4);
  const [inviteeIds, setInviteeIds] = useState<string[]>([]);
  const [messages, setMessages] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [today, setToday] = useState("");
  const [latest, setLatest] = useState("");

  useEffect(() => {
    if (!open || !demo.ready || !demo.userId) return;
    let cancelled = false;
    void (async () => {
      setPhase("loading");
      setStep(1);
      setMessages([]);
      const [profileResult, courseResult, locationResult, requestResult] = await Promise.all([
        getProfile(),
        getCourses(),
        getLocations(),
        getRequests("all"),
      ]);
      if (cancelled) return;
      const failure = [profileResult, courseResult, locationResult, requestResult].find(isApiError);
      if (failure && isApiError(failure)) {
        setLoadError(failure.error.message);
        setPhase("error");
        return;
      }
      if (isApiError(profileResult) || isApiError(courseResult) || isApiError(locationResult) || isApiError(requestResult)) {
        return;
      }
      const enrolled = courseResult.data.filter((course) => profileResult.data?.courseIds.includes(course.id));
      setCourses(enrolled);
      setLocations(locationResult.data);
      const accepted = new Map<string, StudyRequest["counterpart"]>();
      for (const request of requestResult.data) {
        if (request.status === "accepted") accepted.set(request.counterpart.id, request.counterpart);
      }
      setPartners([...accepted.values()]);
      setCourseId(enrolled[0]?.id ?? "");
      const presetLocation = presetLocationId && locationResult.data.some((location) => location.id === presetLocationId)
        ? presetLocationId
        : locationResult.data[0]?.id ?? "";
      setLocationId(presetLocation);
      setDurationMinutes(profileResult.data?.preferredDurationMinutes ?? 60);
      const now = new Date();
      setToday(campusDate(now));
      setLatest(campusDate(new Date(now.getTime() + VALIDATION.sessionHorizonDays * 24 * 60 * 60 * 1000)));
      setPhase("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [open, demo.ready, demo.userId, demo.revision, presetLocationId]);

  const seatCap = visibility === "solo" ? 1 : seatLimit;

  function toggleInvite(id: string) {
    setInviteeIds((current) => {
      if (current.includes(id)) return current.filter((value) => value !== id);
      if (current.length >= seatCap - 1) return current;
      return [...current, id];
    });
  }

  async function create() {
    setMessages([]);
    const resolved = resolveCampusStart(localDate, localTime, new Date());
    if (!resolved.ok) {
      setMessages([CAMPUS_TIME_MESSAGES[resolved.reason]]);
      setStep(1);
      return;
    }
    const body: PostSessionBody = {
      title: title.trim() || "Study session",
      courseId,
      locationId,
      localDate,
      localTime,
      durationMinutes,
      visibility,
      seatLimit: visibility === "solo" ? 1 : seatLimit,
      inviteeIds: visibility === "solo" ? [] : inviteeIds,
    };
    setSaving(true);
    const result = await postSession(body);
    setSaving(false);
    if (isApiError(result)) {
      setMessages(errorLines(result));
      return;
    }
    onClose();
  }

  return (
    <Sheet open={open} title={step === 1 ? "New session" : step === 2 ? "Choose a building" : "Who can join"} onClose={onClose}>
      {phase === "loading" ? <p role="status">Loading scheduler</p> : null}
      {phase === "error" ? <ErrorBlock title="Scheduler unavailable" message={loadError} /> : null}
      {phase === "ready" ? (
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (step === 1) setStep(2);
            else if (step === 2) setStep(3);
            else void create();
          }}
        >
          <p className="text-sm text-muted">Step {step} of 3. Times use {CAMPUS_TIME_ZONE}.</p>
          {step === 1 ? (
            <>
              <label className={fieldClass} htmlFor={`${formId}-title`}>
                Session name
                <input id={`${formId}-title`} className={inputClass} maxLength={60} value={title} onChange={(event) => setTitle(event.target.value)} />
              </label>
              <label className={fieldClass} htmlFor={`${formId}-course`}>
                Class
                <select id={`${formId}-course`} className={inputClass} value={courseId} onChange={(event) => setCourseId(event.target.value)}>
                  {courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.code} · {course.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className={fieldClass} htmlFor={`${formId}-date`}>
                Date
                <input id={`${formId}-date`} className={inputClass} type="date" min={today} max={latest} value={localDate} required onChange={(event) => setLocalDate(event.target.value)} />
              </label>
              <label className={fieldClass} htmlFor={`${formId}-time`}>
                Time
                <select id={`${formId}-time`} className={inputClass} value={localTime} onChange={(event) => setLocalTime(event.target.value)}>
                  {TIMES.map((time) => (
                    <option key={time} value={time}>
                      {time}
                    </option>
                  ))}
                </select>
              </label>
              <label className={fieldClass} htmlFor={`${formId}-duration`}>
                Length, {durationMinutes} minutes
                <input
                  id={`${formId}-duration`}
                  className="w-full accent-[var(--accent-fill)]"
                  type="range"
                  min={VALIDATION.durationMinutes.min}
                  max={VALIDATION.durationMinutes.max}
                  value={durationMinutes}
                  onChange={(event) => setDurationMinutes(Number(event.target.value))}
                />
              </label>
            </>
          ) : null}
          {step === 2 ? (
            <fieldset className="grid gap-2">
              <legend className="text-sm font-bold">Study location</legend>
              {locations.map((location) => (
                <label key={location.id} className="flex min-h-11 items-center gap-3 rounded-[14px] border border-line px-3 py-2 text-sm has-[:checked]:border-accent">
                  <input type="radio" name={`${formId}-location`} checked={locationId === location.id} onChange={() => setLocationId(location.id)} />
                  <span>
                    <span className="block font-bold">{location.name}</span>
                    <span className="text-muted">{location.parent ? `${location.buildingCode} · ${location.parent.name}` : location.buildingCode}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          ) : null}
          {step === 3 ? (
            <>
              <fieldset className="grid gap-2">
                <legend className="text-sm font-bold">Who can join</legend>
                {VISIBILITIES.map((option) => (
                  <label key={option.value} className="grid gap-1 rounded-[14px] border border-line px-3 py-2 text-sm has-[:checked]:border-accent">
                    <span className="flex items-center gap-3 font-bold">
                      <input
                        type="radio"
                        name={`${formId}-visibility`}
                        checked={visibility === option.value}
                        onChange={() => {
                          setVisibility(option.value);
                          if (option.value === "solo") setInviteeIds([]);
                        }}
                      />
                      {option.label}
                    </span>
                    <span className="pl-7 text-muted">{option.detail}</span>
                  </label>
                ))}
              </fieldset>
              {visibility !== "solo" ? (
                <>
                  <label className={fieldClass} htmlFor={`${formId}-seats`}>
                    Seats including you, {seatLimit}
                    <input
                      id={`${formId}-seats`}
                      className="w-full accent-[var(--accent-fill)]"
                      type="range"
                      min={VALIDATION.sessionGroupSeatLimit.min}
                      max={VALIDATION.sessionGroupSeatLimit.max}
                      value={seatLimit}
                      onChange={(event) => {
                        const next = Number(event.target.value);
                        setSeatLimit(next);
                        setInviteeIds((current) => current.slice(0, next - 1));
                      }}
                    />
                  </label>
                  <fieldset className="grid gap-2">
                    <legend className="text-sm font-bold">Invite study partners</legend>
                    <p className="text-sm text-muted">
                      {inviteeIds.length + 1} of {seatLimit} seats reserved, including you. Join requests do not reserve a seat.
                    </p>
                    {partners.length === 0 ? (
                      <p className="text-sm text-muted">Accepted study requests show up here.</p>
                    ) : (
                      partners.map((partner) => (
                        <label key={partner.id} className="flex min-h-11 items-center gap-3 text-sm">
                          <input
                            type="checkbox"
                            checked={inviteeIds.includes(partner.id)}
                            onChange={() => toggleInvite(partner.id)}
                          />
                          <span>
                            <span className="font-bold">{partner.displayName}</span>
                            <span className="block text-muted">{formatPersonMeta(partner.major, partner.academicYear)}</span>
                          </span>
                        </label>
                      ))
                    )}
                  </fieldset>
                </>
              ) : null}
            </>
          ) : null}
          <FieldError messages={messages} />
          <div className="flex flex-wrap gap-2">
            {step > 1 ? (
              <Button variant="secondary" onClick={() => setStep((value) => value - 1)}>
                Back
              </Button>
            ) : null}
            <Button type="submit" disabled={saving || courses.length === 0 || (step === 1 && localDate === "")}>
              {step < 3 ? "Continue" : saving ? "Creating…" : "Create session"}
            </Button>
          </div>
        </form>
      ) : null}
    </Sheet>
  );
}
