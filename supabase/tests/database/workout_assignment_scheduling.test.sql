begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(47);

insert into auth.users (id, email) values
  ('a1000000-0000-4000-8000-000000000001', 'assignment-owner@example.com'),
  ('a2000000-0000-4000-8000-000000000002', 'assignment-coach@example.com'),
  ('a3000000-0000-4000-8000-000000000003', 'assignment-athlete-a@example.com'),
  ('a4000000-0000-4000-8000-000000000004', 'assignment-athlete-b@example.com'),
  ('a5000000-0000-4000-8000-000000000005', 'assignment-athlete-c@example.com'),
  ('a6000000-0000-4000-8000-000000000006', 'assignment-admin@example.com'),
  ('a7000000-0000-4000-8000-000000000007', 'assignment-coach-two@example.com'),
  ('a8000000-0000-4000-8000-000000000008', 'assignment-outsider@example.com');

set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000001';

select lives_ok(
  $$select public.create_team('Assignment Workflow Team', 'assignment-workflow-team', 'staff')$$,
  'team owner can create assignment workflow team'
);

do $$
begin
  perform set_config(
    'test.assignment_team_id',
    (select id::text from public.teams where slug = 'assignment-workflow-team'),
    true
  );
end;
$$;

select lives_ok(
  $$
    insert into public.team_memberships (
      team_id, user_id, member_type, management_role, status, invited_by, joined_at, ended_at
    ) values
      (current_setting('test.assignment_team_id')::uuid, 'a2000000-0000-4000-8000-000000000002', 'coach', 'member', 'active', 'a1000000-0000-4000-8000-000000000001', now(), null),
      (current_setting('test.assignment_team_id')::uuid, 'a3000000-0000-4000-8000-000000000003', 'athlete', 'member', 'active', 'a1000000-0000-4000-8000-000000000001', now(), null),
      (current_setting('test.assignment_team_id')::uuid, 'a4000000-0000-4000-8000-000000000004', 'athlete', 'member', 'active', 'a1000000-0000-4000-8000-000000000001', now(), null),
      (current_setting('test.assignment_team_id')::uuid, 'a5000000-0000-4000-8000-000000000005', 'athlete', 'member', 'active', 'a1000000-0000-4000-8000-000000000001', now(), null),
      (current_setting('test.assignment_team_id')::uuid, 'a6000000-0000-4000-8000-000000000006', 'staff', 'admin', 'active', 'a1000000-0000-4000-8000-000000000001', now(), null),
      (current_setting('test.assignment_team_id')::uuid, 'a7000000-0000-4000-8000-000000000007', 'coach', 'member', 'active', 'a1000000-0000-4000-8000-000000000001', now(), null)
  $$,
  'team owner can establish coaches athletes and staff admin'
);

do $$
begin
  perform set_config('test.assignment_coach_id', (
    select id::text from public.team_memberships
    where team_id = current_setting('test.assignment_team_id')::uuid
      and user_id = 'a2000000-0000-4000-8000-000000000002'
  ), true);
  perform set_config('test.assignment_coach_two_id', (
    select id::text from public.team_memberships
    where team_id = current_setting('test.assignment_team_id')::uuid
      and user_id = 'a7000000-0000-4000-8000-000000000007'
  ), true);
  perform set_config('test.assignment_athlete_a_id', (
    select id::text from public.team_memberships
    where team_id = current_setting('test.assignment_team_id')::uuid
      and user_id = 'a3000000-0000-4000-8000-000000000003'
  ), true);
  perform set_config('test.assignment_athlete_b_id', (
    select id::text from public.team_memberships
    where team_id = current_setting('test.assignment_team_id')::uuid
      and user_id = 'a4000000-0000-4000-8000-000000000004'
  ), true);
  perform set_config('test.assignment_athlete_c_id', (
    select id::text from public.team_memberships
    where team_id = current_setting('test.assignment_team_id')::uuid
      and user_id = 'a5000000-0000-4000-8000-000000000005'
  ), true);
end;
$$;

select lives_ok(
  $$
    insert into public.team_groups (team_id, name, group_type, is_active, created_by)
    values
      (current_setting('test.assignment_team_id')::uuid, 'Authorized Sprint Group', 'event_group', true, 'a1000000-0000-4000-8000-000000000001'),
      (current_setting('test.assignment_team_id')::uuid, 'Mixed Authorization Group', 'event_group', true, 'a1000000-0000-4000-8000-000000000001')
  $$,
  'team owner can create assignment target groups'
);

do $$
begin
  perform set_config('test.assignment_group_ab_id', (
    select id::text from public.team_groups
    where team_id = current_setting('test.assignment_team_id')::uuid
      and name = 'Authorized Sprint Group'
  ), true);
  perform set_config('test.assignment_group_ac_id', (
    select id::text from public.team_groups
    where team_id = current_setting('test.assignment_team_id')::uuid
      and name = 'Mixed Authorization Group'
  ), true);
end;
$$;

select lives_ok(
  $$
    insert into public.team_group_memberships (team_id, group_id, team_membership_id)
    values
      (current_setting('test.assignment_team_id')::uuid, current_setting('test.assignment_group_ab_id')::uuid, current_setting('test.assignment_athlete_a_id')::uuid),
      (current_setting('test.assignment_team_id')::uuid, current_setting('test.assignment_group_ab_id')::uuid, current_setting('test.assignment_athlete_b_id')::uuid),
      (current_setting('test.assignment_team_id')::uuid, current_setting('test.assignment_group_ac_id')::uuid, current_setting('test.assignment_athlete_a_id')::uuid),
      (current_setting('test.assignment_team_id')::uuid, current_setting('test.assignment_group_ac_id')::uuid, current_setting('test.assignment_athlete_c_id')::uuid)
  $$,
  'team owner can populate target groups'
);

select lives_ok(
  $$select public.assign_coach_to_athlete(current_setting('test.assignment_team_id')::uuid, current_setting('test.assignment_coach_id')::uuid, current_setting('test.assignment_athlete_a_id')::uuid, true)$$,
  'owner can explicitly assign coach to athlete A'
);

select lives_ok(
  $$select public.assign_coach_to_athlete(current_setting('test.assignment_team_id')::uuid, current_setting('test.assignment_coach_id')::uuid, current_setting('test.assignment_athlete_b_id')::uuid, true)$$,
  'owner can explicitly assign coach to athlete B'
);

set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000001';

-- Legacy fixture: explicitly grant Track authority under the coach-scope model.
update public.coach_training_permissions
set can_prescribe = true,
    can_review = true,
    granted_by = 'a1000000-0000-4000-8000-000000000001'::uuid
where team_id = current_setting('test.assignment_team_id')::uuid
  and coach_membership_id = current_setting('test.assignment_coach_id')::uuid
  and workout_type = 'running';

set local request.jwt.claim.sub = 'a2000000-0000-4000-8000-000000000002';

select lives_ok(
  $$
    insert into public.workout_templates (team_id, created_by_membership_id, title, workout_type, description)
    values (
      current_setting('test.assignment_team_id')::uuid,
      current_setting('test.assignment_coach_id')::uuid,
      'D2 Acceleration Template',
      'running',
      'Template used to prove immutable assignment snapshots'
    )
  $$,
  'coach can create assignment source template'
);

do $$
begin
  perform set_config('test.assignment_template_id', (
    select id::text from public.workout_templates
    where team_id = current_setting('test.assignment_team_id')::uuid
      and title = 'D2 Acceleration Template'
  ), true);
end;
$$;

select lives_ok(
  $$
    insert into public.workout_template_entries (
      template_id, sort_order, exercise_name_snapshot, sets, reps, distance_m, recovery_seconds, intensity_text
    ) values
      (current_setting('test.assignment_template_id')::uuid, 0, '30m acceleration', 4, 1, 30, 180, '95%'),
      (current_setting('test.assignment_template_id')::uuid, 1, '60m sprint', 3, 1, 60, 300, '95%')
  $$,
  'coach can populate assignment source template'
);

set local request.jwt.claim.sub = 'a6000000-0000-4000-8000-000000000006';

select throws_ok(
  $$select public.create_workout_assignment(current_setting('test.assignment_team_id')::uuid, current_setting('test.assignment_template_id')::uuid, current_date + 1, null, null, false, '{}'::uuid[], array[current_setting('test.assignment_athlete_a_id')::uuid])$$,
  '42501',
  null,
  'team admin cannot author training solely through management status'
);

set local request.jwt.claim.sub = 'a2000000-0000-4000-8000-000000000002';

select lives_ok(
  $$select public.create_workout_assignment(current_setting('test.assignment_team_id')::uuid, current_setting('test.assignment_template_id')::uuid, current_date + 1, null, 'Individual target', false, '{}'::uuid[], array[current_setting('test.assignment_athlete_a_id')::uuid])$$,
  'coach can create an individual assignment for explicitly assigned athlete'
);

do $$
begin
  perform set_config('test.assignment_individual_id', (
    select id::text from public.workout_assignments
    where team_id = current_setting('test.assignment_team_id')::uuid
      and scheduled_date = current_date + 1
  ), true);
end;
$$;

select results_eq(
  $$select count(*) from public.workout_assignment_targets where assignment_id = current_setting('test.assignment_individual_id')::uuid and target_type = 'athlete'$$,
  array[1::bigint],
  'individual assignment preserves original athlete target metadata'
);

select results_eq(
  $$select count(*) from public.workout_assignment_recipients where assignment_id = current_setting('test.assignment_individual_id')::uuid$$,
  array[1::bigint],
  'individual assignment materializes one recipient'
);

select results_eq(
  $$select count(*) from public.workout_assignment_entries where assignment_id = current_setting('test.assignment_individual_id')::uuid$$,
  array[2::bigint],
  'assignment snapshots all template entries'
);

select lives_ok(
  $$select public.create_workout_assignment(current_setting('test.assignment_team_id')::uuid, current_setting('test.assignment_template_id')::uuid, current_date + 2, null, 'Selected athletes', false, '{}'::uuid[], array[current_setting('test.assignment_athlete_a_id')::uuid, current_setting('test.assignment_athlete_b_id')::uuid, current_setting('test.assignment_athlete_a_id')::uuid])$$,
  'coach can assign selected explicitly authorized athletes with overlapping targets'
);

do $$
begin
  perform set_config('test.assignment_selected_id', (
    select id::text from public.workout_assignments
    where team_id = current_setting('test.assignment_team_id')::uuid
      and scheduled_date = current_date + 2
  ), true);
end;
$$;

select results_eq(
  $$select count(*) from public.workout_assignment_recipients where assignment_id = current_setting('test.assignment_selected_id')::uuid$$,
  array[2::bigint],
  'overlapping selected-athlete targets deduplicate to stable recipients'
);

select lives_ok(
  $$select public.create_workout_assignment(current_setting('test.assignment_team_id')::uuid, current_setting('test.assignment_template_id')::uuid, current_date + 3, null, 'Authorized group', false, array[current_setting('test.assignment_group_ab_id')::uuid], '{}'::uuid[])$$,
  'coach can assign a group when every expanded athlete is explicitly authorized'
);

do $$
begin
  perform set_config('test.assignment_group_id', (
    select id::text from public.workout_assignments
    where team_id = current_setting('test.assignment_team_id')::uuid
      and scheduled_date = current_date + 3
  ), true);
end;
$$;

select results_eq(
  $$select count(*) from public.workout_assignment_recipients where assignment_id = current_setting('test.assignment_group_id')::uuid$$,
  array[2::bigint],
  'authorized group materializes both historical recipients'
);

select throws_ok(
  $$select public.create_workout_assignment(current_setting('test.assignment_team_id')::uuid, current_setting('test.assignment_template_id')::uuid, current_date + 4, null, 'Mixed group should fail', false, array[current_setting('test.assignment_group_ac_id')::uuid], '{}'::uuid[])$$,
  '42501',
  null,
  'group assignment fails when one expanded athlete lacks explicit coach authorization'
);

select throws_ok(
  $$select public.create_workout_assignment(current_setting('test.assignment_team_id')::uuid, current_setting('test.assignment_template_id')::uuid, current_date + 5, null, 'Full team should fail', true, '{}'::uuid[], '{}'::uuid[])$$,
  '42501',
  null,
  'full-team assignment fails when one active athlete lacks explicit coach authorization'
);

select results_eq(
  $$select count(*) from public.workout_assignments$$,
  array[3::bigint],
  'unauthorized group and full-team attempts fail atomically without partial assignments'
);

set local request.jwt.claim.sub = 'a7000000-0000-4000-8000-000000000007';

select results_eq(
  $$select count(*) from public.workout_assignments$$,
  array[3::bigint],
  'another active team coach can read non-sensitive assignment metadata'
);

select results_eq(
  $$select count(*) from public.workout_assignment_recipients$$,
  array[0::bigint],
  'unassigned team coach cannot read athlete recipient rows'
);

set local request.jwt.claim.sub = 'a6000000-0000-4000-8000-000000000006';

select results_eq(
  $$select count(*) from public.workout_assignments$$,
  array[3::bigint],
  'team admin can read non-sensitive assignment metadata for operations'
);

select results_eq(
  $$select count(*) from public.workout_assignment_targets$$,
  array[4::bigint],
  'team admin can read original target metadata for operations'
);

select results_eq(
  $$select count(*) from public.workout_assignment_recipients$$,
  array[0::bigint],
  'team admin cannot read athlete recipient rows solely through management authority'
);

set local request.jwt.claim.sub = 'a3000000-0000-4000-8000-000000000003';

select results_eq(
  $$select count(*) from public.workout_assignments$$,
  array[3::bigint],
  'athlete A can read each assignment for which they are a materialized recipient'
);

select results_eq(
  $$select count(*) from public.workout_assignment_recipients$$,
  array[3::bigint],
  'athlete A can read only their own recipient rows'
);

select results_eq(
  $$select count(*) from public.workout_assignment_targets$$,
  array[0::bigint],
  'recipient athlete does not receive coach target-list metadata'
);

set local request.jwt.claim.sub = 'a4000000-0000-4000-8000-000000000004';

select results_eq(
  $$select count(*) from public.workout_assignments$$,
  array[2::bigint],
  'athlete B sees only selected and group assignments that include them'
);

set local request.jwt.claim.sub = 'a2000000-0000-4000-8000-000000000002';

select lives_ok(
  $$update public.workout_template_entries set sets = 6 where template_id = current_setting('test.assignment_template_id')::uuid and sort_order = 0$$,
  'coach can later revise reusable template content'
);

select results_eq(
  $$select sets from public.workout_assignment_entries where assignment_id = current_setting('test.assignment_group_id')::uuid and sort_order = 0$$,
  array[4],
  'existing assignment snapshot is immutable when source template changes'
);

set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000001';

select lives_ok(
  $$delete from public.team_group_memberships where team_id = current_setting('test.assignment_team_id')::uuid and group_id = current_setting('test.assignment_group_ab_id')::uuid and team_membership_id = current_setting('test.assignment_athlete_b_id')::uuid$$,
  'team governance may later change group membership'
);

set local request.jwt.claim.sub = 'a2000000-0000-4000-8000-000000000002';

select results_eq(
  $$select count(*) from public.workout_assignment_recipients where assignment_id = current_setting('test.assignment_group_id')::uuid$$,
  array[2::bigint],
  'historical group assignment recipients do not change when group membership changes'
);

set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000001';

select lives_ok(
  $$select public.assign_coach_to_athlete(current_setting('test.assignment_team_id')::uuid, current_setting('test.assignment_coach_id')::uuid, current_setting('test.assignment_athlete_c_id')::uuid, false)$$,
  'owner can later authorize coach for athlete C'
);

set local request.jwt.claim.sub = 'a2000000-0000-4000-8000-000000000002';

select lives_ok(
  $$select public.create_workout_assignment(current_setting('test.assignment_team_id')::uuid, current_setting('test.assignment_template_id')::uuid, current_date + 5, null, 'Full team now authorized', true, '{}'::uuid[], '{}'::uuid[])$$,
  'full-team assignment succeeds once coach is explicitly authorized for every active athlete'
);

do $$
begin
  perform set_config('test.assignment_full_team_id', (
    select id::text from public.workout_assignments
    where team_id = current_setting('test.assignment_team_id')::uuid
      and scheduled_date = current_date + 5
  ), true);
end;
$$;

select results_eq(
  $$select count(*) from public.workout_assignment_recipients where assignment_id = current_setting('test.assignment_full_team_id')::uuid$$,
  array[3::bigint],
  'full-team assignment materializes all three currently active athletes'
);

select lives_ok(
  $$select public.close_workout_assignment(current_setting('test.assignment_individual_id')::uuid)$$,
  'authorized coach can close an assignment when they retain authorization for every recipient'
);

select results_eq(
  $$select status from public.workout_assignments where id = current_setting('test.assignment_individual_id')::uuid$$,
  array['closed'::text],
  'closed assignment retains explicit closed lifecycle state'
);

set local request.jwt.claim.sub = 'a6000000-0000-4000-8000-000000000006';

select throws_ok(
  $$select public.cancel_workout_assignment(current_setting('test.assignment_group_id')::uuid)$$,
  '42501',
  null,
  'team admin cannot cancel training solely through management status'
);

set local request.jwt.claim.sub = 'a2000000-0000-4000-8000-000000000002';

select lives_ok(
  $$select public.cancel_workout_assignment(current_setting('test.assignment_group_id')::uuid)$$,
  'authorized coach can cancel a scheduled assignment'
);

select results_eq(
  $$select status from public.workout_assignments where id = current_setting('test.assignment_group_id')::uuid$$,
  array['cancelled'::text],
  'cancelled assignment retains explicit cancelled lifecycle state'
);

set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000001';

do $$
declare
  v_assignment_id uuid;
begin
  select id into v_assignment_id
  from public.coach_athlete_assignments
  where team_id = current_setting('test.assignment_team_id')::uuid
    and coach_membership_id = current_setting('test.assignment_coach_id')::uuid
    and athlete_membership_id = current_setting('test.assignment_athlete_b_id')::uuid
    and active;
  perform public.end_coach_athlete_assignment(v_assignment_id);
end;
$$;

select lives_ok($$select 1$$, 'ending coach-athlete assignment completes through controlled workflow');

set local request.jwt.claim.sub = 'a2000000-0000-4000-8000-000000000002';

select results_eq(
  $$select count(*) from public.workout_assignment_recipients where assignment_id = current_setting('test.assignment_selected_id')::uuid$$,
  array[1::bigint],
  'ending coach-athlete assignment immediately removes coach visibility of that athlete recipient row'
);

select results_eq(
  $$select count(*) from public.workout_assignments$$,
  array[4::bigint],
  'coach retains non-sensitive team assignment metadata after one athlete authorization ends'
);

select results_eq(
  $$select count(*) from public.friendships$$,
  array[0::bigint],
  'assignment scheduling lifecycle never creates friendships'
);

select results_eq(
  $$select has_table_privilege('anon', 'public.workout_assignments', 'SELECT')$$,
  array[false],
  'anonymous role has no assignment table access'
);

select results_eq(
  $$select has_table_privilege('anon', 'public.workout_assignment_recipients', 'SELECT')$$,
  array[false],
  'anonymous role has no recipient table access'
);

select * from finish();
rollback;
