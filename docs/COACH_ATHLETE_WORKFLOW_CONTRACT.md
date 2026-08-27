# Track Training App - Coach-Athlete Workflow Production Contract

**Status:** Draft for product approval before database implementation  
**Target repository:** `aprescod12/track-training-app`  
**Target branch:** `main`  
**Phase:** Production Roadmap Phase 3 / proposed Migration D family  
**Depends on:** Team Identity Foundation (Migration A), Coaching and Training Access (Migration B), Trust Layer (Migration C)

---

## 1. Purpose

This contract defines the production data model, authorization boundaries, workflow rules, and implementation sequence for the Track Training App's coach-to-athlete training workflow.

The production roadmap requires coaches to create reusable workout templates, assign them to a full team, event group, selected athletes, or an individual, and allow athletes to report an assigned session as completed, partially completed, modified, skipped, or unavailable because of injury or illness. Coaches must be able to review athlete submissions and notes. The roadmap's Phase 3 also calls for a coach dashboard and notifications.

The earlier Team / Organization / Coach-Athlete schema contract intentionally deferred coach-authored training plans, assigned workouts / workout prescriptions, and team calendars until the A-C identity, coaching, and trust layers were established. Those foundations now exist, so this contract extends them rather than replacing them.

---

## 2. Existing Production Baseline

The current production schema already provides the authorization primitives this workflow must reuse:

- `teams`
- `team_memberships`
- `team_groups`
- `team_group_memberships`
- `coach_athlete_assignments`
- nullable `workouts.team_id`
- `workout_entries`
- `entry_sets`
- `private.is_team_coach(...)`
- `private.is_team_athlete(...)`
- `private.can_coach_view_athlete(...)`
- `private.can_read_workout(...)`
- `team_workout_summary_v`

The current application already has:

- athlete-authored workout logging in `app/modal.tsx`
- a personal calendar in `app/(tabs)/calendar.tsx`
- personal `calendar_events`
- existing workout/history/PR/achievement behavior that must remain backward compatible

Migration D must build on these surfaces without weakening any existing RLS rule.

---

## 3. Permanent Authorization Principles

These rules are non-negotiable across the entire workflow:

1. **Team membership does not grant training access.**
2. **Team admin or owner status alone does not grant athlete training access.**
3. **Verification or organization affiliation does not grant training access.**
4. **Friendship remains independent from team and coaching relationships.**
5. **A coach may target, view, or review an athlete only when an active explicit `coach_athlete_assignments` relationship authorizes that coach-athlete pair in the same team.**
6. **An assigned workout never expands a coach's access to the athlete's unrelated personal workouts.**
7. **Coaches remain unable to edit athlete-owned `workouts`, `workout_entries`, or `entry_sets`.**
8. **Coach review writes are limited to dedicated review metadata in the assignment-submission workflow.**
9. **No workflow action may auto-create a friendship.**
10. **Historical assignments and submissions are retained; normal lifecycle changes use status transitions rather than destructive deletion.**
11. **Sensitive athlete submission information, including injury/illness availability and athlete notes, is visible only to the athlete and currently authorized coaches. Team management authority alone is insufficient.**

---

## 4. Product Model: Prescription Is Not Performance

The system must keep a strict distinction between what a coach prescribed and what an athlete actually performed.

Example:

- Coach prescription: `4 x 60m @ 95%, 5 min recovery`
- Athlete performance: `3 x 60m; stopped because hamstring felt tight`

The prescription belongs to the team workflow tables. The actual performance remains an athlete-owned row in `workouts` with child `workout_entries` / `entry_sets`.

An assignment submission may link the prescribed session to the athlete's actual team-context workout, but it must never overwrite the prescription or allow a coach to mutate the athlete's logged performance.

---

## 5. Core Table: `workout_templates`

Reusable coach-authored session metadata.

Recommended fields:

- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `team_id UUID NOT NULL`
- `created_by_membership_id UUID NOT NULL`
- `title TEXT NOT NULL`
- `workout_type TEXT NOT NULL`
- `description TEXT NULL`
- `is_active BOOLEAN NOT NULL DEFAULT true`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- `archived_at TIMESTAMPTZ NULL`

Rules:

- `team_id + created_by_membership_id` must reference a membership on the same team.
- The creator must be an active `member_type = 'coach'` membership at creation time.
- `workout_type` should remain compatible with the current workout model (`track` / `lift`) unless a separate future schema change deliberately expands the app's workout types.
- Ordinary athletes do not receive access to the team's entire template library merely because they belong to the team.
- Templates are archived rather than deleted once used by an assignment.

---

## 6. Core Table: `workout_template_entries`

Structured prescription rows inside a reusable template.

Recommended fields:

- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `template_id UUID NOT NULL`
- `sort_order INTEGER NOT NULL`
- `exercise_id UUID NULL`
- `exercise_name_snapshot TEXT NOT NULL`
- `label TEXT NULL`
- `sets INTEGER NULL`
- `reps INTEGER NULL`
- `distance_m NUMERIC NULL`
- `target_time_text TEXT NULL`
- `target_weight NUMERIC NULL`
- `recovery_seconds INTEGER NULL`
- `intensity_text TEXT NULL`
- `notes TEXT NULL`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`

Rules:

- `sort_order` must be unique within a template.
- Numeric prescription fields must reject negative values.
- `exercise_id` may reference the existing `exercises` catalog, while `exercise_name_snapshot` preserves the intended display text if catalog metadata changes later.
- This first workflow contract does not require a per-rep prescription table. If coaching use proves that different set-by-set targets are essential, a later additive extension may introduce template-set rows without changing the assignment authorization model.

---

## 7. Core Table: `workout_assignments`

One scheduled coach prescription distributed to athletes.

Recommended fields:

- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `team_id UUID NOT NULL`
- `template_id UUID NOT NULL`
- `assigned_by_membership_id UUID NOT NULL`
- `scheduled_date DATE NOT NULL`
- `due_at TIMESTAMPTZ NULL`
- `title_snapshot TEXT NOT NULL`
- `workout_type_snapshot TEXT NOT NULL`
- `instructions TEXT NULL`
- `status TEXT NOT NULL DEFAULT 'scheduled'`
- `assigned_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- `closed_at TIMESTAMPTZ NULL`
- `cancelled_at TIMESTAMPTZ NULL`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`

Status values:

- `scheduled`
- `closed`
- `cancelled`

Rules:

- The assigning membership must be an active coach on the same team.
- Assignment creation is atomic: if any selected target is invalid or unauthorized, the entire assignment fails.
- Existing assignments are not rewritten when a template is later edited.
- Cancellation does not delete recipients or submissions already recorded.
- Closed or cancelled assignments cannot accept new athlete submissions unless a future explicit reopen workflow is added.

---

## 8. Core Table: `workout_assignment_entries`

Immutable prescription snapshot copied from `workout_template_entries` when an assignment is created.

Recommended fields mirror the template-entry prescription fields:

- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `assignment_id UUID NOT NULL`
- `sort_order INTEGER NOT NULL`
- `exercise_id UUID NULL`
- `exercise_name_snapshot TEXT NOT NULL`
- `label TEXT NULL`
- `sets INTEGER NULL`
- `reps INTEGER NULL`
- `distance_m NUMERIC NULL`
- `target_time_text TEXT NULL`
- `target_weight NUMERIC NULL`
- `recovery_seconds INTEGER NULL`
- `intensity_text TEXT NULL`
- `notes TEXT NULL`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`

Reason for snapshotting:

A coach may improve or reuse a template later, but an athlete's historical assignment must continue to show exactly what was prescribed at assignment time.

Client code must not directly edit assignment snapshot rows.

---

## 9. Core Table: `workout_assignment_targets`

Records the coach's original audience selection for audit and UI history.

Recommended fields:

- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `assignment_id UUID NOT NULL`
- `team_id UUID NOT NULL`
- `target_type TEXT NOT NULL`
- `group_id UUID NULL`
- `athlete_membership_id UUID NULL`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`

Target types:

- `team`
- `group`
- `athlete`

Exactly-one-target rules:

- `team`: both `group_id` and `athlete_membership_id` are null
- `group`: `group_id` is non-null and `athlete_membership_id` is null
- `athlete`: `athlete_membership_id` is non-null and `group_id` is null

All referenced groups/memberships must belong to the same team as the assignment.

Multiple athlete targets support "selected athletes". Duplicate recipients produced by overlapping groups or explicit athlete selections are deduplicated during materialization.

---

## 10. Core Table: `workout_assignment_recipients`

Materialized per-athlete assignment rows. This is the stable historical answer to **who was assigned this workout at assignment time**.

Recommended fields:

- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `assignment_id UUID NOT NULL`
- `team_id UUID NOT NULL`
- `athlete_membership_id UUID NOT NULL`
- `assigned_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- `first_viewed_at TIMESTAMPTZ NULL`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`

Constraints:

- unique `(assignment_id, athlete_membership_id)`
- athlete membership must belong to the same team
- recipient membership must have `member_type = 'athlete'`

### Why recipients are materialized

Group membership is mutable. If an athlete moves from Sprints to Jumps tomorrow, that must not rewrite who received Monday's workout. The original target record captures the audience intent; recipient rows preserve the exact resolved athlete list.

### Authorization at materialization time

For every recipient, the assigning coach must have an active explicit `coach_athlete_assignments` row for that athlete.

For a full-team or group assignment, the RPC expands the requested scope first and then validates every resulting athlete. If any athlete is outside the assigning coach's authorization, the request fails atomically rather than silently creating a partial assignment.

---

## 11. Core Table: `workout_assignment_submissions`

The athlete's response to one assignment recipient row.

Recommended fields:

- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `assignment_recipient_id UUID NOT NULL UNIQUE`
- `team_id UUID NOT NULL`
- `athlete_membership_id UUID NOT NULL`
- `workout_id UUID NULL`
- `completion_status TEXT NOT NULL`
- `unavailable_reason TEXT NULL`
- `athlete_note TEXT NULL`
- `submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- `reviewed_at TIMESTAMPTZ NULL`
- `reviewed_by_membership_id UUID NULL`
- `coach_note TEXT NULL`

Completion status values required by the roadmap:

- `completed`
- `partially_completed`
- `modified`
- `skipped`
- `unavailable`

Unavailable reason values for the initial product:

- `injury`
- `illness`
- `other`

Rules:

- `unavailable_reason` must be non-null only when `completion_status = 'unavailable'`.
- `completed`, `partially_completed`, and `modified` require a linked athlete-owned `workout_id`.
- `skipped` and `unavailable` must not require a workout and normally have `workout_id = NULL`.
- A linked workout must belong to the same athlete and the same `team_id` as the assignment.
- Linking a workout to an assignment does not change workout ownership.
- `athlete_note`, `completion_status`, `unavailable_reason`, and `workout_id` are athlete-controlled submission data.
- `reviewed_at`, `reviewed_by_membership_id`, and `coach_note` are coach-controlled review data.
- A coach may never use the submission workflow to mutate the linked workout itself.

### Athlete revisions

An athlete may revise their submission while the assignment is `scheduled`. A substantive athlete revision clears prior coach review metadata so the revised submission must be reviewed again.

Once the assignment is `closed` or `cancelled`, normal client submission mutation stops.

---

## 12. Coach Review Authorization

A coach may review a recipient/submission only when all of the following are true at review time:

1. caller is authenticated;
2. caller has an active coach membership on the assignment team;
3. recipient is the athlete in question;
4. an active `coach_athlete_assignments` row explicitly connects that coach membership and athlete membership on the same team.

The reviewing coach does not have to be the original assigning coach. This supports legitimate staff handoff while preserving explicit athlete-level authorization.

If the coach-athlete relationship ends, that coach immediately loses coaching-based access to the athlete's submission and linked team-context workout under the same principle already enforced by Migration B.

---

## 13. Team Admin Boundary

Team owners/admins retain operational authority over team membership and coach-athlete assignment management, but that does not make them coaches.

A team owner/admin who is not also an explicitly assigned coach may:

- see non-sensitive assignment metadata needed for team operations;
- manage team membership / coaching assignment through the existing governance workflows.

They may not solely because of management status:

- read athlete completion status;
- read injury/illness availability;
- read athlete submission notes;
- read linked athlete workout performance;
- review athlete submissions.

If a team manager is also an active coach explicitly assigned to the athlete, their coach authorization may grant those abilities independently of management authority.

---

## 14. Assignment Creation RPC

Direct client inserts into assignment, target, recipient, and assignment-snapshot tables should not be the normal mutation path.

Recommended public RPC:

`public.create_workout_assignment(...) -> UUID`

Implemented as a `SECURITY INVOKER` public wrapper over a locked-down `private` helper when privileged multi-table writes are required.

The helper must:

1. require an authenticated caller;
2. resolve the caller's active coach membership for `team_id`;
3. validate the template belongs to the same team and is active;
4. validate target descriptors;
5. expand `team` / `group` / `athlete` targets into active athlete memberships;
6. deduplicate athletes;
7. require at least one recipient;
8. verify the assigning coach has an active explicit coach-athlete assignment for every recipient;
9. create the assignment;
10. copy the current template entries into `workout_assignment_entries`;
11. persist the original target rows;
12. materialize recipient rows;
13. commit atomically or fail entirely.

No assignment RPC may create or modify `friendships`.

---

## 15. Athlete Submission RPC

Recommended public RPC:

`public.submit_workout_assignment(...) -> UUID`

Requirements:

- caller must be the user represented by the recipient's athlete membership;
- athlete may submit only their own recipient row;
- membership must still be active to create or revise a submission;
- assignment must be `scheduled`;
- status/workout relationship constraints must be validated;
- linked workout must be athlete-owned and team-context for the same team;
- a revision updates the existing one-per-recipient submission rather than creating duplicate submissions;
- substantive revision clears previous review metadata.

The athlete may create the actual team-context workout through the normal workout logging flow, pre-populated from the assignment snapshot, then link it during submission.

---

## 16. Coach Review RPC

Recommended public RPC:

`public.review_workout_assignment_submission(...) -> UUID`

Requirements:

- enforce the explicit coach-athlete relationship described in Section 12;
- permit only coach review fields to change;
- never update athlete submission fields;
- never update `workouts`, `workout_entries`, or `entry_sets`;
- record `reviewed_at`, reviewer membership, and optional coach note.

A separate `public.clear_workout_assignment_review(...)` may be added only if a concrete UI flow requires it; it is not required for the initial contract.

---

## 17. Cancellation / Closure

Recommended controlled mutation paths:

- `public.cancel_workout_assignment(p_assignment_id)`
- `public.close_workout_assignment(p_assignment_id)`

Only an active coach on the team should be able to perform these actions, with the initial implementation preferably requiring the original assigning coach or another coach explicitly authorized for every recipient.

Cancellation/closure changes assignment lifecycle state; it does not delete targets, recipients, snapshots, or submissions.

---

## 18. RLS Model

Every new public table must enable RLS.

### Anonymous

`anon` receives no access to any Migration D workflow table.

### Templates and template entries

Readable/writable only through authenticated team coaching/governance rules defined for the template library. Athlete team membership alone does not expose the full coach template library.

### Assignments and snapshot entries

Readable when the user is:

- a recipient athlete for that assignment; or
- an active coach with legitimate team workflow visibility; or
- a team manager for non-sensitive assignment-level metadata where specifically allowed.

### Targets

Primarily coach/team-management operational metadata. Athlete clients do not need target-list access merely because they are recipients.

### Recipients

Readable by:

- the recipient athlete; or
- a currently authorized coach for that exact athlete/team pair.

Management role alone is insufficient for athlete-level recipient data when that data is used to expose submission state.

### Submissions

Readable by:

- the athlete who owns the recipient; or
- a currently authorized coach for the exact athlete/team pair.

No generic team-admin submission read policy.

### Mutations

Prefer controlled RPCs for multi-table workflow transitions. Direct authenticated INSERT/UPDATE/DELETE grants should be minimized and never become an alternate path around workflow validation.

Private `SECURITY DEFINER` helpers must:

- live in the `private` schema;
- use `SET search_path = ''`;
- perform explicit `auth.uid()` authorization checks;
- revoke `PUBLIC` / `anon` execution;
- receive only the minimum execution grants required.

Public API wrappers should remain `SECURITY INVOKER` wherever practical.

---

## 19. Calendar Integration

Migration D introduces **scheduled workout assignments**, not a general shared-events system.

The existing personal `calendar_events` table remains personal and is not repurposed for team authorization.

Athlete calendar UI should merge, at query/view-model level:

- athlete-owned `workouts`;
- athlete-owned `calendar_events`;
- scheduled `workout_assignment_recipients` + parent assignment metadata.

Coach calendar/dashboard views may similarly derive scheduled assignments from `workout_assignments`.

A generic team calendar / shared events table remains a separate future extension from the earlier schema contract.

---

## 20. Coach Dashboard

The first coach dashboard is a derived workflow surface, not a new source-of-truth table.

It should be able to answer for the coach's authorized athletes:

- who is assigned today;
- who has submitted;
- who has not submitted;
- who completed;
- who partially completed;
- who modified;
- who skipped;
- who is unavailable;
- which submissions are unreviewed;
- athlete notes and linked team-context workout details where the coach is authorized.

Security-invoker views may be introduced for efficient dashboard queries, but they must rely on underlying RLS and must not broaden access.

No dashboard query may include unrelated personal workouts, global PRs, or achievements solely because a coaching relationship exists.

---

## 21. Notifications

The roadmap requires notifications, but notification delivery must remain downstream of authoritative assignment state.

Initial product events should include:

- assignment created for athlete;
- assignment materially updated or cancelled;
- assignment due reminder;
- athlete submission received for an authorized coach;
- athlete submission revised after review.

Rules:

- notification failure never rolls back assignment/submission data;
- notifications are not an authorization source;
- notification payloads should avoid sensitive athlete health/note content on lock screens;
- if an outbox table is later required for reliable push delivery, it should be added as a separate operational migration rather than embedding delivery semantics into the core workflow tables.

---

## 22. Health-Sensitive Availability Data

The roadmap explicitly requires an athlete to be able to report unavailable status because of injury or illness.

The initial schema should store only the broad availability category needed for the workflow:

- injury
- illness
- other

Detailed medical diagnosis is outside this contract.

`athlete_note` may contain athlete-entered context and therefore must be treated as sensitive training/health-adjacent data under the strict submission RLS rules.

---

## 23. Backward Compatibility

Migration D must not reclassify existing data.

Specifically:

- existing `workouts.team_id IS NULL` rows remain personal;
- existing team-context workouts remain unchanged;
- existing workout logging continues to work without an assignment;
- athletes may continue creating personal workouts exactly as they do today;
- friendship-based workout access continues independently;
- current personal calendar events remain unchanged;
- existing PR and achievement logic remains athlete/friend scoped unless a later explicit team-scoped analytics design changes it.

`workout_assignment_submissions.workout_id` is nullable so skipped/unavailable responses do not create fake workout rows.

---

## 24. Data Lifecycle

Default lifecycle behavior:

- templates: active -> archived
- assignments: scheduled -> closed or cancelled
- recipients: retained historically
- submissions: retained historically
- coach reviews: retained until a revised athlete submission invalidates the prior review

Normal UI flows do not hard-delete historical assignment/submission data.

If a group changes after assignment creation, historical recipients do not change.

If a coach-athlete assignment ends, historical rows remain but coaching-based read authorization immediately follows the current explicit-assignment policy.

---

## 25. Required Database Tests

Migration D is not complete without focused pgTAP authorization and integrity coverage.

At minimum, prove:

1. active coach can create a template for their team;
2. athlete cannot create a coach template merely because they are a team member;
3. team admin who is not a coach cannot create training assignments solely through admin status;
4. coach can assign one explicitly assigned athlete;
5. coach can assign an authorized group;
6. coach can assign the full team only when authorized for every expanded athlete;
7. assignment fails atomically when one target athlete is unauthorized;
8. group expansion filters to athlete memberships and cannot cross teams;
9. overlapping targets produce one recipient per athlete;
10. editing a template does not mutate an existing assignment snapshot;
11. group membership changes do not mutate historical recipients;
12. recipient athlete can read their assignment;
13. unrelated teammate cannot read another athlete's recipient/submission;
14. assigned coach can read authorized athlete submission;
15. unassigned coach cannot read submission;
16. team admin without coaching assignment cannot read sensitive submission data;
17. athlete can submit completed/partial/modified with their own same-team workout;
18. athlete cannot link another user's workout;
19. athlete cannot link a personal `team_id IS NULL` workout as assignment performance;
20. skipped/unavailable submissions work without creating workouts;
21. unavailable reason is validated;
22. athlete cannot submit for another athlete;
23. coach cannot edit athlete submission content;
24. authorized coach can write review metadata;
25. coach review cannot mutate the linked athlete workout;
26. athlete revision clears previous review metadata;
27. closing/cancelling prevents new normal submissions;
28. ending coach-athlete assignment revokes coaching-based submission/workout access immediately;
29. assignment/submission actions never create friendships;
30. existing personal workout logging remains functional;
31. existing friendship workout access remains independent;
32. all new public tables have RLS and no anonymous access.

---

## 26. Proposed Migration D Implementation Sequence

To keep production changes reviewable, implement the contract as several migrations rather than one large migration.

### D1 - Workout Template Foundation

- `workout_templates`
- `workout_template_entries`
- integrity triggers/helpers
- template RLS/grants
- focused tests

### D2 - Assignment and Scheduling Foundation

- `workout_assignments`
- `workout_assignment_entries`
- `workout_assignment_targets`
- `workout_assignment_recipients`
- controlled assignment creation/cancel/close RPCs
- target expansion + explicit coach-athlete authorization
- focused tests

### D3 - Athlete Submission and Coach Review

- `workout_assignment_submissions`
- controlled athlete submit/revise RPC
- controlled coach review RPC
- linked-workout validation
- sensitive submission RLS
- focused tests

### D4 - Product Query Surfaces and Notifications Integration

- security-invoker read views only if needed for efficient athlete inbox / coach dashboard queries
- calendar integration at the application/view-model layer
- notification event integration
- no change to core authorization semantics

Each migration must pass fresh local migration replay, database lint, focused pgTAP authorization tests, application lint/type checks/tests, hosted deployment verification, migration-ledger reconciliation where necessary, advisors, and regenerated `lib/database.types.ts` before the phase is considered production-complete.

---

## 27. Explicitly Out of Scope for Migration D Core

The following remain separate future work unless deliberately pulled into a later approved contract:

- generic team calendar/shared event CRUD beyond scheduled workout assignments
- team announcements
- attendance
- seasons / competition years
- meet rosters
- relay lineups
- public/team-scoped leaderboards
- team-scoped PR computation
- AI workout generation or recommendations
- broad wearable integration
- live GPS
- medical diagnosis / injury management records
- coach edits to athlete-owned workout performance
- parent/guardian workflows
- multi-team coaching dashboard aggregation

---

## 28. Repository Implementation References

Implementation should remain consistent with the current repository architecture, especially:

- `supabase/migrations/20260827004953_coaching_training_access.sql`
- `supabase/migrations/20260827010800_trust_layer.sql`
- `supabase/migrations/20260827011900_trust_layer_fk_indexes.sql`
- `supabase/tests/database/coach_athlete_training_access.test.sql`
- `supabase/tests/database/coach_athlete_assignment_integrity.test.sql`
- `app/modal.tsx`
- `app/(tabs)/calendar.tsx`
- `lib/database.types.ts`

---

## 29. Acceptance Criteria

The Migration D family is production-complete only when the following end-to-end loop is real and authorization-safe:

**coach creates reusable training -> coach assigns authorized athlete(s) -> athlete sees scheduled assignment -> athlete logs or reports outcome -> athlete submission preserves prescription vs actual performance -> authorized coach reviews -> coach dashboard reflects status -> no unrelated athlete data is exposed.**

The workflow must demonstrate the roadmap's intended Track Team Training and Performance Platform while preserving the A-C rule that identity, team management, trust, social relationships, and coaching authorization are separate relationship graphs.
