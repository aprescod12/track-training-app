-- Reconcile the repository schema with the hardened hosted production posture.
-- This migration is intentionally forward-only: older baseline migrations remain immutable.

create schema if not exists private;
grant usage on schema private to anon, authenticated;

-- Future public tables/functions should not inherit broad client privileges.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

-- Keep friendship authorization privileged but outside the exposed public API schema.
create or replace function private.is_friends(viewer uuid, owner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select viewer = (select auth.uid())
    and exists (
      select 1
      from public.friendships f
      where f.status = 'accepted'
        and f.user_low = least(viewer, owner)
        and f.user_high = greatest(viewer, owner)
    );
$$;
revoke all privileges on function private.is_friends(uuid, uuid) from public, anon;
grant execute on function private.is_friends(uuid, uuid) to authenticated;

-- Re-point every policy that previously depended on public.is_friends.
drop policy if exists workouts_friends_select on public.workouts;
create policy workouts_friends_select on public.workouts
for select to authenticated
using (private.is_friends((select auth.uid()), user_id));

drop policy if exists workout_entries_friends_select on public.workout_entries;
create policy workout_entries_friends_select on public.workout_entries
for select to authenticated
using (
  exists (
    select 1
    from public.workouts w
    where w.id = workout_entries.workout_id
      and private.is_friends((select auth.uid()), w.user_id)
  )
);

drop policy if exists entry_sets_friends_select on public.entry_sets;
create policy entry_sets_friends_select on public.entry_sets
for select to authenticated
using (
  exists (
    select 1
    from public.workout_entries we
    join public.workouts w on w.id = we.workout_id
    where we.id = entry_sets.entry_id
      and private.is_friends((select auth.uid()), w.user_id)
  )
);

drop policy if exists exercise_prs_select_self_and_friends on public.exercise_prs;
drop policy if exists exercise_prs_self_and_friends_select on public.exercise_prs;
create policy exercise_prs_self_and_friends_select on public.exercise_prs
for select to authenticated
using (
  user_id = (select auth.uid())
  or private.is_friends((select auth.uid()), user_id)
);

drop policy if exists achievements_friends_select on public.achievements;
drop policy if exists achievements_self_and_friends_select on public.achievements;
create policy achievements_self_and_friends_select on public.achievements
for select to authenticated
using (
  user_id = (select auth.uid())
  or private.is_friends((select auth.uid()), user_id)
);

drop function if exists public.is_friends(uuid, uuid);

-- Narrow username availability to a public invoker wrapper over a private lookup.
create or replace function private.is_username_available(candidate text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    candidate is not null
    and lower(btrim(candidate)) ~ '^[a-z0-9_]{3,20}$'
    and not exists (
      select 1
      from public.profiles p
      where p.username = lower(btrim(candidate))
    );
$$;
revoke all privileges on function private.is_username_available(text) from public;
grant execute on function private.is_username_available(text) to anon, authenticated;

create or replace function public.is_username_available(candidate text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.is_username_available(candidate);
$$;
revoke all privileges on function public.is_username_available(text) from public, anon, authenticated;
grant execute on function public.is_username_available(text) to anon, authenticated;

-- Auth provisioning is a trigger implementation, not a client RPC.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_full_name text := nullif(btrim(coalesce(new.raw_user_meta_data->>'full_name', '')), '');
  requested_username text := nullif(lower(btrim(coalesce(new.raw_user_meta_data->>'username', ''))), '');
begin
  insert into public.profiles (id, full_name, username)
  values (new.id, requested_full_name, requested_username);
  return new;
end;
$$;
revoke all privileges on function private.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();
drop function if exists public.handle_new_user();

-- Pin helper search paths and remove direct client execution where not required.
alter function public.normalize_username() set search_path = public, pg_temp;
alter function public.parse_time_to_seconds(text) set search_path = public, pg_temp;
alter function public.recompute_exercise_pr(uuid, uuid) set search_path = '';
alter function public.set_updated_at() set search_path = public, pg_temp;
alter function public.trg_recompute_pr_after_entry_delete() security definer;
alter function public.trg_recompute_pr_after_entry_delete() set search_path = '';
alter function public.trg_recompute_pr_after_entry_update() security definer;
alter function public.trg_recompute_pr_after_entry_update() set search_path = '';
alter function public.trg_recompute_pr_after_set_change() set search_path = '';

-- Obsolete duplicate trigger helpers are not part of the API surface.
drop function if exists public.tg_entry_sets_recompute_pr();
drop function if exists public.tg_workout_entries_recompute_pr();
drop function if exists public.trg_workout_entries_recompute_pr();

revoke all privileges on function public.normalize_username() from public, anon, authenticated;
revoke all privileges on function public.recompute_exercise_pr(uuid, uuid) from public, anon, authenticated;
revoke all privileges on function public.set_updated_at() from public, anon, authenticated;
revoke all privileges on function public.trg_recompute_pr_after_entry_delete() from public, anon, authenticated;
revoke all privileges on function public.trg_recompute_pr_after_entry_update() from public, anon, authenticated;
revoke all privileges on function public.trg_recompute_pr_after_set_change() from public, anon, authenticated;
revoke all privileges on function public.parse_time_to_seconds(text) from public, anon, authenticated;
grant execute on function public.parse_time_to_seconds(text) to authenticated;
