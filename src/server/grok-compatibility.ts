import type { Course, DiscoveryMatch, GrokCompatibility, Profile } from "#api";

const GROK_URL = "https://api.x.ai/v1/responses";
const GROK_MODEL = "grok-4.7";
const GROK_LIMIT = 5;
export const GROK_TIMEOUT_MS = 15_000;
export const GROK_MAX_OUTPUT_TOKENS = 1200;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 6;
const CACHE_MS = 10 * 60_000;

export type GrokFailureKind = "missing_key" | "http_error" | "timeout" | "invalid_json" | "request_failed";

/** Logs a failure category only. Callers must not pass keys, prompts, or response text. */
export function reportGrokFailure(kind: GrokFailureKind, status?: number): void {
  if (kind === "http_error") {
    console.error(`grok compatibility failed: http_error status=${status ?? 0}`);
    return;
  }
  console.error(`grok compatibility failed: ${kind}`);
}

export type GrokFacts = {
  slot: string;
  major: string | null;
  academicYear: string | null;
  studyStyle: string;
  preferredDurationMinutes: number | null;
  preferredGroupSize: number | null;
  courses: string[];
  building: string | null;
  publicNotes: string[];
};

type CacheEntry = { expiresAt: number; rows: GrokCompatibility[] };

const hits = new Map<string, number[]>();
const cache = new Map<string, CacheEntry>();

export function resetGrokState(): void {
  hits.clear();
  cache.clear();
}

export function allowGrokRequest(userId: string, now = Date.now()): boolean {
  const recent = (hits.get(userId) ?? []).filter((stamp) => now - stamp < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    hits.set(userId, recent);
    return false;
  }
  recent.push(now);
  hits.set(userId, recent);
  return true;
}

export function readGrokOutputText(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const record = body as { output_text?: unknown; output?: unknown };
  if (typeof record.output_text === "string" && record.output_text.trim()) return record.output_text;
  if (!Array.isArray(record.output)) return null;
  const parts: string[] = [];
  for (const item of record.output) {
    if (!item || typeof item !== "object") continue;
    if ((item as { type?: unknown }).type === "reasoning") continue;
    const content = (item as { content?: unknown }).content;
    if (typeof content === "string") parts.push(content);
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string") {
        parts.push((part as { text: string }).text);
      }
    }
  }
  const text = parts.join("\n").trim();
  return text || null;
}

function cleanReason(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim().replace(/\s+/g, " ");
  if (text.length < 1 || text.length > 120 || text.includes("@")) return null;
  return text;
}

export function parseGrokScore(value: unknown): { score: number; reasons: string[] } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const score = (value as { score?: unknown }).score;
  const reasons = (value as { reasons?: unknown }).reasons;
  if (typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > 100) return null;
  if (!Array.isArray(reasons)) return null;
  const cleaned = reasons.map(cleanReason).filter((reason): reason is string => reason !== null).slice(0, 2);
  if (cleaned.length < 1) return null;
  return { score: Math.round(score), reasons: cleaned };
}

export function parseGrokBatch(text: string): Map<string, { score: number; reasons: string[] }> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { results?: unknown }).results)) return null;
  const scores = new Map<string, { score: number; reasons: string[] }>();
  for (const row of (parsed as { results: unknown[] }).results) {
    if (!row || typeof row !== "object") continue;
    const slot = (row as { slot?: unknown }).slot;
    const score = parseGrokScore(row);
    if (typeof slot !== "string" || !score) continue;
    scores.set(slot, score);
  }
  return scores.size > 0 ? scores : null;
}

export function topEligible(matches: readonly DiscoveryMatch[]): DiscoveryMatch[] {
  return matches.slice(0, GROK_LIMIT);
}

export function callerFacts(profile: Profile, courses: readonly Course[]): GrokFacts {
  const codes = new Map(courses.map((course) => [course.id, course.code]));
  return {
    slot: "you",
    major: profile.major,
    academicYear: profile.academicYear,
    studyStyle: profile.studyStyle,
    preferredDurationMinutes: profile.preferredDurationMinutes,
    preferredGroupSize: profile.preferredGroupSize,
    courses: profile.courseIds.map((id) => codes.get(id)).filter((code): code is string => Boolean(code)),
    building: null,
    publicNotes: [],
  };
}

export function candidateFacts(match: DiscoveryMatch, slot: string, callerCourseCodes: readonly string[]): GrokFacts {
  const shared = callerCourseCodes.includes(match.course.code) ? [match.course.code] : [];
  return {
    slot,
    major: match.user.major,
    academicYear: match.user.academicYear,
    studyStyle: match.user.studyStyle,
    preferredDurationMinutes: null,
    preferredGroupSize: null,
    courses: shared,
    building: match.location.name,
    publicNotes: [...match.reasons],
  };
}

export function grokPrompt(caller: GrokFacts, candidates: readonly GrokFacts[]): string {
  return [
    "Estimate study compatibility. Reply with JSON only:",
    '{"results":[{"slot":"1","score":0,"reasons":["short reason"]}]}',
    "score is an integer 0-100. reasons has 1 or 2 items, each under 80 characters.",
    "Do not include names, emails, or ids.",
    `You: ${JSON.stringify({ ...caller, slot: undefined })}`,
    ...candidates.map((candidate) => `Student ${candidate.slot}: ${JSON.stringify(candidate)}`),
  ].join("\n");
}

export function applyGrokText(
  matches: readonly DiscoveryMatch[],
  slots: readonly string[],
  text: string | null,
): GrokCompatibility[] {
  const parsed = text ? parseGrokBatch(text) : null;
  return matches.map((match, index) => {
    const found = parsed?.get(slots[index] ?? "");
    if (!found) {
      return {
        userId: match.user.id,
        score: match.compatibilityScore,
        reasons: [...match.reasons],
        source: "matching" as const,
      };
    }
    return { userId: match.user.id, score: found.score, reasons: found.reasons, source: "grok" as const };
  });
}

function alignedCache(matches: readonly DiscoveryMatch[], rows: readonly GrokCompatibility[]): GrokCompatibility[] | null {
  if (rows.length !== matches.length) return null;
  const aligned: GrokCompatibility[] = [];
  for (let index = 0; index < matches.length; index += 1) {
    const row = rows[index];
    const match = matches[index];
    if (!row || !match || row.userId !== match.user.id) return null;
    aligned.push(row);
  }
  return aligned;
}

function cacheKey(userId: string, locationId: string | null, courseId: string | null, matches: readonly DiscoveryMatch[]): string {
  const people = matches.map((match) => [match.user.id, match.course.code, match.location.name, match.user.studyStyle, match.compatibilityScore].join(":")).join("|");
  return [userId, locationId ?? "", courseId ?? "", people].join("~");
}

export async function requestGrokText(
  prompt: string,
  apiKey: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  if (!apiKey) {
    reportGrokFailure("missing_key");
    return null;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GROK_TIMEOUT_MS);
  try {
    const response = await fetchImpl(GROK_URL, {
      method: "POST",
      signal: controller.signal,
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: GROK_MODEL,
        store: false,
        max_output_tokens: GROK_MAX_OUTPUT_TOKENS,
        reasoning: { effort: "low" },
        input: [
          { role: "system", content: "You compare anonymous study preferences and return JSON only." },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!response.ok) {
      reportGrokFailure("http_error", response.status);
      return null;
    }
    const body: unknown = await response.json();
    const status = body && typeof body === "object" ? (body as { status?: unknown }).status : null;
    const text = readGrokOutputText(body);
    if (status === "incomplete" || !text) {
      reportGrokFailure("invalid_json");
      return null;
    }
    return text;
  } catch (error) {
    const name = error && typeof error === "object" && "name" in error ? (error as { name?: unknown }).name : "";
    reportGrokFailure(name === "AbortError" ? "timeout" : "request_failed");
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function scoreTopSuggestions(
  userId: string,
  locationId: string | null,
  courseId: string | null,
  profile: Profile | null,
  courses: readonly Course[],
  matches: readonly DiscoveryMatch[],
  apiKey: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<GrokCompatibility[]> {
  const top = topEligible(matches);
  if (top.length === 0 || !profile) return [];
  const key = cacheKey(userId, locationId, courseId, top);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    const aligned = alignedCache(top, cached.rows);
    if (aligned) return aligned;
  }
  const yours = callerFacts(profile, courses);
  const slots = top.map((_, index) => String(index + 1));
  const prompt = grokPrompt(yours, top.map((match, index) => candidateFacts(match, slots[index] ?? "", yours.courses)));
  const text = await requestGrokText(prompt, apiKey, fetchImpl);
  if (text && !parseGrokBatch(text)) reportGrokFailure("invalid_json");
  const rows = applyGrokText(top, slots, text);
  if (text && rows.some((row) => row.source === "grok")) {
    cache.set(key, { expiresAt: Date.now() + CACHE_MS, rows });
  }
  return rows;
}
