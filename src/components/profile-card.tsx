"use client";

import type { DiscoveryMatch } from "@/types/api";
import { AVAILABILITY_LABELS, STUDY_STYLE_LABELS, formatPersonMeta } from "@/lib/labels";
import { Button, LinkButton } from "@/components/ui";

export function ProfileCard({
  match,
  sending,
  error,
  onRequest,
}: {
  match: DiscoveryMatch;
  sending: boolean;
  error: string | null;
  onRequest: (recipientId: string) => void;
}) {
  const { user, course, location, availability, compatibilityScore, reasons, requestStatus } = match;
  return (
    <article className="flex h-full flex-col rounded-2xl border border-line bg-surface p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold leading-tight">{user.displayName}</h2>
          <p className="mt-1 text-sm text-muted">{formatPersonMeta(user.major, user.academicYear)}</p>
        </div>
        <p className="text-right" aria-label={`${compatibilityScore} percent compatibility`}>
          <span className="block text-2xl font-semibold tabular-nums leading-none">{compatibilityScore}%</span>
          <span className="mt-1 block text-xs font-medium uppercase tracking-wide text-muted">Compatibility</span>
        </p>
      </div>
      <p className="mt-4 inline-flex max-w-full flex-wrap items-baseline gap-x-2 gap-y-1 rounded-full bg-accent-soft px-3 py-1 text-sm font-semibold text-accent">
        <span>{course.code}</span>
        <span className="font-medium">{course.title}</span>
      </p>
      <p className="mt-3 text-sm leading-6 break-words">{location.name}</p>
      <p className="text-sm text-muted">{location.buildingCode}</p>
      <p className="mt-2 text-sm">
        {AVAILABILITY_LABELS[availability]} · {STUDY_STYLE_LABELS[user.studyStyle]} check-in
      </p>
      {reasons.length > 0 ? (
        <ul aria-label="Match reasons" className="mt-4 flex flex-wrap gap-2">
          {reasons.map((reason) => (
            <li key={reason} className="rounded-full bg-surface-muted px-3 py-1 text-xs leading-5">
              {reason}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-4">
        {requestStatus === "pending" ? (
          <LinkButton href="/requests" variant="secondary">
            View pending request
          </LinkButton>
        ) : requestStatus === "accepted" ? (
          <p className="text-sm font-semibold text-accent">Connected</p>
        ) : (
          <Button disabled={sending} onClick={() => onRequest(user.id)}>
            {sending ? "Sending…" : "Send request"}
          </Button>
        )}
        {error ? (
          <p role="alert" className="mt-2 text-sm text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </article>
  );
}
