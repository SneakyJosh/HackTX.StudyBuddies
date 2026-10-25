"use client";

import type { DiscoveryMatch } from "@/types/api";
import { strongestReason } from "@/lib/match-reason";
import { AVAILABILITY_LABELS, STUDY_STYLE_LABELS, formatPersonMeta } from "@/lib/labels";
import { Button, LinkButton, cardClass } from "@/components/ui";

const AVATAR_COLORS = ["#C45C26", "#6B3FA0", "#1E6B8A", "#1E9E6E", "#B85200"];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function avatarColor(name: string): string {
  let hash = 0;
  for (const char of name) hash = (hash + char.charCodeAt(0)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[hash] ?? AVATAR_COLORS[0];
}

export function ProfileCard({
  match,
  sending,
  error,
  onRequest,
  onOpen,
}: {
  match: DiscoveryMatch;
  sending: boolean;
  error: string | null;
  onRequest: (recipientId: string) => void;
  onOpen?: () => void;
}) {
  const { user, course, location, availability, compatibilityScore, reasons, requestStatus } = match;
  const leadReason = strongestReason(reasons);
  return (
    <article className={cardClass + " flex h-full flex-col"}>
      <div className="flex items-start gap-3">
        <span
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-sm font-extrabold text-white"
          style={{ background: avatarColor(user.displayName) }}
          aria-hidden="true"
        >
          {initials(user.displayName)}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-xl leading-tight font-bold">{user.displayName}</h2>
          <p className="mt-1 text-sm text-muted">{formatPersonMeta(user.major, user.academicYear)}</p>
        </div>
        <p className="text-right" aria-label={`${compatibilityScore} percent compatibility`}>
          <span className="block font-display text-[1.7rem] leading-none font-extrabold tabular-nums text-accent">
            {compatibilityScore}%
          </span>
          <span className="mt-1 block text-[11px] font-bold tracking-wide text-muted uppercase">Match</span>
        </p>
      </div>
      <p className="mt-4 inline-flex max-w-full flex-wrap items-baseline gap-x-2 gap-y-1 self-start rounded-full bg-accent-soft px-3 py-1 text-sm font-bold text-accent">
        <span>{course.code}</span>
        <span className="font-semibold">{course.title}</span>
      </p>
      <p className="mt-3 text-sm leading-6 break-words">{location.name}</p>
      <p className="text-sm text-muted">{location.buildingCode}</p>
      <p className="mt-2 text-sm">
        {AVAILABILITY_LABELS[availability]} · {STUDY_STYLE_LABELS[user.studyStyle]} check-in
      </p>
      {leadReason ? (
        <p className="mt-4 text-sm font-bold text-accent">{leadReason}</p>
      ) : (
        <p className="mt-4 text-sm text-muted">A score of 0 has no explanation.</p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {onOpen ? (
          <Button variant="secondary" onClick={onOpen}>
            View
          </Button>
        ) : null}
        {requestStatus === "pending" ? (
          <LinkButton href="/connect" variant="secondary">
            View pending request
          </LinkButton>
        ) : requestStatus === "accepted" ? (
          <p className="text-sm font-semibold text-accent">Connected</p>
        ) : (
          <Button disabled={sending} onClick={() => onRequest(user.id)}>
            {sending ? "Sending…" : "Request to study"}
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
