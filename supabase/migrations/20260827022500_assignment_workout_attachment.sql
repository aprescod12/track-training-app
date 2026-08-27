-- Migration D4 follow-up: explicit athlete-controlled transition from personal workout
-- to assignment/team context. The transition and assignment submission are atomic.

create or replace function private.attach_workout_to_assignment(
  p_assignment_recipient_id uuid,
  p_workout_id uuid,
  p_completion_status text,
  p_athlete_note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_team_id uuid;
  v_athlete_membership_id uuid;
  v_athlete_user_id uuid;
  v_assignment_status text;
  v_scheduled_date date;
  v_workout_user_id uuid;
  v_workout_team_id uuid;
  v_workout_date date;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if p_completion_status not in ('completed', 'partially_completed', 'modified') then
    raise exception 'workout attachment requires a performance completion status'
      using errcode = '22023';
  end if;

  select
    war.team_id,
    war.athlete_membership_id,
    athlete_tm.user_id,
    wa.status,
    wa.scheduled_date
  into
    v_team_id,
    v_athlete_membership_id,
    v_athlete_user_id,
    v_assignment_status,
    v_scheduled_date
  from public.workout_assignment_recipients war
  join public.workout_assignments wa
    on wa.id = war.assignment_id
   and wa.team_id = war.team_id
  join public.team_memberships athlete_tm
    on athlete_tm.id = war.athlete_membership_id
   and athlete_tm.team_id = war.team_id
  where war.id = p_assignment_recipient_id
    and athlete_tm.member_type = 'athlete'
  for update of war, wa, athlete_tm;

  if not found then
    raise exception 'assignment recipient not found' using errcode = '22023';
  end if;

  if v_athlete_user_id <> v_user_id then
    raise exception 'athlete may attach a workout only to their own assignment'
      using errcode = '42501';
  end if;

  if v_assignment_status <> 'scheduled' then
    raise exception 'assignment is not open for workout attachment'
      using errcode = '23514';
  end if;

  if not exists (
    select 1
    from public.team_memberships tm
    where tm.id = v_athlete_membership_id
      and tm.team_id = v_team_id
      and tm.user_id = v_user_id
      and tm.member_type = 'athlete'
      and tm.status = 'active'
  ) then
    raise exception 'active athlete membership required' using errcode = '42501';
  end if;

  select w.user_id, w.team_id, w.workout_date
  into v_workout_user_id, v_workout_team_id, v_workout_date
  from public.workouts w
  where w.id = p_workout_id
  for update;

  if not found then
    raise exception 'workout not found' using errcode = '22023';
  end if;

  if v_workout_user_id <> v_user_id then
    raise exception 'athlete may attach only their own workout' using errcode = '42501';
  end if;

  if v_workout_date <> v_scheduled_date then
    raise exception 'workout date must match the assignment scheduled date'
      using errcode = '23514';
  end if;

  if v_workout_team_id is not null and v_workout_team_id <> v_team_id then
    raise exception 'workout already belongs to a different team context'
      using errcode = '23514';
  end if;

  if v_workout_team_id is null then
    update public.workouts
    set team_id = v_team_id
    where id = p_workout_id;
  end if;

  return private.submit_workout_assignment(
    p_assignment_recipient_id,
    p_completion_status,
    p_workout_id,
    null,
    p_athlete_note
  );
end;
$$;

create or replace function public.attach_workout_to_assignment(
  p_assignment_recipient_id uuid,
  p_workout_id uuid,
  p_completion_status text,
  p_athlete_note text default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.attach_workout_to_assignment(
    p_assignment_recipient_id,
    p_workout_id,
    p_completion_status,
    p_athlete_note
  );
$$;

revoke all privileges on function private.attach_workout_to_assignment(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function private.attach_workout_to_assignment(uuid, uuid, text, text)
  to authenticated;

revoke all privileges on function public.attach_workout_to_assignment(uuid, uuid, text, text)
  from public, anon;
grant execute on function public.attach_workout_to_assignment(uuid, uuid, text, text)
  to authenticated;
