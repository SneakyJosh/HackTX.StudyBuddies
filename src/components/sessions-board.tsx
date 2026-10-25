"use client";

import { useEffect, useState } from "react";
import { getCheckin, getCourses, getLocations, isApiError } from "@/lib/api-client";
import { AVAILABILITY_LABELS, STUDY_STYLE_LABELS, formatTimestamp } from "@/lib/labels";
import type { Checkin, Course, Location } from "@/types/api";
import { useDemo } from "@/components/demo-provider";
import { FocusSheet } from "@/components/focus-sheet";
import { Button, EmptyBlock, ErrorBlock, LoadingBlock, cardClass } from "@/components/ui";

export function SessionsBoard() {
  const demo = useDemo();
  const [phase, setPhase] = useState<"loading" | "error" | "ready">("loading");
  const [message, setMessage] = useState("Could not load sessions.");
  const [reloadKey, setReloadKey] = useState(0);
  const [checkin, setCheckin] = useState<Checkin | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [focusOpen, setFocusOpen] = useState(false);

  useEffect(() => {
    if (!demo.ready || !demo.userId) return;
    let cancelled = false;
    void (async () => {
      setPhase("loading");
      const [checkinResult, courseResult, locationResult] = await Promise.all([
        getCheckin(),
        getCourses(),
        getLocations(),
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

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[1.75rem] font-extrabold">Sessions</h1>
          <p className="mt-2 max-w-2xl text-[15px] leading-6 text-muted">
            The active check-in is the only session StudySync stores today.
          </p>
        </div>
        <Button onClick={() => setFocusOpen(true)}>{checkin ? "Open timer" : "New session"}</Button>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-2">
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
            {checkin.availability === "focused" ? (
              <p className="mt-3 text-sm leading-6 text-warning">Focus mode hides you from discovery.</p>
            ) : (
              <p className="mt-3 text-sm leading-6 text-muted">This check-in can appear to other students.</p>
            )}
          </article>
        ) : (
          <EmptyBlock title="No active check-in" body="Start one when you are at a public campus building." />
        )}
        <EmptyBlock
          title="No scheduled sessions"
          body="Booking a future session is not available yet. A check-in is how you study now."
        />
      </div>

      <section className="grid gap-3">
        <h2 className="font-display text-xl font-bold">History</h2>
        <EmptyBlock
          title="No saved history"
          body="Completed sessions, ratings, and weekly totals will show here after history is added. There is nothing to chart yet."
        />
      </section>
      <FocusSheet open={focusOpen} onClose={() => setFocusOpen(false)} />
    </div>
  );
}
