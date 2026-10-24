# StudySync — Development Roadmap and Ownership

## Worktree rules
- `hackathon-ai` / `master`: Cursor integration and shared contracts.
- `hackathon-frontend` / `agent/frontend`: Codex UI only.
- `hackathon-backend` / `agent/backend`: Muse Wonder API, schema, and data logic only.
- The API contract is frozen. Agents must not edit `docs/API_CONTRACT.md` or `src/types/api.ts`. Propose changes to Cursor instead.
- Never commit `.env*`, API keys, database passwords, or personal student data. `.env.example` is the only env file that may be committed, and it contains placeholder names.
- Do not merge two branches blindly. Run tests and resolve contract differences.
- Do not overwrite uncommitted work in another worktree. If a sync is not a fast-forward or the tree is dirty, stop and report it.

## File ownership
- Codex: `src/components/**`, `src/app/(app)/**`, `src/lib/api-client.ts`, `src/fixtures/**`.
- Muse Wonder: `src/app/api/**`, `src/server/**`, `supabase/**`, `middleware.ts`.
- Cursor: `src/types/api.ts`, `docs/**`, `.env.example`.
- Both agents import contract types from `src/types/api.ts`. Neither agent forks a second type module or edits `middleware.ts` outside Muse Wonder's ownership.

## Milestone 0 — Contract freeze (Cursor)
- [x] Review PRD and API contract, including the approved onboarding, request, block, validation, and matching clarifications.
- [x] Commit the frozen contract, PRD, shared types, and `.env.example` on `master`, then fast-forward `agent/frontend` and `agent/backend` before feature coding.
- [ ] Create the Supabase project. Record only the public URL and anon/publishable key in the local environment. Keep the service-role key server-only. Disable email confirmation, or preconfirm the two demo accounts.
- [x] Define labeled demo accounts, campus locations, and course-catalog seed ids in the contract. Do not use real student data or commit passwords.
- [x] Agree enums, route names, error codes, sorting, privacy fields, and cookie auth.

## Milestone 1 — Parallel implementation
### Codex — frontend (owner: `agent/frontend`)
- [ ] F1: Build the responsive shell, navigation, and visual system.
- [ ] F2: Implement sign-in, campus selection, and profile forms. Load `GET /api/universities` before a profile exists. Default visibility off.
- [ ] F3: Build the check-in form for profile courses, location, duration 30–180, and availability. State on the form that Focused hides the student from discovery.
- [ ] F4: Build the discovery feed with the server score, canonical reason chips, and loading, empty, and error states. Render the score the API returns. Do not re-sort with a stronger location rule.
- [ ] F5: Build request send, accept, decline, and cancel UI from `StudyRequest`, including the counterpart summary. Treat a null course or location as checked out.
- [ ] F6: Add block list, block, and unblock UI. Test responsive layouts and run lint/build.
**First task:** F1, plus a typed client in `src/lib/api-client.ts` and mock fixtures that use `src/types/api.ts` and the demo seed ids. Do not create backend routes, middleware, or database schema.

### Muse Wonder — backend (owner: `agent/backend`)
- [ ] B1: Write SQL migrations for universities, locations, profiles, courses, profile_courses, checkins, requests, blocks, and reports. Enforce the contract checks, partial unique indexes, and RLS.
- [ ] B2: Implement `GET /api/universities`, locations, courses, and the profile read/write routes, including the pre-profile campus rule.
- [ ] B3: Implement check-in and checkout with expiry, visibility, profile-course validation, and one-active-check-in enforcement.
- [ ] B4: Implement discovery and the weighted score. Apply the 10-point same-location ordering bonus without adding it to `compatibilityScore`.
- [ ] B5: Implement the request lifecycle, `GET /api/blocks`, and block side effects. Cancel pending requests both ways and hide blocked users from discovery and request lists.
- [ ] B6: Add route tests for auth, expiry, privacy, validation, sorting, and request transitions.
**First task:** B1 schema/RLS, seed the contract ids, and read-only `GET /api/universities`, `GET /api/locations`, and `GET /api/courses`. Do not modify UI components or `src/types/api.ts`.

### Cursor — integrator (owner: `master`)
- [x] C1: Add `.env.example` with placeholder names. Pin Supabase packages when backend implementation starts. The freeze adds no runtime dependency.
- [ ] C2: Confirm frontend fixtures match real backend responses.
- [ ] C3: Review migrations and privacy/RLS policies before applying them.
- [ ] C4: Merge tested backend and frontend commits into master, one at a time.
- [ ] C5: Execute the two-user demo and fix integration defects.
- [ ] C6: Deploy to Vercel and verify auth redirect URLs and environment secrets.

## Integration checkpoints
1. **Contract frozen** — `master`, `agent/frontend`, and `agent/backend` contain the same frozen docs and `src/types/api.ts`.
2. **Schema + UI skeleton** — schema reviewed; frontend navigable with mocks.
3. **Profiles + check-in** — live API works with one signed-in demo account.
4. **Discovery + matching** — two accounts show the contract score, canonical reasons, and close-score location ordering.
5. **Requests + safety** — acceptance, expiry, block cancellation, and hidden blocked users are tested.
6. **Demo-ready** — deployment, labeled seed accounts, and responsive QA are complete.

## Merge workflow
From the main worktree, inspect each branch. Then `git merge --no-ff agent/backend` and test, followed by `git merge --no-ff agent/frontend` and test. Resolve conflicts manually. Push to GitHub only after a secrets scan and tests. Agent branches can continue after main syncs back to them.

Expected collision points are `package.json`, `package-lock.json`, and any file outside the ownership map. Do not let both agents create `middleware.ts`.

## Definition of done
A feature is done only when it follows the frozen contract and `src/types/api.ts`, handles unauthenticated, error, and empty states, respects privacy, passes the relevant checks, and has a reviewable commit.
