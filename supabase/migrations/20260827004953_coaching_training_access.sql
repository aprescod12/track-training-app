-- Migration B: explicit coaching authorization and team-context training access.
-- Team membership alone never grants workout visibility. Coaches receive read-only
-- access only through an active coach-athlete assignment and a non-null workout.team_id.

create table public.coach_athlete_assignments (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  coach_membership_id uuid not null,
  athlete_membership_id uuid not null,
  is_primary boolean not null default false,
  active boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ended_at timestamptz,
  constraint coach_athlete_assignments_members_distinct_check
    check (coach_membership_id <> athlete_membership_id),
  constraint coach_athlete_assignments_active_ended_check
    check (
      (active and ended_at is null)
      or ((not active) and ended_at is not null)
    ),
  constraint coach_athlete_assignments_unique
    unique (team_id, coach_membership_id, athlete_membership_id),
  constraint coach_athlete_assignments_coach_same_team_fkey
    foreign key (team_id, coach_membership_id)
    references public.team_memberships(team_id, id)
    on delete cascade,
  constraint coach_athlete_assignments_athlete_same_team_fkey
    foreign key (team_id, athlete_membership_id)
    references public.team_memberships(team_id, id)
    on delete cascade
);

create index coach_athlete_assignments_coach_membership_id_idx
  on public.coach_athlete_assignments (coach_membership_id);
create index coach_athlete_assignments_athlete_membership_id_idx
  on public.coach_athlete_assignments (athlete_membership_id);
create index coach_athlete_assignments_team_id_idx
  on public.coach_athlete_assignments (team_id);
create unique index coach_athlete_assignments_one_active_primary_idx
  on public.coach_athlete_assignments (team_id, athlete_membership_id)
  where active and is_primary;

alter table public.workouts
  add column team_id uuid references public.teams(id) on delete set null;

create index workouts_team_user_date_idx
  on public.workouts (team_id, user_id, workout_date desc)
  where team_id is not null;

create or replace function private.is_team_coach(p_user_id uuid, p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id = (select auth.uid())
    and exists (
      select 1
      from public.team_memberships tm
      where tm.team_id = p_team_id
        and tm.user_id = p_user_id
        and tm.member_type = 'coach'
        and tm.status = 'active'
    );
$$;

create or replace function private.is_team_athlete(p_user_id uuid, p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id = (select auth.uid())
    and exists (
      select 1
      from public.team_memberships tm
      where tm.team_id = p_team_id
        and tm.user_id = p_user_id
        and tm.member_type = 'athlete'
        and tm.status = 'active'
    );
$$;

create or replace function private.can_coach_view_athlete(
  p_coach_user_id uuid,
  p_athlete_user_id uuid,
  p_team_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_coach_user_id = (select auth.uid())
    and exists (
      select 1
      from public.coach_athlete_assignments caa
      join public.team_memberships coach_tm
        on coach_tm.team_id = caa.team_id
       and coach_tm.id = caa.coach_membership_id
      join public.team_memberships athlete_tm
        on athlete_tm.team_id = caa.team_id
       and athlete_tm.id = caa.athlete_membership_id
      where caa.team_id = p_team_id
        and caa.active
        and coach_tm.user_id = p_coach_user_id
        and coach_tm.member_type = 'coach'
        and coach_tm.status = 'active'
        and athlete_tm.user_id = p_athlete_user_id
        and athlete_tm.member_type = 'athlete'
        and athlete_tm.status = 'active'
    );
$$;

create or replace function private.can_view_coach_assignment(
  p_user_id uuid,
  p_team_id uuid,
  p_coach_membership_id uuid,
  p_athlete_membership_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id = (select auth.uid())
    and (
      private.can_manage_team(p_user_id, p_team_id)
      or exists (
        select 1
        from public.team_memberships tm
        where tm.team_id = p_team_id
          and tm.id in (p_coach_membership_id, p_athlete_membership_id)
          and tm.user_id = p_user_id
      )
    );
$$;

create or replace function private.can_read_workout(
  p_viewer_user_id uuid,
  p_workout_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_viewer_user_id = (select auth.uid())
    and exists (
      select 1
      from public.workouts w
      where w.id = p_workout_id
        and (
          w.user_id = p_viewer_user_id
          or private.is_friends(p_viewer_user_id, w.user_id)
          or (
            w.team_id is not null
            and private.can_coach_view_athlete(
              p_viewer_user_id,
              w.user_id,
              w.team_id
            )
          )
        )
    );
$$;

create or replace function private.can_read_workout_entry(
  p_viewer_user_id uuid,
  p_entry_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_viewer_user_id = (select auth.uid())
    and exists (
      select 1
      from public.workout_entries we
      where we.id = p_entry_id
        and private.can_read_workout(p_viewer_user_id, we.workout_id)
    );
$$;

create or replace function private.enforce_coach_athlete_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_coach public.team_memberships%rowtype;
  v_athlete public.team_memberships%rowtype;
begin
  if new.coach_membership_id = new.athlete_membership_id then
    raise exception 'coach and athlete memberships must be different'
      using errcode = '23514';
  end if;

  select *
  into v_coach
  from public.team_memberships tm
  where tm.team_id = new.team_id
    and tm.id = new.coach_membership_id;

  if not found or v_coach.member_type <> 'coach' then
    raise exception 'coach_membership_id must reference a coach on the same team'
      using errcode = '23514';
  end if;

  select *
  into v_athlete
  from public.team_memberships tm
  where tm.team_id = new.team_id
    and tm.id = new.athlete_membership_id;

  if not found or v_athlete.member_type <> 'athlete' then
    raise exception 'athlete_membership_id must reference an athlete on the same team'
      using errcode = '23514';
  end if;

  if new.active then
    if v_coach.status <> 'active' or v_athlete.status <> 'active' then
      raise exception 'active assignments require active coach and athlete memberships'
        using errcode = '23514';
    end if;
    new.ended_at := null;
  elsif new.ended_at is null then
    new.ended_at := now();
  end if;

  return new;
end;
$$;

create trigger coach_athlete_assignments_guard
before insert or update of team_id, coach_membership_id, athlete_membership_id, active, ended_at
on public.coach_athlete_assignments
for each row execute function private.enforce_coach_athlete_assignment();

create trigger coach_athlete_assignments_set_updated_at
before update on public.coach_athlete_assignments
for each row execute function public.set_updated_at();

alter table public.coach_athlete_assignments enable row level security;
revoke all privileges on table public.coach_athlete_assignments from anon, authenticated;
grant select on public.coach_athlete_assignments to authenticated;

revoke all privileges on function private.is_team_coach(uuid, uuid) from public, anon, authenticated;
revoke all privileges on function private.is_team_athlete(uuid, uuid) from public, anon, authenticated;
revoke all privileges on function private.can_coach_view_athlete(uuid, uuid, uuid) from public, anon, authenticated;
revoke all privileges on function private.can_view_coach_assignment(uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all privileges on function private.can_read_workout(uuid, uuid) from public, anon, authenticated;
revoke all privileges on function private.can_read_workout_entry(uuid, uuid) from public, anon, authenticated;
revoke all privileges on function private.enforce_coach_athlete_assignment() from public, anon, authenticated;

grant execute on function private.is_team_coach(uuid, uuid) to authenticated;
grant execute on function private.is_team_athlete(uuid, uuid) to authenticated;
grant execute on function private.can_coach_view_athlete(uuid, uuid, uuid) to authenticated;
grant execute on function private.can_view_coach_assignment(uuid, uuid, uuid, uuid) to authenticated;
grant execute on function private.can_read_workout(uuid, uuid) to authenticated;
grant execute on function private.can_read_workout_entry(uuid, uuid) to authenticated;

create policy coach_athlete_assignments_visible_select
on public.coach_athlete_assignments
for select to authenticated
using (
  private.can_view_coach_assignment(
    (select auth.uid()),
    team_id,
    coach_membership_id,
    athlete_membership_id
  )
);

create or replace function private.assign_coach_to_athlete(
  p_team_id uuid,
  p_coach_membership_id uuid,
  p_athlete_membership_id uuid,
  p_is_primary boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_assignment_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if not private.can_manage_team(v_user_id, p_team_id) then
    raise exception 'team admin authority required' using errcode = '42501';
  end if;

  insert into public.coach_athlete_assignments (
    team_id,
    coach_membership_id,
    athlete_membership_id,
    is_primary,
    active,
    created_by,
    ended_at
  ) values (
    p_team_id,
    p_coach_membership_id,
    p_athlete_membership_id,
    coalesce(p_is_primary, false),
    true,
    v_user_id,
    null
  )
  on conflict (team_id, coach_membership_id, athlete_membership_id)
  do update set
    is_primary = excluded.is_primary,
    active = true,
    ended_at = null,
    updated_at = now()
  returning id into v_assignment_id;

  return v_assignment_id;
end;
$$;

create or replace function public.assign_coach_to_athlete(
  p_team_id uuid,
  p_coach_membership_id uuid,
  p_athlete_membership_id uuid,
  p_is_primary boolean default false
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.assign_coach_to_athlete(
    p_team_id,
    p_coach_membership_id,
    p_athlete_membership_id,
    p_is_primary
  );
$$;

create or replace function private.end_coach_athlete_assignment(
  p_assignment_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_assignment public.coach_athlete_assignments%rowtype;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select *
  into v_assignment
  from public.coach_athlete_assignments caa
  where caa.id = p_assignment_id
  for update;

  if not found then
    raise exception 'coach-athlete assignment not found' using errcode = '22023';
  end if;

  if not private.can_manage_team(v_user_id, v_assignment.team_id) then
    raise exception 'team admin authority required' using errcode = '42501';
  end if;

  update public.coach_athlete_assignments
  set active = false,
      ended_at = coalesce(ended_at, now())
  where id = p_assignment_id;

  return p_assignment_id;
end;
$$;

create or replace function public.end_coach_athlete_assignment(
  p_assignment_id uuid
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.end_coach_athlete_assignment(p_assignment_id);
$$;

revoke all privileges on function private.assign_coach_to_athlete(uuid, uuid, uuid, boolean) from public, anon, authenticated;
revoke all privileges on function private.end_coach_athlete_assignment(uuid) from public, anon, authenticated;
grant execute on function private.assign_coach_to_athlete(uuid, uuid, uuid, boolean) to authenticated;
grant execute on function private.end_coach_athlete_assignment(uuid) to authenticated;

revoke all privileges on function public.assign_coach_to_athlete(uuid, uuid, uuid, boolean) from public, anon, authenticated;
revoke all privileges on function public.end_coach_athlete_assignment(uuid) from public, anon, authenticated;
grant execute on function public.assign_coach_to_athlete(uuid, uuid, uuid, boolean) to authenticated;
grant execute on function public.end_coach_athlete_assignment(uuid) to authenticated;

drop policy if exists workouts_owner_select on public.workouts;
drop policy if exists workouts_friends_select on public.workouts;
create policy workouts_authorized_select on public.workouts
for select to authenticated
using (
  private.can_read_workout((select auth.uid()), id)
);

drop policy if exists workouts_owner_insert on public.workouts;
create policy workouts_owner_insert on public.workouts
for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and (
    team_id is null
    or private.is_team_athlete((select auth.uid()), team_id)
  )
);

drop policy if exists workouts_owner_update on public.workouts;
create policy workouts_owner_update on public.workouts
for update to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and (
    team_id is null
    or private.is_team_athlete((select auth.uid()), team_id)
  )
);

drop policy if exists workout_entries_owner_select on public.workout_entries;
drop policy if exists workout_entries_friends_select on public.workout_entries;
create policy workout_entries_authorized_select on public.workout_entries
for select to authenticated
using (
  private.can_read_workout((select auth.uid()), workout_id)
);

drop policy if exists entry_sets_owner_select on public.entry_sets;
drop policy if exists entry_sets_friends_select on public.entry_sets;
create policy entry_sets_authorized_select on public.entry_sets
for select to authenticated
using (
  private.can_read_workout_entry((select auth.uid()), entry_id)
);

create or replace view public.team_workout_summary_v
with (security_invoker = true)
as
select
  s.workout_id,
  w.team_id,
  s.user_id,
  s.workout_date,
  s.workout_type,
  s.total_sets,
  s.distance_m_total
from public.workout_summary_v s
join public.workouts w on w.id = s.workout_id
where w.team_id is not null;

revoke all privileges on table public.team_workout_summary_v from anon, authenticated;
grant select on table public.team_workout_summary_v to authenticated;
