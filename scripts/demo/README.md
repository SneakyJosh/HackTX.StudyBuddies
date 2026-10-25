# Hackathon demo data

These scripts are operator tools for the StudySync dev project. They are not imported by the Next.js app, not part of deployment, and they do not change Matching v1 or the database migrations. Migration `0012` is already applied. Do not add or apply a migration `0013`.

The synthetic cohort is tagged `app_metadata.demoCohort = "hackathon-2026"`. Every demo address ends in `@studysync.example`. `demo-student-a@studysync.example` and `demo-student-b@studysync.example` are never created, signed in, or deleted by these scripts.

## What a future seed writes

Twenty fictional students. The interactive sign-ins are:

| Name | Email | What to show |
| --- | --- | --- |
| Avery Chen | `demo-host@studysync.example` | PCL, CS 314, available. Home streak of 6 days. |
| Riley Okonkwo | `demo-guest@studysync.example` | EER, BIO 311C, available. Joins groups and has an invitation. |
| Sam Patel | `demo-timer@studysync.example` | PMA, focused. Hidden from Connect. Personal finish has no chemistry question. |

Eight live check-ins: Avery and Jordan at PCL, Riley at EER, Priya at UTC, Marcus at WCP with questions only, Hana at GDC, Noah at Littlefield Patio Cafe, and Sam focused at PMA. Jonah Blake is visible to nobody and has no check-in.

Twelve accepted study connections and two pending requests. Sofia's request to Avery stays pending. Riley's request to Noah stays pending. Marcus is discoverable but is not Avery's friend, so he appears only in suggestions.

Six groups: Lina's solo diagram review at PCL, Jordan's open CS 314 problem set at EER, Priya's open calc review at the Texas Union, Maya's invite-only BIO writeup at GDC for Riley, Chris's open outline at Up and Atom, and Quinn's PCL sprint that is already in progress with Avery and Riley.

Twelve completed attendance rows. Eight have private study-time and place ratings. Four of those also have chemistry ratings. Four attendance rows have no ratings. No personal check-in history is backdated.

The scripts use the existing course and location ids. Littlefield Residence Hall is not bookable and is never used for a check-in or a group. No catalog row is inserted or updated.

## How access is kept intact

Auth users are created with the Supabase Auth admin API. The password comes from `DEMO_PASSWORD` in the environment and is never written to source, logs, or the browser app. Each account is confirmed at creation so the normal password sign-in works. The admin call sets only the demo cohort tag.

Profiles, check-ins, study requests, accepts, future groups, and ratings then use that account's real session and the existing functions: `save_profile`, `replace_checkin`, `send_study_request`, `create_study_session`, and `submit_study_ratings`. Accepting a request is an update from the recipient's own session. The database trigger still requires `auth.uid()` to be the recipient. These scripts do not change session claims, table policies, or grants.

Completed history and the already-started PCL sprint cannot go through `create_study_session`, because that function rejects a start time in the past. The service-role client inserts those rows only after the same booking rules have been checked, and the commitment exclusion constraint still applies. Ratings for that history are submitted by each rater's own session, so a student only writes ratings as themselves.

Cleanup deletes the tagged Auth users with `auth.admin.deleteUser` after their demo rows are gone. Deleting the Auth user cascades the profile. It never deletes universities, courses, locations, or campus places.

## Commands

The reviewed copy of this folder is committed in the app repo. A matching copy belongs in the linked backend checkout, which is where the commands below run, because that checkout has `supabase/.temp/project-ref`. Run them only after a separate approval. Do not run them as part of app deployment. Set the variables in the shell for that window. Do not put them in a committed file.

```powershell
cd C:\Users\joshu\Documents\hackathon-backend
$env:SUPABASE_URL = "https://pmzxxdbdvqdnlmecsgcn.supabase.co"
$env:SUPABASE_ANON_KEY = "<anon key>"
$env:SUPABASE_SERVICE_ROLE_KEY = "<service-role key>"
$env:DEMO_PASSWORD = "<12 or more characters, no spaces>"
node scripts/demo/create-users.mjs --confirm-project=pmzxxdbdvqdnlmecsgcn
node scripts/demo/seed.mjs --confirm-project=pmzxxdbdvqdnlmecsgcn
node scripts/demo/refresh-live.mjs --confirm-project=pmzxxdbdvqdnlmecsgcn
node scripts/demo/cleanup.mjs --confirm-project=pmzxxdbdvqdnlmecsgcn
```

Every command refuses to continue unless all of these match: the confirm flag, `supabase/.temp/project-ref`, and `SUPABASE_URL`. A wrong flag, a different linked project, or a missing password stops the script before any write.

`create-users` only creates missing cohort accounts. If an email already belongs to someone outside the cohort, it stops. `seed` stops if any demo profile already exists. `refresh-live` only calls `replace_checkin` for the eight demo students who have a planned check-in. `cleanup` reads every related row first. If the demo tag is missing, on more than 25 users, on a preserved test account, or on any address outside this cohort, it deletes nothing. If any demo row points at someone outside the cohort, it deletes nothing.

Use the same `DEMO_PASSWORD` for create, seed, and refresh. Cleanup does not need the password. If seed stops halfway, do not run seed again. Review the error and run cleanup, then create and seed from the start.

## Four-minute walkthrough

Sign in as Avery about an hour after seeding, and run `refresh-live` in the few minutes before you start.

1. Home shows Avery checked in at PCL for CS 314 and a 6-day streak. The streak comes from finished group attendance through yesterday in America/Chicago.
2. Connect shows Friends studying now: Jordan, Riley, Priya, Hana, and Noah. Suggestions rank Jordan at 100, Riley in the middle at 65, and Marcus at 80 even though Marcus is not a friend. Noah is at the cafe and scores 0. Sam and Jonah do not appear.
3. Requests shows Sofia's pending request. Accept it on stage. Leave Riley's outgoing request to Noah pending.
4. Sessions shows Quinn's in-progress PCL sprint. Finish it as Avery and give Riley a chemistry rating. That rating stays on Avery's History. Open Jordan's CS 314 problem set, Maya's invite-only BIO writeup, and Chris's Up and Atom outline from the group lists.
5. Sign in as Riley. Riley can join the open EER problem set. The BIO writeup is an invitation, not an open seat. Finish the sprint as Riley and confirm Avery's chemistry answer is not on Riley's History.
6. Sign in as Sam. Sam's focused PMA check-in does not put Sam on Connect. Finishing that personal timer asks about study time and the place only.
7. Map shows the bookable buildings and the three cafes. Welch Hall and Up and Atom stay on the same geographic point but are different locations, so they do not count as the same place for matching. The quiet filter still means PCL floors 3, 4, and 6. Study here opens a check-in with that location selected.

## Checks that do not touch the database

From the app repo:

```powershell
node --test scripts/demo/cohort.test.mjs
```

That test checks the cohort shape, Matching v1 scores, Focused and hidden exclusion, private rating shape, invitation commitments, the project-confirmation guard, and that the scripts do not contain a password, a key, a policy change, or an app import.

## Limits

The PCL sprint is valid for the finish flow for a little more than half an hour after seeding, and the finish window stays open for two hours after it ends. Refresh does not move that sprint. If it has expired, run cleanup and seed again. Future groups are booked on the next one or two Chicago days, so seed on the day of the demo. Personal check-ins cannot be backdated, so older streak days are group attendance. Cleanup cannot identify demo rows after the Auth users are already gone, and it will not guess. These scripts do not reset the project and do not merge or deploy anything.
