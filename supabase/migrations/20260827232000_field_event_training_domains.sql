-- First-class track & field training domains and field-event attempt logging.
--
-- Product domains are now Running / Jumps / Throws / Lift. The historical
-- `track` value is migrated to `running` before constraints are tightened.
-- Field attempts remain athlete-owned performance records: friends may see
-- personal workouts through friendship, while coaches only see team-context
-- workouts through explicit coach-athlete authorization.

-- ---------------------------------------------------------------------------
-- Domain vocabulary
-- ---------------------------------------------------------------------------

alter table public.workouts
  drop constraint if exists workouts_workout_type_check;

update public.workouts
set workout_type = 'running'
where workout_type = 'track';

alter table public.workouts
  add constraint workouts_workout_type_check
  check (workout_type in ('running', 'jumps', 'throws', 'lift'));

alter table public.exercises
  drop constraint if exists exercises_category_check;

update public.exercises
set category = 'running'
where category = 'track';

alter table public.exercises
  add constraint exercises_category_check
  check (category in ('running', 'jumps', 'throws', 'lift', 'other'));

alter table public.workout_templates
  drop constraint if exists workout_templates_workout_type_check;

update public.workout_templates
set workout_type = 'running'
where workout_type = 'track';

alter table public.workout_templates
  add constraint workout_templates_workout_type_check
  check (workout_type in ('running', 'jumps', 'throws', 'lift'));

alter table public.workout_assignments
  drop constraint if exists workout_assignments_workout_type_check;

update public.workout_assignments
set workout_type_snapshot = 'running'
where workout_type_snapshot = 'track';

alter table public.workout_assignments
  add constraint workout_assignments_workout_type_check
  check (workout_type_snapshot in ('running', 'jumps', 'throws', 'lift'));

alter table public.coach_training_permissions
  drop constraint if exists coach_training_permissions_workout_type_check;

update public.coach_training_permissions
set workout_type = 'running'
where workout_type = 'track';

alter table public.coach_training_permissions
  add constraint coach_training_permissions_workout_type_check
  check (workout_type in ('running', 'jumps', 'throws', 'lift'));

-- Existing Track authority represented responsibility for the entire sport.
-- Preserve that authority during the split by copying Running permissions into
-- Jumps and Throws. Managers can narrow those scopes afterward.
insert into public.coach_training_permissions (
  team_id,
  coach_membership_id,
  workout_type,
  can_prescribe,
  can_review,
  granted_by
)
select
  ctp.team_id,
  ctp.coach_membership_id,
  domain.workout_type,
  ctp.can_prescribe,
  ctp.can_review,
  ctp.granted_by
from public.coach_training_permissions ctp
cross join (values ('jumps'::text), ('throws'::text)) as domain(workout_type)
where ctp.workout_type = 'running'
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
      (new.team_id, new.id, 'running', v_owner_default, v_owner_default, null),
      (new.team_id, new.id, 'jumps', v_owner_default, v_owner_default, null),
      (new.team_id, new.id, 'throws', v_owner_default, v_owner_default, null),
      (new.team_id, new.id, 'lift', v_owner_default, v_owner_default, null)
    on conflict (team_id, coach_membership_id, workout_type) do nothing;
  end if;

  return new;
end;
$$;

revoke all privileges on function private.seed_new_coach_training_permissions()
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Field-event metadata on workout entries and prescriptions
-- ---------------------------------------------------------------------------

alter table public.workout_entries
  add column event_code text,
  add column implement_weight_kg numeric;

alter table public.workout_entries
  add constraint workout_entries_event_code_check
  check (
    event_code is null
    or event_code in (
      'long_jump', 'triple_jump', 'high_jump', 'pole_vault',
      'shot_put', 'discus', 'hammer', 'javelin'
    )
  ),
  add constraint workout_entries_implement_weight_check
  check (implement_weight_kg is null or implement_weight_kg > 0);

alter table public.workout_template_entries
  add column event_code text,
  add column attempts integer,
  add column target_mark_m numeric,
  add column implement_weight_kg numeric;

alter table public.workout_template_entries
  add constraint workout_template_entries_event_code_check
  check (
    event_code is null
    or event_code in (
      'long_jump', 'triple_jump', 'high_jump', 'pole_vault',
      'shot_put', 'discus', 'hammer', 'javelin'
    )
  ),
  add constraint workout_template_entries_attempts_check
  check (attempts is null or attempts > 0),
  add constraint workout_template_entries_target_mark_check
  check (target_mark_m is null or target_mark_m > 0),
  add constraint workout_template_entries_implement_weight_check
  check (implement_weight_kg is null or implement_weight_kg > 0);

alter table public.workout_assignment_entries
  add column event_code text,
  add column attempts integer,
  add column target_mark_m numeric,
  add column implement_weight_kg numeric;

alter table public.workout_assignment_entries
  add constraint workout_assignment_entries_event_code_check
  check (
    event_code is null
    or event_code in (
      'long_jump', 'triple_jump', 'high_jump', 'pole_vault',
      'shot_put', 'discus', 'hammer', 'javelin'
    )
  ),
  add constraint workout_assignment_entries_attempts_check
  check (attempts is null or attempts > 0),
  add constraint workout_assignment_entries_target_mark_check
  check (target_mark_m is null or target_mark_m > 0),
  add constraint workout_assignment_entries_implement_weight_check
  check (implement_weight_kg is null or implement_weight_kg > 0);

grant insert (event_code, attempts, target_mark_m, implement_weight_kg)
  on public.workout_template_entries to authenticated;
grant update (event_code, attempts, target_mark_m, implement_weight_kg)
  on public.workout_template_entries to authenticated;

create or replace function private.validate_workout_entry_training_domain()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_domain text;
begin
  select w.workout_type
  into v_domain
  from public.workouts w
  where w.id = new.workout_id;

  if not found then
    return new;
  end if;

  if v_domain = 'jumps' then
    if new.event_code not in ('long_jump', 'triple_jump', 'high_jump', 'pole_vault') then
      raise exception 'jump workout entries require a jump event'
        using errcode = '23514';
    end if;
    if new.implement_weight_kg is not null then
      raise exception 'jump workout entries cannot use implement weight'
        using errcode = '23514';
    end if;
  elsif v_domain = 'throws' then
    if new.event_code not in ('shot_put', 'discus', 'hammer', 'javelin') then
      raise exception 'throw workout entries require a throwing event'
        using errcode = '23514';
    end if;
    if new.implement_weight_kg is null then
      raise exception 'throw workout entries require implement weight'
        using errcode = '23514';
    end if;
  elsif new.event_code is not null or new.implement_weight_kg is not null then
    raise exception 'field-event metadata is allowed only on jumps or throws workouts'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all privileges on function private.validate_workout_entry_training_domain()
  from public, anon, authenticated;

drop trigger if exists workout_entries_training_domain_guard on public.workout_entries;
create trigger workout_entries_training_domain_guard
before insert or update of workout_id, event_code, implement_weight_kg
on public.workout_entries
for each row execute function private.validate_workout_entry_training_domain();

create or replace function private.validate_template_entry_training_domain()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_domain text;
begin
  select wt.workout_type
  into v_domain
  from public.workout_templates wt
  where wt.id = new.template_id;

  if not found then
    return new;
  end if;

  if v_domain = 'jumps' then
    if new.event_code not in ('long_jump', 'triple_jump', 'high_jump', 'pole_vault') then
      raise exception 'jump prescriptions require a jump event'
        using errcode = '23514';
    end if;
    if new.implement_weight_kg is not null then
      raise exception 'jump prescriptions cannot use implement weight'
        using errcode = '23514';
    end if;
  elsif v_domain = 'throws' then
    if new.event_code not in ('shot_put', 'discus', 'hammer', 'javelin') then
      raise exception 'throw prescriptions require a throwing event'
        using errcode = '23514';
    end if;
  elsif new.event_code is not null
     or new.attempts is not null
     or new.target_mark_m is not null
     or new.implement_weight_kg is not null then
    raise exception 'field-event prescription fields require jumps or throws domain'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all privileges on function private.validate_template_entry_training_domain()
  from public, anon, authenticated;

drop trigger if exists workout_template_entries_training_domain_guard
  on public.workout_template_entries;
create trigger workout_template_entries_training_domain_guard
before insert or update of template_id, event_code, attempts, target_mark_m, implement_weight_kg
on public.workout_template_entries
for each row execute function private.validate_template_entry_training_domain();

-- The existing assignment RPC snapshots the legacy columns. Fill the new field
-- columns from the source template at the assignment-entry boundary so the
-- snapshot remains immutable without duplicating the large RPC implementation.
create or replace function private.snapshot_field_prescription_metadata()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_code text;
  v_attempts integer;
  v_target_mark_m numeric;
  v_implement_weight_kg numeric;
begin
  select
    wte.event_code,
    wte.attempts,
    wte.target_mark_m,
    wte.implement_weight_kg
  into
    v_event_code,
    v_attempts,
    v_target_mark_m,
    v_implement_weight_kg
  from public.workout_assignments wa
  join public.workout_template_entries wte
    on wte.template_id = wa.template_id
   and wte.sort_order = new.sort_order
  where wa.id = new.assignment_id;

  if found then
    new.event_code := coalesce(new.event_code, v_event_code);
    new.attempts := coalesce(new.attempts, v_attempts);
    new.target_mark_m := coalesce(new.target_mark_m, v_target_mark_m);
    new.implement_weight_kg := coalesce(new.implement_weight_kg, v_implement_weight_kg);
  end if;

  return new;
end;
$$;

revoke all privileges on function private.snapshot_field_prescription_metadata()
  from public, anon, authenticated;

drop trigger if exists workout_assignment_entries_field_snapshot
  on public.workout_assignment_entries;
create trigger workout_assignment_entries_field_snapshot
before insert on public.workout_assignment_entries
for each row execute function private.snapshot_field_prescription_metadata();

-- ---------------------------------------------------------------------------
-- Attempt-level athlete performance
-- ---------------------------------------------------------------------------

create table public.field_attempts (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.workout_entries(id) on delete cascade,
  attempt_number integer not null,
  mark_m numeric,
  outcome text not null,
  notes text,
  created_at timestamptz not null default now(),
  constraint field_attempts_entry_attempt_unique unique (entry_id, attempt_number),
  constraint field_attempts_attempt_number_check check (attempt_number > 0),
  constraint field_attempts_mark_check check (mark_m is null or mark_m > 0),
  constraint field_attempts_outcome_check
    check (outcome in ('valid', 'foul', 'unmeasured', 'clear', 'miss', 'pass')),
  constraint field_attempts_notes_check
    check (notes is null or length(btrim(notes)) > 0)
);

create index field_attempts_entry_idx
  on public.field_attempts (entry_id, attempt_number);

create or replace function private.validate_field_attempt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_domain text;
  v_event_code text;
begin
  select w.workout_type, we.event_code
  into v_domain, v_event_code
  from public.workout_entries we
  join public.workouts w on w.id = we.workout_id
  where we.id = new.entry_id;

  if not found or v_domain not in ('jumps', 'throws') then
    raise exception 'field attempts require a jumps or throws workout entry'
      using errcode = '23514';
  end if;

  if v_event_code in ('high_jump', 'pole_vault') then
    if new.outcome not in ('clear', 'miss', 'pass') then
      raise exception 'vertical jump attempts require clear, miss, or pass outcome'
        using errcode = '23514';
    end if;
    if new.mark_m is null then
      raise exception 'vertical jump attempts require a bar height'
        using errcode = '23514';
    end if;
  else
    if new.outcome not in ('valid', 'foul', 'unmeasured') then
      raise exception 'horizontal jump and throw attempts require valid, foul, or unmeasured outcome'
        using errcode = '23514';
    end if;
    if new.outcome = 'valid' and new.mark_m is null then
      raise exception 'valid field attempts require a measured mark'
        using errcode = '23514';
    end if;
    if new.outcome = 'unmeasured' then
      new.mark_m := null;
    end if;
  end if;

  return new;
end;
$$;

revoke all privileges on function private.validate_field_attempt()
  from public, anon, authenticated;

create trigger field_attempts_domain_guard
before insert or update of entry_id, mark_m, outcome
on public.field_attempts
for each row execute function private.validate_field_attempt();

alter table public.field_attempts enable row level security;
revoke all privileges on table public.field_attempts from anon, authenticated;
grant select, insert, update, delete on public.field_attempts to authenticated;

create policy field_attempts_authorized_select
on public.field_attempts
for select to authenticated
using (
  private.can_read_workout_entry((select auth.uid()), entry_id)
);

create policy field_attempts_owner_insert
on public.field_attempts
for insert to authenticated
with check (
  exists (
    select 1
    from public.workout_entries we
    join public.workouts w on w.id = we.workout_id
    where we.id = field_attempts.entry_id
      and w.user_id = (select auth.uid())
  )
);

create policy field_attempts_owner_update
on public.field_attempts
for update to authenticated
using (
  exists (
    select 1
    from public.workout_entries we
    join public.workouts w on w.id = we.workout_id
    where we.id = field_attempts.entry_id
      and w.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.workout_entries we
    join public.workouts w on w.id = we.workout_id
    where we.id = field_attempts.entry_id
      and w.user_id = (select auth.uid())
  )
);

create policy field_attempts_owner_delete
on public.field_attempts
for delete to authenticated
using (
  exists (
    select 1
    from public.workout_entries we
    join public.workouts w on w.id = we.workout_id
    where we.id = field_attempts.entry_id
      and w.user_id = (select auth.uid())
  )
);

-- Built-in field-event exercise identities. score_type is intentionally
-- `max_mark`; the existing running/lift PR engine remains untouched while the
-- field best surface below handles valid marks.
insert into public.exercises (name, category, distance_m, score_type, created_by)
select seed.name, seed.category, null, 'max_mark', null
from (values
  ('Long Jump'::text, 'jumps'::text),
  ('Triple Jump'::text, 'jumps'::text),
  ('High Jump'::text, 'jumps'::text),
  ('Pole Vault'::text, 'jumps'::text),
  ('Shot Put'::text, 'throws'::text),
  ('Discus'::text, 'throws'::text),
  ('Hammer'::text, 'throws'::text),
  ('Javelin'::text, 'throws'::text)
) as seed(name, category)
where not exists (
  select 1 from public.exercises e where lower(e.name) = lower(seed.name)
);

create or replace view public.field_event_bests_v
with (security_invoker = true)
as
select
  w.user_id,
  we.event_code,
  we.implement_weight_kg,
  max(fa.mark_m) as best_mark_m
from public.field_attempts fa
join public.workout_entries we on we.id = fa.entry_id
join public.workouts w on w.id = we.workout_id
where fa.outcome in ('valid', 'clear')
  and we.event_code is not null
group by w.user_id, we.event_code, we.implement_weight_kg;

revoke all privileges on table public.field_event_bests_v from anon, authenticated;
grant select on table public.field_event_bests_v to authenticated;
