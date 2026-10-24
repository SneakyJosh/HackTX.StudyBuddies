# StudySync — Product Requirements Document

## Vision
StudySync connects university students for in-person studying through voluntary, temporary campus-location check-ins and explainable study-partner matching. The initial campus is UT Austin; campus locations are configured as predefined public study spaces.

## Audience and outcome
University students, especially those in introductory courses or seeking accountability and collaboration. The hackathon success criterion is a polished, functioning end-to-end flow: register/sign in → complete profile → check in → discover matching students → send request → recipient accepts → view connection.

## MVP scope (P0)
1. Email sign-up/sign-in through Supabase Auth.
2. Editable profile: display name, university, major, year, courses, study style (quiet/collaborative), preferred duration, preferred group size, visibility.
3. Select a predefined public UT Austin location (PCL Library, EER, Texas Union).
4. Voluntary check-in with course, duration, availability and explicit checkout; automatically expire check-ins.
5. Discovery feed of active, visible, available students on the same campus, with building-level location only.
6. Explainable weighted matching, primarily course overlap, study style, duration and same location.
7. Send, accept and decline study requests; both users must consent before coordination details become available.
8. Responsive mobile-first interface, including empty/loading/error states.
9. Block/report controls; blocked users must not appear in discovery or requests.

## Deferred (P1/P2)
P1: predefined-location map, temporary groups, messaging, filters, richer availability states. P2: AI matching, calendar integration, social graph, gamification. Do not implement until P0 works end to end.

## Key user journeys
### New student
Sign up → create profile with at least one course → choose location → check in for a bounded duration → see matching student cards and match explanations.
### Partner request
From a discoverable card → send request → recipient sees pending request → accept/decline → both see connected state. Repeated requests must not duplicate pending requests.
### Privacy
User can check out, hide profile, or block another user. Expired check-ins vanish from discovery without manual intervention.

## Functional requirements and acceptance criteria
| ID | Requirement | Acceptance criterion |
|---|---|---|
| FR-01 | Auth | Signed-out users cannot call private APIs; signed-in users can complete onboarding. |
| FR-02 | Profiles | User can create/update only their own profile; public discovery returns limited fields. |
| FR-03 | Check-in | User selects a known location, course and 30–180 minute duration; only one active check-in per user. |
| FR-04 | Expiration | API filters expired check-ins by server time; expired users are not discoverable. |
| FR-05 | Discovery | Same-campus active, visible users are listed, excluding self and blocked users. |
| FR-06 | Matching | Every result has a deterministic score from 0–100 and at least one truthful explanation. |
| FR-07 | Requests | Request sender/recipient can see appropriate state; only recipient can accept/decline. |
| FR-08 | Safety | No exact GPS or private schedule exposed; check-in location is a named public campus space. |
| FR-09 | UX | Mobile and desktop flows work, with accessible labels and actionable errors. |
| FR-10 | Demo | Two test accounts demonstrate request and acceptance end to end. |

## Nonfunctional requirements
- TypeScript strict types, server-side input validation, Supabase Row Level Security, no service-role key in client bundles.
- Accessible controls and keyboard navigation; loading, error, and empty states.
- Graceful behavior when no students are available; seeded/demo accounts only with clear labeling and no real student information.
- Do not collect GPS or publish detailed schedules. Default discovery visibility is opt-in.

## Design
Minimal mobile-first social discovery feed; profile cards with course badges, availability, named building, compatibility percentage and explanation. Tabs: Discover, Check-in, Requests, Profile. Map/Groups/Messages can be disabled placeholders until implemented.

## Demo checklist
1. Sign in as Student A, set course and preferences, check in at PCL.
2. Sign in as Student B, check in with overlapping course.
3. Show B in A's feed with explainable score.
4. A requests; B accepts; both see connected status.
5. A checks out; A disappears from B's discovery.
6. B blocks A; requests and discovery respect the block.

## Out of scope / assumptions
Initial UT Austin location list is curated, not live campus occupancy data. 'Nearby' initially means same predefined location first, then other locations on the same campus; do not claim GPS distance. No real-time subscriptions required for first working release; polling or refresh is acceptable. Do not promise guaranteed study matches.
