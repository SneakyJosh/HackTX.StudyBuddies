import type { Profile, RequestStatus } from "@/types/api";
import {
  createSeedCheckins,
  createSeedProfiles,
  createSeedRequests,
  demoLoginFor,
  type FixtureCheckinRecord,
  type FixtureRequestRecord,
} from "@/fixtures/population";

type BlockRecord = {
  blockerId: string;
  blockedId: string;
};

let sessionUserId: string | null = null;
const profiles: Profile[] = createSeedProfiles().map(cloneProfile);
let checkins: FixtureCheckinRecord[] = createSeedCheckins().map(cloneCheckin);
let requests: FixtureRequestRecord[] = createSeedRequests().map(cloneRequest);
const blocks: BlockRecord[] = [];
const listeners = new Set<() => void>();

function cloneProfile(profile: Profile): Profile {
  return { ...profile, courseIds: [...profile.courseIds] };
}

function cloneCheckin(checkin: FixtureCheckinRecord): FixtureCheckinRecord {
  return { ...checkin };
}

function cloneRequest(request: FixtureRequestRecord): FixtureRequestRecord {
  return { ...request };
}

function emit(): void {
  for (const listener of listeners) listener();
}

export function subscribeFixtureStore(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSessionUserId(): string | null {
  return sessionUserId;
}

export function signInDemo(userId: string): boolean {
  if (!demoLoginFor(userId)) return false;
  sessionUserId = userId;
  emit();
  return true;
}

export function signOutDemo(): void {
  sessionUserId = null;
  emit();
}

export function readProfiles(): Profile[] {
  return profiles.map(cloneProfile);
}

export function readProfile(userId: string): Profile | null {
  const profile = profiles.find((item) => item.id === userId);
  return profile ? cloneProfile(profile) : null;
}

export function upsertProfile(next: Profile): void {
  const cloned = cloneProfile(next);
  const index = profiles.findIndex((profile) => profile.id === cloned.id);
  if (index === -1) profiles.push(cloned);
  else profiles[index] = cloned;
  emit();
}

export function readCheckins(): FixtureCheckinRecord[] {
  return checkins.map(cloneCheckin);
}

export function replaceActiveCheckin(next: FixtureCheckinRecord, nowMs: number): void {
  checkins = checkins.map((checkin) => {
    if (checkin.userId !== next.userId || checkin.checkedOutAt !== null) return checkin;
    if (Date.parse(checkin.expiresAt) <= nowMs) return checkin;
    return { ...checkin, checkedOutAt: next.startedAt };
  });
  checkins.push(cloneCheckin(next));
  emit();
}

export function checkoutActive(userId: string, checkedOutAt: string, nowMs: number): void {
  let changed = false;
  checkins = checkins.map((checkin) => {
    if (checkin.userId !== userId || checkin.checkedOutAt !== null) return checkin;
    if (Date.parse(checkin.expiresAt) <= nowMs) return checkin;
    changed = true;
    return { ...checkin, checkedOutAt };
  });
  if (changed) emit();
}

export function readRequests(): FixtureRequestRecord[] {
  return requests.map(cloneRequest);
}

export function insertRequest(request: FixtureRequestRecord): void {
  requests.push(cloneRequest(request));
  emit();
}

export function changeRequestStatus(id: string, status: RequestStatus, updatedAt: string): void {
  requests = requests.map((request) =>
    request.id === id ? { ...request, status, updatedAt } : request,
  );
  emit();
}

export function isEitherBlocked(leftUserId: string, rightUserId: string): boolean {
  return blocks.some(
    (block) =>
      (block.blockerId === leftUserId && block.blockedId === rightUserId) ||
      (block.blockerId === rightUserId && block.blockedId === leftUserId),
  );
}
