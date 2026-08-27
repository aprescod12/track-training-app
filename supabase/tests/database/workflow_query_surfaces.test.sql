begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(25);

insert into auth.users (id, email) values
  ('c1000000-0000-4000-8000-000000000001', 'query-owner@example.com'),
  ('c2000000-0000-4000-8000-000000000002', 'query-coach@example.com'),
  ('c3000000-0000-4000-8000-000000000003', 'query-athlete-a@example.com'),
  ('c4000000-0000-4000-8000-000000000004', 'query-athlete-b@example.com'),
  ('c5000000-0000-4000-8000-000000000005', 'query-admin@example.com'),
  ('c6000000-0000-4000-8000-000000000006', 'query-unassigned-coach@example.com');

set local role authenticated;
set local request.jwt.claim.sub = 'c1000000-0000-4000-8000-000000000001';

select lives_ok(
  $$select public.create_team('Query Surface Team', 'query-surface-team', 'staff')$$,
  'owner can create query surface team'
);

do $$
begin
  perform set_config('test.query_team_id', (
    select id::text from public.teams where slug = 'query-surface-team'
  ), true);
end;
$$;

select lives_ok(
  $$
    insert into public.team_memberships (
      team_id, user_id, member_type, management_role, status, invited_by, joined_at, ended_at
    ) values
      (current_setting('test.query_team_id')::uuid, 'c2000000-0000-4000-8000-000000000002', 'coach', 'member', 'active', 'c1000000-0000-4000-8000-000000000001', now(), null),
      (current_setting('test.query_team_id')::uuid, 'c3000000-0000-4000-8000-000000000003', 'athlete', 'member', 'active', 'c1000000-0000-4000-8000-000000000001', now(), null),
      (current_setting('test.query_team_id')::uuid, 'c4000000-0000-4000-8000-000000000004', 'athlete', 'member', 'active', 'c1000000-0000-4000-8000-000000000001', now(), null),
      (current_setting('test.query_team_id')::uuid, 'c5000000-0000-4000-8000-000000000005', 'staff', 'admin', 'active', 'c1000000-0000-4000-8000-000000000001', now(), null),
      (current_setting('test.query_team_id')::uuid, 'c6000000-0000-4000-8000-000000000006', 'coach', 'member', 'active', 'c1000000-0000-4000-8000-000000000001', now(), null)
  $$,
  'owner can establish query surface memberships'
);

do $$
begin
  perform set_config('test.query_coach_id', (
    select id::text from public.team_memberships
    where team_id = current_setting('test.query_team_id')::uuid
      and user_id = 'c2000000-0000-4000-8000-000000000002'
  ), true);
  perform set_config('test.query_athlete_a_id', (
    select id::text from public.team_memberships
    where team_id = current_setting('test.query_team_id')::uuid
      and user_id = 'c3000000-0000-4000-8000-000000000003'
  ), true);
  perform set_config('test.query_athlete_b_id', (
    select id::text from public.team_memberships
    where team_id = current_setting('test.query_team_id')::uuid
      and user_id = 'c4000000-0000-4000-8000-000000000004'
  ), true);
end;
$$;

select lives_ok(
  $$select public.assign_coach_to_athlete(current_setting('test.query_team_id')::uuid, current_setting('test.query_coach_id')::uuid, current_setting('test.query_athlete_a_id')::uuid, true)$$,
  'owner can explicitly assign coach to athlete A'
);
select lives_ok(
  $$select public.assign_coach_to_athlete(current_setting('test.query_team_id')::uuid, current_setting('test.query_coach_id')::uuid, current_setting('test.query_athlete_b_id')::uuid, true)$$,
  'owner can explicitly assign coach to athlete B'
);

set local request.jwt.claim.sub = 'c1000000-0000-4000-8000-000000000001';

-- Legacy fixture: explicitly grant Track authority under the coach-scope model.
update public.coach_training_permissions
set can_prescribe = true,
    can_review = true,
    granted_by = 'c1000000-0000-4000-8000-000000000001'::uuid
where team_id = current_setting('test.query_team_id')::uuid
  and coach_membership_id = current_setting('test.query_coach_id')::uuid
  and workout_type = 'track';

set local request.jwt.claim.sub = 'c2000000-0000-4000-8000-000000000002';
select lives_ok(
  $$
    insert into public.workout_templates (team_id, created_by_membership_id, title, workout_type)
    values (current_setting('test.query_team_id')::uuid, current_setting('test.query_coach_id')::uuid, 'Query Template', 'track')
  $$,
  'coach can create query source template'
);

do $$
begin
  perform set_config('test.query_template_id', (
    select id::text from public.workout_templates
    where team_id = current_setting('test.query_team_id')::uuid
      and title = 'Query Template'
  ), true);
end;
$$;

select lives_ok(
  $$
    insert into public.workout_template_entries (template_id, sort_order, exercise_name_snapshot, sets, reps, distance_m)
    values (current_setting('test.query_template_id')::uuid, 0, '80m build-up', 3, 1, 80)
  $$,
  'coach can populate query source template'
);

select lives_ok(
  $$select public.create_workout_assignment(current_setting('test.query_team_id')::uuid, current_setting('test.query_template_id')::uuid, current_date + 1, null, 'Athlete A', false, '{}'::uuid[], array[current_setting('test.query_athlete_a_id')::uuid])$$,
  'coach can assign athlete A for query surface'
);
select lives_ok(
  $$select public.create_workout_assignment(current_setting('test.query_team_id')::uuid, current_setting('test.query_template_id')::uuid, current_date + 2, null, 'Athlete B', false, '{}'::uuid[], array[current_setting('test.query_athlete_b_id')::uuid])$$,
  'coach can assign athlete B for query surface'
);

do $$
begin
  perform set_config('test.query_recipient_a_id', (
    select war.id::text
    from public.workout_assignment_recipients war
    join public.workout_assignments wa on wa.id = war.assignment_id
    where war.athlete_membership_id = current_setting('test.query_athlete_a_id')::uuid
      and wa.scheduled_date = current_date + 1
  ), true);
end;
$$;

set local request.jwt.claim.sub = 'c3000000-0000-4000-8000-000000000003';
select results_eq(
  $$select count(*) from public.athlete_assignment_inbox_v$$,
  array[1::bigint],
  'athlete inbox contains only the signed-in athlete recipient'
);
select results_eq(
  $$select scheduled_date from public.athlete_assignment_inbox_v$$,
  array[current_date + 1],
  'athlete inbox preserves scheduled assignment date'
);
select results_eq(
  $$select count(*) from public.coach_assignment_dashboard_v$$,
  array[0::bigint],
  'athlete cannot use coach dashboard view'
);
select lives_ok(
  $$select public.submit_workout_assignment(current_setting('test.query_recipient_a_id')::uuid, 'unavailable', null, 'injury', 'Private athlete context')$$,
  'athlete can submit sensitive availability through controlled RPC'
);
select results_eq(
  $$select completion_status from public.athlete_assignment_inbox_v$$,
  array['unavailable'::text],
  'athlete inbox reflects own submission outcome'
);

set local request.jwt.claim.sub = 'c2000000-0000-4000-8000-000000000002';
select results_eq(
  $$select count(*) from public.coach_assignment_dashboard_v$$,
  array[2::bigint],
  'authorized coach dashboard contains both explicitly assigned athletes'
);
select results_eq(
  $$select count(*) from public.coach_assignment_dashboard_v where completion_status = 'unavailable'$$,
  array[1::bigint],
  'authorized coach dashboard can reflect authorized sensitive submission status'
);
select results_eq(
  $$select athlete_note from public.coach_assignment_dashboard_v where completion_status = 'unavailable'$$,
  array['Private athlete context'::text],
  'authorized coach dashboard can read authorized athlete note'
);

set local request.jwt.claim.sub = 'c5000000-0000-4000-8000-000000000005';
select results_eq(
  $$select count(*) from public.coach_assignment_dashboard_v$$,
  array[0::bigint],
  'team admin without coaching authorization receives no coach dashboard rows'
);
select results_eq(
  $$select count(*) from public.athlete_assignment_inbox_v$$,
  array[0::bigint],
  'team admin receives no athlete inbox rows'
);

set local request.jwt.claim.sub = 'c6000000-0000-4000-8000-000000000006';
select results_eq(
  $$select count(*) from public.coach_assignment_dashboard_v$$,
  array[0::bigint],
  'unassigned coach receives no coach dashboard rows'
);

reset role;
select ok(
  (select reloptions @> array['security_invoker=true'] from pg_class where oid = 'public.athlete_assignment_inbox_v'::regclass),
  'athlete inbox view is security invoker'
);
select ok(
  (select reloptions @> array['security_invoker=true'] from pg_class where oid = 'public.coach_assignment_dashboard_v'::regclass),
  'coach dashboard view is security invoker'
);
select ok(
  not has_table_privilege('anon', 'public.athlete_assignment_inbox_v', 'select'),
  'anonymous role cannot select athlete inbox view'
);
select ok(
  not has_table_privilege('anon', 'public.coach_assignment_dashboard_v', 'select'),
  'anonymous role cannot select coach dashboard view'
);
select ok(
  has_table_privilege('authenticated', 'public.athlete_assignment_inbox_v', 'select'),
  'authenticated role can query athlete inbox through RLS-backed view'
);
select ok(
  has_table_privilege('authenticated', 'public.coach_assignment_dashboard_v', 'select'),
  'authenticated role can query coach dashboard through RLS-backed view'
);

select * from finish();
rollback;
