"use client";

import { useEffect, useState } from "react";
import { getStudyingConnections, isApiError } from "@/lib/api-client";
import { AVAILABILITY_LABELS, STUDY_STYLE_LABELS, formatPersonMeta, initials } from "@/lib/labels";
import type { StudyingConnection } from "@/types/api";
import { useDemo } from "@/components/demo-provider";
import { EmptyBlock, ErrorBlock, LoadingBlock, Sheet, cardClass } from "@/components/ui";

const AVATAR_COLORS = ["#C45C26", "#6B3FA0", "#1E6B8A", "#1E9E6E", "#B85200"];

function avatarColor(name: string): string {
  let hash = 0;
  for (const char of name) hash = (hash + char.charCodeAt(0)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[hash] ?? AVATAR_COLORS[0];
}

export function FriendsStudying() {
  const demo = useDemo();
  const [phase, setPhase] = useState<"loading" | "error" | "ready">("loading");
  const [message, setMessage] = useState("Could not load friends.");
  const [friends, setFriends] = useState<StudyingConnection[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!demo.ready || !demo.userId) return;
    let cancelled = false;
    void (async () => {
      setPhase("loading");
      const result = await getStudyingConnections();
      if (cancelled) return;
      if (isApiError(result)) {
        setFriends([]);
        setMessage(result.error.message);
        setPhase("error");
        return;
      }
      setFriends(result.data);
      setPhase("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [demo.ready, demo.userId, demo.revision, reloadKey]);

  const selected = friends.find((friend) => friend.user.id === selectedId) ?? null;

  return (
    <section className="grid gap-4">
      <div>
        <h2 className="font-display text-xl font-bold">Friends studying now</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">
          Accepted study partners who are checked in and discoverable. Focused, hidden, and checked-out students stay off this list.
        </p>
      </div>
      {phase === "loading" ? <LoadingBlock label="Loading friends" /> : null}
      {phase === "error" ? (
        <ErrorBlock title="Friends are unavailable" message={message} onRetry={() => setReloadKey((value) => value + 1)} />
      ) : null}
      {phase === "ready" && friends.length === 0 ? (
        <EmptyBlock
          title="No friends are studying now"
          body="When an accepted study partner checks in as available or questions only, they show up here."
        />
      ) : null}
      {phase === "ready" && friends.length > 0 ? (
        <ul className="grid gap-3">
          {friends.map((friend) => (
            <li key={friend.user.id}>
              <button
                type="button"
                className={`${cardClass} flex w-full items-center gap-3 text-left`}
                onClick={() => setSelectedId(friend.user.id)}
              >
                <span
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-sm font-extrabold text-white"
                  style={{ background: avatarColor(friend.user.displayName) }}
                  aria-hidden="true"
                >
                  {initials(friend.user.displayName)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-lg font-bold">{friend.user.displayName}</span>
                  <span className="mt-1 block text-sm leading-6 text-muted">
                    Studying {friend.course.code} at {friend.location.name} ({friend.location.buildingCode})
                  </span>
                  <span className="mt-1 block text-sm">
                    {AVAILABILITY_LABELS[friend.availability]} · {STUDY_STYLE_LABELS[friend.user.studyStyle]}
                  </span>
                </span>
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#1E9E6E]" aria-label="Checked in now" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <Sheet open={selected !== null} title="Study partner" onClose={() => setSelectedId(null)}>
        {selected ? <FriendSheet friend={selected} /> : null}
      </Sheet>
    </section>
  );
}

function FriendSheet({ friend }: { friend: StudyingConnection }) {
  return (
    <div className="grid gap-3">
      <p className="font-display text-2xl font-extrabold">{friend.user.displayName}</p>
      <p className="text-sm text-muted">{formatPersonMeta(friend.user.major, friend.user.academicYear)}</p>
      <p className="text-sm leading-6">
        {friend.course.code} · {friend.course.title}
      </p>
      <p className="text-sm leading-6">
        {friend.location.name} ({friend.location.buildingCode})
      </p>
      <p className="text-sm leading-6 text-muted">
        {AVAILABILITY_LABELS[friend.availability]} · {STUDY_STYLE_LABELS[friend.user.studyStyle]} check-in
      </p>
    </div>
  );
}
