begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(32);

insert into auth.users (id, email) values
  ('f1000000-0000-4000-8000-000000000001', 'field-owner@example.com'),
  ('f2000000-0000-4000-8000-000000000002', 'field-coach@example.com'),
  ('f3000000-0000-4000-8000-000000000003', 'field-athlete@example.com');

set local role authenticated;
set local request.jwt.claim.sub = 'f1000000-0000-4000-8000-000000000001';

select lives_ok(
  $$select public.create_team('Field Event Test Team', 'field-event-test-team', 'staff')$$,
  'owner creates field-event test team'
);

do $$
begin
  perform set_config(
    'test.field_team_id',
    (select id::text from public.teams where slug = 'field-event-test-team'),
    true
  );
end;
$$;

select lives_ok(
  $$
    insert into public.team_memberships (
      team_id, user_id, member_type, management_role, status, invited_by, joined_at
    ) values
      (current_setting('test.field_team_id')::uuid, 'f2000000-0000-4000-8000-000000000002', 'coach', 'member', 'active', 'f1000000-0000-4000-8000-000000000001', now()),
      (current_setting('test.field_team_id')::uuid, 'f3000000-0000-4000-8000-000000000003', 'athlete', 'member', 'active', 'f1000000-0000-4000-8000-000000000001', now())
  $$,
  'owner adds coach and athlete'
);

do $$
begin
  perform set_config('test.field_coach_membership_id', (
    select id::text from public.team_memberships
    where team_id = current_setting('test.field_team_id')::uuid
      and user_id = 'f2000000-0000-4000-8000-000000000002'
  ), true);
  perform set_config('test.field_athlete_membership_id', (
    select id::text from public.team_memberships
    where team_id = current_setting('test.field_team_id')::uuid
      and user_id = 'f3000000-0000-4000-8000-000000000003'
  ), true);
end;
$$;

select lives_ok(
  $$
    update public.coach_training_permissions
    set can_prescribe = true, can_review = true, granted_by = 'f1000000-0000-4000-8000-000000000001'
    where team_id = current_setting('test.field_team_id')::uuid
      and coach_membership_id = current_setting('test.field_coach_membership_id')::uuid
      and workout_type = 'jumps'
  $$,
  'owner grants coach Jumps authority only'
);

select lives_ok(
  $$select public.assign_coach_to_athlete(current_setting('test.field_team_id')::uuid, current_setting('test.field_coach_membership_id')::uuid, current_setting('test.field_athlete_membership_id')::uuid, true)$$,
  'owner explicitly assigns coach to athlete'
);

set local request.jwt.claim.sub = 'f3000000-0000-4000-8000-000000000003';

select lives_ok(
  $$insert into public.workouts (workout_date, title, workout_type, user_id) values (current_date, 'Personal Long Jump', 'jumps', 'f3000000-0000-4000-8000-000000000003')$$,
  'athlete creates personal jumps workout'
);

do $$
begin
  perform set_config('test.field_jump_workout_id', (select id::text from public.workouts where title = 'Personal Long Jump'), true);
end;
$$;

select lives_ok(
  $$insert into public.workout_entries (workout_id, user_id, exercise, label, event_code) values (current_setting('test.field_jump_workout_id')::uuid, 'f3000000-0000-4000-8000-000000000003', 'Long Jump', 'Full approach', 'long_jump')$$,
  'athlete creates long jump workout entry'
);

do $$
begin
  perform set_config('test.field_jump_entry_id', (select id::text from public.workout_entries where workout_id = current_setting('test.field_jump_workout_id')::uuid), true);
end;
$$;

select lives_ok(
  $$insert into public.field_attempts (entry_id, attempt_number, mark_m, outcome) values (current_setting('test.field_jump_entry_id')::uuid, 1, 6.42, 'valid')$$,
  'horizontal jump accepts measured valid attempt'
);
select lives_ok(
  $$insert into public.field_attempts (entry_id, attempt_number, outcome) values (current_setting('test.field_jump_entry_id')::uuid, 2, 'foul')$$,
  'horizontal jump accepts foul without mark'
);
select lives_ok(
  $$insert into public.field_attempts (entry_id, attempt_number, mark_m, outcome) values (current_setting('test.field_jump_entry_id')::uuid, 3, 6.50, 'unmeasured')$$,
  'horizontal jump accepts unmeasured attempt'
);
select results_eq(
  $$select mark_m from public.field_attempts where entry_id = current_setting('test.field_jump_entry_id')::uuid and attempt_number = 3$$,
  array[null::numeric],
  'unmeasured attempt stores no mark'
);

set local request.jwt.claim.sub = 'f2000000-0000-4000-8000-000000000002';
select results_eq(
  $$select count(*) from public.workouts where id = current_setting('test.field_jump_workout_id')::uuid$$,
  array[0::bigint],
  'coach cannot see personal field workout through coaching relationship alone'
);
select results_eq(
  $$select count(*) from public.field_attempts where entry_id = current_setting('test.field_jump_entry_id')::uuid$$,
  array[0::bigint],
  'coach cannot see personal field attempts through coaching relationship alone'
);

set local request.jwt.claim.sub = 'f3000000-0000-4000-8000-000000000003';
select lives_ok(
  $$update public.workouts set team_id = current_setting('test.field_team_id')::uuid where id = current_setting('test.field_jump_workout_id')::uuid$$,
  'athlete may intentionally move workout into team context'
);

set local request.jwt.claim.sub = 'f2000000-0000-4000-8000-000000000002';
select results_eq(
  $$select count(*) from public.workouts where id = current_setting('test.field_jump_workout_id')::uuid$$,
  array[1::bigint],
  'assigned coach can see team-context jumps workout'
);
select results_eq(
  $$select count(*) from public.field_attempts where entry_id = current_setting('test.field_jump_entry_id')::uuid$$,
  array[3::bigint],
  'assigned coach can see team-context jump attempts'
);
select results_eq(
  $$
    with updated as (
      update public.field_attempts
      set mark_m = 6.60
      where entry_id = current_setting('test.field_jump_entry_id')::uuid
        and attempt_number = 1
      returning 1
    )
    select count(*) from updated
  $$,
  array[0::bigint],
  'coach cannot edit athlete-owned field attempt'
);

set local request.jwt.claim.sub = 'f3000000-0000-4000-8000-000000000003';
select throws_ok(
  $$insert into public.field_attempts (entry_id, attempt_number, mark_m, outcome) values (current_setting('test.field_jump_entry_id')::uuid, 4, 1.90, 'clear')$$,
  '23514', null,
  'horizontal jump rejects vertical-jump outcomes'
);

select lives_ok(
  $$insert into public.workouts (workout_date, title, workout_type, user_id) values (current_date, 'High Jump Session', 'jumps', 'f3000000-0000-4000-8000-000000000003')$$,
  'athlete creates vertical jumps workout'
);
do $$
begin
  perform set_config('test.field_high_workout_id', (select id::text from public.workouts where title = 'High Jump Session'), true);
end;
$$;
select lives_ok(
  $$insert into public.workout_entries (workout_id, user_id, exercise, event_code) values (current_setting('test.field_high_workout_id')::uuid, 'f3000000-0000-4000-8000-000000000003', 'High Jump', 'high_jump')$$,
  'athlete creates high jump entry'
);
do $$
begin
  perform set_config('test.field_high_entry_id', (select id::text from public.workout_entries where workout_id = current_setting('test.field_high_workout_id')::uuid), true);
end;
$$;
select lives_ok(
  $$insert into public.field_attempts (entry_id, attempt_number, mark_m, outcome) values (current_setting('test.field_high_entry_id')::uuid, 1, 1.90, 'clear')$$,
  'vertical jump accepts height and clear outcome'
);
select throws_ok(
  $$insert into public.field_attempts (entry_id, attempt_number, mark_m, outcome) values (current_setting('test.field_high_entry_id')::uuid, 2, 1.95, 'valid')$$,
  '23514', null,
  'vertical jump rejects horizontal valid outcome'
);

select lives_ok(
  $$insert into public.workouts (workout_date, title, workout_type, user_id) values (current_date, 'Shot Session', 'throws', 'f3000000-0000-4000-8000-000000000003')$$,
  'athlete creates throws workout'
);
do $$
begin
  perform set_config('test.field_throw_workout_id', (select id::text from public.workouts where title = 'Shot Session'), true);
end;
$$;
select throws_ok(
  $$insert into public.workout_entries (workout_id, user_id, exercise, event_code) values (current_setting('test.field_throw_workout_id')::uuid, 'f3000000-0000-4000-8000-000000000003', 'Shot Put', 'shot_put')$$,
  '23514', null,
  'throws entry requires implement weight'
);
select lives_ok(
  $$insert into public.workout_entries (workout_id, user_id, exercise, event_code, implement_weight_kg) values (current_setting('test.field_throw_workout_id')::uuid, 'f3000000-0000-4000-8000-000000000003', 'Shot Put', 'shot_put', 7.26)$$,
  'throws entry stores implement weight'
);
do $$
begin
  perform set_config('test.field_throw_entry_id', (select id::text from public.workout_entries where workout_id = current_setting('test.field_throw_workout_id')::uuid), true);
end;
$$;
select lives_ok(
  $$insert into public.field_attempts (entry_id, attempt_number, mark_m, outcome) values (current_setting('test.field_throw_entry_id')::uuid, 1, 17.31, 'valid')$$,
  'throw accepts measured valid attempt'
);
select results_eq(
  $$select best_mark_m from public.field_event_bests_v where user_id = 'f3000000-0000-4000-8000-000000000003' and event_code = 'shot_put' and implement_weight_kg = 7.26$$,
  array[17.31::numeric],
  'throw training best is grouped by implement weight'
);

set local request.jwt.claim.sub = 'f2000000-0000-4000-8000-000000000002';
select lives_ok(
  $$insert into public.workout_templates (team_id, created_by_membership_id, title, workout_type) values (current_setting('test.field_team_id')::uuid, current_setting('test.field_coach_membership_id')::uuid, 'Jump Authority Template', 'jumps')$$,
  'Jumps-authorized coach can create Jumps template'
);
select throws_ok(
  $$insert into public.workout_templates (team_id, created_by_membership_id, title, workout_type) values (current_setting('test.field_team_id')::uuid, current_setting('test.field_coach_membership_id')::uuid, 'Throw Authority Template', 'throws')$$,
  '42501', null,
  'Jumps-only coach cannot create Throws template'
);
select throws_ok(
  $$insert into public.workout_templates (team_id, created_by_membership_id, title, workout_type) values (current_setting('test.field_team_id')::uuid, current_setting('test.field_coach_membership_id')::uuid, 'Running Authority Template', 'running')$$,
  '42501', null,
  'Jumps-only coach cannot create Running template'
);

set local request.jwt.claim.sub = 'f1000000-0000-4000-8000-000000000001';
select lives_ok(
  $$update public.coach_training_permissions set can_prescribe = true, can_review = true, granted_by = 'f1000000-0000-4000-8000-000000000001' where team_id = current_setting('test.field_team_id')::uuid and coach_membership_id = current_setting('test.field_coach_membership_id')::uuid and workout_type = 'throws'$$,
  'owner independently grants Throws authority'
);

set local request.jwt.claim.sub = 'f2000000-0000-4000-8000-000000000002';
select lives_ok(
  $$insert into public.workout_templates (team_id, created_by_membership_id, title, workout_type) values (current_setting('test.field_team_id')::uuid, current_setting('test.field_coach_membership_id')::uuid, 'Throw Authority Template', 'throws')$$,
  'Throws-authorized coach can create Throws template'
);
do $$
begin
  perform set_config('test.field_throw_template_id', (select id::text from public.workout_templates where title = 'Throw Authority Template'), true);
end;
$$;
select lives_ok(
  $$insert into public.workout_template_entries (template_id, sort_order, exercise_name_snapshot, event_code, attempts, target_mark_m, implement_weight_kg) values (current_setting('test.field_throw_template_id')::uuid, 0, 'Shot Put', 'shot_put', 6, 17.00, 7.26)$$,
  'field prescription snapshots event, attempts, target mark, and implement'
);

select * from finish();
rollback;
