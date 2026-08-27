# Track Training App — Coach Responsibility Scope Contract

**Status:** Implemented in repository; hosted Supabase deployment pending  
**Target repository:** `aprescod12/track-training-app`  
**Target branch:** `main`  
**Depends on:** Team Identity Foundation, Coaching Training Access, Coach-Athlete Workflow Contract

## 1. Purpose

This contract defines how coaching responsibilities are represented without weakening the existing athlete privacy model.

A team may contain coaches with different responsibilities, for example:

- Head Coach
- Assistant Coach — Sprints
- Distance Coach
- Jumps Coach
- Throws Coach
- Strength & Conditioning Coach

Those labels must not become a growing list of authorization roles. The permanent membership identity remains `member_type = 'coach'`. Responsibility is modeled independently through team groups, explicit coach-athlete assignments, and training-domain permissions.

## 2. Three Independent Dimensions

A coach's effective role is the combination of three independent dimensions:

1. **Team identity** — the user is an active `coach` member of the team.
2. **Athlete visibility** — explicit active `coach_athlete_assignments` rows define which athletes the coach may view in team-context training.
3. **Training authority** — `coach_training_permissions` defines which workout domains the coach may prescribe and formally review.

No one dimension implies another.

## 3. Team Groups Are Organizational Only

`team_groups` and `team_group_memberships` organize the roster into operational groups such as Sprints, Distance, Jumps, Throws, Men's Team, Women's Team, or other staff-defined groupings.

Group membership must never:

- create a friendship;
- create a `coach_athlete_assignments` row;
- grant workout visibility;
- grant prescription authority;
- grant review authority.

A coach and athlete may share a group while the coach still has zero access to that athlete's training until an explicit coach-athlete assignment is created.

## 4. Athlete Visibility Remains Explicit

The existing `coach_athlete_assignments` relationship remains the sole coaching-based athlete visibility gate.

When an active explicit assignment connects a coach and athlete on the same team, the coach may view that athlete's authorized team-context training across both Track and Lift domains. This broad visibility supports coordinated coaching decisions.

Examples:

- a strength coach may need to see that an athlete completed high-intensity sprint work before programming a lift;
- a sprint coach may need to see that an athlete completed a heavy lower-body lift before adjusting track volume.

Visibility does not grant mutation authority over athlete-owned performance.

## 5. Athlete-Owned Performance Is Always Read-Only to Coaches

This contract does not change the permanent ownership boundary for:

- `workouts`
- `workout_entries`
- `entry_sets`

Coaches may never edit an athlete's logged performance through coaching authority. Prescription and performance remain separate records.

## 6. Training-Domain Authority

`coach_training_permissions` stores authority per coach membership and workout type.

Initial workout types:

- `track`
- `lift`

Each row has independent capability fields:

- `can_prescribe`
- `can_review`

The current product UI toggles these together for simplicity, while the schema keeps them separate so a future advanced workflow may distinguish prescription authority from formal review authority.

### Track-only coach

May:

- view Track and Lift context for explicitly assigned athletes;
- create and update Track templates;
- create/manage Track assignments;
- formally review Track submissions.

May not:

- create or modify Lift prescriptions;
- formally review Lift submissions;
- edit any athlete-owned workout.

### Lift-only coach

The inverse applies: broad assigned-athlete visibility, with prescription and formal-review authority limited to Lift.

### Full-scope coach

A coach may be granted both Track and Lift authority.

## 7. Formal Review Is Domain-Owned

Cross-disciplinary coaches retain visibility but do not receive formal review authority outside their training domain.

Example:

- Sprint Coach: Track authority enabled, Lift authority disabled.
- Athlete submits a Lift assignment.
- Sprint Coach may view the Lift prescription, athlete response, and authorized linked performance.
- Sprint Coach may not mark the Lift submission reviewed or write the official Lift review note.

A future additive discussion/comment feature may support cross-disciplinary staff comments without changing formal review ownership.

## 8. Descriptive Coaching Titles

`team_memberships.role_title` is optional human-readable metadata, for example:

- `Head Coach`
- `Assistant Coach - Sprints`
- `Strength & Conditioning Coach`

`role_title` is never an authorization primitive. Changing a title does not change athlete visibility or training authority.

## 9. Defaults and Backward Compatibility

To preserve existing production behavior when this migration is deployed:

- active coaches that already exist when the migration runs are backfilled with Track and Lift prescription/review authority;
- a new team creator whose owner membership is also a coach receives Track and Lift authority;
- new non-owner coaches receive explicit Track and Lift permission rows with prescription/review disabled until a team manager configures them.

Team owners/admins may configure responsibility scopes, but management authority alone still does not grant athlete training visibility.

## 10. Enforcement Boundary

Training scope is enforced in the database, not only by UI visibility.

The migration guards:

- `workout_templates` creation/update by workout type;
- `workout_assignments` creation/update by assignment workout type;
- formal `workout_assignment_submissions` review writes by assignment workout type.

The client additionally hides or disables unauthorized authoring/review actions to avoid dead-end workflows.

## 11. Application Surfaces

Current repository implementation uses these concepts in:

- `lib/teams.ts` — groups, role titles, coach training permissions;
- `app/teams/[teamId].tsx` — Training Groups, Coach Responsibilities, Athlete Visibility;
- `app/team-training/template-new.tsx` — template type options respect prescription authority;
- `app/team-training/assign.tsx` — only templates in authorized domains can be assigned;
- `app/team-training/assignment/[recipientId].tsx` — cross-domain coach access is view-only when formal review authority is absent.

## 12. Permanent Invariants

1. Membership does not grant friendship.
2. Group membership does not grant training access.
3. Team management authority does not grant athlete training access.
4. Athlete visibility requires explicit coach-athlete assignment.
5. Training authority does not grant visibility to unassigned athletes.
6. Explicitly assigned coaches may view authorized athlete context across Track and Lift.
7. Prescription and formal review are limited by training-domain authority.
8. Coaches never edit athlete-owned workout performance.
9. Historical workflow records remain retained under existing lifecycle rules.
10. Future coaching roles must extend this capability model rather than proliferating authorization values in `member_type`.
