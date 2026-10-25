import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { Course, DiscoveryMatch, Profile } from "#api";

import {
  GROK_MAX_OUTPUT_TOKENS,
  GROK_TIMEOUT_MS,
  allowGrokRequest,
  applyGrokText,
  candidateFacts,
  grokPrompt,
  parseGrokBatch,
  parseGrokScore,
  readGrokOutputText,
  requestGrokText,
  resetGrokState,
  scoreTopSuggestions,
  topEligible,
} from "./grok-compatibility.ts";

const course: Course = {
  id: "33333333-3333-4333-8333-333333333332",
  universityId: "22222222-2222-4222-8222-222222222222",
  code: "CS314",
  title: "Data Structures",
};

function match(id: string, score = 65): DiscoveryMatch {
  return {
    user: {
      id,
      displayName: "Riley Okonkwo",
      major: "Biology",
      academicYear: "sophomore",
      studyStyle: "flexible",
    },
    location: { id: "11111111-1111-4111-8111-111111111112", name: "EER", buildingCode: "EER" },
    course,
    availability: "available",
    compatibilityScore: score,
    reasons: ["Shares another enrolled course", "Compatible study style"],
    checkinExpiresAt: "2026-10-25T18:00:00.000Z",
    requestStatus: null,
  };
}

const profile: Profile = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  displayName: "Avery Chen",
  universityId: course.universityId,
  major: "Computer Science",
  academicYear: "junior",
  courseIds: [course.id],
  studyStyle: "collaborative",
  preferredDurationMinutes: 60,
  preferredGroupSize: 3,
  visible: true,
};

test("a valid Grok score is accepted and extra reasons are limited to two", () => {
  const parsed = parseGrokScore({ score: 82.2, reasons: ["Shared CS314", "Both like groups", "Too many"] });
  assert.deepEqual(parsed, { score: 82, reasons: ["Shared CS314", "Both like groups"] });
});

test("invalid Grok payloads are rejected", () => {
  assert.equal(parseGrokScore({ score: 101, reasons: ["Too high"] }), null);
  assert.equal(parseGrokScore({ score: 40, reasons: [] }), null);
  assert.equal(parseGrokScore({ score: 40, reasons: ["mail@example.com"] }), null);
  assert.equal(parseGrokBatch("not json"), null);
});

test("a failed or empty model response falls back to Matching v1", () => {
  const rows = applyGrokText([match("student-1", 65)], ["1"], null);
  assert.equal(rows[0]?.source, "matching");
  assert.equal(rows[0]?.score, 65);
  const mixed = applyGrokText(
    [match("student-1", 65), match("student-2", 40)],
    ["1", "2"],
    '{"results":[{"slot":"1","score":90,"reasons":["Same building"]}]}',
  );
  assert.equal(mixed[0]?.source, "grok");
  assert.equal(mixed[1]?.source, "matching");
  assert.equal(mixed[1]?.score, 40);
});

test("the prompt uses public study facts and omits names, emails, and coordinates", () => {
  const facts = candidateFacts(match("student-1"), "1", ["CS314"]);
  const prompt = grokPrompt(
    {
      slot: "you",
      major: profile.major,
      academicYear: profile.academicYear,
      studyStyle: profile.studyStyle,
      preferredDurationMinutes: profile.preferredDurationMinutes,
      preferredGroupSize: profile.preferredGroupSize,
      courses: ["CS314"],
      building: null,
      publicNotes: [],
    },
    [facts],
  );
  assert.equal(prompt.includes(profile.displayName), false);
  assert.equal(prompt.includes("Riley"), false);
  assert.equal(prompt.includes("@"), false);
  assert.equal(prompt.includes("latitude"), false);
  assert.equal(prompt.includes("password"), false);
  assert.match(prompt, /CS314/);
  assert.match(prompt, /EER/);
  assert.equal(facts.preferredDurationMinutes, null);
  assert.deepEqual(topEligible([match("a"), match("b"), match("c"), match("d"), match("e"), match("f")]).length, 5);
});

test("output text is read from the message and reasoning text is ignored", () => {
  assert.equal(readGrokOutputText({ output_text: '{"results":[]}' }), '{"results":[]}');
  assert.equal(
    readGrokOutputText({
      output: [
        { type: "reasoning", content: [{ text: '{"results":[{"slot":"9","score":1,"reasons":["no"]}]}' }] },
        { type: "message", content: [{ text: '{"results":[{"slot":"1","score":10,"reasons":["Style"]}]}' }] },
      ],
    }),
    '{"results":[{"slot":"1","score":10,"reasons":["Style"]}]}',
  );
  const parsed = parseGrokBatch(readGrokOutputText({ output_text: '{"results":[{"slot":"1","score":10,"reasons":["Style"]}]}' }) ?? "");
  assert.equal(parsed?.get("1")?.score, 10);
});

test("the Responses request uses grok-4.7, low reasoning, and room for five results", async () => {
  assert.equal(GROK_TIMEOUT_MS, 15_000);
  assert.ok(GROK_MAX_OUTPUT_TOKENS >= 1000);
  type GrokRequestBody = {
    model?: string;
    store?: boolean;
    max_output_tokens?: number;
    reasoning?: { effort?: string };
  };
  const captured: { url: string; body: GrokRequestBody | null } = { url: "", body: null };
  const text = await requestGrokText("anonymous", "test-key", async (input, init) => {
    captured.url = String(input);
    captured.body = JSON.parse(String(init?.body)) as GrokRequestBody;
    return Response.json({ output_text: '{"results":[{"slot":"1","score":70,"reasons":["Style"]}]}', status: "completed" });
  });
  assert.equal(captured.url, "https://api.x.ai/v1/responses");
  assert.equal(captured.body?.model, "grok-4.7");
  assert.equal(captured.body?.store, false);
  assert.equal(captured.body?.reasoning?.effort, "low");
  assert.equal(captured.body?.max_output_tokens, GROK_MAX_OUTPUT_TOKENS);
  assert.match(text ?? "", /Style/);
});

test("failure diagnostics name the category and omit secrets", async () => {
  const logged: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    logged.push(args.map((arg) => String(arg)).join(" "));
  };
  try {
    assert.equal(await requestGrokText("student profile", undefined, async () => {
      throw new Error("should not be called");
    }), null);
    assert.equal(await requestGrokText("student profile", "secret-key", async () => {
      return Response.json({ leaked: "student profile" }, { status: 401 });
    }), null);
    assert.equal(await requestGrokText("student profile", "secret-key", async () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    }), null);
    resetGrokState();
    const rows = await scoreTopSuggestions("user", null, null, profile, [course], [match("student-1")], "secret-key", async () => {
      return Response.json({ output_text: "not json", status: "completed" });
    });
    assert.equal(rows[0]?.source, "matching");
  } finally {
    console.error = original;
  }
  assert.deepEqual(logged, [
    "grok compatibility failed: missing_key",
    "grok compatibility failed: http_error status=401",
    "grok compatibility failed: timeout",
    "grok compatibility failed: invalid_json",
  ]);
  assert.equal(logged.join("\n").includes("secret-key"), false);
  assert.equal(logged.join("\n").includes("student profile"), false);
  assert.equal(logged.join("\n").includes("not json"), false);
});

test("a changed eligible list does not reuse another student's Grok score", async () => {
  resetGrokState();
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    const score = calls === 1 ? 91 : 44;
    return Response.json({
      output_text: `{"results":[{"slot":"1","score":${score},"reasons":["Shared course"]}]}`,
      status: "completed",
    });
  };
  const first = await scoreTopSuggestions("user", null, null, profile, [course], [match("student-1", 65)], "test-key", fetchImpl);
  const second = await scoreTopSuggestions("user", null, null, profile, [course], [match("student-2", 40)], "test-key", fetchImpl);
  const cached = await scoreTopSuggestions("user", null, null, profile, [course], [match("student-2", 40)], "test-key", fetchImpl);
  assert.equal(first[0]?.userId, "student-1");
  assert.equal(first[0]?.score, 91);
  assert.equal(first[0]?.source, "grok");
  assert.equal(second[0]?.userId, "student-2");
  assert.equal(second[0]?.score, 44);
  assert.equal(second[0]?.source, "grok");
  assert.equal(cached[0]?.score, 44);
  assert.equal(calls, 2);
  resetGrokState();
});

test("a failed Grok request returns no text and the scorer falls back", async () => {
  const text = await requestGrokText("anonymous", "test-key", async () => {
    throw new Error("network down");
  });
  assert.equal(text, null);
  const missing = await requestGrokText("anonymous", undefined, async () => {
    throw new Error("should not be called");
  });
  assert.equal(missing, null);
  resetGrokState();
  const rows = await scoreTopSuggestions("user", null, null, profile, [course], [match("student-1")], "test-key", async () => {
    throw new Error("timeout");
  });
  assert.equal(rows[0]?.source, "matching");
  assert.equal(rows[0]?.reasons.includes("Riley Okonkwo"), false);
  resetGrokState();
});

test("Grok calls are limited per user and the route stays authenticated", () => {
  resetGrokState();
  for (let count = 0; count < 6; count += 1) assert.equal(allowGrokRequest("user-1", 1_000), true);
  assert.equal(allowGrokRequest("user-1", 1_000), false);
  assert.equal(allowGrokRequest("user-2", 1_000), true);
  resetGrokState();
  const route = readFileSync("src/app/api/discovery/grok/route.ts", "utf8");
  const server = readFileSync("src/server/grok-compatibility.ts", "utf8");
  const client = readFileSync("src/components/discovery-feed.tsx", "utf8");
  const card = readFileSync("src/components/profile-card.tsx", "utf8");
  const browser = readFileSync("src/lib/api-client.ts", "utf8");
  assert.match(route, /requireAuthenticatedUser/);
  assert.match(route, /discoverMatches/);
  assert.match(route, /process\.env\.XAI_API_KEY/);
  assert.equal(server.includes("process.env"), false);
  assert.match(server, /grok compatibility failed:/);
  assert.equal(server.includes("console.error(error"), false);
  assert.equal(server.includes("console.error(prompt"), false);
  assert.equal(server.includes("console.error(apiKey"), false);
  assert.equal(server.includes("console.error(text"), false);
  assert.match(client, /eligibleIds/);
  for (const source of [client, card, browser]) {
    assert.equal(source.includes("XAI_API_KEY"), false);
    assert.equal(source.includes("api.x.ai"), false);
    assert.equal(source.includes("grok-compatibility"), false);
  }
});
