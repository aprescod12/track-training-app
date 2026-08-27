-- Migration D4: security-invoker product query surfaces for athlete calendar/inbox and coach dashboard.
-- No new source-of-truth workflow state is introduced here.

create view public.athlete_assignment_inbox_v
with (security_invoker = true)
as
select
  war.id as assignment_recipient_id,
  wa.id as assignment_id,
  wa.team_id,
  t.name as team_name,
  war.athlete_membership_id,
  wa.scheduled_date,
  wa.due_at,
  wa.title_snapshot,
  wa.workout_type_snapshot,
  wa.instructions,
  wa.status as assignment_status,
  wa.assigned_at,
  wa.updated_at as assignment_updated_at,
  was.id as submission_id,
  was.completion_status,
  was.unavailable_reason,
  was.athlete_note,
  was.workout_id,
  was.submitted_at,
  was.updated_at as submission_updated_at,
  was.reviewed_at,
  was.coach_note
from public.workout_assignment_recipients war
join public.workout_assignments wa
  on wa.id = war.assignment_id
 and wa.team_id = war.team_id
join public.team_memberships athlete_tm
  on athlete_tm.id = war.athlete_membership_id
 and athlete_tm.team_id = war.team_id
join public.teams t
  on t.id = war.team_id
left join public.workout_assignment_submissions was
  on was.assignment_recipient_id = war.id
 and was.team_id = war.team_id
where athlete_tm.member_type = 'athlete'
  and athlete_tm.user_id = (select auth.uid());

create view public.coach_assignment_dashboard_v
with (security_invoker = true)
as
select
  war.id as assignment_recipient_id,
  wa.id as assignment_id,
  wa.team_id,
  t.name as team_name,
  war.athlete_membership_id,
  athlete_tm.user_id as athlete_user_id,
  p.full_name as athlete_full_name,
  p.username as athlete_username,
  wa.scheduled_date,
  wa.due_at,
  wa.title_snapshot,
  wa.workout_type_snapshot,
  wa.instructions,
  wa.status as assignment_status,
  wa.assigned_at,
  wa.updated_at as assignment_updated_at,
  was.id as submission_id,
  was.completion_status,
  was.unavailable_reason,
  was.athlete_note,
  was.workout_id,
  was.submitted_at,
  was.updated_at as submission_updated_at,
  was.reviewed_at,
  was.reviewed_by_membership_id,
  was.coach_note
from public.workout_assignment_recipients war
join public.workout_assignments wa
  on wa.id = war.assignment_id
 and wa.team_id = war.team_id
join public.team_memberships athlete_tm
  on athlete_tm.id = war.athlete_membership_id
 and athlete_tm.team_id = war.team_id
join public.teams t
  on t.id = war.team_id
left join public.profiles p
  on p.id = athlete_tm.user_id
left join public.workout_assignment_submissions was
  on was.assignment_recipient_id = war.id
 and was.team_id = war.team_id
where athlete_tm.member_type = 'athlete'
  and private.can_coach_view_athlete(
    (select auth.uid()),
    athlete_tm.user_id,
    war.team_id
  );

revoke all privileges on table public.athlete_assignment_inbox_v from public, anon, authenticated;
revoke all privileges on table public.coach_assignment_dashboard_v from public, anon, authenticated;

grant select on table public.athlete_assignment_inbox_v to authenticated;
grant select on table public.coach_assignment_dashboard_v to authenticated;
