-- Coach responsibility scopes: group organization + domain-specific training authority.
--
-- Permanent boundaries preserved by this migration:
-- - Team/group membership does not grant athlete training access.
-- - coach_athlete_assignments remains the athlete-visibility gate.
-- - Explicitly assigned coaches may continue to view an athlete across track/lift domains.
-- - Prescription and formal-review writes are limited by track/lift coaching authority.

alter table public.team_memberships
  add column if not exists role_title text;

alter table public.team_memberships
  drop constraint if exists team_memberships_role_title_check;

alter table public.team_memberships
  add constraint team_memberships_role_title_check
  check (
    role_title is null
    or (length(btrim(role_title)) between 1 and 80)
  );

grant update (role_title) on public.team_memberships to authenticated;

create table public.coach_training_permissions (
  team_id uuid not null,
  coach_membership_id uuid not null,
  workout_type text not null,
  can_prescribe boolean not null default false,
  can_review boolean not null default false,
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coach_training_permissions_pkey
    primary key (team_id, coach_membership_id, workout_type),
  constraint coach_training_permissions_membership_same_team_fkey
    foreign key (team_id, coach_membership_id)
    references public.team_memberships(team_id, id)
    on delete cascade,
  constraint coach_training_permissions_workout_type_check
    check (workout_type in ('track', 'lift'))
);

create index coach_training_permissions_membership_idx
  on public.coach_training_permissions (coach_membership_id, workout_type);

create trigger coach_training_permissions_set_updated_at
before update on public.coach_training_permissions
for each row execute function public.set_updated_at();

create or replace function private.validate_coach_training_permission_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.team_memberships tm
    where tm.team_id = new.team_id
      and tm.id = new.coach_membership_id
      and tm.member_type = 'coach'
  ) then
    raise exception 'training permissions require a coach membership on the same team'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all privileges on function private.validate_coach_training_permission_membership()
  from public, anon, authenticated;

create trigger coach_training_permissions_membership_guard
before insert or update of team_id, coach_membership_id
on public.coach_training_permissions
for each row execute function private.validate_coach_training_permission_membership();

-- Preserve production behavior for coaches who already existed before this migration.
-- New non-owner coaches are intentionally seeded with no prescription/review authority
-- until a team manager explicitly configures them.
insert into public.coach_training_permissions (
  team_id,
  coach_membership_id,
  workout_type,
  can_prescribe,
  can_review,
  granted_by
)
select
  tm.team_id,
  tm.id,
  scope.workout_type,
  true,
  true,
  null
from public.team_memberships tm
cross join (values ('track'::text), ('lift'::text)) as scope(workout_type)
where tm.member_type = 'coach'
  and tm.status = 'active'
on conflict (team_id, coach_membership_id, workout_type) do nothing;

create or replace function private.seed_new_coach_training_permissions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_default boolean;
begin
  if new.member_type = 'coach' and new.status = 'active' then
    v_owner_default := new.management_role = 'owner';

    insert into public.coach_training_permissions (
      team_id,
      coach_membership_id,
      workout_type,
      can_prescribe,
      can_review,
      granted_by
    ) values
      (new.team_id, new.id, 'track', v_owner_default, v_owner_default, null),
      (new.team_id, new.id, 'lift', v_owner_default, v_owner_default, null)
    on conflict (team_id, coach_membership_id, workout_type) do nothing;
  end if;

  return new;
end;
$$;

revoke all privileges on function private.seed_new_coach_training_permissions()
  from public, anon, authenticated;

drop trigger if exists team_memberships_seed_training_permissions on public.team_memberships;
create trigger team_memberships_seed_training_permissions
after insert or update of member_type, management_role, status
on public.team_memberships
for each row execute function private.seed_new_coach_training_permissions();

create or replace function private.coach_membership_has_training_permission(
  p_user_id uuid,
  p_team_id uuid,
  p_coach_membership_id uuid,
  p_workout_type text,
  p_permission text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id = (select auth.uid())
    and p_permission in ('prescribe', 'review')
    and exists (
      select 1
      from public.team_memberships tm
      join public.coach_training_permissions ctp
        on ctp.team_id = tm.team_id
       and ctp.coach_membership_id = tm.id
       and ctp.workout_type = p_workout_type
      where tm.team_id = p_team_id
        and tm.id = p_coach_membership_id
        and tm.user_id = p_user_id
        and tm.member_type = 'coach'
        and tm.status = 'active'
        and (
          (p_permission = 'prescribe' and ctp.can_prescribe)
          or (p_permission = 'review' and ctp.can_review)
        )
    );
$$;

create or replace function private.current_coach_has_training_permission(
  p_user_id uuid,
  p_team_id uuid,
  p_workout_type text,
  p_permission text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id = (select auth.uid())
    and p_permission in ('prescribe', 'review')
    and exists (
      select 1
      from public.team_memberships tm
      join public.coach_training_permissions ctp
        on ctp.team_id = tm.team_id
       and ctp.coach_membership_id = tm.id
       and ctp.workout_type = p_workout_type
      where tm.team_id = p_team_id
        and tm.user_id = p_user_id
        and tm.member_type = 'coach'
        and tm.status = 'active'
        and (
          (p_permission = 'prescribe' and ctp.can_prescribe)
          or (p_permission = 'review' and ctp.can_review)
        )
    );
$$;

revoke all privileges on function private.coach_membership_has_training_permission(uuid, uuid, uuid, text, text)
  from public, anon, authenticated;
revoke all privileges on function private.current_coach_has_training_permission(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function private.coach_membership_has_training_permission(uuid, uuid, uuid, text, text)
  to authenticated;
grant execute on function private.current_coach_has_training_permission(uuid, uuid, text, text)
  to authenticated;

alter table public.coach_training_permissions enable row level security;

revoke all privileges on table public.coach_training_permissions from anon, authenticated;
grant select on public.coach_training_permissions to authenticated;
grant insert (
  team_id,
  coach_membership_id,
  workout_type,
  can_prescribe,
  can_review,
  granted_by
) on public.coach_training_permissions to authenticated;
grant update (
  can_prescribe,
  can_review,
  granted_by
) on public.coach_training_permissions to authenticated;
grant delete on public.coach_training_permissions to authenticated;

create policy coach_training_permissions_team_select
on public.coach_training_permissions
for select to authenticated
using (private.is_team_member((select auth.uid()), team_id));

create policy coach_training_permissions_manager_insert
on public.coach_training_permissions
for insert to authenticated
with check (private.can_manage_team((select auth.uid()), team_id));

create policy coach_training_permissions_manager_update
on public.coach_training_permissions
for update to authenticated
using (private.can_manage_team((select auth.uid()), team_id))
with check (private.can_manage_team((select auth.uid()), team_id));

create policy coach_training_permissions_manager_delete
on public.coach_training_permissions
for delete to authenticated
using (private.can_manage_team((select auth.uid()), team_id));

-- Template entries inherit the template's domain authority.
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
        and private.current_coach_has_training_permission(
          p_user_id,
          wt.team_id,
          wt.workout_type,
          'prescribe'
        )
    );
$$;

revoke all privileges on function private.can_edit_workout_template(uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.can_edit_workout_template(uuid, uuid)
  to authenticated;

drop policy if exists workout_templates_active_coach_insert on public.workout_templates;
create policy workout_templates_scoped_coach_insert
on public.workout_templates
for insert to authenticated
with check (
  private.is_active_team_coach_membership(
    (select auth.uid()),
    team_id,
    created_by_membership_id
  )
  and private.current_coach_has_training_permission(
    (select auth.uid()),
    team_id,
    workout_type,
    'prescribe'
  )
  and is_active
  and archived_at is null
);

drop policy if exists workout_templates_active_coach_update on public.workout_templates;
create policy workout_templates_scoped_coach_update
on public.workout_templates
for update to authenticated
using (
  archived_at is null
  and private.current_coach_has_training_permission(
    (select auth.uid()),
    team_id,
    workout_type,
    'prescribe'
  )
)
with check (
  private.current_coach_has_training_permission(
    (select auth.uid()),
    team_id,
    workout_type,
    'prescribe'
  )
);

create or replace function private.enforce_workout_template_training_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and not private.current_coach_has_training_permission(
       v_user_id,
       old.team_id,
       old.workout_type,
       'prescribe'
     ) then
    raise exception 'coach does not have prescription authority for this workout type'
      using errcode = '42501';
  end if;

  if not private.current_coach_has_training_permission(
    v_user_id,
    new.team_id,
    new.workout_type,
    'prescribe'
  ) then
    raise exception 'coach does not have prescription authority for this workout type'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all privileges on function private.enforce_workout_template_training_scope()
  from public, anon, authenticated;

drop trigger if exists workout_templates_training_scope_guard on public.workout_templates;
create trigger workout_templates_training_scope_guard
before insert or update on public.workout_templates
for each row execute function private.enforce_workout_template_training_scope();

-- create_workout_assignment is SECURITY DEFINER; enforce the domain at the table
-- boundary so every assignment mutation path remains protected.
create or replace function private.enforce_workout_assignment_training_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and not private.current_coach_has_training_permission(
       v_user_id,
       old.team_id,
       old.workout_type_snapshot,
       'prescribe'
     ) then
    raise exception 'coach does not have prescription authority for this assignment type'
      using errcode = '42501';
  end if;

  if not private.current_coach_has_training_permission(
    v_user_id,
    new.team_id,
    new.workout_type_snapshot,
    'prescribe'
  ) then
    raise exception 'coach does not have prescription authority for this assignment type'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all privileges on function private.enforce_workout_assignment_training_scope()
  from public, anon, authenticated;

drop trigger if exists workout_assignments_training_scope_guard on public.workout_assignments;
create trigger workout_assignments_training_scope_guard
before insert or update on public.workout_assignments
for each row execute function private.enforce_workout_assignment_training_scope();

-- Reading remains based on explicit coach-athlete authorization. Only formal
-- review writes are domain-scoped.
create or replace function private.enforce_workout_submission_review_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_workout_type text;
begin
  if v_user_id is null then
    return new;
  end if;

  -- Athlete revisions intentionally clear prior review metadata.
  if new.reviewed_at is null
     and new.reviewed_by_membership_id is null
     and new.coach_note is null then
    return new;
  end if;

  select wa.workout_type_snapshot
  into v_workout_type
  from public.workout_assignment_recipients war
  join public.workout_assignments wa
    on wa.id = war.assignment_id
   and wa.team_id = war.team_id
  where war.id = new.assignment_recipient_id
    and war.team_id = new.team_id;

  if not found then
    raise exception 'assignment not found for coach review' using errcode = '22023';
  end if;

  if not private.current_coach_has_training_permission(
    v_user_id,
    new.team_id,
    v_workout_type,
    'review'
  ) then
    raise exception 'coach does not have review authority for this workout type'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all privileges on function private.enforce_workout_submission_review_scope()
  from public, anon, authenticated;

drop trigger if exists workout_assignment_submissions_review_scope_guard
  on public.workout_assignment_submissions;
create trigger workout_assignment_submissions_review_scope_guard
before update of reviewed_at, reviewed_by_membership_id, coach_note
on public.workout_assignment_submissions
for each row execute function private.enforce_workout_submission_review_scope();
