-- Migration D2: coach-authored workout assignments, target expansion, and stable athlete recipients.
-- Assignment creation is atomic and requires explicit coach-athlete authorization for every recipient.

alter table public.workout_templates
  add constraint workout_templates_team_id_id_unique unique (team_id, id);

create table public.workout_assignments (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  template_id uuid not null,
  assigned_by_membership_id uuid not null,
  scheduled_date date not null,
  due_at timestamptz,
  title_snapshot text not null,
  workout_type_snapshot text not null,
  instructions text,
  status text not null default 'scheduled',
  assigned_at timestamptz not null default now(),
  closed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workout_assignments_team_id_id_unique unique (team_id, id),
  constraint workout_assignments_template_same_team_fkey
    foreign key (team_id, template_id)
    references public.workout_templates(team_id, id),
  constraint workout_assignments_assigner_same_team_fkey
    foreign key (team_id, assigned_by_membership_id)
    references public.team_memberships(team_id, id),
  constraint workout_assignments_title_check
    check (length(btrim(title_snapshot)) > 0),
  constraint workout_assignments_workout_type_check
    check (workout_type_snapshot in ('track', 'lift')),
  constraint workout_assignments_status_check
    check (status in ('scheduled', 'closed', 'cancelled')),
  constraint workout_assignments_lifecycle_check
    check (
      (status = 'scheduled' and closed_at is null and cancelled_at is null)
      or (status = 'closed' and closed_at is not null and cancelled_at is null)
      or (status = 'cancelled' and cancelled_at is not null and closed_at is null)
    )
);

create table public.workout_assignment_entries (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.workout_assignments(id) on delete cascade,
  sort_order integer not null,
  exercise_id uuid references public.exercises(exercise_id) on delete set null,
  exercise_name_snapshot text not null,
  label text,
  sets integer,
  reps integer,
  distance_m numeric,
  target_time_text text,
  target_weight numeric,
  recovery_seconds integer,
  intensity_text text,
  notes text,
  created_at timestamptz not null default now(),
  constraint workout_assignment_entries_assignment_sort_unique
    unique (assignment_id, sort_order),
  constraint workout_assignment_entries_sort_order_check
    check (sort_order >= 0),
  constraint workout_assignment_entries_exercise_name_check
    check (length(btrim(exercise_name_snapshot)) > 0),
  constraint workout_assignment_entries_sets_check
    check (sets is null or sets > 0),
  constraint workout_assignment_entries_reps_check
    check (reps is null or reps > 0),
  constraint workout_assignment_entries_distance_check
    check (distance_m is null or distance_m >= 0),
  constraint workout_assignment_entries_target_weight_check
    check (target_weight is null or target_weight >= 0),
  constraint workout_assignment_entries_recovery_check
    check (recovery_seconds is null or recovery_seconds >= 0),
  constraint workout_assignment_entries_target_time_check
    check (target_time_text is null or length(btrim(target_time_text)) > 0),
  constraint workout_assignment_entries_intensity_check
    check (intensity_text is null or length(btrim(intensity_text)) > 0)
);

create table public.workout_assignment_targets (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null,
  team_id uuid not null,
  target_type text not null,
  group_id uuid,
  athlete_membership_id uuid,
  created_at timestamptz not null default now(),
  constraint workout_assignment_targets_assignment_same_team_fkey
    foreign key (team_id, assignment_id)
    references public.workout_assignments(team_id, id)
    on delete cascade,
  constraint workout_assignment_targets_group_same_team_fkey
    foreign key (team_id, group_id)
    references public.team_groups(team_id, id),
  constraint workout_assignment_targets_athlete_same_team_fkey
    foreign key (team_id, athlete_membership_id)
    references public.team_memberships(team_id, id),
  constraint workout_assignment_targets_type_check
    check (target_type in ('team', 'group', 'athlete')),
  constraint workout_assignment_targets_shape_check
    check (
      (target_type = 'team' and group_id is null and athlete_membership_id is null)
      or (target_type = 'group' and group_id is not null and athlete_membership_id is null)
      or (target_type = 'athlete' and group_id is null and athlete_membership_id is not null)
    )
);

create table public.workout_assignment_recipients (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null,
  team_id uuid not null,
  athlete_membership_id uuid not null,
  assigned_at timestamptz not null default now(),
  first_viewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint workout_assignment_recipients_assignment_athlete_unique
    unique (assignment_id, athlete_membership_id),
  constraint workout_assignment_recipients_assignment_same_team_fkey
    foreign key (team_id, assignment_id)
    references public.workout_assignments(team_id, id)
    on delete cascade,
  constraint workout_assignment_recipients_athlete_same_team_fkey
    foreign key (team_id, athlete_membership_id)
    references public.team_memberships(team_id, id)
);

create unique index workout_assignment_targets_team_unique_idx
  on public.workout_assignment_targets (assignment_id)
  where target_type = 'team';
create unique index workout_assignment_targets_group_unique_idx
  on public.workout_assignment_targets (assignment_id, group_id)
  where target_type = 'group';
create unique index workout_assignment_targets_athlete_unique_idx
  on public.workout_assignment_targets (assignment_id, athlete_membership_id)
  where target_type = 'athlete';

create index workout_assignments_team_template_idx
  on public.workout_assignments (team_id, template_id);
create index workout_assignments_team_assigner_idx
  on public.workout_assignments (team_id, assigned_by_membership_id);
create index workout_assignments_team_schedule_idx
  on public.workout_assignments (team_id, scheduled_date, status);
create index workout_assignment_entries_exercise_id_idx
  on public.workout_assignment_entries (exercise_id)
  where exercise_id is not null;
create index workout_assignment_targets_team_assignment_idx
  on public.workout_assignment_targets (team_id, assignment_id);
create index workout_assignment_targets_team_group_idx
  on public.workout_assignment_targets (team_id, group_id)
  where group_id is not null;
create index workout_assignment_targets_team_athlete_idx
  on public.workout_assignment_targets (team_id, athlete_membership_id)
  where athlete_membership_id is not null;
create index workout_assignment_recipients_team_assignment_idx
  on public.workout_assignment_recipients (team_id, assignment_id);
create index workout_assignment_recipients_team_athlete_idx
  on public.workout_assignment_recipients (team_id, athlete_membership_id);

create or replace function private.lock_workout_template_for_entry_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_template_id uuid;
begin
  if tg_op = 'DELETE' then
    v_template_id := old.template_id;
  else
    v_template_id := new.template_id;
  end if;

  perform 1
  from public.workout_templates wt
  where wt.id = v_template_id
  for update;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

revoke all privileges on function private.lock_workout_template_for_entry_mutation()
  from public, anon, authenticated;

create trigger workout_template_entries_parent_lock
before insert or update or delete on public.workout_template_entries
for each row execute function private.lock_workout_template_for_entry_mutation();

create or replace function private.can_view_workout_assignment(
  p_user_id uuid,
  p_assignment_id uuid
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
      from public.workout_assignments wa
      where wa.id = p_assignment_id
        and (
          private.is_team_coach(p_user_id, wa.team_id)
          or private.can_manage_team(p_user_id, wa.team_id)
          or exists (
            select 1
            from public.workout_assignment_recipients war
            join public.team_memberships tm
              on tm.id = war.athlete_membership_id
             and tm.team_id = war.team_id
            where war.assignment_id = wa.id
              and tm.user_id = p_user_id
          )
        )
    );
$$;

create or replace function private.can_view_workout_assignment_targets(
  p_user_id uuid,
  p_assignment_id uuid
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
      from public.workout_assignments wa
      where wa.id = p_assignment_id
        and (
          private.is_team_coach(p_user_id, wa.team_id)
          or private.can_manage_team(p_user_id, wa.team_id)
        )
    );
$$;

create or replace function private.can_view_workout_assignment_recipient(
  p_user_id uuid,
  p_recipient_id uuid
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
      from public.workout_assignment_recipients war
      join public.team_memberships athlete_tm
        on athlete_tm.id = war.athlete_membership_id
       and athlete_tm.team_id = war.team_id
      where war.id = p_recipient_id
        and (
          athlete_tm.user_id = p_user_id
          or private.can_coach_view_athlete(
            p_user_id,
            athlete_tm.user_id,
            war.team_id
          )
        )
    );
$$;

create or replace function private.can_manage_workout_assignment(
  p_user_id uuid,
  p_assignment_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_team_id uuid;
  v_coach_membership_id uuid;
begin
  if p_user_id is distinct from (select auth.uid()) then
    return false;
  end if;

  select wa.team_id
  into v_team_id
  from public.workout_assignments wa
  where wa.id = p_assignment_id;

  if not found then
    return false;
  end if;

  select tm.id
  into v_coach_membership_id
  from public.team_memberships tm
  where tm.team_id = v_team_id
    and tm.user_id = p_user_id
    and tm.member_type = 'coach'
    and tm.status = 'active';

  if not found then
    return false;
  end if;

  return not exists (
    select 1
    from public.workout_assignment_recipients war
    where war.assignment_id = p_assignment_id
      and not exists (
        select 1
        from public.coach_athlete_assignments caa
        join public.team_memberships athlete_tm
          on athlete_tm.id = caa.athlete_membership_id
         and athlete_tm.team_id = caa.team_id
         and athlete_tm.member_type = 'athlete'
         and athlete_tm.status = 'active'
        where caa.team_id = v_team_id
          and caa.coach_membership_id = v_coach_membership_id
          and caa.athlete_membership_id = war.athlete_membership_id
          and caa.active
      )
  );
end;
$$;

revoke all privileges on function private.can_view_workout_assignment(uuid, uuid)
  from public, anon, authenticated;
revoke all privileges on function private.can_view_workout_assignment_targets(uuid, uuid)
  from public, anon, authenticated;
revoke all privileges on function private.can_view_workout_assignment_recipient(uuid, uuid)
  from public, anon, authenticated;
revoke all privileges on function private.can_manage_workout_assignment(uuid, uuid)
  from public, anon, authenticated;

grant execute on function private.can_view_workout_assignment(uuid, uuid)
  to authenticated;
grant execute on function private.can_view_workout_assignment_targets(uuid, uuid)
  to authenticated;
grant execute on function private.can_view_workout_assignment_recipient(uuid, uuid)
  to authenticated;
grant execute on function private.can_manage_workout_assignment(uuid, uuid)
  to authenticated;

create or replace function private.create_workout_assignment(
  p_team_id uuid,
  p_template_id uuid,
  p_scheduled_date date,
  p_due_at timestamptz,
  p_instructions text,
  p_target_team boolean,
  p_group_ids uuid[],
  p_athlete_membership_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_coach_membership_id uuid;
  v_title text;
  v_workout_type text;
  v_assignment_id uuid;
  v_group_ids uuid[] := coalesce(p_group_ids, '{}'::uuid[]);
  v_athlete_ids uuid[] := coalesce(p_athlete_membership_ids, '{}'::uuid[]);
  v_target_team boolean := coalesce(p_target_team, false);
  v_recipient_ids uuid[];
  v_authorized_count integer;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if p_team_id is null or p_template_id is null or p_scheduled_date is null then
    raise exception 'team, template, and scheduled date are required' using errcode = '22023';
  end if;

  if not v_target_team
     and cardinality(v_group_ids) = 0
     and cardinality(v_athlete_ids) = 0 then
    raise exception 'at least one assignment target is required' using errcode = '22023';
  end if;

  if array_position(v_group_ids, null) is not null
     or array_position(v_athlete_ids, null) is not null then
    raise exception 'assignment targets cannot contain null identifiers' using errcode = '22023';
  end if;

  select tm.id
  into v_coach_membership_id
  from public.team_memberships tm
  where tm.team_id = p_team_id
    and tm.user_id = v_user_id
    and tm.member_type = 'coach'
    and tm.status = 'active'
  for share;

  if not found then
    raise exception 'active team coach membership required' using errcode = '42501';
  end if;

  select wt.title, wt.workout_type
  into v_title, v_workout_type
  from public.workout_templates wt
  where wt.id = p_template_id
    and wt.team_id = p_team_id
    and wt.is_active
    and wt.archived_at is null
  for share;

  if not found then
    raise exception 'active workout template not found on team' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.workout_template_entries wte
    where wte.template_id = p_template_id
  ) then
    raise exception 'workout template must contain at least one entry' using errcode = '23514';
  end if;

  if exists (
    select 1
    from unnest(v_group_ids) as requested(group_id)
    where not exists (
      select 1
      from public.team_groups tg
      where tg.id = requested.group_id
        and tg.team_id = p_team_id
        and tg.is_active
    )
  ) then
    raise exception 'every target group must be active on the assignment team' using errcode = '23514';
  end if;

  if exists (
    select 1
    from unnest(v_athlete_ids) as requested(athlete_membership_id)
    where not exists (
      select 1
      from public.team_memberships tm
      where tm.id = requested.athlete_membership_id
        and tm.team_id = p_team_id
        and tm.member_type = 'athlete'
        and tm.status = 'active'
    )
  ) then
    raise exception 'every athlete target must be an active athlete on the assignment team' using errcode = '23514';
  end if;

  select coalesce(array_agg(distinct expanded.athlete_membership_id order by expanded.athlete_membership_id), '{}'::uuid[])
  into v_recipient_ids
  from (
    select tm.id as athlete_membership_id
    from public.team_memberships tm
    where v_target_team
      and tm.team_id = p_team_id
      and tm.member_type = 'athlete'
      and tm.status = 'active'

    union

    select tm.id as athlete_membership_id
    from public.team_group_memberships tgm
    join public.team_memberships tm
      on tm.id = tgm.team_membership_id
     and tm.team_id = tgm.team_id
    where tgm.team_id = p_team_id
      and tgm.group_id = any(v_group_ids)
      and tm.member_type = 'athlete'
      and tm.status = 'active'

    union

    select tm.id as athlete_membership_id
    from public.team_memberships tm
    where tm.team_id = p_team_id
      and tm.id = any(v_athlete_ids)
      and tm.member_type = 'athlete'
      and tm.status = 'active'
  ) expanded;

  if cardinality(v_recipient_ids) = 0 then
    raise exception 'assignment targets resolved to no active athletes' using errcode = '23514';
  end if;

  perform 1
  from public.team_memberships tm
  where tm.team_id = p_team_id
    and tm.id = any(v_recipient_ids)
  for share;

  perform 1
  from public.coach_athlete_assignments caa
  where caa.team_id = p_team_id
    and caa.coach_membership_id = v_coach_membership_id
    and caa.athlete_membership_id = any(v_recipient_ids)
    and caa.active
  for share;

  select count(distinct caa.athlete_membership_id)::integer
  into v_authorized_count
  from public.coach_athlete_assignments caa
  where caa.team_id = p_team_id
    and caa.coach_membership_id = v_coach_membership_id
    and caa.athlete_membership_id = any(v_recipient_ids)
    and caa.active;

  if v_authorized_count <> cardinality(v_recipient_ids) then
    raise exception 'coach must have an active explicit assignment for every target athlete' using errcode = '42501';
  end if;

  insert into public.workout_assignments (
    team_id,
    template_id,
    assigned_by_membership_id,
    scheduled_date,
    due_at,
    title_snapshot,
    workout_type_snapshot,
    instructions,
    status
  ) values (
    p_team_id,
    p_template_id,
    v_coach_membership_id,
    p_scheduled_date,
    p_due_at,
    v_title,
    v_workout_type,
    p_instructions,
    'scheduled'
  ) returning id into v_assignment_id;

  insert into public.workout_assignment_entries (
    assignment_id,
    sort_order,
    exercise_id,
    exercise_name_snapshot,
    label,
    sets,
    reps,
    distance_m,
    target_time_text,
    target_weight,
    recovery_seconds,
    intensity_text,
    notes
  )
  select
    v_assignment_id,
    wte.sort_order,
    wte.exercise_id,
    wte.exercise_name_snapshot,
    wte.label,
    wte.sets,
    wte.reps,
    wte.distance_m,
    wte.target_time_text,
    wte.target_weight,
    wte.recovery_seconds,
    wte.intensity_text,
    wte.notes
  from public.workout_template_entries wte
  where wte.template_id = p_template_id
  order by wte.sort_order;

  if v_target_team then
    insert into public.workout_assignment_targets (
      assignment_id, team_id, target_type
    ) values (
      v_assignment_id, p_team_id, 'team'
    );
  end if;

  insert into public.workout_assignment_targets (
    assignment_id, team_id, target_type, group_id
  )
  select v_assignment_id, p_team_id, 'group', requested.group_id
  from (
    select distinct unnest(v_group_ids) as group_id
  ) requested;

  insert into public.workout_assignment_targets (
    assignment_id, team_id, target_type, athlete_membership_id
  )
  select v_assignment_id, p_team_id, 'athlete', requested.athlete_membership_id
  from (
    select distinct unnest(v_athlete_ids) as athlete_membership_id
  ) requested;

  insert into public.workout_assignment_recipients (
    assignment_id, team_id, athlete_membership_id
  )
  select v_assignment_id, p_team_id, recipient.athlete_membership_id
  from unnest(v_recipient_ids) as recipient(athlete_membership_id);

  return v_assignment_id;
end;
$$;

create or replace function public.create_workout_assignment(
  p_team_id uuid,
  p_template_id uuid,
  p_scheduled_date date,
  p_due_at timestamptz default null,
  p_instructions text default null,
  p_target_team boolean default false,
  p_group_ids uuid[] default '{}'::uuid[],
  p_athlete_membership_ids uuid[] default '{}'::uuid[]
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.create_workout_assignment(
    p_team_id,
    p_template_id,
    p_scheduled_date,
    p_due_at,
    p_instructions,
    p_target_team,
    p_group_ids,
    p_athlete_membership_ids
  );
$$;

create or replace function private.set_workout_assignment_status(
  p_assignment_id uuid,
  p_status text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_current_status text;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if p_status not in ('closed', 'cancelled') then
    raise exception 'unsupported assignment status transition' using errcode = '22023';
  end if;

  select wa.status
  into v_current_status
  from public.workout_assignments wa
  where wa.id = p_assignment_id
  for update;

  if not found then
    raise exception 'workout assignment not found' using errcode = '22023';
  end if;

  if v_current_status <> 'scheduled' then
    raise exception 'only scheduled assignments can be closed or cancelled' using errcode = '23514';
  end if;

  if not private.can_manage_workout_assignment(v_user_id, p_assignment_id) then
    raise exception 'authorized coach relationship required for every assignment recipient' using errcode = '42501';
  end if;

  if p_status = 'closed' then
    update public.workout_assignments
    set status = 'closed',
        closed_at = now(),
        cancelled_at = null
    where id = p_assignment_id;
  else
    update public.workout_assignments
    set status = 'cancelled',
        cancelled_at = now(),
        closed_at = null
    where id = p_assignment_id;
  end if;

  return p_assignment_id;
end;
$$;

create or replace function public.close_workout_assignment(p_assignment_id uuid)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.set_workout_assignment_status(p_assignment_id, 'closed');
$$;

create or replace function public.cancel_workout_assignment(p_assignment_id uuid)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.set_workout_assignment_status(p_assignment_id, 'cancelled');
$$;

revoke all privileges on function private.create_workout_assignment(uuid, uuid, date, timestamptz, text, boolean, uuid[], uuid[])
  from public, anon, authenticated;
revoke all privileges on function private.set_workout_assignment_status(uuid, text)
  from public, anon, authenticated;
grant execute on function private.create_workout_assignment(uuid, uuid, date, timestamptz, text, boolean, uuid[], uuid[])
  to authenticated;
grant execute on function private.set_workout_assignment_status(uuid, text)
  to authenticated;

revoke all privileges on function public.create_workout_assignment(uuid, uuid, date, timestamptz, text, boolean, uuid[], uuid[])
  from public, anon;
revoke all privileges on function public.close_workout_assignment(uuid)
  from public, anon;
revoke all privileges on function public.cancel_workout_assignment(uuid)
  from public, anon;
grant execute on function public.create_workout_assignment(uuid, uuid, date, timestamptz, text, boolean, uuid[], uuid[])
  to authenticated;
grant execute on function public.close_workout_assignment(uuid)
  to authenticated;
grant execute on function public.cancel_workout_assignment(uuid)
  to authenticated;

create trigger workout_assignments_set_updated_at
before update on public.workout_assignments
for each row execute function public.set_updated_at();

alter table public.workout_assignments enable row level security;
alter table public.workout_assignment_entries enable row level security;
alter table public.workout_assignment_targets enable row level security;
alter table public.workout_assignment_recipients enable row level security;

revoke all privileges on table public.workout_assignments from anon, authenticated;
revoke all privileges on table public.workout_assignment_entries from anon, authenticated;
revoke all privileges on table public.workout_assignment_targets from anon, authenticated;
revoke all privileges on table public.workout_assignment_recipients from anon, authenticated;

grant select on public.workout_assignments to authenticated;
grant select on public.workout_assignment_entries to authenticated;
grant select on public.workout_assignment_targets to authenticated;
grant select on public.workout_assignment_recipients to authenticated;

create policy workout_assignments_authorized_select
on public.workout_assignments
for select to authenticated
using (
  private.can_view_workout_assignment((select auth.uid()), id)
);

create policy workout_assignment_entries_authorized_select
on public.workout_assignment_entries
for select to authenticated
using (
  private.can_view_workout_assignment((select auth.uid()), assignment_id)
);

create policy workout_assignment_targets_coach_or_manager_select
on public.workout_assignment_targets
for select to authenticated
using (
  private.can_view_workout_assignment_targets((select auth.uid()), assignment_id)
);

create policy workout_assignment_recipients_authorized_select
on public.workout_assignment_recipients
for select to authenticated
using (
  private.can_view_workout_assignment_recipient((select auth.uid()), id)
);
