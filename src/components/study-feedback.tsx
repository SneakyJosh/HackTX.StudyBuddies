"use client";

import { useState } from "react";
import { isApiError, postCheckinRating } from "@/lib/api-client";
import type { CheckinStudyRecord } from "@/types/api";
import { Button } from "@/components/ui";

export function StarPicker({
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
      <legend className="text-sm font-bold leading-6">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {[1, 2, 3, 4, 5].map((stars) => {
          const selected = value !== null && stars <= value;
          return (
            <button
              key={stars}
              type="button"
              disabled={locked}
              aria-pressed={value === stars}
              aria-label={`${stars} ${stars === 1 ? "star" : "stars"}`}
              className={`grid h-11 w-11 place-items-center rounded-full text-lg ${
                selected ? "bg-[#C45C26] text-white" : "bg-surface-muted text-muted"
              } disabled:opacity-70`}
              onClick={() => onChange(stars)}
            >
              ★
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function SavedRatingLine({
  studyTime,
  environment,
  chemistry = [],
}: {
  studyTime: number | null;
  environment: number | null;
  chemistry?: { label: string; stars: number }[];
}) {
  const parts: { key: string; text: string; label: string }[] = [];
  if (studyTime !== null) {
    parts.push({ key: "focus", text: `Focus ${"★".repeat(studyTime)}`, label: `Focus ${studyTime} out of 5` });
  }
  if (environment !== null) {
    parts.push({ key: "place", text: `Place ${"★".repeat(environment)}`, label: `Place ${environment} out of 5` });
  }
  chemistry.forEach((item, index) => {
    const prefix = chemistry.length === 1 ? "Chemistry" : `Chemistry · ${item.label}`;
    parts.push({
      key: `chemistry-${index}`,
      text: `${prefix} ${"★".repeat(item.stars)}`,
      label: `${prefix} ${item.stars} out of 5`,
    });
  });
  if (parts.length === 0) return null;
  return (
    <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm font-bold">
      {parts.map((part) => (
        <span key={part.key} aria-label={part.label}>
          {part.text}
        </span>
      ))}
    </p>
  );
}

export function CheckinFeedback({
  record,
  onSkip,
  onSaved,
}: {
  record: CheckinStudyRecord;
  onSkip: () => void;
  onSaved?: (record: CheckinStudyRecord) => void;
}) {
  const [studyTime, setStudyTime] = useState<number | null>(null);
  const [environment, setEnvironment] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [savedNote, setSavedNote] = useState(false);

  async function submit() {
    const body: { studyTime?: number; environment?: number } = {};
    if (record.myRatings.studyTime === null && studyTime !== null) body.studyTime = studyTime;
    if (record.myRatings.environment === null && environment !== null) body.environment = environment;
    if (body.studyTime === undefined && body.environment === undefined) {
      setMessage("Choose a rating, or skip. Skipping saves nothing.");
      return;
    }
    setBusy(true);
    const result = await postCheckinRating(record.checkinId, body);
    setBusy(false);
    if (isApiError(result)) {
      setMessage(result.error.message);
      return;
    }
    setSavedNote(true);
    setMessage(null);
    onSaved?.(result.data);
  }

  return (
    <div className="grid gap-4 text-left">
      <p className="text-sm leading-6 text-muted">
        Answer either question, or both. Skip saves nothing and leaves your study time, streak, and completion unchanged. This stays on your account and does not change matching or your saved preferences.
      </p>
      <StarPicker
        label="How productive was your study session?"
        value={record.myRatings.studyTime ?? studyTime}
        locked={record.myRatings.studyTime !== null}
        onChange={setStudyTime}
      />
      <StarPicker
        label="How much did you enjoy this study space?"
        value={record.myRatings.environment ?? environment}
        locked={record.myRatings.environment !== null}
        onChange={setEnvironment}
      />
      {savedNote ? <p className="text-sm leading-6">Feedback saved. Your study minutes are unchanged.</p> : null}
      {message ? (
        <p role="alert" className="text-sm text-danger">
          {message}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} onClick={() => void submit()}>
          {busy ? "Saving…" : "Save feedback"}
        </Button>
        <Button variant="secondary" disabled={busy} onClick={onSkip}>
          {savedNote ? "Close" : "Skip"}
        </Button>
      </div>
    </div>
  );
}
