export const GROUP_FINISH_GRACE_MS = 2 * 60 * 60 * 1000;

export type GroupSessionRef = {
  id: string;
  myRole: string | null;
  myStatus: string | null;
  startsAt: string;
  endsAt: string;
};

export function canFinishGroupSession(session: GroupSessionRef, nowMs: number): boolean {
  const startsAt = new Date(session.startsAt).getTime();
  const endsAt = new Date(session.endsAt).getTime();
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt)) return false;
  const eligible = session.myRole === "host" || session.myStatus === "accepted";
  return eligible && nowMs >= startsAt && nowMs <= endsAt + GROUP_FINISH_GRACE_MS;
}

export function chemistryQuestions(participants: { id: string; displayName: string }[]): { userId: string; label: string }[] {
  return participants.map((person) => ({
    userId: person.id,
    label: `How well did you study with ${person.displayName}?`,
  }));
}

export function ratingsForAuthor<T extends { raterId: string }>(authorId: string, rows: T[]): T[] {
  return rows.filter((row) => row.raterId === authorId);
}
