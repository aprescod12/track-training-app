-- Production foundation security cleanup for the existing Track Training schema.
-- Validated against project pxkpfgultgopernrmqzv inside a transaction that was rolled back.

-- Remove broad Data API privileges and grant only what the mobile app needs.
do $$
declare
  relation_name text;
begin
  foreach relation_name in array array[
    'achievements','calendar_events','entry_sets','exercise_prs','exercises',
    'friendships','profiles','workout_entries','workouts','workout_summary_v'
  ] loop
    execute format('revoke all privileges on table public.%I from anon, authenticated', relation_name);
  end loop;
end $$;

grant select, insert, update, delete on public.achievements, public.calendar_events,
  public.entry_sets, public.exercise_prs, public.exercises, public.friendships,
  public.workout_entries, public.workouts to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select on public.workout_summary_v to authenticated;
alter view public.workout_summary_v set (security_invoker = true);

-- Replace accumulated duplicate policies with one explicit policy set.
do $$
declare
  p record;
begin
  for p in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = any (array[
        'achievements','calendar_events','entry_sets','exercise_prs','exercises',
        'friendships','profiles','workout_entries','workouts'
      ])
  loop
    execute format('drop policy if exists %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

create or replace function public.is_friends(viewer uuid, owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
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

create policy profiles_authenticated_read on public.profiles
  for select to authenticated using (true);
create policy profiles_insert_own on public.profiles
  for insert to authenticated with check ((select auth.uid()) = id);
create policy profiles_update_own on public.profiles
  for update to authenticated using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy workouts_owner_select on public.workouts
  for select to authenticated using ((select auth.uid()) = user_id);
create policy workouts_friends_select on public.workouts
  for select to authenticated using (public.is_friends((select auth.uid()), user_id));
create policy workouts_owner_insert on public.workouts
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy workouts_owner_update on public.workouts
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy workouts_owner_delete on public.workouts
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy workout_entries_owner_select on public.workout_entries
  for select to authenticated using (
    (select auth.uid()) = user_id and exists (
      select 1 from public.workouts w
      where w.id = workout_entries.workout_id and w.user_id = (select auth.uid())
    )
  );
create policy workout_entries_friends_select on public.workout_entries
  for select to authenticated using (exists (
    select 1 from public.workouts w
    where w.id = workout_entries.workout_id
      and public.is_friends((select auth.uid()), w.user_id)
  ));
create policy workout_entries_owner_insert on public.workout_entries
  for insert to authenticated with check (
    (select auth.uid()) = user_id and exists (
      select 1 from public.workouts w
      where w.id = workout_entries.workout_id and w.user_id = (select auth.uid())
    )
  );
create policy workout_entries_owner_update on public.workout_entries
  for update to authenticated using (
    (select auth.uid()) = user_id and exists (
      select 1 from public.workouts w
      where w.id = workout_entries.workout_id and w.user_id = (select auth.uid())
    )
  ) with check (
    (select auth.uid()) = user_id and exists (
      select 1 from public.workouts w
      where w.id = workout_entries.workout_id and w.user_id = (select auth.uid())
    )
  );
create policy workout_entries_owner_delete on public.workout_entries
  for delete to authenticated using (
    (select auth.uid()) = user_id and exists (
      select 1 from public.workouts w
      where w.id = workout_entries.workout_id and w.user_id = (select auth.uid())
    )
  );

create policy entry_sets_owner_select on public.entry_sets
  for select to authenticated using (exists (
    select 1 from public.workout_entries we
    join public.workouts w on w.id = we.workout_id
    where we.id = entry_sets.entry_id and w.user_id = (select auth.uid())
  ));
create policy entry_sets_friends_select on public.entry_sets
  for select to authenticated using (exists (
    select 1 from public.workout_entries we
    join public.workouts w on w.id = we.workout_id
    where we.id = entry_sets.entry_id
      and public.is_friends((select auth.uid()), w.user_id)
  ));
create policy entry_sets_owner_insert on public.entry_sets
  for insert to authenticated with check (exists (
    select 1 from public.workout_entries we
    join public.workouts w on w.id = we.workout_id
    where we.id = entry_sets.entry_id and w.user_id = (select auth.uid())
  ));
create policy entry_sets_owner_update on public.entry_sets
  for update to authenticated using (exists (
    select 1 from public.workout_entries we
    join public.workouts w on w.id = we.workout_id
    where we.id = entry_sets.entry_id and w.user_id = (select auth.uid())
  )) with check (exists (
    select 1 from public.workout_entries we
    join public.workouts w on w.id = we.workout_id
    where we.id = entry_sets.entry_id and w.user_id = (select auth.uid())
  ));
create policy entry_sets_owner_delete on public.entry_sets
  for delete to authenticated using (exists (
    select 1 from public.workout_entries we
    join public.workouts w on w.id = we.workout_id
    where we.id = entry_sets.entry_id and w.user_id = (select auth.uid())
  ));

create policy calendar_events_owner_select on public.calendar_events
  for select to authenticated using ((select auth.uid()) = user_id);
create policy calendar_events_owner_insert on public.calendar_events
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy calendar_events_owner_update on public.calendar_events
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy calendar_events_owner_delete on public.calendar_events
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy friendships_participant_select on public.friendships
  for select to authenticated using (
    (select auth.uid()) = user_low or (select auth.uid()) = user_high
  );
create policy friendships_requester_insert on public.friendships
  for insert to authenticated with check (
    requester_id = (select auth.uid())
    and ((select auth.uid()) = user_low or (select auth.uid()) = user_high)
    and user_low < user_high
  );
create policy friendships_participant_update on public.friendships
  for update to authenticated using (
    (select auth.uid()) = user_low or (select auth.uid()) = user_high
  ) with check (
    (select auth.uid()) = user_low or (select auth.uid()) = user_high
  );
create policy friendships_participant_delete on public.friendships
  for delete to authenticated using (
    (select auth.uid()) = user_low or (select auth.uid()) = user_high
  );

create policy exercises_authenticated_select on public.exercises
  for select to authenticated using (true);
create policy exercises_creator_insert on public.exercises
  for insert to authenticated with check (created_by = (select auth.uid()));
create policy exercises_creator_update on public.exercises
  for update to authenticated using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));
create policy exercises_creator_delete on public.exercises
  for delete to authenticated using (created_by = (select auth.uid()));

create policy exercise_prs_self_and_friends_select on public.exercise_prs
  for select to authenticated using (
    user_id = (select auth.uid()) or public.is_friends((select auth.uid()), user_id)
  );
create policy exercise_prs_owner_insert on public.exercise_prs
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy exercise_prs_owner_update on public.exercise_prs
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy exercise_prs_owner_delete on public.exercise_prs
  for delete to authenticated using (user_id = (select auth.uid()));

create policy achievements_self_and_friends_select on public.achievements
  for select to authenticated using (
    user_id = (select auth.uid()) or public.is_friends((select auth.uid()), user_id)
  );
create policy achievements_owner_insert on public.achievements
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy achievements_owner_update on public.achievements
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy achievements_owner_delete on public.achievements
  for delete to authenticated using (user_id = (select auth.uid()));

-- Lock function name resolution and prevent trigger/internal functions from becoming RPC endpoints.
alter function public.handle_new_user() set search_path = public, pg_temp;
alter function public.normalize_username() set search_path = public, pg_temp;
alter function public.parse_time_to_seconds(text) set search_path = public, pg_temp;
alter function public.recompute_exercise_pr(uuid, uuid) set search_path = public, pg_temp;
alter function public.set_updated_at() set search_path = public, pg_temp;
alter function public.trg_recompute_pr_after_entry_delete() security definer;
alter function public.trg_recompute_pr_after_entry_delete() set search_path = public, pg_temp;
alter function public.trg_recompute_pr_after_entry_update() security definer;
alter function public.trg_recompute_pr_after_entry_update() set search_path = public, pg_temp;
alter function public.trg_recompute_pr_after_set_change() set search_path = public, pg_temp;

drop function if exists public.tg_entry_sets_recompute_pr();
drop function if exists public.tg_workout_entries_recompute_pr();
drop function if exists public.trg_workout_entries_recompute_pr();

do $$
declare
  signature regprocedure;
begin
  foreach signature in array array[
    'public.handle_new_user()'::regprocedure,
    'public.normalize_username()'::regprocedure,
    'public.recompute_exercise_pr(uuid,uuid)'::regprocedure,
    'public.set_updated_at()'::regprocedure,
    'public.trg_recompute_pr_after_entry_delete()'::regprocedure,
    'public.trg_recompute_pr_after_entry_update()'::regprocedure,
    'public.trg_recompute_pr_after_set_change()'::regprocedure
  ] loop
    execute format('revoke all privileges on function %s from public, anon, authenticated', signature);
  end loop;
end $$;
revoke all privileges on function public.is_friends(uuid, uuid) from public, anon;
grant execute on function public.is_friends(uuid, uuid) to authenticated;
revoke all privileges on function public.parse_time_to_seconds(text) from public, anon;
grant execute on function public.parse_time_to_seconds(text) to authenticated;

-- Public object URLs continue to work; listing and writes are restricted to each user's folder.
do $$
declare
  p record;
begin
  for p in
    select policyname
    from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = any (array[
        'Public read avatars','Users can delete avatars','Users can delete own avatar files',
        'Users can update avatars','Users can update own avatar files','Users can upload avatars',
        'Users can upload own avatar files','Avatar owners can select','Avatar owners can insert',
        'Avatar owners can update','Avatar owners can delete'
      ])
  loop
    execute format('drop policy if exists %I on storage.objects', p.policyname);
  end loop;
end $$;
create policy "Avatar owners can select" on storage.objects
  for select to authenticated using (
    bucket_id = 'avatars' and (select auth.uid())::text = (storage.foldername(name))[1]
  );
create policy "Avatar owners can insert" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'avatars' and (select auth.uid())::text = (storage.foldername(name))[1]
  );
create policy "Avatar owners can update" on storage.objects
  for update to authenticated using (
    bucket_id = 'avatars' and (select auth.uid())::text = (storage.foldername(name))[1]
  ) with check (
    bucket_id = 'avatars' and (select auth.uid())::text = (storage.foldername(name))[1]
  );
create policy "Avatar owners can delete" on storage.objects
  for delete to authenticated using (
    bucket_id = 'avatars' and (select auth.uid())::text = (storage.foldername(name))[1]
  );
