# StudySync — Development Roadmap and Ownership

## Worktree rules
- `hackathon-ai` / `master`: Cursor integration and shared contracts.
- `hackathon-frontend` / `agent/frontend`: Codex UI only.
- `hackathon-backend` / `agent/backend`: Muse Wonder API, schema and data logic only.
- Agents must not independently edit `docs/API_CONTRACT.md` after the contract is frozen. Propose changes to Cursor instead.
- Never commit `.env*`, API keys, database passwords or personal student data. Commit only `.env.example` with placeholder names.
- Do not merge two branches blindly: run tests and resolve contract differences.

## Milestone 0 — Contract freeze (Cursor; BLOCKING)
- [ ] Review PRD and API contract with both agents.
- [ ] Create `docs/` in main branch; commit docs; merge or cherry-pick the docs commit into each agent branch before coding.
- [ ] Create Supabase project; record only public URL and anon/publishable key in local environment. Keep secret/service-role key server-only.
- [ ] Define test accounts and demo locations. Do not use real student data.
- [ ] Agree on all enums, route names, error shape and auth strategy.

## Milestone 1 — Parallel implementation
### Codex — frontend (owner: `agent/frontend`)
- [ ] F1: Build responsive application shell, navigation and visual system.
- [ ] F2: Implement sign-in/onboarding and editable profile forms against contract.
- [ ] F3: Build check-in form with location/course/duration/availability.
- [ ] F4: Build discovery feed with match scores, explanation chips, loading/empty/error states.
- [ ] F5: Build request send/accept/decline UI and status indicators.
- [ ] F6: Test responsive layouts and run lint/build.
**First task:** F1 plus typed client API interfaces and mock fixtures matching API_CONTRACT.md. Do not create backend routes or change database schema.

### Muse Wonder — backend (owner: `agent/backend`)
- [ ] B1: Write SQL migrations: universities, locations, profiles, courses, profile_courses, checkins, requests, blocks, reports; enforce RLS.
- [ ] B2: Implement authenticated profile and location/course endpoints.
- [ ] B3: Implement check-in/checkout with expiry, one-active-check-in enforcement.
- [ ] B4: Implement discovery query and deterministic weighted matching.
- [ ] B5: Implement request lifecycle with authorization and block enforcement.
- [ ] B6: Add route tests for auth, expiry, privacy, validation, and request transitions.
**First task:** B1 schema/RLS and read-only `GET /api/locations` and `GET /api/courses` endpoints per contract. Do not modify UI components.

### Cursor — integrator (owner: `master`)
- [ ] C1: Set up environment examples and dependency versions.
- [ ] C2: Confirm frontend fixtures match real backend responses.
- [ ] C3: Review migrations and privacy/RLS policies before applying.
- [ ] C4: Merge tested backend and frontend commits into master (one at a time).
- [ ] C5: Execute two-user end-to-end demo, fix integration defects.
- [ ] C6: Deploy to Vercel; verify auth redirect URLs and environment secrets.

## Integration checkpoints
1. **Contract frozen** — both branches share identical docs.
2. **Schema + UI skeleton** — schema reviewed; frontend navigable with mocks.
3. **Profiles + check-in** — live API works with signed-in account.
4. **Discovery + matching** — two accounts show correct compatibility.
5. **Requests + safety** — acceptance, expiry and blocking tested.
6. **Demo-ready** — deployment, seed/demo strategy and responsive QA complete.

## Merge workflow
From main worktree, inspect each branch, then `git merge --no-ff agent/backend` and test; `git merge --no-ff agent/frontend` and test. Resolve conflicts manually. Push to GitHub only after secrets scan and tests. Agent branches can continue after main syncs back to them.

## Definition of done
A feature is done only when it follows the contract, handles unauthenticated/error/empty states, respects privacy, passes relevant checks, and has a reviewable commit.
