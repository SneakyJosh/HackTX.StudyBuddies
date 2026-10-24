# StudySync — Product Requirements Document

## Vision
StudySync connects university students for in-person studying through voluntary, temporary campus-location check-ins and explainable study-partner matching. The initial campus is UT Austin; campus locations are configured as predefined public study spaces.

## Audience and outcome
University students, especially those in introductory courses or seeking accountability and collaboration. The hackathon success criterion is a polished, functioning end-to-end flow: register/sign in → complete profile → check in → discover matching students → send request → recipient accepts → view connection.

## MVP scope (P0)
1. Email sign-up/sign-in through Supabase Auth.
2. Editable profile: display name, university, major, year, one to eight courses, study style (`quiet`, `collaborative`, or `flexible`), preferred duration, preferred group size, and visibility. Visibility defaults off until the student opts in.
3. Select a predefined public UT Austin location (PCL Library, EER, Texas Union).
4. Voluntary check-in with one of the profile courses, a 30–180 minute duration, availability (`available`, `questions_only`, or `focused`), and explicit checkout. Check-ins expire automatically. `focused` is stored for the student and hidden from discovery. The check-in screen says that explicitly.
5. Discovery feed of active, visible students on the same campus whose availability is `available` or `questions_only`, with building-level location only.
6. Explainable weighted matching from 0 to 100, using the shared active course, other enrolled courses, check-in study style, profile preferred duration, same location, and preferred group size.
7. Send, accept, and decline study requests. The recipient sees the other student's public name, major, year, profile study style, and current building and course when that student is still checked in. Both users must consent before that coordination context is treated as a connection.
8. Responsive mobile-first interface, including empty, loading, and error states.
9. Block and report controls. A block cancels pending requests in both directions. Blocked users disappear from discovery and from the request list.

## Deferred (P1/P2)
P1: predefined-location map, temporary groups, messaging, filters, richer availability states. P2: AI matching, calendar integration, social graph, gamification. Do not implement until P0 works end to end.

## Key user journeys
### New student
Sign up → load the campus list before a profile exists → create a profile with at least one course → choose a location → opt into visibility → check in for a bounded duration → see matching student cards and the canonical match explanations.
### Partner request
From a discoverable card → send request → recipient sees the pending request with the sender's public summary → accept or decline → both see the connected state. A second pending request for the same pair is rejected. After a decline or cancellation, either student may send a new request. An accepted pair cannot open a second request.
### Privacy
The student can check out, hide the profile, or block another student. Hiding a profile removes that student from discovery and does not by itself check them out. Expired check-ins vanish from discovery without manual intervention. A block cancels pending requests both ways and hides the other student from discovery and the request list.

## Functional requirements and acceptance criteria
| ID | Requirement | Acceptance criterion |
|---|---|---|
| FR-01 | Auth | Signed-out users cannot call private APIs. A signed-in user with no profile can load the university, location, and course lists and finish onboarding. |
| FR-02 | Profiles | A user can create and update only their own profile. Public discovery returns the limited fields in the API contract. `visible` defaults to false. |
| FR-03 | Check-in | The user selects a known location, one of their profile courses, and a 30–180 minute duration. Only one active check-in exists per user. Check-in requires visibility to be on. `focused` check-ins are visible to the owner and omitted from discovery. |
| FR-04 | Expiration | The API filters expired check-ins by server time. Expired users are not discoverable. |
| FR-05 | Discovery | Same-campus, active, visible users with `available` or `questions_only` are listed. The feed excludes self, `focused` check-ins, and either-direction blocks. Location is the public building only. |
| FR-06 | Matching | Every result has a deterministic score from 0–100. Each scoring rule that actually matched contributes its canonical explanation. A score of 0 has no filler explanation. Ordering uses the score, then a 10-point same-location preference, then user id. A student whose score is 15 or more points higher still ranks above a same-building student. |
| FR-07 | Requests | Sender and recipient see the public counterpart summary and the appropriate state. Only the recipient can accept or decline. Only the sender can cancel a pending request. Request course and building reflect the counterpart's current check-in and are empty after checkout. |
| FR-08 | Safety | No exact GPS, room, desk, email, or private schedule is exposed. Check-in location is a named public campus space. |
| FR-09 | UX | Mobile and desktop flows work, with accessible labels and actionable errors. The check-in form states that Focused hides the student from discovery. |
| FR-10 | Demo | Labeled accounts Demo Student A and Demo Student B demonstrate request and acceptance end to end. No real student data is used. |

## Nonfunctional requirements
- TypeScript strict types from `src/types/api.ts`, server-side input validation, Supabase Row Level Security, and no service-role key in client bundles.
- Accessible controls and keyboard navigation, plus loading, error, and empty states.
- Graceful behavior when no students are available. Demo accounts are clearly labeled and contain no real student information.
- Do not collect GPS or publish detailed schedules. Default discovery visibility is opt-in.

## Design
Minimal mobile-first social discovery feed. Profile cards show course badges, availability, named building, compatibility percentage, and canonical explanation chips. Tabs: Discover, Check-in, Requests, Profile. Map, Groups, and Messages can be disabled placeholders until implemented.

## Demo checklist
1. Sign in as Demo Student A, set a course and preferences, opt in, and check in at PCL.
2. Sign in as Demo Student B and check in with an overlapping course.
3. Show B in A's feed with the contract score and only the explanations for rules that matched.
4. A requests. B sees A's public summary and accepts. Both see connected status.
5. A checks out. A disappears from B's discovery.
6. B blocks A. Pending requests are cancelled, and A disappears from B's discovery and request list.

## Out of scope / assumptions
The initial UT Austin location list is curated, not live campus occupancy data. Ranking uses the weighted compatibility score. When scores are within 10 points, the same predefined building ranks higher. A clearly stronger score still wins across buildings. Do not claim GPS distance. No real-time subscriptions are required for the first working release. Polling or refresh is acceptable. Do not promise guaranteed study matches. The authoritative request and response shapes are in `docs/API_CONTRACT.md`.
