"use client";

import { useEffect, useState } from "react";
import { getCheckin, getCourses, getLocations, getProfile, getSessions, isApiError } from "@/lib/api-client";
import { formatCampusTimestamp } from "@/lib/campus-time";
import { AVAILABILITY_LABELS, formatTimestamp, initials } from "@/lib/labels";
import type { Checkin, Course, Location, Profile, ScheduledSession } from "@/types/api";
import { useDemo } from "@/components/demo-provider";
import { FocusSheet } from "@/components/focus-sheet";
import { StudyStatsCard } from "@/components/study-stats-card";
import { Button, EmptyBlock, ErrorBlock, LinkButton, LoadingBlock, cardClass } from "@/components/ui";

export function HomeDashboard() {
  const demo = useDemo();
  const [phase, setPhase] = useState<"loading" | "error" | "ready">("loading");
  const [message, setMessage] = useState("Could not load home.");
  const [reloadKey, setReloadKey] = useState(0);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [checkin, setCheckin] = useState<Checkin | null>(null);
  const [nextSession, setNextSession] = useState<ScheduledSession | null>(null);
  const [focusOpen, setFocusOpen] = useState(false);

  useEffect(() => {
    if (!demo.ready || !demo.userId) return;
    let cancelled = false;
    void (async () => {
      setPhase("loading");
      const [profileResult, courseResult, locationResult, checkinResult, sessionResult] = await Promise.all([
        getProfile(),
        getCourses(),
        getLocations(),
        getCheckin(),
        getSessions("upcoming"),
      ]);
      if (cancelled) return;
      const failure = [profileResult, courseResult, locationResult, checkinResult].find(isApiError);
      if (failure && isApiError(failure)) {
        setMessage(failure.error.message);
        setPhase("error");
        return;
      }
      if (isApiError(profileResult) || isApiError(courseResult) || isApiError(locationResult) || isApiError(checkinResult)) {
        return;
      }
      setProfile(profileResult.data);
      setCourses(courseResult.data);
      setLocations(locationResult.data);
      setCheckin(checkinResult.data);
      setNextSession(
        isApiError(sessionResult)
          ? null
          : sessionResult.data.find((session) => session.myRole === "host" || session.myStatus === "accepted") ?? null,
      );
      setPhase("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [demo.ready, demo.userId, demo.revision, reloadKey]);

  if (!demo.ready || phase === "loading") return <LoadingBlock label="Loading home" />;
  if (phase === "error") {
    return <ErrorBlock title="Home is unavailable" message={message} onRetry={() => setReloadKey((value) => value + 1)} />;
  }

  const name = profile?.displayName || "there";
  const enrolled = courses.filter((course) => profile?.courseIds.includes(course.id));
  const activeCourse = courses.find((course) => course.id === checkin?.courseId);
  const activeLocation = locations.find((location) => location.id === checkin?.locationId);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-muted">Home</p>
          <h1 className="font-display text-[1.75rem] font-extrabold">Dashboard</h1>
        </div>
        <Button className="hidden lg:inline-flex" onClick={() => setFocusOpen(true)}>
          {checkin ? "Open focus timer" : "Start focusing"}
        </Button>
      </div>

      <section className={`${cardClass} bg-[linear-gradient(135deg,var(--surface),rgba(255,138,31,0.13))]`}>
        <div className="flex items-center gap-4">
          <span
            className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-accent-fill font-display text-xl font-extrabold text-accent-ink"
            aria-hidden="true"
          >
            {initials(name)}
          </span>
          <div>
            <p className="text-sm text-muted">Welcome back</p>
            <h2 className="font-display text-[1.7rem] font-extrabold">{name}</h2>
            <p className="mt-1 text-sm text-muted">
              {profile?.major ? profile.major : "Add a major on your profile."}
              {profile?.visible ? " · Visible in discovery after you check in." : " · Discovery is off until you opt in."}
            </p>
          </div>
        </div>
        <div className="mt-4">
          <StudyStatsCard />
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-display text-xl font-bold">Up next</h2>
          <LinkButton href="/sessions" variant="secondary">
            Sessions
          </LinkButton>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
        {nextSession ? (
          <article className={cardClass}>
            <h3 className="font-display text-xl font-bold">{nextSession.title}</h3>
            <p className="mt-1 text-sm">
              {nextSession.course.code} · {nextSession.course.title}
            </p>
            <p className="mt-1 text-sm text-muted">{formatCampusTimestamp(nextSession.startsAt)}</p>
            <p className="mt-1 text-sm">{nextSession.location.name}</p>
            <p className="mt-2 text-sm text-muted">
              {nextSession.seatsReserved} of {nextSession.seatLimit} seats reserved
            </p>
          </article>
        ) : null}
        {checkin ? (
          <article className={cardClass}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h3 className="font-display text-xl font-bold">
                {activeCourse ? `${activeCourse.code} · ${activeCourse.title}` : "Active check-in"}
              </h3>
              <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-bold text-accent">
                {AVAILABILITY_LABELS[checkin.availability]}
              </span>
            </div>
            <p className="mt-2 text-sm text-muted">
              {checkin.live ? `Until ${formatTimestamp(checkin.expiresAt)}` : "Planned time ended"}
            </p>
            <p className="mt-2 text-sm">{activeLocation ? activeLocation.name : "Public building"}</p>
            {checkin.live ? null : (
              <p className="mt-3 text-sm leading-6 text-warning">
                Finish studying to save the minutes through the planned end. Time after that is not counted.
              </p>
            )}
            {checkin.availability === "focused" ? (
              <p className="mt-3 text-sm leading-6 text-warning">Focus mode hides this check-in from discovery.</p>
            ) : checkin.live ? (
              <p className="mt-3 text-sm leading-6 text-muted">Other students on campus can see this public building.</p>
            ) : (
              <p className="mt-3 text-sm leading-6 text-muted">This check-in is no longer visible in discovery.</p>
            )}
          </article>
        ) : null}
        </div>
        {!checkin && !nextSession ? (
          <EmptyBlock
            title="Nothing scheduled"
            body="Create a booking on Sessions, or start a check-in when you are at a public building."
          />
        ) : null}
      </section>

      <section>
        <h2 className="mb-3 font-display text-xl font-bold">Your courses</h2>
        {enrolled.length === 0 ? (
          <EmptyBlock title="No courses yet" body="Add at least one course on your profile." />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {enrolled.map((course) => (
              <li key={course.id} className={cardClass}>
                <p className="font-display text-lg font-bold">{course.code}</p>
                <p className="mt-1 text-sm leading-5 text-muted">{course.title}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {!checkin ? (
        <button
          type="button"
          className="fixed bottom-24 left-1/2 z-20 grid h-24 w-24 -translate-x-1/2 place-items-center rounded-full bg-[radial-gradient(circle_at_35%_28%,#FFD9A8,var(--accent-fill)_58%,#E56F00)] text-center font-display text-sm font-extrabold text-accent-ink shadow-[0_0_0_7px_rgba(255,138,31,0.18),0_0_38px_9px_rgba(255,138,31,0.45)] lg:hidden"
          onClick={() => setFocusOpen(true)}
        >
          Focus
          <span className="mt-1 block font-sans text-[10px] font-semibold">tap to start</span>
        </button>
      ) : null}
      <FocusSheet open={focusOpen} onClose={() => setFocusOpen(false)} />
    </div>
  );
}
