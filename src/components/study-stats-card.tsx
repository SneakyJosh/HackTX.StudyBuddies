"use client";

import { useEffect, useState } from "react";
import { getStudyStats, isApiError } from "@/lib/api-client";
import type { StudyStats } from "@/types/api";
import { useDemo } from "@/components/demo-provider";
import { cardClass } from "@/components/ui";

function weekday(date: string): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "America/Chicago" }).format(
    new Date(`${date}T18:00:00Z`),
  );
}

export function StudyStatsCard({ variant = "compact" }: { variant?: "compact" | "full" }) {
  const demo = useDemo();
  const [stats, setStats] = useState<StudyStats | null>(null);
  const [phase, setPhase] = useState<"loading" | "error" | "ready">("loading");

  useEffect(() => {
    if (!demo.ready || !demo.userId) return;
    let cancelled = false;
    void (async () => {
      setPhase("loading");
      const result = await getStudyStats();
      if (cancelled) return;
      if (isApiError(result)) {
        setStats(null);
        setPhase("error");
        return;
      }
      setStats(result.data);
      setPhase("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [demo.ready, demo.userId, demo.revision]);

  if (!demo.ready || phase === "loading") {
    return <p className="text-sm text-muted">Loading self-reported study time.</p>;
  }
  if (phase === "error" || !stats) {
    return (
      <p className="text-sm leading-6 text-muted">
        Self-reported stats are not available yet. Nothing here is estimated.
      </p>
    );
  }

  const peak = Math.max(...stats.week.map((day) => day.minutes), 1);
  return (
    <div className={variant === "full" ? cardClass : ""}>
      <p className="text-sm leading-6 text-muted">{stats.description}</p>
      <dl className="mt-3 grid grid-cols-3 gap-3">
        <div>
          <dt className="text-xs font-bold text-muted">Streak</dt>
          <dd className="font-display text-2xl font-extrabold">{stats.streakDays} days</dd>
        </div>
        <div>
          <dt className="text-xs font-bold text-muted">This week</dt>
          <dd className="font-display text-2xl font-extrabold">{stats.weekMinutes} min</dd>
        </div>
        <div>
          <dt className="text-xs font-bold text-muted">Total</dt>
          <dd className="font-display text-2xl font-extrabold">{stats.qualifyingMinutes} min</dd>
        </div>
      </dl>
      {variant === "full" ? (
        <>
          <ol className="mt-4 grid grid-cols-7 gap-1">
            {stats.week.map((day) => (
              <li key={day.date} className="grid justify-items-center gap-1 text-center">
                <span className="flex h-16 w-full items-end">
                  <span
                    className="block w-full rounded-md bg-accent-fill"
                    style={{ height: `${Math.max(4, Math.round((day.minutes / peak) * 64))}px` }}
                  />
                </span>
                <span className="text-[10px] font-bold text-muted">{weekday(day.date)}</span>
                <span className="text-[10px] text-muted">{day.minutes}m</span>
              </li>
            ))}
          </ol>
          {stats.courseStreaks.length > 0 ? (
            <ul className="mt-4 grid gap-2">
              {stats.courseStreaks.map((course) => (
                <li key={course.courseId} className="flex items-center justify-between gap-3 text-sm">
                  <span>
                    {course.code} · {course.title}
                  </span>
                  <span className="font-bold">{course.streakDays} day streak</span>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
