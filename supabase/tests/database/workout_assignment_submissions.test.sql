begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(47);

insert into auth.users (id, email) values
  ('b1000000-0000-4000-8000-000000000001', 'submission-owner@example.com'),
  ('b2000000-0000-4000-8000-000000000002', 'submission-coach@example.com'),
  ('b3000000-0000-4000-8000-000000000003', 'submission-athlete-a@example.com'),
  ('b4000000-0000-4000-8000-000000000004', 'submission-athlete-b@example.com'),
  ('b5000000-0000-4000-8000-000000000005', 'submission-admin@example.com'),
  ('b6000000-0000-4000-8000-000000000006', 'submission-unassigned-coach@example.com');

set local role authenticated;
set local request.jwt.claim.sub = 'b1000000-0000-4000-8000-000000000001';

select lives_ok(
  $$select public.create_team('Submission Workflow Team', 'submission-workflow-team', 'staff')$$,
  'owner can create submission workflow team'
);

do $$
begin
  perform set_config(
    'test.submission_team_id',
    (select id::text from public.teams where slug = 'submission-workflow-team'),
    true
  );
end;
$$;

select lives_ok(
  $$
    insert into public.team_memberships (
      team_id, user_id, member_type, management_role, status, invited_by, joined_at, ended_at
    ) values
      (current_setting('test.submission_team_id')::uuid, 'b2000000-0000-4000-8000-000000000002', 'coach', 'member', 'active', 'b1000000-0000-4000-8000-000000000001', now(), null),
      (current_setting('test.submission_team_id')::uuid, 'b3000000-0000-4000-8000-000000000003', 'athlete', 'member', 'active', 'b1000000-0000-4000-8000-000000000001', now(), null),
      (current_setting('test.submission_team_id')::uuid, 'b4000000-0000-4000-8000-000000000004', 'athlete', 'member', 'active', 'b1000000-0000-4000-8000-000000000001', now(), null),
      (current_setting('test.submission_team_id')::uuid, 'b5000000-0000-4000-8000-000000000005', 'staff', 'admin', 'active', 'b1000000-0000-4000-8000-000000000001', now(), null),
      (current_setting('test.submission_team_id')::uuid, 'b6000000-0000-4000-8000-000000000006', 'coach', 'member', 'active', 'b1000000-0000-4000-8000-000000000001', now(), null)
  $$,
  'owner can establish submission workflow memberships'
);

do $$
begin
  perform set_config('test.submission_coach_id', (
    select id::text from public.team_memberships
    where team_id = current_setting('test.submission_team_id')::uuid
      and user_id = 'b2000000-0000-4000-8000-000000000002'
  ), true);
  perform set_config('test.submission_athlete_a_id', (
    select id::text from public.team_memberships
    where team_id = current_setting('test.submission_team_id')::uuid
      and user_id = 'b3000000-0000-4000-8000-000000000003'
  ), true);
  perform set_config('test.submission_athlete_b_id', (
    select id::text from public.team_memberships
    where team_id = current_setting('test.submission_team_id')::uuid
      and user_id = 'b4000000-0000-4000-8000-000000000004'
  ), true);
end;
$$;

select lives_ok(
  $$select public.assign_coach_to_athlete(current_setting('test.submission_team_id')::uuid, current_setting('test.submission_coach_id')::uuid, current_setting('test.submission_athlete_a_id')::uuid, true)$$,
  'owner can explicitly assign coach to athlete A'
);

select lives_ok(
  $$select public.assign_coach_to_athlete(current_setting('test.submission_team_id')::uuid, current_setting('test.submission_coach_id')::uuid, current_setting('test.submission_athlete_b_id')::uuid, true)$$,
  'owner can explicitly assign coach to athlete B'
);

set local request.jwt.claim.sub = 'b1000000-0000-4000-8000-000000000001';

-- Legacy fixture: explicitly grant Track authority under the coach-scope model.
update public.coach_training_permissions
set can_prescribe = true,
    can_review = true,
    granted_by = 'b1000000-0000-4000-8000-000000000001'::uuid
where team_id = current_setting('test.submission_team_id')::uuid
  and coach_membership_id = current_setting('test.submission_coach_id')::uuid
  and workout_type = 'track';

set local request.jwt.claim.sub = 'b2000000-0000-4000-8000-000000000002';

select lives_ok(
  $$
    insert into public.workout_templates (team_id, created_by_membership_id, title, workout_type)
    values (
      current_setting('test.submission_team_id')::uuid,
      current_setting('test.submission_coach_id')::uuid,
      'Submission Test Template',
      'track'
    )
  $$,
  'coach can create submission source template'
);

do $$
begin
  perform set_config('test.submission_template_id', (
    select id::text from public.workout_templates
    where team_id = current_setting('test.submission_team_id')::uuid
      and title = 'Submission Test Template'
  ), true);
end;
$$;

select lives_ok(
  $$
    insert into public.workout_template_entries (
      template_id, sort_order, exercise_name_snapshot, sets, reps, distance_m
    ) values (
      current_setting('test.submission_template_id')::uuid,
      0,
      '60m sprint',
      4,
      1,
      60
    )
  $$,
  'coach can populate submission source template'
);

select lives_ok(
  $$select public.create_workout_assignment(current_setting('test.submission_team_id')::uuid, current_setting('test.submission_template_id')::uuid, current_date + 1, null, 'Athlete A assignment', false, '{}'::uuid[], array[current_setting('test.submission_athlete_a_id')::uuid])$$,
  'coach can assign athlete A'
);

select lives_ok(
  $$select public.create_workout_assignment(current_setting('test.submission_team_id')::uuid, current_setting('test.submission_template_id')::uuid, current_date + 2, null, 'Athlete B assignment', false, '{}'::uuid[], array[current_setting('test.submission_athlete_b_id')::uuid])$$,
  'coach can assign athlete B'
);

do $$
begin
  perform set_config('test.submission_assignment_a_id', (
    select id::text from public.workout_assignments
    where team_id = current_setting('test.submission_team_id')::uuid
      and scheduled_date = current_date + 1
  ), true);
  perform set_config('test.submission_assignment_b_id', (
    select id::text from public.workout_assignments
    where team_id = current_setting('test.submission_team_id')::uuid
      and scheduled_date = current_date + 2
  ), true);
  perform set_config('test.submission_recipient_a_id', (
    select id::text from public.workout_assignment_recipients
    where assignment_id = current_setting('test.submission_assignment_a_id')::uuid
      and athlete_membership_id = current_setting('test.submission_athlete_a_id')::uuid
  ), true);
  perform set_config('test.submission_recipient_b_id', (
    select id::text from public.workout_assignment_recipients
    where assignment_id = current_setting('test.submission_assignment_b_id')::uuid
      and athlete_membership_id = current_setting('test.submission_athlete_b_id')::uuid
  ), true);
end;
$$;

set local request.jwt.claim.sub = 'b3000000-0000-4000-8000-000000000003';

select lives_ok(
  $$
    insert into public.workouts (workout_date, title, workout_type, user_id, team_id)
    values (current_date + 1, 'Athlete A Personal Workout', 'track', 'b3000000-0000-4000-8000-000000000003', null)
  $$,
  'athlete A can still create unrelated personal workout'
);

do $$
begin
  perform set_config('test.submission_personal_workout_a_id', (
    select id::text from public.workouts
    where user_id = 'b3000000-0000-4000-8000-000000000003'
      and team_id is null
      and title = 'Athlete A Personal Workout'
  ), true);
end;
$$;

select lives_ok(
  $$
    insert into public.workouts (workout_date, title, workout_type, user_id, team_id)
    values (current_date + 1, 'Athlete A Team Performance', 'track', 'b3000000-0000-4000-8000-000000000003', current_setting('test.submission_team_id')::uuid)
  $$,
  'athlete A can create team-context performance for assignment'
);

do $$
begin
  perform set_config('test.submission_team_workout_a_id', (
    select id::text from public.workouts
    where user_id = 'b3000000-0000-4000-8000-000000000003'
      and team_id = current_setting('test.submission_team_id')::uuid
      and title = 'Athlete A Team Performance'
  ), true);
end;
$$;

set local request.jwt.claim.sub = 'b4000000-0000-4000-8000-000000000004';

select lives_ok(
  $$
    insert into public.workouts (workout_date, title, workout_type, user_id, team_id)
    values (current_date + 2, 'Athlete B Team Performance', 'track', 'b4000000-0000-4000-8000-000000000004', current_setting('test.submission_team_id')::uuid)
  $$,
  'athlete B can create own team-context workout'
);

do $$
begin
  perform set_config('test.submission_team_workout_b_id', (
    select id::text from public.workouts
    where user_id = 'b4000000-0000-4000-8000-000000000004'
      and team_id = current_setting('test.submission_team_id')::uuid
      and title = 'Athlete B Team Performance'
  ), true);
end;
$$;

set local request.jwt.claim.sub = 'b3000000-0000-4000-8000-000000000003';

select throws_ok(
  $$select public.submit_workout_assignment(current_setting('test.submission_recipient_b_id')::uuid, 'skipped', null, null, 'Not my assignment')$$,
  '42501',
  null,
  'athlete cannot submit another athlete recipient row'
);

select throws_ok(
  $$select public.submit_workout_assignment(current_setting('test.submission_recipient_a_id')::uuid, 'completed', null, null, null)$$,
  '23514',
  null,
  'completed submission requires a linked workout'
);

select throws_ok(
  $$select public.submit_workout_assignment(current_setting('test.submission_recipient_a_id')::uuid, 'completed', current_setting('test.submission_personal_workout_a_id')::uuid, null, null)$$,
  '23514',
  null,
  'personal workout cannot satisfy team assignment performance'
);

select throws_ok(
  $$select public.submit_workout_assignment(current_setting('test.submission_recipient_a_id')::uuid, 'completed', current_setting('test.submission_team_workout_b_id')::uuid, null, null)$$,
  '42501',
  null,
  'athlete cannot link another athlete workout'
);

select throws_ok(
  $$select public.submit_workout_assignment(current_setting('test.submission_recipient_a_id')::uuid, 'unavailable', null, 'vacation', null)$$,
  '23514',
  null,
  'unavailable reason is constrained to injury illness or other'
);

select throws_ok(
  $$select public.submit_workout_assignment(current_setting('test.submission_recipient_a_id')::uuid, 'skipped', current_setting('test.submission_team_workout_a_id')::uuid, null, null)$$,
  '23514',
  null,
  'skipped outcome cannot attach a workout'
);

select lives_ok(
  $$select public.submit_workout_assignment(current_setting('test.submission_recipient_a_id')::uuid, 'completed', current_setting('test.submission_team_workout_a_id')::uuid, null, 'Felt good')$$,
  'athlete can submit completed outcome with own same-team workout'
);

do $$
begin
  perform set_config('test.submission_a_id', (
    select id::text from public.workout_assignment_submissions
    where assignment_recipient_id = current_setting('test.submission_recipient_a_id')::uuid
  ), true);
end;
$$;

select results_eq(
  $$select count(*) from public.workout_assignment_submissions$$,
  array[1::bigint],
  'athlete sees their own submission'
);

set local request.jwt.claim.sub = 'b5000000-0000-4000-8000-000000000005';

select results_eq(
  $$select count(*) from public.workout_assignment_submissions$$,
  array[0::bigint],
  'team admin cannot read sensitive athlete submission solely through management role'
);

set local request.jwt.claim.sub = 'b6000000-0000-4000-8000-000000000006';

select results_eq(
  $$select count(*) from public.workout_assignment_submissions$$,
  array[0::bigint],
  'unassigned coach cannot read athlete submission'
);

set local request.jwt.claim.sub = 'b2000000-0000-4000-8000-000000000002';

select results_eq(
  $$select count(*) from public.workout_assignment_submissions$$,
  array[1::bigint],
  'explicitly assigned coach can read athlete submission'
);

select throws_ok(
  $$update public.workout_assignment_submissions set completion_status = 'skipped', workout_id = null where id = current_setting('test.submission_a_id')::uuid$$,
  '42501',
  null,
  'coach cannot directly edit athlete submission content'
);

set local request.jwt.claim.sub = 'b5000000-0000-4000-8000-000000000005';

select throws_ok(
  $$select public.review_workout_assignment_submission(current_setting('test.submission_a_id')::uuid, 'Admin review')$$,
  '42501',
  null,
  'team admin cannot review athlete submission solely through management role'
);

set local request.jwt.claim.sub = 'b6000000-0000-4000-8000-000000000006';

select throws_ok(
  $$select public.review_workout_assignment_submission(current_setting('test.submission_a_id')::uuid, 'Unassigned review')$$,
  '42501',
  null,
  'unassigned coach cannot review athlete submission'
);

set local request.jwt.claim.sub = 'b2000000-0000-4000-8000-000000000002';

select lives_ok(
  $$select public.review_workout_assignment_submission(current_setting('test.submission_a_id')::uuid, 'Good execution')$$,
  'authorized coach can review athlete submission'
);

select results_eq(
  $$select count(*) from public.workout_assignment_submissions where id = current_setting('test.submission_a_id')::uuid and reviewed_at is not null and reviewed_by_membership_id = current_setting('test.submission_coach_id')::uuid and coach_note = 'Good execution'$$,
  array[1::bigint],
  'coach review metadata is recorded separately from athlete outcome'
);

select results_eq(
  $$select title from public.workouts where id = current_setting('test.submission_team_workout_a_id')::uuid$$,
  array['Athlete A Team Performance'::text],
  'coach review does not mutate linked athlete workout'
);

set local request.jwt.claim.sub = 'b3000000-0000-4000-8000-000000000003';

select lives_ok(
  $$select public.submit_workout_assignment(current_setting('test.submission_recipient_a_id')::uuid, 'modified', current_setting('test.submission_team_workout_a_id')::uuid, null, 'Reduced final rep')$$,
  'athlete can revise own submission while assignment remains scheduled'
);

select results_eq(
  $$select count(*) from public.workout_assignment_submissions where id = current_setting('test.submission_a_id')::uuid and completion_status = 'modified' and reviewed_at is null and reviewed_by_membership_id is null and coach_note is null$$,
  array[1::bigint],
  'athlete revision clears previous coach review metadata'
);

set local request.jwt.claim.sub = 'b2000000-0000-4000-8000-000000000002';

select lives_ok(
  $$select public.close_workout_assignment(current_setting('test.submission_assignment_a_id')::uuid)$$,
  'authorized coach can close athlete A assignment'
);

set local request.jwt.claim.sub = 'b3000000-0000-4000-8000-000000000003';

select throws_ok(
  $$select public.submit_workout_assignment(current_setting('test.submission_recipient_a_id')::uuid, 'completed', current_setting('test.submission_team_workout_a_id')::uuid, null, 'Late revision')$$,
  '23514',
  null,
  'closed assignment rejects normal athlete submission revision'
);

set local request.jwt.claim.sub = 'b2000000-0000-4000-8000-000000000002';

select lives_ok(
  $$select public.review_workout_assignment_submission(current_setting('test.submission_a_id')::uuid, 'Reviewed after close')$$,
  'authorized coach may review retained submission after assignment closes'
);

set local request.jwt.claim.sub = 'b4000000-0000-4000-8000-000000000004';

select lives_ok(
  $$select public.submit_workout_assignment(current_setting('test.submission_recipient_b_id')::uuid, 'unavailable', null, 'injury', 'Soreness today')$$,
  'athlete can report unavailable due to injury without creating fake workout'
);

do $$
begin
  perform set_config('test.submission_b_id', (
    select id::text from public.workout_assignment_submissions
    where assignment_recipient_id = current_setting('test.submission_recipient_b_id')::uuid
  ), true);
end;
$$;

select results_eq(
  $$select count(*) from public.workout_assignment_submissions where id = current_setting('test.submission_b_id')::uuid and completion_status = 'unavailable' and unavailable_reason = 'injury' and workout_id is null$$,
  array[1::bigint],
  'unavailable outcome stores broad reason without fake workout'
);

select lives_ok(
  $$select public.submit_workout_assignment(current_setting('test.submission_recipient_b_id')::uuid, 'skipped', null, null, 'Could not complete')$$,
  'athlete may revise unavailable outcome to skipped while scheduled'
);

select results_eq(
  $$select count(*) from public.workout_assignment_submissions where id = current_setting('test.submission_b_id')::uuid and completion_status = 'skipped' and unavailable_reason is null and workout_id is null$$,
  array[1::bigint],
  'skipped revision clears unavailable reason and remains workout-free'
);

set local request.jwt.claim.sub = 'b2000000-0000-4000-8000-000000000002';

select lives_ok(
  $$select public.cancel_workout_assignment(current_setting('test.submission_assignment_b_id')::uuid)$$,
  'authorized coach can cancel athlete B assignment'
);

set local request.jwt.claim.sub = 'b4000000-0000-4000-8000-000000000004';

select throws_ok(
  $$select public.submit_workout_assignment(current_setting('test.submission_recipient_b_id')::uuid, 'skipped', null, null, 'Cancelled revision')$$,
  '23514',
  null,
  'cancelled assignment rejects normal submission revision'
);

set local request.jwt.claim.sub = 'b2000000-0000-4000-8000-000000000002';

select throws_ok(
  $$select public.review_workout_assignment_submission(current_setting('test.submission_b_id')::uuid, 'Cancelled review')$$,
  '23514',
  null,
  'cancelled assignment submission is not reviewable'
);

set local request.jwt.claim.sub = 'b1000000-0000-4000-8000-000000000001';

select lives_ok(
  $$select public.end_coach_athlete_assignment((select id from public.coach_athlete_assignments where team_id = current_setting('test.submission_team_id')::uuid and coach_membership_id = current_setting('test.submission_coach_id')::uuid and athlete_membership_id = current_setting('test.submission_athlete_a_id')::uuid and active))$$,
  'team owner can end coach-athlete relationship for athlete A'
);

set local request.jwt.claim.sub = 'b2000000-0000-4000-8000-000000000002';

select results_eq(
  $$select count(*) from public.workout_assignment_submissions$$,
  array[1::bigint],
  'ending athlete A coaching relationship immediately removes coach access to A submission while B remains authorized'
);

set local request.jwt.claim.sub = 'b3000000-0000-4000-8000-000000000003';

select results_eq(
  $$select count(*) from public.workout_assignment_submissions where id = current_setting('test.submission_a_id')::uuid$$,
  array[1::bigint],
  'athlete retains access to own historical submission after coach relationship ends'
);

select results_eq(
  $$select count(*) from public.friendships$$,
  array[0::bigint],
  'submission and review lifecycle never creates friendships'
);

select results_eq(
  $$select has_table_privilege('anon', 'public.workout_assignment_submissions', 'SELECT')$$,
  array[false],
  'anonymous role has no submission table access'
);

select results_eq(
  $$select has_table_privilege('authenticated', 'public.workout_assignment_submissions', 'INSERT')$$,
  array[false],
  'authenticated clients cannot bypass submission RPC with direct inserts'
);

select results_eq(
  $$select count(*) from public.workouts$$,
  array[2::bigint],
  'outcome workflow creates no fake workout records beyond athlete-authored performance and personal workout'
);

select * from finish();
rollback;
