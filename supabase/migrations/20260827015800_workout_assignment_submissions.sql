-- Migration D3: athlete assignment submissions and coach review.
-- Prescription state remains separate from athlete-owned workout performance.

alter table public.workout_assignment_recipients
  add constraint workout_assignment_recipients_team_id_id_unique unique (team_id, id);

create table public.workout_assignment_submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_recipient_id uuid not null unique,
  team_id uuid not null,
  athlete_membership_id uuid not null,
  workout_id uuid references public.workouts(id) on delete set null,
  completion_status text not null,
  unavailable_reason text,
  athlete_note text,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by_membership_id uuid,
  coach_note text,
  constraint workout_assignment_submissions_recipient_same_team_fkey
    foreign key (team_id, assignment_recipient_id)
    references public.workout_assignment_recipients(team_id, id)
    on delete cascade,
  constraint workout_assignment_submissions_athlete_same_team_fkey
    foreign key (team_id, athlete_membership_id)
    references public.team_memberships(team_id, id),
  constraint workout_assignment_submissions_reviewer_same_team_fkey
    foreign key (team_id, reviewed_by_membership_id)
    references public.team_memberships(team_id, id),
  constraint workout_assignment_submissions_status_check
    check (
      completion_status in (
        'completed',
        'partially_completed',
        'modified',
        'skipped',
        'unavailable'
      )
    ),
  constraint workout_assignment_submissions_outcome_shape_check
    check (
      (
        completion_status in ('completed', 'partially_completed', 'modified')
        and workout_id is not null
        and unavailable_reason is null
      )
      or (
        completion_status = 'skipped'
        and workout_id is null
        and unavailable_reason is null
      )
      or (
        completion_status = 'unavailable'
        and workout_id is null
        and unavailable_reason in ('injury', 'illness', 'other')
      )
    ),
  constraint workout_assignment_submissions_review_state_check
    check (
      (reviewed_at is null and reviewed_by_membership_id is null and coach_note is null)
      or (reviewed_at is not null and reviewed_by_membership_id is not null)
    )
);

create index workout_assignment_submissions_team_athlete_idx
  on public.workout_assignment_submissions (team_id, athlete_membership_id, updated_at desc);
create index workout_assignment_submissions_workout_id_idx
  on public.workout_assignment_submissions (workout_id)
  where workout_id is not null;
create index workout_assignment_submissions_team_reviewer_idx
  on public.workout_assignment_submissions (team_id, reviewed_by_membership_id)
  where reviewed_by_membership_id is not null;
create index workout_assignment_submissions_status_idx
  on public.workout_assignment_submissions (team_id, completion_status, updated_at desc);

create trigger workout_assignment_submissions_set_updated_at
before update on public.workout_assignment_submissions
for each row execute function public.set_updated_at();

create or replace function private.can_view_workout_assignment_submission(
  p_user_id uuid,
  p_submission_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id = (select auth.uid())
    and exists (
      select 1
      from public.workout_assignment_submissions was
      where was.id = p_submission_id
        and private.can_view_workout_assignment_recipient(
          p_user_id,
          was.assignment_recipient_id
        )
    );
$$;

revoke all privileges on function private.can_view_workout_assignment_submission(uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.can_view_workout_assignment_submission(uuid, uuid)
  to authenticated;

create or replace function private.submit_workout_assignment(
  p_assignment_recipient_id uuid,
  p_completion_status text,
  p_workout_id uuid,
  p_unavailable_reason text,
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
  v_workout_user_id uuid;
  v_workout_team_id uuid;
  v_submission_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if p_completion_status not in (
    'completed',
    'partially_completed',
    'modified',
    'skipped',
    'unavailable'
  ) then
    raise exception 'unsupported completion status' using errcode = '22023';
  end if;

  select
    war.team_id,
    war.athlete_membership_id,
    athlete_tm.user_id,
    wa.status
  into
    v_team_id,
    v_athlete_membership_id,
    v_athlete_user_id,
    v_assignment_status
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
    raise exception 'athlete may submit only their own assignment' using errcode = '42501';
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

  if v_assignment_status <> 'scheduled' then
    raise exception 'assignment is not open for submission' using errcode = '23514';
  end if;

  if p_completion_status in ('completed', 'partially_completed', 'modified') then
    if p_workout_id is null then
      raise exception 'completed, partially completed, and modified submissions require a workout'
        using errcode = '23514';
    end if;

    if p_unavailable_reason is not null then
      raise exception 'unavailable reason is valid only for unavailable submissions'
        using errcode = '23514';
    end if;

    select w.user_id, w.team_id
    into v_workout_user_id, v_workout_team_id
    from public.workouts w
    where w.id = p_workout_id
    for share;

    if not found then
      raise exception 'linked workout not found' using errcode = '22023';
    end if;

    if v_workout_user_id <> v_user_id then
      raise exception 'athlete may link only their own workout' using errcode = '42501';
    end if;

    if v_workout_team_id is distinct from v_team_id then
      raise exception 'linked workout must be team-context for the assignment team'
        using errcode = '23514';
    end if;
  elsif p_completion_status = 'skipped' then
    if p_workout_id is not null or p_unavailable_reason is not null then
      raise exception 'skipped submission cannot include workout or unavailable reason'
        using errcode = '23514';
    end if;
  else
    if p_workout_id is not null then
      raise exception 'unavailable submission cannot include a workout'
        using errcode = '23514';
    end if;

    if p_unavailable_reason not in ('injury', 'illness', 'other') then
      raise exception 'unavailable reason must be injury, illness, or other'
        using errcode = '23514';
    end if;
  end if;

  insert into public.workout_assignment_submissions (
    assignment_recipient_id,
    team_id,
    athlete_membership_id,
    workout_id,
    completion_status,
    unavailable_reason,
    athlete_note,
    reviewed_at,
    reviewed_by_membership_id,
    coach_note
  ) values (
    p_assignment_recipient_id,
    v_team_id,
    v_athlete_membership_id,
    p_workout_id,
    p_completion_status,
    p_unavailable_reason,
    p_athlete_note,
    null,
    null,
    null
  )
  on conflict (assignment_recipient_id) do update
  set workout_id = excluded.workout_id,
      completion_status = excluded.completion_status,
      unavailable_reason = excluded.unavailable_reason,
      athlete_note = excluded.athlete_note,
      reviewed_at = null,
      reviewed_by_membership_id = null,
      coach_note = null
  returning id into v_submission_id;

  return v_submission_id;
end;
$$;

create or replace function public.submit_workout_assignment(
  p_assignment_recipient_id uuid,
  p_completion_status text,
  p_workout_id uuid default null,
  p_unavailable_reason text default null,
  p_athlete_note text default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.submit_workout_assignment(
    p_assignment_recipient_id,
    p_completion_status,
    p_workout_id,
    p_unavailable_reason,
    p_athlete_note
  );
$$;

create or replace function private.review_workout_assignment_submission(
  p_submission_id uuid,
  p_coach_note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_team_id uuid;
  v_athlete_user_id uuid;
  v_assignment_status text;
  v_coach_membership_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select
    was.team_id,
    athlete_tm.user_id,
    wa.status
  into
    v_team_id,
    v_athlete_user_id,
    v_assignment_status
  from public.workout_assignment_submissions was
  join public.workout_assignment_recipients war
    on war.id = was.assignment_recipient_id
   and war.team_id = was.team_id
  join public.workout_assignments wa
    on wa.id = war.assignment_id
   and wa.team_id = war.team_id
  join public.team_memberships athlete_tm
    on athlete_tm.id = was.athlete_membership_id
   and athlete_tm.team_id = was.team_id
  where was.id = p_submission_id
  for update of was;

  if not found then
    raise exception 'assignment submission not found' using errcode = '22023';
  end if;

  if v_assignment_status = 'cancelled' then
    raise exception 'cancelled assignment submissions cannot be reviewed'
      using errcode = '23514';
  end if;

  if not private.can_coach_view_athlete(v_user_id, v_athlete_user_id, v_team_id) then
    raise exception 'active explicit coach-athlete authorization required'
      using errcode = '42501';
  end if;

  select tm.id
  into v_coach_membership_id
  from public.team_memberships tm
  where tm.team_id = v_team_id
    and tm.user_id = v_user_id
    and tm.member_type = 'coach'
    and tm.status = 'active';

  if not found then
    raise exception 'active team coach membership required' using errcode = '42501';
  end if;

  update public.workout_assignment_submissions
  set reviewed_at = now(),
      reviewed_by_membership_id = v_coach_membership_id,
      coach_note = nullif(btrim(p_coach_note), '')
  where id = p_submission_id;

  return p_submission_id;
end;
$$;

create or replace function public.review_workout_assignment_submission(
  p_submission_id uuid,
  p_coach_note text default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.review_workout_assignment_submission(p_submission_id, p_coach_note);
$$;

revoke all privileges on function private.submit_workout_assignment(uuid, text, uuid, text, text)
  from public, anon, authenticated;
revoke all privileges on function private.review_workout_assignment_submission(uuid, text)
  from public, anon, authenticated;
grant execute on function private.submit_workout_assignment(uuid, text, uuid, text, text)
  to authenticated;
grant execute on function private.review_workout_assignment_submission(uuid, text)
  to authenticated;

revoke all privileges on function public.submit_workout_assignment(uuid, text, uuid, text, text)
  from public, anon;
revoke all privileges on function public.review_workout_assignment_submission(uuid, text)
  from public, anon;
grant execute on function public.submit_workout_assignment(uuid, text, uuid, text, text)
  to authenticated;
grant execute on function public.review_workout_assignment_submission(uuid, text)
  to authenticated;

alter table public.workout_assignment_submissions enable row level security;

revoke all privileges on table public.workout_assignment_submissions from anon, authenticated;
grant select on public.workout_assignment_submissions to authenticated;

create policy workout_assignment_submissions_authorized_select
on public.workout_assignment_submissions
for select to authenticated
using (
  private.can_view_workout_assignment_submission((select auth.uid()), id)
);
