-- Migration D1: reusable coach-authored workout template foundation.
-- This migration does not create athlete assignments or change workout visibility.

create table public.workout_templates (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  created_by_membership_id uuid not null,
  title text not null,
  workout_type text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint workout_templates_creator_same_team_fkey
    foreign key (team_id, created_by_membership_id)
    references public.team_memberships(team_id, id),
  constraint workout_templates_title_check
    check (length(btrim(title)) > 0),
  constraint workout_templates_workout_type_check
    check (workout_type in ('track', 'lift')),
  constraint workout_templates_archive_state_check
    check (
      (is_active and archived_at is null)
      or ((not is_active) and archived_at is not null)
    )
);

create table public.workout_template_entries (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.workout_templates(id) on delete cascade,
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
  updated_at timestamptz not null default now(),
  constraint workout_template_entries_template_sort_unique
    unique (template_id, sort_order),
  constraint workout_template_entries_sort_order_check
    check (sort_order >= 0),
  constraint workout_template_entries_exercise_name_check
    check (length(btrim(exercise_name_snapshot)) > 0),
  constraint workout_template_entries_sets_check
    check (sets is null or sets > 0),
  constraint workout_template_entries_reps_check
    check (reps is null or reps > 0),
  constraint workout_template_entries_distance_check
    check (distance_m is null or distance_m >= 0),
  constraint workout_template_entries_target_weight_check
    check (target_weight is null or target_weight >= 0),
  constraint workout_template_entries_recovery_check
    check (recovery_seconds is null or recovery_seconds >= 0),
  constraint workout_template_entries_target_time_check
    check (target_time_text is null or length(btrim(target_time_text)) > 0),
  constraint workout_template_entries_intensity_check
    check (intensity_text is null or length(btrim(intensity_text)) > 0)
);

create index workout_templates_team_active_updated_idx
  on public.workout_templates (team_id, is_active, updated_at desc);
create index workout_templates_creator_membership_idx
  on public.workout_templates (team_id, created_by_membership_id);
create index workout_template_entries_exercise_id_idx
  on public.workout_template_entries (exercise_id)
  where exercise_id is not null;

create or replace function private.is_active_team_coach_membership(
  p_user_id uuid,
  p_team_id uuid,
  p_membership_id uuid
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
      from public.team_memberships tm
      where tm.id = p_membership_id
        and tm.team_id = p_team_id
        and tm.user_id = p_user_id
        and tm.member_type = 'coach'
        and tm.status = 'active'
    );
$$;

create or replace function private.can_view_workout_template(
  p_user_id uuid,
  p_template_id uuid
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
      from public.workout_templates wt
      where wt.id = p_template_id
        and (
          private.is_team_coach(p_user_id, wt.team_id)
          or private.can_manage_team(p_user_id, wt.team_id)
        )
    );
$$;

create or replace function private.can_edit_workout_template(
  p_user_id uuid,
  p_template_id uuid
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
      from public.workout_templates wt
      where wt.id = p_template_id
        and wt.is_active
        and wt.archived_at is null
        and private.is_team_coach(p_user_id, wt.team_id)
    );
$$;

revoke all privileges on function private.is_active_team_coach_membership(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all privileges on function private.can_view_workout_template(uuid, uuid)
  from public, anon, authenticated;
revoke all privileges on function private.can_edit_workout_template(uuid, uuid)
  from public, anon, authenticated;

grant execute on function private.is_active_team_coach_membership(uuid, uuid, uuid)
  to authenticated;
grant execute on function private.can_view_workout_template(uuid, uuid)
  to authenticated;
grant execute on function private.can_edit_workout_template(uuid, uuid)
  to authenticated;

create trigger workout_templates_set_updated_at
before update on public.workout_templates
for each row execute function public.set_updated_at();

create trigger workout_template_entries_set_updated_at
before update on public.workout_template_entries
for each row execute function public.set_updated_at();

alter table public.workout_templates enable row level security;
alter table public.workout_template_entries enable row level security;

revoke all privileges on table public.workout_templates from anon, authenticated;
revoke all privileges on table public.workout_template_entries from anon, authenticated;

grant select on public.workout_templates to authenticated;
grant insert (
  team_id,
  created_by_membership_id,
  title,
  workout_type,
  description
) on public.workout_templates to authenticated;
grant update (
  title,
  workout_type,
  description,
  is_active,
  archived_at
) on public.workout_templates to authenticated;

grant select on public.workout_template_entries to authenticated;
grant insert (
  template_id,
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
) on public.workout_template_entries to authenticated;
grant update (
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
) on public.workout_template_entries to authenticated;
grant delete on public.workout_template_entries to authenticated;

create policy workout_templates_coach_or_manager_select
on public.workout_templates
for select to authenticated
using (
  private.is_team_coach((select auth.uid()), team_id)
  or private.can_manage_team((select auth.uid()), team_id)
);

create policy workout_templates_active_coach_insert
on public.workout_templates
for insert to authenticated
with check (
  private.is_active_team_coach_membership(
    (select auth.uid()),
    team_id,
    created_by_membership_id
  )
  and is_active
  and archived_at is null
);

create policy workout_templates_active_coach_update
on public.workout_templates
for update to authenticated
using (
  archived_at is null
  and private.is_team_coach((select auth.uid()), team_id)
)
with check (
  private.is_team_coach((select auth.uid()), team_id)
);

create policy workout_template_entries_authorized_select
on public.workout_template_entries
for select to authenticated
using (
  private.can_view_workout_template((select auth.uid()), template_id)
);

create policy workout_template_entries_active_coach_insert
on public.workout_template_entries
for insert to authenticated
with check (
  private.can_edit_workout_template((select auth.uid()), template_id)
);

create policy workout_template_entries_active_coach_update
on public.workout_template_entries
for update to authenticated
using (
  private.can_edit_workout_template((select auth.uid()), template_id)
)
with check (
  private.can_edit_workout_template((select auth.uid()), template_id)
);

create policy workout_template_entries_active_coach_delete
on public.workout_template_entries
for delete to authenticated
using (
  private.can_edit_workout_template((select auth.uid()), template_id)
);
