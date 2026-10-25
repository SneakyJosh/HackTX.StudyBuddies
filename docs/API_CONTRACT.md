# StudySync — Shared API Contract v1

**Status:** Frozen for Milestone 0. **Owner:** Cursor. Base path: `/api`. JSON over HTTPS. Next.js App Router route handlers. Supabase Auth sessions identify callers. Never trust a user ID sent in a request body.

Shared TypeScript types, bounds, reason strings, and demo seed ids live in `src/types/api.ts`. That module must stay identical to this document. Agents import it and do not declare a second contract.

## Conventions
- Request body and response keys use `camelCase`.
- Success response: `{ "data": ... }`. List response: `{ "data": [...], "meta": { "count": 0 } }`.
- Error response: `{ "error": { "code": "VALIDATION_ERROR", "message": "Human-readable message", "details": {} } }`.
- All private endpoints require a valid Supabase session cookie. Route handlers derive `userId` from the authenticated session. No service-role credential in the browser.
- ISO 8601 UTC timestamps. IDs are UUID strings. Nullable fields use `null`.
- Unknown request fields are rejected with `400 VALIDATION_ERROR`. The validation layer does not ignore them.
- Campus locations are named predefined public buildings. Responses never include GPS coordinates, room numbers, desks, or private schedules.

## Error codes
| Code | HTTP | When |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Malformed JSON, unknown fields, wrong types, out-of-bounds values, bad enums, a course that is not on the caller profile, a location or course from another university, self-requests, self-blocks, or `q` / report text over the length limit |
| `UNAUTHENTICATED` | 401 | Missing or invalid session |
| `FORBIDDEN` | 403 | Profile not completed, visibility is off when checking in, recipient is not discoverable, or the caller is a participant but is not allowed to make that status change |
| `NOT_FOUND` | 404 | Request, user, or other resource is missing. Also used when the caller is not a participant on a request, so the handler does not reveal that the row exists |
| `CONFLICT` | 409 | Duplicate pending request in either direction, an accepted request already exists for the pair, an illegal status transition for the role that is allowed to act, or a university change while a check-in is active |
| `RATE_LIMITED` | 429 | Reserved. MVP handlers may omit rate limits |
| `INTERNAL_ERROR` | 500 | Unexpected server failure |

`details` is an object. Field failures should name the field. `details` may be `{}`.

## Types
```ts
type StudyStyle = 'quiet' | 'collaborative' | 'flexible';
type Availability = 'available' | 'questions_only' | 'focused';
type RequestStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';
type AcademicYear = 'freshman' | 'sophomore' | 'junior' | 'senior' | 'graduate' | 'other';
type ReportReason = 'harassment' | 'spam' | 'other';
type RequestDirection = 'incoming' | 'outgoing' | 'all';
type MatchReason = 'Studying the same course' | 'Shares another enrolled course' | 'Compatible study style' | 'Same study location' | 'Preferred duration within 30 minutes' | 'Preferred duration within 60 minutes' | 'Similar preferred group size';

type University = { id: string; name: string; slug: string };
type Profile = { id: string; displayName: string; universityId: string; major: string | null; academicYear: AcademicYear | null; courseIds: string[]; studyStyle: StudyStyle; preferredDurationMinutes: number; preferredGroupSize: number; visible: boolean };
type Location = { id: string; universityId: string; name: string; buildingCode: string; description: string | null };
type PublicLocation = Pick<Location, 'id' | 'name' | 'buildingCode'>;
type Course = { id: string; universityId: string; code: string; title: string };
type Checkin = { id: string; locationId: string; courseId: string; availability: Availability; studyStyle: StudyStyle; startedAt: string; expiresAt: string; live: boolean };
type CheckinStudyRecord = { id: string; checkinId: string; course: Course; location: PublicLocation; studyStyle: StudyStyle; availability: Availability; startedAt: string; finishedAt: string; creditedMinutes: number; countsTowardStats: boolean; campusDate: string; recordedAt: string; selfReported: true };
type DiscoveryUser = { id: string; displayName: string; major: string | null; academicYear: AcademicYear | null; studyStyle: StudyStyle };
type DiscoveryMatch = { user: DiscoveryUser; location: PublicLocation; course: Course; availability: Availability; compatibilityScore: number; reasons: MatchReason[]; checkinExpiresAt: string; requestStatus: RequestStatus | null };
type RequestCounterpart = { id: string; displayName: string; major: string | null; academicYear: AcademicYear | null; studyStyle: StudyStyle };
type StudyRequest = { id: string; senderId: string; recipientId: string; status: RequestStatus; createdAt: string; updatedAt: string; counterpart: RequestCounterpart; course: Course | null; location: PublicLocation | null };
type Block = { blockedUserId: string; displayName: string | null; createdAt: string };
```

`DiscoveryUser.studyStyle` is the counterpart's **check-in** study style and is the value used for scoring. `RequestCounterpart.studyStyle` is the counterpart's **profile** study style so the Requests tab still has a label after checkout.

`MatchReason` is exactly one of:
- `Studying the same course`
- `Shares another enrolled course`
- `Compatible study style`
- `Same study location`
- `Preferred duration within 30 minutes`
- `Preferred duration within 60 minutes`
- `Similar preferred group size`

## Validation bounds
| Field | Rule |
|---|---|
| `displayName` | Required string, trimmed length 1–40 |
| `major` | `null` or trimmed length 1–80 |
| `academicYear` | Enum or `null` |
| `courseIds` | 1–8 unique UUIDs belonging to the profile university. `PUT /api/profile` replaces the full set |
| `preferredDurationMinutes` | Integer 30–180 |
| `preferredGroupSize` | Integer 1–6 |
| `visible` | Boolean. Omitted on create or update means `false` |
| `durationMinutes` | Integer 30–180 |
| `q` | Optional course search, trimmed length at most 40 |
| `details` | Omitted, `null`, or string length at most 500 |

Check-in `courseId` must be one of the caller's `courseIds`. Check-in `locationId` must belong to the profile university.

## Endpoints
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/universities` | yes | Campuses the caller may join. Works before a profile exists |
| GET | `/api/locations` | yes | Predefined locations for the caller's university |
| GET | `/api/courses` | yes | Courses for the caller's university; optional `q` filter |
| GET | `/api/profile` | yes | Current user's profile |
| PUT | `/api/profile` | yes | Create or replace the current user's profile |
| GET | `/api/checkin` | yes | Current finishable check-in, or `null` |
| POST | `/api/checkin` | yes | Create or replace the current user's check-in |
| DELETE | `/api/checkin` | yes | Check out without saving study time |
| POST | `/api/checkin/:id/finish` | yes | Save a personal study record and check out |
| GET | `/api/checkin/history` | yes | The caller's finished personal study sessions |
| GET | `/api/discovery` | yes | Discover same-campus active matches |
| GET | `/api/requests` | yes | Current user's incoming and outgoing requests |
| POST | `/api/requests` | yes | Send a request |
| PATCH | `/api/requests/:id` | yes | Accept, decline, or cancel a request |
| GET | `/api/blocks` | yes | Users the caller has blocked |
| POST | `/api/blocks` | yes | Block another user |
| DELETE | `/api/blocks/:userId` | yes | Unblock a user |
| POST | `/api/reports` | yes | Report a user |

There is no custom sign-in route. Email sign-up and sign-in use the Supabase Auth client. The API only reads the resulting session cookie.

## Request and response details
### GET `/api/universities`
Auth required. A profile is not required. Response `{ "data": University[], "meta": { "count": number } }`. The Milestone 0 seed contains one campus, UT Austin. The client uses this id in `PUT /api/profile`.

### GET `/api/locations`
Returns `{ "data": Location[], "meta": { "count": number } }`. When the caller has a profile, return that profile's university. When the profile is `null`, return the sole configured university. `description` is a short public building blurb and must not name a room, desk, or coordinate. Inactive locations are omitted.

### GET `/api/courses?q=M408`
Returns `{ "data": Course[], "meta": { "count": number } }` for the same university selection rule as locations. `q` is an optional case-insensitive substring on `code` or `title`.

### GET `/api/profile`
Returns `{ "data": Profile | null }`. `null` means onboarding is not complete.

### PUT `/api/profile`
Body: `{ "displayName": "Demo Student A", "universityId": "22222222-2222-4222-8222-222222222222", "major": "Engineering", "academicYear": "freshman", "courseIds": ["33333333-3333-4333-8333-333333333331"], "studyStyle": "collaborative", "preferredDurationMinutes": 120, "preferredGroupSize": 2, "visible": true }`.

Response: `{ "data": Profile }`. `universityId` must be an allowed campus. Every course id must belong to that campus. Omitted `visible` is stored as `false`. Changing `universityId` while the caller has an active check-in returns `409 CONFLICT`. The handler replaces `profile_courses` with `courseIds` in the same transaction.

### GET `/api/checkin`
Returns `{ "data": Checkin | null }`. The row is returned while `checked_out_at` is null and server time is still within 2 hours after `expires_at`. `live` is true only while `expires_at` is in the future. Discovery still requires that same live window. A check-in in the grace period is not discoverable. Refreshing the site uses `startedAt` and `expiresAt` from this response. The browser does not store the elapsed time.

### POST `/api/checkin`
Body: `{ "locationId": "uuid", "courseId": "uuid", "durationMinutes": 120, "availability": "available", "studyStyle": "collaborative" }`.

Requires a completed profile and `visible: true`. Otherwise `403 FORBIDDEN`. `courseId` must be one of the profile's `courseIds`. Duration is 30–180 minutes. The handler ends any active check-in and inserts the new row in one transaction. Response `201 { "data": Checkin }`.

`availability: "focused"` is valid. Focused check-ins are stored and returned to the owner, and they are excluded from discovery.

Setting `visible` to `false` later does not check the user out. That user drops out of discovery until they opt in again.

### DELETE `/api/checkin`
Response `200 { "data": { "checkedOut": true } }`. This is check-out without a study record. It does not add minutes, change History, or complete a booking. It is idempotent when the caller is already checked out or the 2-hour finish window has closed.

### POST `/api/checkin/:id/finish`
No body. The server computes credited minutes from `started_at` through `min(now, expires_at)`. A full minute is required for study-time credit. Minutes after `expires_at` are not credited. The planned check-in length stays 30–180 minutes. Finishing checks the caller out and stores one personal study record. A second finish of the same check-in returns that record and does not add minutes. Checkout or replace before finish is `409`. Finish after `expires_at + 2 hours` is `409` and writes nothing. Another student's check-in is `404`. The response is one `CheckinStudyRecord` with `selfReported: true`.

### GET `/api/checkin/history`
Returns `{ "data": CheckinStudyRecord[], "meta": { "count": number } }`, newest start first. These records are private to the caller. They do not include other students or ratings.

### GET `/api/discovery?locationId=uuid&courseId=uuid`
Both filters are optional. Response `{ "data": DiscoveryMatch[], "meta": { "count": number } }`.

Include a student only when all of these hold:
- Same university as the caller.
- Profile `visible` is true.
- Check-in is active.
- Availability is `available` or `questions_only`.
- Not the caller.
- No block in either direction.

`locationId` and `courseId` further restrict that set. The caller may call this endpoint without being checked in or visible.

`requestStatus` is the latest `study_requests` row between the pair in either direction, or `null` when none exists.

`location` is building-level only. Do not return email, auth ids beyond the profile id, GPS, schedules, the profile's preferred duration, or the profile's group size. Those last two affect the score and reasons only.

### GET `/api/requests?direction=incoming|outgoing|all`
Default `all`. Response `{ "data": StudyRequest[], "meta": { "count": number } }`. Only requests involving the caller. Omit any request whose other participant is blocked in either direction.

`counterpart` is the other participant and includes `displayName`, `major`, `academicYear`, and profile `studyStyle`. `course` and `location` come from that person's current active check-in. They are `null` after checkout or expiry. They are not columns on `study_requests`. No email or other contact details.

### POST `/api/requests`
Body: `{ "recipientId": "uuid" }`. The recipient must currently be discoverable to the caller. Self-requests are `400`. A recipient who is hidden, focused, expired, checked out, on another campus, or blocked in either direction is `403`.

A pending request already exists for the unordered pair: `409`. An accepted request already exists for the unordered pair: `409`. After `declined` or `cancelled`, a new pending request is allowed. Response `201 { "data": StudyRequest }`.

### PATCH `/api/requests/:id`
Body: `{ "status": "accepted" | "declined" | "cancelled" }`.

- Recipient of a `pending` request may set `accepted` or `declined`.
- Sender of a `pending` request may set `cancelled`.
- The sender attempting to accept or decline is `403`. The recipient attempting to cancel is `403`.
- Any other transition, including changes after the request is no longer `pending`, is `409`.
- A caller who is not a participant receives `404`.

Response `{ "data": StudyRequest }`.

### GET `/api/blocks`
Response `{ "data": Block[], "meta": { "count": number } }`. Only blocks created by the caller. `displayName` is the blocked user's profile name, or `null` when that profile does not exist. No email.

### POST `/api/blocks`
Body: `{ "blockedUserId": "uuid" }`. Self-blocks are `400`. The first block returns `201 { "data": Block }`. Blocking an already-blocked user is idempotent and returns `200 { "data": Block }` with the original `createdAt`.

Blocking cancels every `pending` request between the two users in either direction (`status: "cancelled"`). Accepted, declined, and already cancelled rows stay stored. Discovery and `GET /api/requests` hide the blocked user in both directions.

### DELETE `/api/blocks/:userId`
Response `200 { "data": { "unblocked": true } }`. Idempotent when no block exists. Unblock does not revive cancelled requests.

### POST `/api/reports`
Body: `{ "reportedUserId": "uuid", "reason": "harassment" | "spam" | "other", "details": "optional text" }`. Response `201 { "data": { "id": "uuid" } }`. A report does not itself block or cancel requests. Ordinary users cannot read reports. Self-reports are `400`.

## Matching v1
The displayed `compatibilityScore` is a deterministic integer from 0 through 100. It is a compatibility heuristic, not a probability. Compare the two active check-ins and the two profiles as follows. Award each row at most once:

| Condition | Points | Reason |
|---|---|---|
| The two active check-in `courseId` values are equal | 40 | `Studying the same course` |
| Otherwise, `profile.courseIds` still intersect | 25 | `Shares another enrolled course` |
| Check-in `studyStyle` values are equal, or either value is `flexible` | 20 | `Compatible study style` |
| Check-in `locationId` values are equal | 20 | `Same study location` |
| Absolute difference of `preferredDurationMinutes` is 30 or less | 10 | `Preferred duration within 30 minutes` |
| Otherwise that absolute difference is 60 or less | 5 | `Preferred duration within 60 minutes` |
| Absolute difference of `preferredGroupSize` is 1 or less | 10 | `Similar preferred group size` |

Study style points use the **check-in** study style. Duration and group-size points use the **profile** preferences. Return a reason only when that row awarded points. A score of 0 has `reasons: []`. Do not invent a filler explanation.

Maximum is 40 + 20 + 20 + 10 + 10 = 100.

## Sorting
Sort is a total order. The displayed score does not change.

1. `rank = compatibilityScore + (sameLocation ? 10 : 0)`, descending. `sameLocation` is true when the caller has an active check-in and the match `locationId` equals it. The extra 10 is ordering-only. It is not added to `compatibilityScore` and it is not a reason. When the caller is not checked in, every bonus is 0.
2. When `rank` ties, same-location matches come first.
3. Then `user.id` ascending as a UUID string.

Because scores move in steps of 5, a same-location student outranks another student whose displayed score is 0, 5, or 10 points higher. A student whose displayed score is 15 or more points higher ranks above a same-location student. Location never lifts a weak match over a clearly stronger one.

## Database schema (PostgreSQL / Supabase)
- `universities`: `id uuid pk`, `name text`, `slug text unique`.
- `locations`: `id uuid pk`, `university_id uuid fk`, `name text`, `building_code text`, `description text`, `is_active boolean`.
- `courses`: `id uuid pk`, `university_id uuid fk`, `code text`, `title text`, unique (`university_id`, `code`).
- `profiles`: `id uuid pk references auth.users(id)`, `university_id uuid fk`, `display_name text`, `major text nullable`, `academic_year text nullable`, `study_style text`, `preferred_duration_minutes integer`, `preferred_group_size integer`, `visible boolean default false`, `created_at timestamptz`, `updated_at timestamptz`.
- `profile_courses`: `user_id uuid fk`, `course_id uuid fk`, primary key (`user_id`, `course_id`).
- `checkins`: `id uuid pk`, `user_id uuid fk`, `location_id uuid fk`, `course_id uuid fk`, `availability text`, `study_style text`, `started_at timestamptz`, `expires_at timestamptz`, `checked_out_at timestamptz nullable`.
- `study_requests`: `id uuid pk`, `sender_id uuid fk`, `recipient_id uuid fk`, `status text`, `created_at timestamptz`, `updated_at timestamptz`. No course or location columns. Request course and location are derived from the counterpart's active check-in.
- `blocks`: `blocker_id uuid fk`, `blocked_id uuid fk`, `created_at timestamptz`, primary key (`blocker_id`, `blocked_id`).
- `reports`: `id uuid pk`, `reporter_id uuid fk`, `reported_id uuid fk`, `reason text`, `details text nullable`, `created_at timestamptz`.

**Constraints:** Check enumerated values in the database. Enforce display name length 1–40, major length 1–80 when present, preferred duration 30–180, group size 1–6, and report details length at most 500. The profile write path rejects course sets outside 1–8 and should make a ninth enrollment fail in the database as well. One active check-in means `checked_out_at is null` and `expires_at > now()`, enforced by a transaction or advisory lock. A partial index cannot use `now()` safely. Enforce one `pending` request and one `accepted` request per unordered pair with partial unique indexes on `least(sender_id, recipient_id), greatest(sender_id, recipient_id)`. Index check-ins on (`location_id`, `expires_at`) and requests on both participant ids. Validate cross-university references in the route handler.

## RLS and privacy
Enable RLS on every user-linked table. Profiles and profile course links are writable only by the owner. Check-ins are writable only by the owner. Requests are readable by the sender and recipient and mutable only through the allowed transitions. Blocks are readable and writable only by the blocker. Reports are insertable by the reporter and not readable by ordinary users.

Discovery is a server route that checks the session and selects the public fields in `DiscoveryMatch`. Do not expose the check-ins table, emails, or coordinates to other users. Location descriptions stay public building blurbs. Test RLS with two separate user sessions. Use the smallest privilege that still lets the route run. The service-role key stays server-only.

## Demo seed
These rows are public campus data, not student records. Use the same ids in migrations and fixtures.

| Entity | Id | Label |
|---|---|---|
| University | `22222222-2222-4222-8222-222222222222` | University of Texas at Austin (`ut-austin`) |
| Location | `11111111-1111-4111-8111-111111111111` | Perry-Castañeda Library (`PCL`) |
| Location | `11111111-1111-4111-8111-111111111112` | Engineering Education and Research Center (`EER`) |
| Location | `11111111-1111-4111-8111-111111111113` | Texas Union (`UNION`) |
| Course | `33333333-3333-4333-8333-333333333331` | `M408C` Differential and Integral Calculus |
| Course | `33333333-3333-4333-8333-333333333332` | `CS314` Data Structures |
| Course | `33333333-3333-4333-8333-333333333333` | `BIO311C` Introductory Biology |

Labeled demo accounts, created in Supabase with email confirmation disabled or preconfirmed:
- Demo Student A, `demo-student-a@studysync.example`
- Demo Student B, `demo-student-b@studysync.example`

Auth user ids are assigned when the accounts are created. Passwords stay in the local environment and are never committed. Do not seed real student names, emails, or schedules.

## Auth and operations
Use `@supabase/ssr` for Next.js cookie sessions. Verify the user on the server with Supabase Auth. The publishable/anon key may be client-side. The service-role key is secret. Configure deployment redirect URLs before the demo. The first release uses manual refresh or short polling. Add Realtime only after the core flow passes tests.

Supabase package versions are pinned when backend implementation starts. The contract freeze does not add runtime dependencies.

## Scheduled sessions (Milestone 9)

Scheduled sessions are bookings. They are not check-ins, discovery matches, or completed study history. A booking whose `endsAt` is in the past stays `scheduled`. This milestone does not write a `completed` status and does not count hours or streaks. Completion belongs to a later milestone.

Campus wall-clock times use `America/Chicago`. Clients send `localDate` (`YYYY-MM-DD`) and `localTime` (`HH:MM`). The server resolves exactly one UTC instant. A spring-forward gap has no valid instant and is `400`. A fall-back hour that matches two instants is `400`. The server does not shift the clock or pick the earlier or later offset. Stored and returned timestamps are ISO 8601 UTC. Responses label no zone of their own. The website formats them in `America/Chicago`.

`seatsTaken` counts participants with status `accepted`, including the host. `seatsReserved` counts `accepted` plus `invited`. Status `requested` is an Open-session join request and does not reserve a seat. The host's accept rechecks `seatsReserved` inside the locked transaction before anyone new becomes `accepted`.

### Types
```ts
type SessionVisibility = 'solo' | 'open' | 'invite_only';
type SessionStatus = 'scheduled' | 'cancelled';
type SessionParticipantStatus = 'invited' | 'requested' | 'accepted' | 'declined' | 'left' | 'cancelled';
type SessionRole = 'host' | 'invitee' | 'joiner';
type SessionWhen = 'upcoming' | 'past';
type SessionPerson = { id: string; displayName: string; major: string | null; academicYear: AcademicYear | null };
type SessionParticipant = { user: SessionPerson; role: SessionRole; status: SessionParticipantStatus };
type ScheduledSession = {
  id: string; title: string; course: Course; location: PublicLocation;
  visibility: SessionVisibility; seatLimit: number; seatsTaken: number; seatsReserved: number;
  startsAt: string; endsAt: string; status: SessionStatus; host: SessionPerson;
  myRole: SessionRole | null; myStatus: SessionParticipantStatus | null;
  participants: SessionParticipant[];
};
type OpenSession = {
  id: string; title: string; course: Course; location: PublicLocation;
  seatLimit: number; seatsTaken: number; seatsReserved: number;
  startsAt: string; endsAt: string; host: SessionPerson;
  myStatus: SessionParticipantStatus | null;
};
```

`location` is the public building only. Person objects are display name, major, and year. No email, GPS, room, desk, or private calendar.

### Validation
| Field | Rule |
|---|---|
| `title` | Trimmed length 1–60. `<` and `>` are rejected |
| `localDate` | Real calendar date |
| `localTime` | `HH:MM`, minute multiple of 5, one America/Chicago instant |
| `durationMinutes` | Integer 30–180 |
| `startsAt` | After server time and at most 180 days ahead |
| `visibility` | `solo`, `open`, or `invite_only` |
| `seatLimit` | `solo` is 1. Open and invite-only are 2–6, including the host |
| `inviteeIds` | Unique UUIDs. Empty for solo. At least one for invite-only. Cannot exceed the seats left after the host |

Overlap uses a half-open range `[startsAt, endsAt)` across sessions the user hosts or has accepted. A session that starts when another ends is allowed. Pending invitations and join requests do not create a commitment.

### Endpoints
| Method | Path | Description |
|---|---|---|
| GET | `/api/sessions?when=upcoming\|past` | Bookings the caller hosts or is invited to |
| POST | `/api/sessions` | Create a booking. `201` |
| GET | `/api/sessions/open?courseId=&today=true` | Upcoming open bookings on the caller's campus |
| GET | `/api/sessions/:id` | One booking the caller may see |
| POST | `/api/sessions/:id/invitations` | Host invites one accepted study partner |
| PATCH | `/api/sessions/:id/invitations` | Invitee accepts or declines |
| POST | `/api/sessions/:id/join` | Request a seat on an open booking. `201`. Status becomes `requested` |
| PATCH | `/api/sessions/:id/participants/:userId` | Host accepts or declines a join request |
| POST | `/api/sessions/:id/leave` | Accepted non-host leaves |
| POST | `/api/sessions/:id/cancel` | Host cancels. Idempotent |

`when=upcoming` is `scheduled`, `endsAt` still in the future, and the caller's status is `invited`, `requested`, or `accepted`. `when=past` is `scheduled`, `endsAt` has passed, and the caller is the host or `accepted`. Cancelled bookings appear in neither list. Past rows are elapsed bookings, not completed study sessions.

Create body: `{ "title", "courseId", "locationId", "localDate", "localTime", "durationMinutes", "visibility", "seatLimit", "inviteeIds" }`. The course must be on the host's profile. The building must belong to the host's university. Invitees must be other students on that campus with an accepted study request and no block in either direction.

### Roster visibility
- The host sees every participant row and status.
- An `accepted`, `invited`, or `requested` caller sees accepted participants, plus their own row. They do not see other pending invitations or other join requests.
- A caller with no active row (`invited`, `requested`, or `accepted`) sees an open, upcoming, same-campus booking with `participants: []`. Solo, invite-only, cancelled, and elapsed private bookings are `404`. `declined`, `left`, and `cancelled` do not keep access. Decline and leave still return that booking once so the action can succeed.
- A block in either direction with the host makes the booking `404`, including open bookings.
- A block between two non-host participants omits each of them from the other's roster. Seat counts stay numeric and do not name the hidden person.

### Capacity and cancellation
Accepting a join request locks the booking, recounts `accepted` and `invited` rows, and inserts the commitment only when `seatsReserved` is still below `seatLimit`. A full booking is `409`. Declining a join request sets `declined` and does not change seats. Declining an invitation sets `declined` and releases the reserved seat. Leaving sets `left` and deletes that person's commitment. The host cannot leave.

Cancellation is host-only. It sets the booking to `cancelled`, deletes every commitment for that booking, and sets `invited`, `requested`, and `accepted` participant rows to `cancelled`. `declined` and `left` stay as they are. A second cancel returns the same cancelled booking. Cancelled bookings are absent from upcoming and past lists.

### Blocks
Blocking still cancels pending study requests. It also cancels `invited` and `requested` session rows between the pair, removes an `accepted` non-host from the other's upcoming booking, and deletes that person's commitment. The host's booking continues for everyone else. Unblocking does not restore the seat.

Changing university while the caller hosts a future `scheduled` booking, or has an `accepted` seat on one, is `409`.

Check-ins, discovery, matching, and study requests are unchanged. A booking does not check a student in. Focused check-ins stay out of discovery.

## Study history (Milestone 10)

Study hours are self-reported. The server stores the minutes it derived from the booking and the finish time. It does not verify that the student was at the building. Responses set `selfReported: true` and describe the total as self-reported. These totals are private to the author. They are not a leaderboard and they do not change `compatibilityScore` or discovery order.

`SessionStatus` stays `scheduled | cancelled`. Completion is not a session-wide status. Each host or accepted participant has their own attendance: `completed` or `missed`. An elapsed booking with no attendance row is unconfirmed. Unconfirmed bookings are the `past` list. They add no minutes and no streak. The server does not convert them to missed on its own.

### Who may record attendance
Only the host, or a participant whose status is still `accepted`, may finish or mark missed. `invited`, `requested`, `declined`, `left`, and `cancelled` participants cannot gain new credit. A block in either direction with the host makes finish and miss `404` for the other person. A second finish of an existing completion returns that same record and does not add minutes. A missed row cannot later be finished. A completed row cannot later be marked missed.

Finish is allowed only while `startsAt <= now <= endsAt + 2 hours`. Credited minutes are the booked length when they finish at or after `endsAt`, and the elapsed minutes from `startsAt` otherwise, never more than the booked length. A booking is still 30–180 minutes. Finishing early can credit fewer minutes, including 1–4. `countsTowardStats` is true when the completion has at least 1 credited minute. A finish with 0 credited minutes stays in history and does not add study time. Miss is allowed once `startsAt` has passed, including after the finish window, and stores zero minutes.

### Cancellation after a partial record
Host cancellation still cancels the booking, removes commitments, and stops every new finish or miss. Attendance rows already stored stay in the database. History and stats continue to include those completed rows. The history card keeps `sessionStatus: "cancelled"` so the later cancellation is visible. Unconfirmed participants on that booking do not receive hours.

### History, missed, and stats
`GET /api/sessions?when=history` returns the caller's completed rows, newest start first. `when=missed` returns the caller's missed rows. `when=past` remains unconfirmed elapsed bookings whose caller is the host or still `accepted`. `when=upcoming` is unchanged, except a caller who already recorded attendance no longer sees that booking there.

A history participant list is the accepted roster copied at record time, without the caller and without anyone blocked relative to the caller. Display names do not follow later profile edits. Course and building stay the booking's catalog rows.

The study day is the `America/Chicago` date of the booking `startsAt` or the check-in `startedAt`. A session that crosses midnight keeps every credited minute on the start date. Total study time adds every completed booking and every finished personal check-in with at least 1 credited minute. A streak day is a campus date whose completed bookings and finished check-ins add up to at least 5 credited minutes. Sessions of 1–4 minutes count toward the total and toward that day's combined total. They do not qualify the day on their own unless the day's combined total reaches 5. The streak counts back from today, or from yesterday when today is under 5 minutes. A gap before that anchor makes the streak 0. Week bars are Monday through Sunday in `America/Chicago` and include every credited minute, including days under 5. Course streaks use the same daily total for one course. Missed rows, unconfirmed bookings, cancelled bookings with no prior completion, and check-ins that were closed without Finish studying contribute nothing.

### Ratings
`POST /api/sessions/:id/ratings` is allowed only after that caller's attendance is `completed`. Categories are `study_time`, `environment`, and `chemistry`. Study time and environment have no subject. Chemistry names one other accepted participant from the stored roster, never the author, and never a student blocked at submit time. Stars are integers 1–5. One row exists per rater, session, category, and subject. A duplicate is `409`. Ratings are returned only on the author's own history record. Nobody else can read them.

### Endpoints
| Method | Path | Description |
|---|---|---|
| POST | `/api/sessions/:id/finish` | Record this caller's completion. `200` |
| POST | `/api/sessions/:id/miss` | Record this caller's miss. `200` |
| POST | `/api/sessions/:id/ratings` | Store this caller's private ratings. `201` |
| GET | `/api/study-stats` | This caller's self-reported streak and minutes |

Finish and miss return one `StudyRecord`. Ratings body is `{ "studyTime"?: 1-5, "environment"?: 1-5, "chemistry"?: [{ "userId", "stars" }] }` with at least one field. `GET /api/study-stats` returns `{ selfReported: true, description, streakDays, qualifyingMinutes, weekMinutes, week: [{ date, minutes }], courseStreaks }`.

Accepting a study request is unchanged and is not session completion. Discovery matching is unchanged.

## Contract change procedure
Cursor owns edits to this file and to `src/types/api.ts`. Any agent requesting a change must specify the affected endpoint or type, migration impact, UI impact, and compatibility strategy. Freeze the update and sync it to both worktrees before dependent code changes.
