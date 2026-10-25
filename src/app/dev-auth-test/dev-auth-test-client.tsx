"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useMemo, useRef, useState } from "react";

import type {
  AcademicYear,
  Availability,
  Block,
  Checkin,
  Course,
  DiscoveryMatch,
  Location,
  Profile,
  StudyRequest,
  StudyStyle,
  University,
} from "@/types/api";

/**
 * Interactive half of the development-only auth test page (rendered only
 * by the server page, which 404s in production).
 *
 * It drives the real, frozen API contract through the normal Supabase SSR
 * cookie session: createBrowserClient stores the session in cookies (via
 * @supabase/ssr), middleware refreshes them, and plain same-origin fetch
 * calls below authenticate against /api/* exactly like the frontend will.
 *
 * Only the public NEXT_PUBLIC_* values are read here. Passwords are kept
 * in form state, cleared after each attempt, and never rendered or
 * logged; session objects and tokens are never touched or displayed.
 * Response bodies shown are the contract's own public payloads (catalog
 * rows, profiles, check-ins, discovery matches, requests, blocks).
 */

const CATALOG_ENDPOINTS = ["/api/universities", "/api/locations", "/api/courses"] as const;
const ACADEMIC_YEARS: AcademicYear[] = [
  "freshman",
  "sophomore",
  "junior",
  "senior",
  "graduate",
  "other",
];
const STUDY_STYLES: StudyStyle[] = ["quiet", "collaborative", "flexible"];
const AVAILABILITIES: Availability[] = ["available", "questions_only", "focused"];

type ApiLogEntry = {
  id: number;
  label: string;
  method: string;
  path: string;
  status: number | null;
  expectedStatus?: number;
  body: unknown;
};

type ApiOutcome = { status: number | null; body: unknown };

function readBrowserConfig(): { supabase: SupabaseClient | null; missing: string[] } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const missing: string[] = [];
  if (!url) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!anonKey) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!url || !anonKey) return { supabase: null, missing };
  return { supabase: createBrowserClient(url, anonKey), missing };
}

function dataOf(body: unknown): unknown {
  if (typeof body === "object" && body !== null && "data" in body) {
    return (body as { data: unknown }).data;
  }
  return null;
}

const inputClass =
  "rounded-md border border-zinc-300 px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";
const buttonClass =
  "rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-900 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50";
const primaryButtonClass =
  "rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900";

export default function DevAuthTestClient() {
  const { supabase, missing } = useMemo(() => readBrowserConfig(), []);
  const logId = useRef(0);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);
  const [ownId, setOwnId] = useState<string | null>(null);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [log, setLog] = useState<ApiLogEntry[]>([]);
  const [busy, setBusy] = useState(false);

  // Catalog + workflow state, always filled from live API responses.
  const [universities, setUniversities] = useState<University[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [checkin, setCheckin] = useState<Checkin | null>(null);
  const [matches, setMatches] = useState<DiscoveryMatch[]>([]);
  const [requests, setRequests] = useState<StudyRequest[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);

  // Profile form.
  const [displayName, setDisplayName] = useState("");
  const [universityId, setUniversityId] = useState("");
  const [major, setMajor] = useState("");
  const [academicYear, setAcademicYear] = useState<AcademicYear | "">("");
  const [profileStudyStyle, setProfileStudyStyle] = useState<StudyStyle>("collaborative");
  const [preferredDurationMinutes, setPreferredDurationMinutes] = useState(120);
  const [preferredGroupSize, setPreferredGroupSize] = useState(2);
  const [visible, setVisible] = useState(true);
  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>([]);

  // Check-in form.
  const [checkinLocationId, setCheckinLocationId] = useState("");
  const [checkinCourseId, setCheckinCourseId] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(120);
  const [availability, setAvailability] = useState<Availability>("available");
  const [checkinStudyStyle, setCheckinStudyStyle] = useState<StudyStyle>("collaborative");

  // Requests / blocks forms.
  const [recipientId, setRecipientId] = useState("");
  const [blockUserId, setBlockUserId] = useState("");
  const [lastSentRecipientId, setLastSentRecipientId] = useState<string | null>(null);
  const [lastBlockedUserId, setLastBlockedUserId] = useState<string | null>(null);

  async function apiCall(
    label: string,
    method: string,
    path: string,
    body?: unknown,
    expectedStatus?: number,
  ): Promise<ApiOutcome> {
    let outcome: ApiOutcome;
    try {
      const response = await fetch(path, {
        method,
        headers: {
          accept: "application/json",
          ...(body !== undefined ? { "content-type": "application/json" } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      const text = await response.text();
      let parsed: unknown = "Non-JSON response (not displayed)";
      try {
        parsed = JSON.parse(text) as unknown;
      } catch {
        // Keep the fallback above; raw non-JSON text is never rendered.
      }
      outcome = { status: response.status, body: parsed };
    } catch {
      outcome = { status: null, body: "Request failed before a response was received" };
    }
    logId.current += 1;
    const entry: ApiLogEntry = {
      id: logId.current,
      label,
      method,
      path,
      status: outcome.status,
      expectedStatus,
      body: outcome.body,
    };
    setLog((previous) => [entry, ...previous].slice(0, 50));
    return outcome;
  }

  async function runCatalogChecks() {
    for (const endpoint of CATALOG_ENDPOINTS) {
      const { status, body } = await apiCall("Catalog", "GET", endpoint);
      if (status !== 200) continue;
      const data = dataOf(body);
      if (endpoint === "/api/universities" && Array.isArray(data)) {
        const rows = data as University[];
        setUniversities(rows);
        setUniversityId((current) => current || (rows[0]?.id ?? ""));
      }
      if (endpoint === "/api/locations" && Array.isArray(data)) {
        const rows = data as Location[];
        setLocations(rows);
        setCheckinLocationId((current) => current || (rows[0]?.id ?? ""));
      }
      if (endpoint === "/api/courses" && Array.isArray(data)) {
        const rows = data as Course[];
        setCourses(rows);
        setCheckinCourseId((current) => current || (rows[0]?.id ?? ""));
      }
    }
  }

  async function loadProfile() {
    const { status, body } = await apiCall("Load profile", "GET", "/api/profile");
    if (status !== 200) return;
    const data = dataOf(body) as Profile | null;
    setProfile(data);
    if (data) {
      setOwnId(data.id);
      setDisplayName(data.displayName);
      setUniversityId(data.universityId);
      setMajor(data.major ?? "");
      setAcademicYear(data.academicYear ?? "");
      setProfileStudyStyle(data.studyStyle);
      setPreferredDurationMinutes(data.preferredDurationMinutes);
      setPreferredGroupSize(data.preferredGroupSize);
      setVisible(data.visible);
      setSelectedCourseIds(data.courseIds);
      setCheckinCourseId((current) => current || (data.courseIds[0] ?? ""));
    }
  }

  async function saveProfile() {
    const { status, body } = await apiCall("Create/replace profile", "PUT", "/api/profile", {
      displayName,
      universityId,
      major: major.trim() ? major : null,
      academicYear: academicYear === "" ? null : academicYear,
      courseIds: selectedCourseIds,
      studyStyle: profileStudyStyle,
      preferredDurationMinutes,
      preferredGroupSize,
      visible,
    });
    if (status === 200) {
      const data = dataOf(body) as Profile;
      setProfile(data);
      setOwnId(data.id);
    }
  }

  async function loadCheckin() {
    const { status, body } = await apiCall("Load check-in", "GET", "/api/checkin");
    if (status === 200) setCheckin(dataOf(body) as Checkin | null);
  }

  async function doCheckin() {
    const { status, body } = await apiCall("Check in", "POST", "/api/checkin", {
      locationId: checkinLocationId,
      courseId: checkinCourseId,
      durationMinutes,
      availability,
      studyStyle: checkinStudyStyle,
    });
    if (status === 201) setCheckin(dataOf(body) as Checkin);
  }

  async function doCheckout() {
    const { status } = await apiCall("Check out", "DELETE", "/api/checkin");
    if (status === 200) setCheckin(null);
  }

  async function runDiscovery() {
    const { status, body } = await apiCall("Discovery", "GET", "/api/discovery");
    if (status === 200) {
      const data = dataOf(body);
      setMatches(Array.isArray(data) ? (data as DiscoveryMatch[]) : []);
    }
  }

  async function loadRequests() {
    const { status, body } = await apiCall("List requests", "GET", "/api/requests?direction=all");
    if (status === 200) {
      const data = dataOf(body);
      setRequests(Array.isArray(data) ? (data as StudyRequest[]) : []);
    }
  }

  async function sendRequest(recipient: string) {
    const { status } = await apiCall("Send request", "POST", "/api/requests", {
      recipientId: recipient,
    });
    if (status === 201) {
      setLastSentRecipientId(recipient);
      await loadRequests();
    }
  }

  async function transition(requestId: string, nextStatus: "accepted" | "declined" | "cancelled") {
    const { status } = await apiCall(
      `Request → ${nextStatus}`,
      "PATCH",
      `/api/requests/${requestId}`,
      { status: nextStatus },
    );
    if (status === 200) await loadRequests();
  }

  async function loadBlocks() {
    const { status, body } = await apiCall("List blocks", "GET", "/api/blocks");
    if (status === 200) {
      const data = dataOf(body);
      setBlocks(Array.isArray(data) ? (data as Block[]) : []);
    }
  }

  async function doBlock(targetUserId: string) {
    const { status } = await apiCall("Block user", "POST", "/api/blocks", {
      blockedUserId: targetUserId,
    });
    if (status === 200 || status === 201) {
      setLastBlockedUserId(targetUserId);
      await loadBlocks();
      await loadRequests();
    }
  }

  async function doUnblock(targetUserId: string) {
    const { status } = await apiCall("Unblock user", "DELETE", `/api/blocks/${targetUserId}`);
    if (status === 200) await loadBlocks();
  }

  // ---- Negative (expected-failure) security checks ---------------------

  async function negativeSelfRequest() {
    if (!ownId) return;
    await apiCall("NEGATIVE: request yourself", "POST", "/api/requests", { recipientId: ownId }, 400);
  }

  async function negativeSelfBlock() {
    if (!ownId) return;
    await apiCall("NEGATIVE: block yourself", "POST", "/api/blocks", { blockedUserId: ownId }, 400);
  }

  async function negativeUnknownField() {
    if (!ownId) return;
    await apiCall(
      "NEGATIVE: unknown body field",
      "POST",
      "/api/requests",
      { recipientId: ownId, unexpectedField: true },
      400,
    );
  }

  async function negativeNonParticipant() {
    await apiCall(
      "NEGATIVE: act on a stranger's request",
      "PATCH",
      `/api/requests/${crypto.randomUUID()}`,
      { status: "accepted" },
      404,
    );
  }

  async function negativeSenderAcceptsOwn() {
    const outgoing = requests.find((request) => request.senderId === ownId && request.status === "pending");
    if (!outgoing) return;
    await apiCall(
      "NEGATIVE: sender accepts own request",
      "PATCH",
      `/api/requests/${outgoing.id}`,
      { status: "accepted" },
      403,
    );
  }

  async function negativeDuplicateRequest() {
    if (!lastSentRecipientId) return;
    await apiCall(
      "NEGATIVE: duplicate pending request",
      "POST",
      "/api/requests",
      { recipientId: lastSentRecipientId },
      409,
    );
  }

  async function negativeRequestBlocked() {
    if (!lastBlockedUserId) return;
    await apiCall(
      "NEGATIVE: request a blocked user",
      "POST",
      "/api/requests",
      { recipientId: lastBlockedUserId },
      403,
    );
  }

  // ---- Session ----------------------------------------------------------

  async function handleSignIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || busy) return;
    setBusy(true);
    setAuthMessage(null);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setSignedInEmail(null);
        setAuthMessage(`Sign-in failed: ${error.message}`);
        return;
      }
      setSignedInEmail(data.user?.email ?? email);
      setOwnId(data.user?.id ?? null);
      setAuthMessage("Signed in. Loading catalog, profile, and check-in…");
      await runCatalogChecks();
      await loadProfile();
      await loadCheckin();
      setAuthMessage("Signed in. Catalog, profile, and check-in loaded (see log).");
    } finally {
      // The password is never rendered or stored anywhere else.
      setPassword("");
      setBusy(false);
    }
  }

  async function handleSignOut() {
    if (!supabase || busy) return;
    setBusy(true);
    try {
      await supabase.auth.signOut();
      setSignedInEmail(null);
      setOwnId(null);
      setProfile(null);
      setCheckin(null);
      setMatches([]);
      setRequests([]);
      setBlocks([]);
      setAuthMessage("Signed out. Run the catalog checks to confirm every endpoint returns 401.");
    } finally {
      setBusy(false);
    }
  }

  // Restore the session label (never the session itself) on reload.
  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    supabase.auth
      .getUser()
      .then(({ data }) => {
        if (cancelled || !data.user) return;
        setSignedInEmail(data.user.email ?? null);
        setOwnId(data.user.id);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const enrolledCourses = courses.filter((course) => selectedCourseIds.includes(course.id));
  const checkinCourseOptions = enrolledCourses.length > 0 ? enrolledCourses : courses;
  const outgoingPending = requests.find(
    (request) => request.senderId === ownId && request.status === "pending",
  );

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-12 font-sans">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          StudyBuddie dev auth test
        </h1>
        <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          Development only — this route returns 404 in production. It drives the real API through
          the normal SSR cookie session using the two fictional accounts on the isolated
          studysync-dev project. Nothing here deletes data; check-out, decline, cancel, and
          unblock are the only state reversals.
        </p>
      </header>

      <section className="flex flex-col gap-2 rounded-md border border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <h2 className="text-base font-medium text-zinc-900 dark:text-zinc-50">
          Two-session test script
        </h2>
        <ol className="list-decimal space-y-1 pl-5 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          <li>
            Open this page in a normal browser window (<strong>Session A</strong>) and in an
            incognito/private window or a second browser (<strong>Session B</strong>). Cookies are
            per browser context, so the two fictional accounts stay separate.
          </li>
          <li>
            Session A: sign in as <code>demo-student-a@studysync.example</code>. Session B: sign in
            as <code>demo-student-b@studysync.example</code>. Passwords are whatever you set when
            creating the accounts; they are never shown or stored by this page.
          </li>
          <li>
            In both sessions: create the profile (section 3). Pick the same course in both (for
            example M408C) so discovery scores highly, and keep <em>Visible</em> checked.
          </li>
          <li>
            In both sessions: check in (section 4), ideally the same location and course with
            availability <code>available</code>.
          </li>
          <li>Session A: run discovery (section 5) — Demo Student B should appear. Send a request.</li>
          <li>
            Session B: list requests (section 6) — accept the incoming request. Back in Session A,
            list requests again to see <code>accepted</code>.
          </li>
          <li>Session B: check out (section 4). Session A: refresh requests — B&apos;s course/location become null.</li>
          <li>
            Blocking (do last, it cancels pending requests): Session A blocks B (section 7), then
            runs discovery and request lists to confirm B disappears. Unblock B from the block
            list; unblocking does not revive cancelled requests.
          </li>
          <li>
            Negative checks (section 8) can run any time their button is enabled. For the
            signed-out check, sign out here and re-run the catalog checks: all three must return
            401.
          </li>
        </ol>
      </section>

      {missing.length > 0 ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Missing environment variable{missing.length > 1 ? "s" : ""}: {missing.join(", ")}. Add{" "}
          {missing.length > 1 ? "them" : "it"} to <code>.env.local</code> and restart the dev
          server. Values are never shown here.
        </p>
      ) : null}

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">1. Sign in</h2>
        <form onSubmit={handleSignIn} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
            Email
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={inputClass}
              placeholder="demo-student-a@studysync.example"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
            Password
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={inputClass}
            />
          </label>
          <div className="flex flex-wrap gap-3">
            <button type="submit" disabled={!supabase || busy} className={primaryButtonClass}>
              {busy ? "Working…" : "Sign in"}
            </button>
            <button type="button" onClick={handleSignOut} disabled={!supabase || busy} className={buttonClass}>
              Sign out
            </button>
          </div>
        </form>
        {signedInEmail ? (
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            Signed in as <span className="font-medium">{signedInEmail}</span>
          </p>
        ) : (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Not signed in.</p>
        )}
        {authMessage ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400" role="status">
            {authMessage}
          </p>
        ) : null}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">2. Catalog</h2>
        <div>
          <button type="button" onClick={runCatalogChecks} disabled={busy} className={buttonClass}>
            Run catalog checks (universities / locations / courses)
          </button>
        </div>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Signed in, expect 200 for all three. Signed out, expect 401 for all three. Results fill
          the dropdowns below.
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">3. Profile &amp; courses</h2>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={loadProfile} disabled={busy} className={buttonClass}>
            GET /api/profile
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
            Display name
            <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} className={inputClass} placeholder="Demo Student A" />
          </label>
          <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
            University
            <select value={universityId} onChange={(event) => setUniversityId(event.target.value)} className={inputClass}>
              <option value="">Select…</option>
              {universities.map((university) => (
                <option key={university.id} value={university.id}>
                  {university.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
            Major (optional)
            <input value={major} onChange={(event) => setMajor(event.target.value)} className={inputClass} placeholder="Engineering" />
          </label>
          <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
            Academic year
            <select value={academicYear} onChange={(event) => setAcademicYear(event.target.value as AcademicYear | "")} className={inputClass}>
              <option value="">Not set</option>
              {ACADEMIC_YEARS.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
            Study style
            <select value={profileStudyStyle} onChange={(event) => setProfileStudyStyle(event.target.value as StudyStyle)} className={inputClass}>
              {STUDY_STYLES.map((style) => (
                <option key={style} value={style}>
                  {style}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
            Preferred duration (minutes, 30–180)
            <input type="number" min={30} max={180} value={preferredDurationMinutes} onChange={(event) => setPreferredDurationMinutes(Number(event.target.value))} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
            Preferred group size (1–6)
            <input type="number" min={1} max={6} value={preferredGroupSize} onChange={(event) => setPreferredGroupSize(Number(event.target.value))} className={inputClass} />
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input type="checkbox" checked={visible} onChange={(event) => setVisible(event.target.checked)} />
            Visible (required to check in and be discovered)
          </label>
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm text-zinc-700 dark:text-zinc-300">
            Courses (select 1–8; both students should share at least one)
          </legend>
          {courses.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Run the catalog checks first.</p>
          ) : (
            courses.map((course) => (
              <label key={course.id} className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                <input
                  type="checkbox"
                  checked={selectedCourseIds.includes(course.id)}
                  onChange={(event) =>
                    setSelectedCourseIds((previous) =>
                      event.target.checked
                        ? [...previous, course.id]
                        : previous.filter((id) => id !== course.id),
                    )
                  }
                />
                {course.code} — {course.title}
              </label>
            ))
          )}
        </fieldset>
        <div>
          <button type="button" onClick={saveProfile} disabled={busy || !displayName || !universityId || selectedCourseIds.length === 0} className={primaryButtonClass}>
            PUT /api/profile (create or replace)
          </button>
        </div>
        {profile ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Current profile: {profile.displayName}, visible: {String(profile.visible)},{" "}
            {profile.courseIds.length} course(s).
          </p>
        ) : null}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">4. Check-in / check-out</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
            Location
            <select value={checkinLocationId} onChange={(event) => setCheckinLocationId(event.target.value)} className={inputClass}>
              <option value="">Select…</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name} ({location.buildingCode})
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
            Course (must be on your profile)
            <select value={checkinCourseId} onChange={(event) => setCheckinCourseId(event.target.value)} className={inputClass}>
              <option value="">Select…</option>
              {checkinCourseOptions.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.code} — {course.title}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
            Duration (minutes, 30–180)
            <input type="number" min={30} max={180} value={durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value))} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
            Availability
            <select value={availability} onChange={(event) => setAvailability(event.target.value as Availability)} className={inputClass}>
              {AVAILABILITIES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
            Study style
            <select value={checkinStudyStyle} onChange={(event) => setCheckinStudyStyle(event.target.value as StudyStyle)} className={inputClass}>
              {STUDY_STYLES.map((style) => (
                <option key={style} value={style}>
                  {style}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={doCheckin} disabled={busy || !checkinLocationId || !checkinCourseId} className={primaryButtonClass}>
            POST /api/checkin
          </button>
          <button type="button" onClick={loadCheckin} disabled={busy} className={buttonClass}>
            GET /api/checkin
          </button>
          <button type="button" onClick={doCheckout} disabled={busy} className={buttonClass}>
            DELETE /api/checkin (check out)
          </button>
        </div>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {checkin
            ? `Active check-in until ${checkin.expiresAt} (${checkin.availability}).`
            : "No active check-in."}{" "}
          Checking in requires a visible profile; <code>focused</code> hides you from discovery.
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">5. Discovery</h2>
        <div>
          <button type="button" onClick={runDiscovery} disabled={busy} className={primaryButtonClass}>
            GET /api/discovery
          </button>
        </div>
        {matches.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No matches loaded. The other student must be visible, checked in, and not focused —
            and must not have blocked you (or you them).
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {matches.map((match) => (
              <li key={match.user.id} className="rounded-md border border-zinc-200 px-4 py-3 dark:border-zinc-800">
                <p className="text-sm text-zinc-900 dark:text-zinc-50">
                  {match.user.displayName} — {match.location.name} ({match.location.buildingCode}),{" "}
                  {match.course.code}, score {match.compatibilityScore}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {match.reasons.join(" · ") || "No reasons"} · availability {match.availability} ·
                  request status {match.requestStatus ?? "none"}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" onClick={() => sendRequest(match.user.id)} disabled={busy} className={buttonClass}>
                    Send request to {match.user.displayName}
                  </button>
                  <button type="button" onClick={() => setBlockUserId(match.user.id)} className={buttonClass}>
                    Use this user in block test
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">6. Study requests</h2>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={loadRequests} disabled={busy} className={buttonClass}>
            GET /api/requests?direction=all
          </button>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
            Recipient user id (from discovery in the other session, if needed)
            <input value={recipientId} onChange={(event) => setRecipientId(event.target.value)} className={`${inputClass} w-80 font-mono text-xs`} placeholder="uuid" />
          </label>
          <button type="button" onClick={() => sendRequest(recipientId)} disabled={busy || !recipientId} className={buttonClass}>
            POST /api/requests
          </button>
        </div>
        {requests.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No requests loaded.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {requests.map((request) => {
              const incoming = request.recipientId === ownId;
              return (
                <li key={request.id} className="rounded-md border border-zinc-200 px-4 py-3 dark:border-zinc-800">
                  <p className="text-sm text-zinc-900 dark:text-zinc-50">
                    {incoming ? "Incoming from" : "Outgoing to"} {request.counterpart.displayName} —{" "}
                    {request.status}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {request.course ? `${request.course.code} · ` : ""}
                    {request.location ? `${request.location.name} (${request.location.buildingCode})` : "not checked in"}
                  </p>
                  {request.status === "pending" ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {incoming ? (
                        <>
                          <button type="button" onClick={() => transition(request.id, "accepted")} disabled={busy} className={buttonClass}>
                            Accept
                          </button>
                          <button type="button" onClick={() => transition(request.id, "declined")} disabled={busy} className={buttonClass}>
                            Decline
                          </button>
                        </>
                      ) : (
                        <button type="button" onClick={() => transition(request.id, "cancelled")} disabled={busy} className={buttonClass}>
                          Cancel
                        </button>
                      )}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">7. Blocks</h2>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={loadBlocks} disabled={busy} className={buttonClass}>
            GET /api/blocks
          </button>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
            User id to block
            <input value={blockUserId} onChange={(event) => setBlockUserId(event.target.value)} className={`${inputClass} w-80 font-mono text-xs`} placeholder="uuid" />
          </label>
          <button type="button" onClick={() => doBlock(blockUserId)} disabled={busy || !blockUserId} className={buttonClass}>
            POST /api/blocks
          </button>
        </div>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Blocking cancels pending requests between you and hides each of you from the other in
          discovery and request lists. Run this step last in the happy path.
        </p>
        {blocks.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No blocks loaded.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {blocks.map((block) => (
              <li key={block.blockedUserId} className="flex flex-wrap items-center gap-3 rounded-md border border-zinc-200 px-4 py-3 dark:border-zinc-800">
                <span className="text-sm text-zinc-900 dark:text-zinc-50">
                  {block.displayName ?? "Unknown user"} — blocked at {block.createdAt}
                </span>
                <button type="button" onClick={() => doUnblock(block.blockedUserId)} disabled={busy} className={buttonClass}>
                  DELETE /api/blocks/:userId (unblock)
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
          8. Negative security checks (all should fail safely)
        </h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Each button makes one deliberately invalid call. The log entry shows PASS when the API
          returns the expected status. None of these change stored data.
        </p>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={negativeSelfRequest} disabled={busy || !ownId} className={buttonClass}>
            Request yourself → expect 400
          </button>
          <button type="button" onClick={negativeSelfBlock} disabled={busy || !ownId} className={buttonClass}>
            Block yourself → expect 400
          </button>
          <button type="button" onClick={negativeUnknownField} disabled={busy || !ownId} className={buttonClass}>
            Unknown body field → expect 400
          </button>
          <button type="button" onClick={negativeNonParticipant} disabled={busy} className={buttonClass}>
            Act on a stranger&apos;s request → expect 404
          </button>
          <button type="button" onClick={negativeSenderAcceptsOwn} disabled={busy || !outgoingPending} className={buttonClass}>
            Sender accepts own request → expect 403
          </button>
          <button type="button" onClick={negativeDuplicateRequest} disabled={busy || !lastSentRecipientId} className={buttonClass}>
            Duplicate pending request → expect 409
          </button>
          <button type="button" onClick={negativeRequestBlocked} disabled={busy || !lastBlockedUserId} className={buttonClass}>
            Request a blocked user → expect 403
          </button>
        </div>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Signed-out check: sign out in section 1, then re-run the catalog checks in section 2 —
          all three endpoints must return 401. Also try GET /api/profile while signed out (section
          3 button): expect 401.
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">API activity log</h2>
        {log.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No calls yet.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {log.map((entry) => {
              const verdict =
                entry.expectedStatus === undefined
                  ? ""
                  : entry.status === entry.expectedStatus
                    ? " — PASS"
                    : " — FAIL";
              return (
                <article key={entry.id} className="rounded-md border border-zinc-200 dark:border-zinc-800">
                  <h3 className="border-b border-zinc-200 px-4 py-2 font-mono text-sm text-zinc-900 dark:border-zinc-800 dark:text-zinc-50">
                    {entry.label}: {entry.method} {entry.path} — HTTP {entry.status ?? "no response"}
                    {entry.expectedStatus !== undefined ? ` (expected ${entry.expectedStatus})${verdict}` : ""}
                  </h3>
                  <pre className="overflow-x-auto px-4 py-3 font-mono text-xs leading-5 text-zinc-700 dark:text-zinc-300">
                    {JSON.stringify(entry.body, null, 2)}
                  </pre>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
