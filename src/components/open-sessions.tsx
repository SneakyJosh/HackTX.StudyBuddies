"use client";

import { useEffect, useState } from "react";
import { getCourses, getOpenSessions, isApiError, postJoin } from "@/lib/api-client";
import { formatCampusTimestamp } from "@/lib/campus-time";
import { formatPersonMeta } from "@/lib/labels";
import type { Course, OpenSession } from "@/types/api";
import { useDemo } from "@/components/demo-provider";
import { Button, EmptyBlock, ErrorBlock, LoadingBlock, cardClass } from "@/components/ui";

export function OpenSessions() {
  const demo = useDemo();
  const [phase, setPhase] = useState<"loading" | "error" | "ready">("loading");
  const [message, setMessage] = useState("Could not load open sessions.");
  const [reloadKey, setReloadKey] = useState(0);
  const [sessions, setSessions] = useState<OpenSession[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState("");
  const [today, setToday] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!demo.ready || !demo.userId) return;
    let cancelled = false;
    void getCourses().then((result) => {
      if (!cancelled && !isApiError(result)) setCourses(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, [demo.ready, demo.userId]);

  useEffect(() => {
    if (!demo.ready || !demo.userId) return;
    let cancelled = false;
    void (async () => {
      setPhase("loading");
      const result = await getOpenSessions({
        courseId: courseId || undefined,
        today,
      });
      if (cancelled) return;
      if (isApiError(result)) {
        setMessage(result.error.message);
        setPhase("error");
        return;
      }
      setSessions(result.data);
      setPhase("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [demo.ready, demo.userId, demo.revision, courseId, today, reloadKey]);

  async function join(sessionId: string) {
    setPendingId(sessionId);
    setActionError(null);
    const result = await postJoin(sessionId);
    setPendingId(null);
    if (isApiError(result)) setActionError(result.error.message);
  }

  return (
    <section className="grid gap-4">
      <div>
        <h2 className="font-display text-xl font-bold">Open sessions</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">
          Upcoming bookings other students opened on your campus. Requesting a seat does not reserve it until the host accepts.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <label className="grid gap-1 text-sm font-bold">
          Course
          <select className="min-h-11 rounded-[14px] border border-line bg-surface px-3" value={courseId} onChange={(event) => setCourseId(event.target.value)}>
            <option value="">All courses</option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.code}
              </option>
            ))}
          </select>
        </label>
        <Button variant={today ? "primary" : "secondary"} aria-pressed={today} onClick={() => setToday((value) => !value)}>
          Today
        </Button>
      </div>
      {phase === "loading" ? <LoadingBlock label="Loading open sessions" /> : null}
      {phase === "error" ? (
        <ErrorBlock title="Open sessions are unavailable" message={message} onRetry={() => setReloadKey((value) => value + 1)} />
      ) : null}
      {phase === "ready" && sessions.length === 0 ? (
        <EmptyBlock title="No open sessions" body="When someone on your campus creates an open booking, it shows up here." />
      ) : null}
      {phase === "ready" && sessions.length > 0 ? (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {sessions.map((session) => {
            const full = session.seatsReserved >= session.seatLimit;
            return (
              <li key={session.id} className={cardClass}>
                <h3 className="font-display text-xl font-bold">{session.title}</h3>
                <p className="mt-1 text-sm">
                  {session.course.code} · {session.course.title}
                </p>
                <p className="mt-1 text-sm text-muted">{formatCampusTimestamp(session.startsAt)}</p>
                <p className="mt-1 text-sm">{session.location.name}</p>
                <p className="mt-2 text-sm">
                  {session.host.displayName}
                  <span className="text-muted"> · {formatPersonMeta(session.host.major, session.host.academicYear)}</span>
                </p>
                <p className="mt-2 text-sm font-bold">
                  {session.seatsReserved} of {session.seatLimit} seats reserved
                </p>
                {session.myStatus === "requested" ? (
                  <p className="mt-3 text-sm font-semibold">Requested. Waiting for the host.</p>
                ) : session.myStatus === "accepted" ? (
                  <p className="mt-3 text-sm font-semibold text-accent">You have a seat.</p>
                ) : (
                  <Button className="mt-3" disabled={full || pendingId === session.id} onClick={() => void join(session.id)}>
                    {full ? "Full" : pendingId === session.id ? "Requesting…" : "Request to join"}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
      {actionError ? (
        <p role="alert" className="text-sm text-danger">
          {actionError}
        </p>
      ) : null}
    </section>
  );
}
