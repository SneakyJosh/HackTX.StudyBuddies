"use client";

import { useEffect, useState } from "react";
import { getCourses, getDiscovery, getGrokCompatibility, getLocations, isApiError, postRequest } from "@/lib/api-client";
import { strongestReason } from "@/lib/match-reason";
import { AVAILABILITY_LABELS, STUDY_STYLE_LABELS, formatPersonMeta, formatTimestamp, initials } from "@/lib/labels";
import type { Course, DiscoveryMatch, GrokCompatibility, Location } from "@/types/api";
import { useDemo } from "@/components/demo-provider";
import { ProfileCard } from "@/components/profile-card";
import {
  Button,
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
  PageHeader,
  Sheet,
  fieldClass,
  inputClass,
} from "@/components/ui";

export function DiscoveryFeed({ embedded = false }: { embedded?: boolean }) {
  const demo = useDemo();
  const [locations, setLocations] = useState<Location[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [locationId, setLocationId] = useState("");
  const [courseId, setCourseId] = useState("");
  const [matches, setMatches] = useState<DiscoveryMatch[] | null>(null);
  const [grok, setGrok] = useState<Record<string, GrokCompatibility>>({});
  const [count, setCount] = useState(0);
  const [phase, setPhase] = useState<"loading" | "error" | "ready">("loading");
  const [message, setMessage] = useState("Could not load discovery.");
  const [reloadKey, setReloadKey] = useState(0);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<{ userId: string; message: string } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!demo.ready || !demo.userId) return;
    let cancelled = false;
    void (async () => {
      const [locationResult, courseResult] = await Promise.all([getLocations(), getCourses()]);
      if (cancelled) return;
      if (!isApiError(locationResult)) setLocations(locationResult.data);
      if (!isApiError(courseResult)) setCourses(courseResult.data);
    })();
    return () => {
      cancelled = true;
    };
  }, [demo.ready, demo.userId]);

  useEffect(() => {
    if (!demo.ready || !demo.userId) return;
    let cancelled = false;
    void (async () => {
      setPhase("loading");
      const filters: { locationId?: string; courseId?: string } = {};
      if (locationId) filters.locationId = locationId;
      if (courseId) filters.courseId = courseId;
      const result = await getDiscovery(filters);
      if (cancelled) return;
      if (isApiError(result)) {
        setMessage(result.error.message);
        setMatches(null);
        setPhase("error");
        return;
      }
      setMatches(result.data);
      setCount(result.meta.count);
      setGrok({});
      setPhase("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [demo.ready, demo.userId, demo.revision, locationId, courseId, reloadKey]);

  useEffect(() => {
    if (!demo.ready || !demo.userId || phase !== "ready" || !matches || matches.length === 0) return;
    let cancelled = false;
    const filters: { locationId?: string; courseId?: string } = {};
    if (locationId) filters.locationId = locationId;
    if (courseId) filters.courseId = courseId;
    const eligibleIds = new Set(matches.slice(0, 5).map((match) => match.user.id));
    void (async () => {
      const result = await getGrokCompatibility(filters);
      if (cancelled || isApiError(result)) return;
      const next: Record<string, GrokCompatibility> = {};
      for (const row of result.data) {
        if (row.source === "grok" && eligibleIds.has(row.userId)) next[row.userId] = row;
      }
      setGrok(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [demo.ready, demo.userId, phase, matches, locationId, courseId]);

  async function sendRequest(recipientId: string) {
    setSendingId(recipientId);
    setRequestError(null);
    const result = await postRequest({ recipientId });
    setSendingId(null);
    if (isApiError(result)) {
      setRequestError({ userId: recipientId, message: result.error.message });
    }
  }

  const filtered = locationId !== "" || courseId !== "";
  const selected = matches?.find((match) => match.user.id === selectedId) ?? null;

  return (
    <div className="grid w-full gap-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
      {embedded ? (
        <div>
          <h2 className="font-display text-xl font-bold">Suggested study buddies</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">
            Ranked by the current server score. Grok can replace the first five percentages after the list loads.
          </p>
        </div>
      ) : (
      <PageHeader
        title="Discover"
        description="Active students on your campus who opted in. The percentage is the compatibility score. Same-building order does not change that number. A score of 0 has no explanation chips."
      />
      )}
      <div className="grid w-full gap-3 sm:grid-cols-2 xl:w-[28rem] xl:shrink-0">
        <label className={fieldClass} htmlFor="discovery-building">
          Building
          <select
            id="discovery-building"
            className={inputClass}
            value={locationId}
            onChange={(event) => setLocationId(event.target.value)}
          >
            <option value="">All buildings</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        </label>
        <label className={fieldClass} htmlFor="discovery-course">
          Course
          <select
            id="discovery-course"
            className={inputClass}
            value={courseId}
            onChange={(event) => setCourseId(event.target.value)}
          >
            <option value="">All courses</option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.code} · {course.title}
              </option>
            ))}
          </select>
        </label>
      </div>
      </div>
      {phase === "loading" ? <LoadingBlock label="Loading students" /> : null}
      {phase === "error" ? (
        <ErrorBlock
          title="Discovery is unavailable"
          message={message}
          onRetry={() => setReloadKey((value) => value + 1)}
        />
      ) : null}
      {phase === "ready" && matches && matches.length === 0 ? (
        <EmptyBlock
          title={filtered ? "No students match these filters" : "No students are discoverable"}
          body={
            filtered
              ? "Try another building or course. Focused, hidden, and checked-out students stay out of the feed."
              : "When another demo student opts in and checks in, they show up here."
          }
        />
      ) : null}
      {phase === "ready" && matches && matches.length > 0 ? (
        <>
          <p className="text-sm text-muted">
            {count} {count === 1 ? "student" : "students"}
          </p>
          <div className="grid w-full gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {matches.map((match) => {
              const ai = grok[match.user.id];
              return (
              <ProfileCard
                key={match.user.id}
                match={match}
                sending={sendingId === match.user.id}
                error={requestError?.userId === match.user.id ? requestError.message : null}
                onRequest={(recipientId) => void sendRequest(recipientId)}
                onOpen={() => setSelectedId(match.user.id)}
                grok={ai?.source === "grok" ? { score: ai.score, reasons: ai.reasons } : null}
              />
              );
            })}
          </div>
        </>
      ) : null}
      <Sheet open={selected !== null} title="Student" onClose={() => setSelectedId(null)}>
        {selected ? (
          <StudentSheet
            match={selected}
            grok={grok[selected.user.id]?.source === "grok" ? grok[selected.user.id] : null}
            sending={sendingId === selected.user.id}
            error={requestError?.userId === selected.user.id ? requestError.message : null}
            onRequest={() => void sendRequest(selected.user.id)}
          />
        ) : null}
      </Sheet>
      {filtered && phase === "ready" ? (
        <Button
          variant="ghost"
          className="justify-self-start"
          onClick={() => {
            setLocationId("");
            setCourseId("");
          }}
        >
          Clear filters
        </Button>
      ) : null}
    </div>
  );
}

function StudentSheet({
  match,
  sending,
  error,
  onRequest,
  grok = null,
}: {
  match: DiscoveryMatch;
  sending: boolean;
  error: string | null;
  onRequest: () => void;
  grok?: { score: number; reasons: string[] } | null;
}) {
  const { user, course, location, availability, compatibilityScore, reasons, requestStatus, checkinExpiresAt } = match;
  const score = grok?.score ?? compatibilityScore;
  const leadReason = grok?.reasons[0] ?? strongestReason(reasons);
  const secondReason = grok?.reasons[1] ?? null;
  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-3">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-accent-fill text-lg font-extrabold text-accent-ink">
          {initials(user.displayName)}
        </span>
        <div>
          <p className="font-display text-2xl font-extrabold">{user.displayName}</p>
          <p className="text-sm text-muted">{formatPersonMeta(user.major, user.academicYear)}</p>
        </div>
      </div>
      <p className="font-display text-4xl font-extrabold text-accent" aria-label={`${score} percent compatibility`}>
        {score}%
      </p>
      {grok ? <p className="text-xs font-bold tracking-wide text-muted uppercase">Grok AI</p> : null}
      <p className="text-sm leading-6">
        {course.code} · {course.title}
      </p>
      <p className="text-sm leading-6">
        {location.name} ({location.buildingCode})
      </p>
      <p className="text-sm leading-6 text-muted">
        {AVAILABILITY_LABELS[availability]} · {STUDY_STYLE_LABELS[user.studyStyle]} · until {formatTimestamp(checkinExpiresAt)}
      </p>
      {leadReason ? (
        <p className="text-sm font-bold text-accent">{leadReason}</p>
      ) : (
        <p className="text-sm text-muted">A score of 0 has no explanation.</p>
      )}
      {secondReason ? <p className="text-sm text-muted">{secondReason}</p> : null}
      {requestStatus === "pending" ? (
        <p className="text-sm font-semibold">A study request is already pending.</p>
      ) : requestStatus === "accepted" ? (
        <p className="text-sm font-semibold text-accent">Connected</p>
      ) : (
        <Button disabled={sending} onClick={onRequest}>
          {sending ? "Sending…" : "Request to study"}
        </Button>
      )}
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
