"use client";

import { useEffect, useState } from "react";
import {
  getCheckin,
  getCourses,
  getLocations,
  getSessions,
  isApiError,
  patchInvitation,
  patchSessionParticipant,
  postCancelSession,
  postLeave,
} from "@/lib/api-client";
import { formatCampusTimestamp } from "@/lib/campus-time";
import { AVAILABILITY_LABELS, STUDY_STYLE_LABELS, formatTimestamp } from "@/lib/labels";
import { VALIDATION, type Checkin, type Course, type Location, type ScheduledSession } from "@/types/api";
import { useDemo } from "@/components/demo-provider";
import { FocusSheet } from "@/components/focus-sheet";
import { ScheduleSheet } from "@/components/schedule-sheet";
import { Button, EmptyBlock, ErrorBlock, LoadingBlock, cardClass } from "@/components/ui";

export function SessionsBoard() {
  const demo = useDemo();
  const [phase, setPhase] = useState<"loading" | "error" | "ready">("loading");
  const [message, setMessage] = useState("Could not load sessions.");
  const [reloadKey, setReloadKey] = useState(0);
  const [checkin, setCheckin] = useState<Checkin | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [upcoming, setUpcoming] = useState<ScheduledSession[]>([]);
  const [past, setPast] = useState<ScheduledSession[]>([]);
  const [scheduleMessage, setScheduleMessage] = useState<string | null>(null);
  const [focusOpen, setFocusOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [preset, setPreset] = useState<{ courseId: string; locationId: string; durationMinutes: number } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!demo.ready || !demo.userId) return;
    let cancelled = false;
    void (async () => {
      setPhase("loading");
      const [checkinResult, courseResult, locationResult, upcomingResult, pastResult] = await Promise.all([
        getCheckin(),
        getCourses(),
        getLocations(),
        getSessions("upcoming"),
        getSessions("past"),
      ]);
      if (cancelled) return;
      const failure = [checkinResult, courseResult, locationResult].find(isApiError);
      if (failure && isApiError(failure)) {
        setMessage(failure.error.message);
        setPhase("error");
        return;
      }
      if (isApiError(checkinResult) || isApiError(courseResult) || isApiError(locationResult)) return;
      setCheckin(checkinResult.data);
      setCourses(courseResult.data);
      setLocations(locationResult.data);
      if (isApiError(upcomingResult)) {
        setUpcoming([]);
        setPast([]);
        setScheduleMessage(upcomingResult.error.message);
      } else if (isApiError(pastResult)) {
        setUpcoming([]);
        setPast([]);
        setScheduleMessage(pastResult.error.message);
      } else {
        setUpcoming(upcomingResult.data);
        setPast(pastResult.data);
        setScheduleMessage(null);
      }
      setPhase("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [demo.ready, demo.userId, demo.revision, reloadKey]);

  if (!demo.ready || phase === "loading") return <LoadingBlock label="Loading sessions" />;
  if (phase === "error") {
    return (
      <ErrorBlock title="Sessions are unavailable" message={message} onRetry={() => setReloadKey((value) => value + 1)} />
    );
  }

  const course = courses.find((item) => item.id === checkin?.courseId);
  const location = locations.find((item) => item.id === checkin?.locationId);

  function studyFrom(session: ScheduledSession) {
    const minutes = Math.round((new Date(session.endsAt).getTime() - new Date(session.startsAt).getTime()) / 60000);
    setPreset({
      courseId: session.course.id,
      locationId: session.location.id,
      durationMinutes: Math.min(VALIDATION.durationMinutes.max, Math.max(VALIDATION.durationMinutes.min, minutes)),
    });
    setFocusOpen(true);
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[1.75rem] font-extrabold">Sessions</h1>
          <p className="mt-2 max-w-2xl text-[15px] leading-6 text-muted">
            A booking is a plan. The check-in is the live study block, and you still choose Focus mode yourself.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setFocusOpen(true)}>
            {checkin ? "Open timer" : "Focus now"}
          </Button>
          <Button onClick={() => setScheduleOpen(true)}>New session</Button>
        </div>
      </div>

      {checkin ? (
        <article className={cardClass}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2 className="font-display text-xl font-bold">
              {course ? `${course.code} · ${course.title}` : "Active check-in"}
            </h2>
            <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-bold text-accent">
              {AVAILABILITY_LABELS[checkin.availability]}
            </span>
          </div>
          <p className="mt-2 text-sm text-muted">Until {formatTimestamp(checkin.expiresAt)}</p>
          <p className="mt-2 text-sm">{location?.name ?? "Public building"}</p>
          <p className="mt-1 text-sm text-muted">{STUDY_STYLE_LABELS[checkin.studyStyle]}</p>
        </article>
      ) : (
        <EmptyBlock title="No active check-in" body="Start one when you are at a public campus building." />
      )}

      <section className="grid gap-3">
        <h2 className="font-display text-xl font-bold">Upcoming</h2>
        {scheduleMessage ? <ErrorBlock title="Bookings are unavailable" message={scheduleMessage} /> : null}
        {upcoming.length === 0 && !scheduleMessage ? (
          <EmptyBlock title="No upcoming bookings" body="Create a session for a public building and a time in America/Chicago." />
        ) : (
          <ul className="grid gap-4 xl:grid-cols-2">
            {upcoming.map((session) => (
              <SessionCard key={session.id} session={session} onStudy={() => studyFrom(session)} onError={setActionError} />
            ))}
          </ul>
        )}
        {actionError ? (
          <p role="alert" className="text-sm text-danger">
            {actionError}
          </p>
        ) : null}
      </section>

      <section className="grid gap-3">
        <h2 className="font-display text-xl font-bold">Past bookings</h2>
        <p className="text-sm leading-6 text-muted">
          These times have passed. They are not completed study sessions, and they do not add streaks or study hours.
        </p>
        {past.length === 0 ? (
          <EmptyBlock title="No past bookings" body="A booking moves here after its end time. Cancelling one removes it from both lists." />
        ) : (
          <ul className="grid gap-4 xl:grid-cols-2">
            {past.map((session) => (
              <li key={session.id} className={cardClass}>
                <h3 className="font-display text-xl font-bold">{session.title}</h3>
                <p className="mt-1 text-sm text-muted">{formatCampusTimestamp(session.startsAt)}</p>
                <p className="mt-1 text-sm">{session.location.name}</p>
                <p className="mt-2 text-sm font-semibold">Ended booking</p>
              </li>
            ))}
          </ul>
        )}
      </section>
      <ScheduleSheet open={scheduleOpen} onClose={() => setScheduleOpen(false)} />
      <FocusSheet open={focusOpen} preset={preset} onClose={() => setFocusOpen(false)} />
    </div>
  );
}

function SessionCard({
  session,
  onStudy,
  onError,
}: {
  session: ScheduledSession;
  onStudy: () => void;
  onError: (message: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const requests = session.myRole === "host" ? session.participants.filter((person) => person.status === "requested") : [];

  async function run(action: () => Promise<{ error?: { message: string } } | object>) {
    setBusy(true);
    onError(null);
    const result = await action();
    setBusy(false);
    if ("error" in result && result.error) onError(result.error.message);
  }

  return (
    <li className={cardClass}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="font-display text-xl font-bold">{session.title}</h3>
        <span className="rounded-full bg-surface-muted px-3 py-1 text-xs font-bold">
          {session.myRole === "host" ? "Host" : session.myStatus}
        </span>
      </div>
      <p className="mt-2 text-sm">
        {session.course.code} · {session.course.title}
      </p>
      <p className="mt-1 text-sm text-muted">{formatCampusTimestamp(session.startsAt)}</p>
      <p className="mt-1 text-sm">{session.location.name}</p>
      <p className="mt-2 text-sm font-bold">
        {session.seatsTaken} accepted · {session.seatsReserved} of {session.seatLimit} reserved
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {session.myStatus === "invited" ? (
          <>
            <Button disabled={busy} onClick={() => void run(() => patchInvitation(session.id, { status: "accepted" }))}>
              Accept
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => void run(() => patchInvitation(session.id, { status: "declined" }))}>
              Decline
            </Button>
          </>
        ) : null}
        {session.myStatus === "accepted" && session.myRole !== "host" ? (
          <Button variant="secondary" disabled={busy} onClick={() => void run(() => postLeave(session.id))}>
            Leave
          </Button>
        ) : null}
        {session.myRole === "host" ? (
          <Button variant="danger" disabled={busy} onClick={() => void run(() => postCancelSession(session.id))}>
            Cancel
          </Button>
        ) : null}
        {session.myStatus === "accepted" || session.myRole === "host" ? (
          <Button variant="secondary" onClick={onStudy}>
            Start check-in
          </Button>
        ) : null}
      </div>
      {requests.length > 0 ? (
        <ul className="mt-3 grid gap-2">
          {requests.map((person) => (
            <li key={person.user.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>{person.user.displayName} requested a seat</span>
              <span className="flex gap-2">
                <Button disabled={busy} onClick={() => void run(() => patchSessionParticipant(session.id, person.user.id, { status: "accepted" }))}>
                  Accept
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void run(() => patchSessionParticipant(session.id, person.user.id, { status: "declined" }))}
                >
                  Decline
                </Button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}
