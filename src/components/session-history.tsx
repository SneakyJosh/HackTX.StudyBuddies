"use client";

import { useEffect, useState } from "react";
import { getCheckinHistory, getStudyRecords, isApiError, postStudyRating } from "@/lib/api-client";
import { formatCampusTimestamp } from "@/lib/campus-time";
import { STUDY_STYLE_LABELS } from "@/lib/labels";
import { STREAK_DAY_MINIMUM_MINUTES, STUDY_TIME_MINIMUM_MINUTES } from "@/lib/study-time";
import type { CheckinStudyRecord, PostStudyRatingBody, StudyRecord } from "@/types/api";
import { useDemo } from "@/components/demo-provider";
import { StudyStatsCard } from "@/components/study-stats-card";
import { Button, EmptyBlock, Sheet, cardClass } from "@/components/ui";

export function SessionHistory() {
  const demo = useDemo();
  const [history, setHistory] = useState<StudyRecord[]>([]);
  const [checkins, setCheckins] = useState<CheckinStudyRecord[]>([]);
  const [missed, setMissed] = useState<StudyRecord[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [checkinMessage, setCheckinMessage] = useState<string | null>(null);
  const [rating, setRating] = useState<StudyRecord | null>(null);

  useEffect(() => {
    if (!demo.ready || !demo.userId) return;
    let cancelled = false;
    void (async () => {
      const [historyResult, missedResult, checkinResult] = await Promise.all([
        getStudyRecords("history"),
        getStudyRecords("missed"),
        getCheckinHistory(),
      ]);
      if (cancelled) return;
      if (isApiError(historyResult) || isApiError(missedResult)) {
        setHistory([]);
        setMissed([]);
        setCheckins([]);
        setMessage("History is not available yet. Upcoming bookings and check-ins still work.");
        setCheckinMessage(null);
        return;
      }
      setHistory(historyResult.data);
      setMissed(missedResult.data);
      setMessage(null);
      if (isApiError(checkinResult)) {
        setCheckins([]);
        setCheckinMessage("Personal study sessions are not available yet. Booking history is unchanged.");
        return;
      }
      setCheckins(checkinResult.data);
      setCheckinMessage(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [demo.ready, demo.userId, demo.revision]);

  return (
    <section className="grid gap-4">
      <div>
        <h2 className="font-display text-xl font-bold">History</h2>
        <p className="mt-1 text-sm leading-6 text-muted">
          Completed bookings and personal study sessions you recorded. Hours are self-reported, not independently verified, and they are not used for matching.
        </p>
      </div>
      <StudyStatsCard variant="full" />
      {message ? <p className="text-sm leading-6 text-muted">{message}</p> : null}
      {checkinMessage ? <p className="text-sm leading-6 text-muted">{checkinMessage}</p> : null}
      {history.length === 0 && checkins.length === 0 && !message ? (
        <EmptyBlock title="No completed sessions" body="Finish a booking or a personal study timer to record self-reported time. Unconfirmed bookings stay out of this list." />
      ) : (
        <ul className="grid gap-4 xl:grid-cols-2">
          {completedCards(history, checkins).map((card) =>
            card.kind === "booking" ? (
            <li key={`booking-${card.record.id}`} className={cardClass}>
              <RecordSummary record={card.record} />
              <p className="mt-2 text-sm font-bold">{card.record.creditedMinutes} min · Self-reported</p>
              <p className="mt-1 text-sm text-muted">{studyTimeNote(card.record.creditedMinutes)}</p>
              {card.record.sessionStatus === "cancelled" ? (
                <p className="mt-1 text-sm text-muted">You recorded this before the booking was cancelled.</p>
              ) : null}
              <People record={card.record} />
              <Ratings record={card.record} />
              <Button className="mt-3" variant="secondary" onClick={() => setRating(card.record)}>
                Rate
              </Button>
            </li>
            ) : (
            <li key={`checkin-${card.record.id}`} className={cardClass}>
              <h3 className="font-display text-xl font-bold">Personal study</h3>
              <p className="mt-1 text-sm">
                {card.record.course.code} · {card.record.course.title}
              </p>
              <p className="mt-1 text-sm text-muted">
                {formatCampusTimestamp(card.record.startedAt)} – {formatCampusTimestamp(card.record.finishedAt)}
              </p>
              <p className="mt-1 text-sm">{card.record.location.name}</p>
              <p className="mt-1 text-sm text-muted">{STUDY_STYLE_LABELS[card.record.studyStyle]}</p>
              <p className="mt-2 text-sm font-bold">{card.record.creditedMinutes} min · Self-reported</p>
              <p className="mt-1 text-sm text-muted">{studyTimeNote(card.record.creditedMinutes)}</p>
            </li>
            ),
          )}
        </ul>
      )}
      <div>
        <h2 className="font-display text-xl font-bold">Missed</h2>
        <p className="mt-1 text-sm leading-6 text-muted">
          Sessions you explicitly marked missed. They add no hours and no streak.
        </p>
      </div>
      {missed.length === 0 && !message ? (
        <EmptyBlock title="No missed sessions" body="An unfinished booking stays unconfirmed until you mark it missed." />
      ) : (
        <ul className="grid gap-4 xl:grid-cols-2">
          {missed.map((record) => (
            <li key={record.id} className={cardClass}>
              <RecordSummary record={record} />
              <p className="mt-2 text-sm font-bold">Missed · 0 min</p>
            </li>
          ))}
        </ul>
      )}
      <RatingSheet record={rating} onClose={() => setRating(null)} onSaved={setRating} />
    </section>
  );
}

function completedCards(bookings: StudyRecord[], personal: CheckinStudyRecord[]) {
  return [
    ...bookings.map((record) => ({ kind: "booking" as const, at: record.startsAt, record })),
    ...personal.map((record) => ({ kind: "checkin" as const, at: record.startedAt, record })),
  ].sort((left, right) => right.at.localeCompare(left.at) || left.record.id.localeCompare(right.record.id));
}

function studyTimeNote(minutes: number): string {
  if (minutes < STUDY_TIME_MINIMUM_MINUTES) {
    return "No credited minutes, so this does not add study time.";
  }
  if (minutes < STREAK_DAY_MINIMUM_MINUTES) {
    return `Counts toward self-reported study time. A streak day needs ${STREAK_DAY_MINIMUM_MINUTES} combined minutes.`;
  }
  return "Counts toward self-reported study time and that day's streak total.";
}

function RecordSummary({ record }: { record: StudyRecord }) {
  return (
    <>
      <h3 className="font-display text-xl font-bold">{record.title}</h3>
      <p className="mt-1 text-sm">
        {record.course.code} · {record.course.title}
      </p>
      <p className="mt-1 text-sm text-muted">{formatCampusTimestamp(record.startsAt)}</p>
      <p className="mt-1 text-sm">{record.location.name}</p>
    </>
  );
}

function People({ record }: { record: StudyRecord }) {
  if (record.participants.length === 0) return <p className="mt-2 text-sm text-muted">Solo</p>;
  return (
    <p className="mt-2 text-sm">
      With {record.participants.map((person) => person.displayName).join(", ")}
    </p>
  );
}

function Ratings({ record }: { record: StudyRecord }) {
  const { studyTime, environment, chemistry } = record.myRatings;
  if (studyTime === null && environment === null && chemistry.length === 0) return null;
  return (
    <p className="mt-2 text-sm text-muted">
      Private ratings
      {studyTime !== null ? ` · Study time ${studyTime}/5` : ""}
      {environment !== null ? ` · Place ${environment}/5` : ""}
      {chemistry.map((item) => {
        const name = record.participants.find((person) => person.id === item.userId)?.displayName ?? "Student";
        return ` · ${name} ${item.stars}/5`;
      })}
    </p>
  );
}

export function RatingSheet({
  record,
  onClose,
  onSaved,
}: {
  record: StudyRecord | null;
  onClose: () => void;
  onSaved?: (record: StudyRecord) => void;
}) {
  return (
    <Sheet open={record !== null} title="Private ratings" onClose={onClose}>
      {record ? <RatingForm key={record.id} record={record} onClose={onClose} onSaved={onSaved} /> : null}
    </Sheet>
  );
}

function RatingForm({
  record,
  onClose,
  onSaved,
}: {
  record: StudyRecord;
  onClose: () => void;
  onSaved?: (record: StudyRecord) => void;
}) {
  const [studyTime, setStudyTime] = useState<number | null>(null);
  const [environment, setEnvironment] = useState<number | null>(null);
  const [chemistry, setChemistry] = useState<Record<string, number>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const body: PostStudyRatingBody = {};
    if (record.myRatings.studyTime === null && studyTime !== null) body.studyTime = studyTime;
    if (record.myRatings.environment === null && environment !== null) body.environment = environment;
    const fresh = record.participants
      .filter((person) => record.myRatings.chemistry.every((item) => item.userId !== person.id))
      .flatMap((person) => {
        const stars = chemistry[person.id];
        return stars === undefined ? [] : [{ userId: person.id, stars }];
      });
    if (fresh.length > 0) body.chemistry = fresh;
    if (body.studyTime === undefined && body.environment === undefined && body.chemistry === undefined) {
      setMessage("Choose a rating, or skip. Skipping saves nothing.");
      return;
    }
    setBusy(true);
    const result = await postStudyRating(record.id, body);
    setBusy(false);
    if (isApiError(result)) {
      setMessage(result.error.message);
      return;
    }
    onSaved?.(result.data);
    onClose();
  }

  return (
        <div className="grid gap-4">
          <p className="text-sm leading-6 text-muted">
            These stay on your account. They do not change compatibility or appear on anyone else&apos;s screen. Skip saves nothing.
          </p>
          <StarRow
            label="Study time"
            value={record.myRatings.studyTime ?? studyTime}
            locked={record.myRatings.studyTime !== null}
            onChange={setStudyTime}
          />
          <StarRow
            label="Environment"
            value={record.myRatings.environment ?? environment}
            locked={record.myRatings.environment !== null}
            onChange={setEnvironment}
          />
          {record.participants.map((person) => {
            const existing = record.myRatings.chemistry.find((item) => item.userId === person.id)?.stars ?? null;
            return (
              <StarRow
                key={person.id}
                label={`Chemistry with ${person.displayName}`}
                value={existing ?? chemistry[person.id] ?? null}
                locked={existing !== null}
                onChange={(stars) => setChemistry((current) => ({ ...current, [person.id]: stars }))}
              />
            );
          })}
          {message ? (
            <p role="alert" className="text-sm text-danger">
              {message}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => void submit()}>
              Save ratings
            </Button>
            <Button variant="secondary" disabled={busy} onClick={onClose}>
              Skip
            </Button>
          </div>
        </div>
  );
}

function StarRow({
  label,
  value,
  locked,
  onChange,
}: {
  label: string;
  value: number | null;
  locked: boolean;
  onChange: (stars: number) => void;
}) {
  return (
    <fieldset className="grid gap-2">
      <legend className="text-sm font-bold">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {[1, 2, 3, 4, 5].map((stars) => (
          <Button
            key={stars}
            variant={value === stars ? "primary" : "secondary"}
            disabled={locked}
            aria-pressed={value === stars}
            onClick={() => onChange(stars)}
          >
            {stars}
          </Button>
        ))}
      </div>
    </fieldset>
  );
}
