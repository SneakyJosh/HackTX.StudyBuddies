# StudySync — Shared API Contract v1

**Status:** Proposed freeze before parallel implementation. **Owner:** Cursor. Base path: `/api`. JSON over HTTPS. Next.js App Router route handlers. Supabase Auth sessions identify callers. Never trust a user ID sent in a request body.

## Conventions
- Request body and response keys use `camelCase`.
- Success response: `{ "data": ... }`; list response: `{ "data": [...], "meta": { "count": 0 } }`.
- Error response: `{ "error": { "code": "VALIDATION_ERROR", "message": "Human-readable message", "details": {} } }`.
- Codes: `UNAUTHENTICATED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `CONFLICT` (409), `VALIDATION_ERROR` (400), `RATE_LIMITED` (429), `INTERNAL_ERROR` (500).
- All private endpoints require a valid Supabase session cookie. Route handlers derive `userId` from authenticated session. No service-role credential in browser.
- ISO 8601 UTC timestamps. IDs are UUID strings. Nullable fields use `null`. Unknown fields should be rejected or ignored consistently by validation layer.
- Campus locations are named predefined public places, never raw GPS coordinates.

## Types
```ts
type StudyStyle = 'quiet' | 'collaborative' | 'flexible';
type Availability = 'available' | 'questions_only' | 'focused';
type RequestStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';
type AcademicYear = 'freshman' | 'sophomore' | 'junior' | 'senior' | 'graduate' | 'other';
type Profile = { id: string; displayName: string; universityId: string; major: string | null; academicYear: AcademicYear | null; courseIds: string[]; studyStyle: StudyStyle; preferredDurationMinutes: number; preferredGroupSize: number; visible: boolean };
type Location = { id: string; universityId: string; name: string; buildingCode: string; description: string | null };
type Course = { id: string; universityId: string; code: string; title: string };
type Checkin = { id: string; locationId: string; courseId: string; availability: Availability; studyStyle: StudyStyle; startedAt: string; expiresAt: string };
type DiscoveryMatch = { user: Pick<Profile, 'id' | 'displayName' | 'major' | 'academicYear' | 'studyStyle'>; location: Location; course: Course; availability: Availability; compatibilityScore: number; reasons: string[]; checkinExpiresAt: string; requestStatus: RequestStatus | null };
type StudyRequest = { id: string; senderId: string; recipientId: string; status: RequestStatus; createdAt: string; updatedAt: string };
```

## Endpoints
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/locations` | yes | Predefined locations for user's university |
| GET | `/api/courses` | yes | Courses for user's university; optional `q` filter |
| GET | `/api/profile` | yes | Current user's profile |
| PUT | `/api/profile` | yes | Create/update current user's profile |
| GET | `/api/checkin` | yes | Current active check-in or `null` |
| POST | `/api/checkin` | yes | Create/replace current user's check-in |
| DELETE | `/api/checkin` | yes | Check out current user |
| GET | `/api/discovery` | yes | Discover same-campus active matches |
| GET | `/api/requests` | yes | Current user's incoming/outgoing requests |
| POST | `/api/requests` | yes | Send a request |
| PATCH | `/api/requests/:id` | yes | Accept, decline or cancel a request |
| POST | `/api/blocks` | yes | Block another user |
| DELETE | `/api/blocks/:userId` | yes | Unblock a user |
| POST | `/api/reports` | yes | Report a user |

## Request/response examples
### GET `/api/locations`
```json
{"data":[{"id":"11111111-1111-4111-8111-111111111111","universityId":"22222222-2222-4222-8222-222222222222","name":"Perry-Castañeda Library","buildingCode":"PCL","description":"Public library study spaces"}],"meta":{"count":1}}
```

### GET `/api/courses?q=M408`
Returns `{ "data": Course[], "meta": { "count": number } }` with only courses from the caller's university.

### GET `/api/profile`
Returns `{ "data": Profile | null }`. Null indicates onboarding not completed.

### PUT `/api/profile`
Body: `{ "displayName": "Alex", "universityId": "uuid", "major": "Engineering", "academicYear": "freshman", "courseIds": ["uuid"], "studyStyle": "collaborative", "preferredDurationMinutes": 120, "preferredGroupSize": 2, "visible": true }`.
Response: `{ "data": Profile }`. University must be an allowed campus and course IDs must belong to it. Default `visible` is `false` unless user explicitly opts in.

### GET `/api/checkin`
Returns `{ "data": Checkin | null }`. Expired check-ins are treated as null.

### POST `/api/checkin`
Body: `{ "locationId": "uuid", "courseId": "uuid", "durationMinutes": 120, "availability": "available", "studyStyle": "collaborative" }`.
Validation: duration 30–180 minutes; course/location belong to profile university; user has completed profile and opted into visibility. Replaces any active check-in atomically. Response `201 { "data": Checkin }`.

### DELETE `/api/checkin`
Response `200 { "data": { "checkedOut": true } }` (idempotent).

### GET `/api/discovery?locationId=uuid&courseId=uuid`
Both filters optional. Response `{ "data": DiscoveryMatch[], "meta": { "count": number } }`. Only current, visible, available (`available` or `questions_only`) same-university check-ins; exclude self and either-direction blocks. Do not reveal precise location, detailed schedules, email, or contact information.

### GET `/api/requests?direction=incoming|outgoing|all`
Default `all`. Response `{ "data": StudyRequest[], "meta": { "count": number } }`. Only requests involving caller. No private contact details included.

### POST `/api/requests`
Body: `{ "recipientId": "uuid" }`. Recipient must be discoverable, on same campus, not blocked, and not caller. Duplicate pending request => 409 `CONFLICT`. Response `201 { "data": StudyRequest }`.

### PATCH `/api/requests/:id`
Body: `{ "status": "accepted" | "declined" | "cancelled" }`. Only recipient may accept/decline a pending request; only sender may cancel a pending request. Invalid transitions => 409. Response `{ "data": StudyRequest }`.

### POST `/api/blocks`
Body `{ "blockedUserId": "uuid" }`. Response `201 { "data": { "blockedUserId": "uuid" } }`. Excludes both directions from discovery/requests. Users cannot block themselves.

### DELETE `/api/blocks/:userId`
Response `{ "data": { "unblocked": true } }`.

### POST `/api/reports`
Body `{ "reportedUserId": "uuid", "reason": "harassment" | "spam" | "other", "details": "optional text" }`. Response `201 { "data": { "id": "uuid" } }`. Reports visible only to authorized moderators, not reported users.

## Matching v1 (deterministic)
Score 0–100, sum of:
- Same active course: 40 points; other shared enrolled course: 25; otherwise 0.
- Same study style or either `flexible`: 20 points; otherwise 0.
- Same location: 20 points; otherwise 0.
- Preferred study duration difference <=30 min: 10 points; <=60 min: 5; otherwise 0.
- Preferred group size difference <=1: 10 points; otherwise 0.
Return score and explanations ONLY for conditions actually met. Sort descending score, then stable user ID. This is a compatibility heuristic, not a predictive probability.

## Database schema (PostgreSQL / Supabase)
- `universities`: `id uuid pk`, `name text`, `slug text unique`.
- `locations`: `id uuid pk`, `university_id uuid fk`, `name text`, `building_code text`, `description text`, `is_active boolean`.
- `courses`: `id uuid pk`, `university_id uuid fk`, `code text`, `title text`, unique (`university_id`, `code`).
- `profiles`: `id uuid pk references auth.users(id)`, `university_id uuid fk`, `display_name text`, `major text nullable`, `academic_year text nullable`, `study_style text`, `preferred_duration_minutes integer`, `preferred_group_size integer`, `visible boolean default false`, `created_at timestamptz`, `updated_at timestamptz`.
- `profile_courses`: `user_id uuid fk`, `course_id uuid fk`, primary key (`user_id`, `course_id`).
- `checkins`: `id uuid pk`, `user_id uuid fk`, `location_id uuid fk`, `course_id uuid fk`, `availability text`, `study_style text`, `started_at timestamptz`, `expires_at timestamptz`, `checked_out_at timestamptz nullable`.
- `study_requests`: `id uuid pk`, `sender_id uuid fk`, `recipient_id uuid fk`, `status text`, `created_at timestamptz`, `updated_at timestamptz`.
- `blocks`: `blocker_id uuid fk`, `blocked_id uuid fk`, `created_at timestamptz`, primary key (`blocker_id`, `blocked_id`).
- `reports`: `id uuid pk`, `reporter_id uuid fk`, `reported_id uuid fk`, `reason text`, `details text`, `created_at timestamptz`.

**Constraints:** Enforce enumerated values and duration/group-size bounds; ensure one active check-in via transactional update or advisory lock, since time-dependent `now()` cannot safely be used in a partial-index predicate. Enforce one pending request per pair via partial unique index. Index checkins on (`location_id`, `expires_at`) and requests on participant IDs. Validate cross-university references server-side.

## RLS / privacy
Enable RLS on every user-linked table. Profiles editable only by owner. Profile course links writable only by owner. Check-ins writable only by owner. Requests readable by sender/recipient and mutable only under allowed transitions. Blocks writable/readable only by blocker. Reports insertable by reporter, not readable by ordinary users. Discovery should be served via a secure server route that checks session and only selects safe public fields; never expose full check-in tables to other users. Use minimal privileges and test RLS with two separate user sessions.

## Auth and operational details
Use `@supabase/ssr` for Next.js cookie-based sessions; verify user server-side with Supabase Auth, not client-supplied IDs. Supabase publishable/anon key may be client-side; service-role key is secret and must never be exposed or committed. Configure deployment redirect URLs for authentication. For initial MVP use manual refresh or short polling rather than Realtime; add subscriptions only after core flow passes tests.

## Contract change procedure
Cursor owns edits. Any agent requesting a change must specify affected endpoint/types, migration impact, UI impact and compatibility strategy. Freeze updated contract and sync it to both worktrees before dependent code changes.
