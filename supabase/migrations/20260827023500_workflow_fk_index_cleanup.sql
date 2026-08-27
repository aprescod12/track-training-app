-- Migration D4 cleanup: cover the composite submission -> recipient foreign key.
-- This removes the final Migration D-specific unindexed foreign-key advisory.

create index workout_assignment_submissions_team_recipient_idx
  on public.workout_assignment_submissions (team_id, assignment_recipient_id);
