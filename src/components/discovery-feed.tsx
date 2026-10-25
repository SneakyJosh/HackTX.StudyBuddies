"use client";

import { useEffect, useState } from "react";
import { getCourses, getDiscovery, getLocations, isApiError, postRequest } from "@/lib/api-client";
import type { Course, DiscoveryMatch, Location } from "@/types/api";
import { useDemo } from "@/components/demo-provider";
import { ProfileCard } from "@/components/profile-card";
import {
  Button,
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
  PageHeader,
  fieldClass,
  inputClass,
} from "@/components/ui";

export function DiscoveryFeed() {
  const demo = useDemo();
  const [locations, setLocations] = useState<Location[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [locationId, setLocationId] = useState("");
  const [courseId, setCourseId] = useState("");
  const [matches, setMatches] = useState<DiscoveryMatch[] | null>(null);
  const [count, setCount] = useState(0);
  const [phase, setPhase] = useState<"loading" | "error" | "ready">("loading");
  const [message, setMessage] = useState("Could not load discovery.");
  const [reloadKey, setReloadKey] = useState(0);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<{ userId: string; message: string } | null>(null);

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
      setPhase("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [demo.ready, demo.userId, demo.revision, locationId, courseId, reloadKey]);

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

  return (
    <div className="grid w-full gap-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
      <PageHeader
        title="Discover"
        description="Active students on your campus who opted in. The percentage is the compatibility score. Same-building order does not change that number. A score of 0 has no explanation chips."
      />
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
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {matches.map((match) => (
              <ProfileCard
                key={match.user.id}
                match={match}
                sending={sendingId === match.user.id}
                error={requestError?.userId === match.user.id ? requestError.message : null}
                onRequest={(recipientId) => void sendRequest(recipientId)}
              />
            ))}
          </div>
        </>
      ) : null}
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
