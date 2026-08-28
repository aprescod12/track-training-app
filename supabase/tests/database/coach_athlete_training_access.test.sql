begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(25);

insert into auth.users (id, email) values
  ('10000000-0000-4000-8000-000000000001', 'owner-coach-access@example.com'),
  ('20000000-0000-4000-8000-000000000002', 'assigned-coach-access@example.com'),
  ('30000000-0000-4000-8000-000000000003', 'athlete-access@example.com'),
  ('40000000-0000-4000-8000-000000000004', 'staff-admin-access@example.com'),
  ('50000000-0000-4000-8000-000000000005', 'unassigned-coach-access@example.com'),
  ('60000000-0000-4000-8000-000000000006', 'friend-access@example.com'),
  ('70000000-0000-4000-8000-000000000007', 'outsider-access@example.com');

insert into public.friendships (user_low, user_high, requester_id, status)
values (
  '30000000-0000-4000-8000-000000000003',
  '60000000-0000-4000-8000-000000000006',
  '60000000-0000-4000-8000-000000000006',
  'accepted'
);

set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';

select lives_ok(
  $$select public.create_team('Coach Access Test Team', 'coach-access-test-team', 'coach', null, null, null, null, null, 'private')$$,
  'owner coach can create the team'
);

do $$
begin
  perform set_config(
    'test.coach_access_team_id',
    (select id::text from public.teams where slug = 'coach-access-test-team'),
    true
  );
end;
$$;

select lives_ok(
  $$
    insert into public.team_memberships (
      team_id, user_id, member_type, management_role, status, invited_by, joined_at
    ) values
      (
        current_setting('test.coach_access_team_id')::uuid,
        '20000000-0000-4000-8000-000000000002'::uuid,
        'coach', 'member', 'active',
        '10000000-0000-4000-8000-000000000001'::uuid, now()
      ),
      (
        current_setting('test.coach_access_team_id')::uuid,
        '30000000-0000-4000-8000-000000000003'::uuid,
        'athlete', 'member', 'active',
        '10000000-0000-4000-8000-000000000001'::uuid, now()
      ),
      (
        current_setting('test.coach_access_team_id')::uuid,
        '40000000-0000-4000-8000-000000000004'::uuid,
        'staff', 'admin', 'active',
        '10000000-0000-4000-8000-000000000001'::uuid, now()
      ),
      (
        current_setting('test.coach_access_team_id')::uuid,
        '50000000-0000-4000-8000-000000000005'::uuid,
        'coach', 'member', 'active',
        '10000000-0000-4000-8000-000000000001'::uuid, now()
      )
  $$,
  'owner can add coach, athlete, staff admin, and unassigned coach memberships'
);

do $$
begin
  perform set_config(
    'test.assigned_coach_membership_id',
    (
      select id::text from public.team_memberships
      where team_id = current_setting('test.coach_access_team_id')::uuid
        and user_id = '20000000-0000-4000-8000-000000000002'::uuid
    ),
    true
  );
  perform set_config(
    'test.access_athlete_membership_id',
    (
      select id::text from public.team_memberships
      where team_id = current_setting('test.coach_access_team_id')::uuid
        and user_id = '30000000-0000-4000-8000-000000000003'::uuid
    ),
    true
  );
end;
$$;

set local request.jwt.claim.sub = '30000000-0000-4000-8000-000000000003';

select lives_ok(
  $$
    insert into public.workouts (workout_date, title, workout_type, user_id)
    values (
      current_date,
      'Private Rehab Session',
      'running',
      '30000000-0000-4000-8000-000000000003'::uuid
    )
  $$,
  'athlete can create a personal workout with no team context'
);

select lives_ok(
  $$
    insert into public.workouts (workout_date, title, workout_type, user_id, team_id)
    values (
      current_date,
      'Team Speed Session',
      'running',
      '30000000-0000-4000-8000-000000000003'::uuid,
      current_setting('test.coach_access_team_id')::uuid
    )
  $$,
  'active athlete can create a team-context workout'
);

do $$
begin
  perform set_config(
    'test.personal_workout_id',
    (select id::text from public.workouts where title = 'Private Rehab Session'),
    true
  );
  perform set_config(
    'test.team_workout_id',
    (select id::text from public.workouts where title = 'Team Speed Session'),
    true
  );
end;
$$;

select lives_ok(
  $$
    do $test$
    declare
      v_personal_entry_id uuid;
      v_team_entry_id uuid;
    begin
      insert into public.workout_entries (workout_id, label, user_id)
      values (
        current_setting('test.personal_workout_id')::uuid,
        'Private entry',
        '30000000-0000-4000-8000-000000000003'::uuid
      )
      returning id into v_personal_entry_id;

      insert into public.workout_entries (workout_id, label, user_id)
      values (
        current_setting('test.team_workout_id')::uuid,
        'Team entry',
        '30000000-0000-4000-8000-000000000003'::uuid
      )
      returning id into v_team_entry_id;

      insert into public.entry_sets (entry_id, set_number, reps)
      values (v_personal_entry_id, 1, 1);

      insert into public.entry_sets (entry_id, set_number, reps)
      values (v_team_entry_id, 1, 1);
    end
    $test$
  $$,
  'athlete can create child training data for both workouts'
);

select lives_ok(
  $$
    insert into public.achievements (user_id, type, workout_id, dedupe_key)
    values (
      '30000000-0000-4000-8000-000000000003'::uuid,
      'team_access_regression',
      current_setting('test.team_workout_id')::uuid,
      'team-access-regression-achievement'
    )
  $$,
  'athlete can create an achievement tied to the team workout'
);

set local request.jwt.claim.sub = '20000000-0000-4000-8000-000000000002';

select results_eq(
  $$select count(*) from public.workouts where user_id = '30000000-0000-4000-8000-000000000003'::uuid$$,
  array[0::bigint],
  'same-team coach has no workout access before explicit assignment'
);

set local request.jwt.claim.sub = '40000000-0000-4000-8000-000000000004';

select lives_ok(
  $$
    select public.assign_coach_to_athlete(
      current_setting('test.coach_access_team_id')::uuid,
      current_setting('test.assigned_coach_membership_id')::uuid,
      current_setting('test.access_athlete_membership_id')::uuid,
      true
    )
  $$,
  'staff team admin can create the explicit coach-athlete assignment'
);

do $$
begin
  perform set_config(
    'test.coach_access_assignment_id',
    (
      select id::text from public.coach_athlete_assignments
      where team_id = current_setting('test.coach_access_team_id')::uuid
        and coach_membership_id = current_setting('test.assigned_coach_membership_id')::uuid
        and athlete_membership_id = current_setting('test.access_athlete_membership_id')::uuid
    ),
    true
  );
end;
$$;

set local request.jwt.claim.sub = '20000000-0000-4000-8000-000000000002';

select results_eq(
  $$select count(*) from public.workouts where user_id = '30000000-0000-4000-8000-000000000003'::uuid$$,
  array[1::bigint],
  'assigned coach sees exactly the athlete team-context workout'
);

select results_eq(
  $$select count(*) from public.workouts where id = current_setting('test.personal_workout_id')::uuid$$,
  array[0::bigint],
  'assigned coach cannot read the athlete personal workout'
);

select results_eq(
  $$select count(*) from public.workout_entries where workout_id = current_setting('test.team_workout_id')::uuid$$,
  array[1::bigint],
  'coach permission propagates to workout entries through the authorized workout'
);

select results_eq(
  $$
    select count(*)
    from public.entry_sets es
    join public.workout_entries we on we.id = es.entry_id
    where we.workout_id = current_setting('test.team_workout_id')::uuid
  $$,
  array[1::bigint],
  'coach permission propagates to entry sets through the authorized workout'
);

select results_eq(
  $$select count(*) from public.team_workout_summary_v where workout_id = current_setting('test.team_workout_id')::uuid$$,
  array[1::bigint],
  'team-context summary query exposes the assigned team workout'
);

select results_eq(
  $$
    update public.workouts
    set notes = 'coach should not be able to write this'
    where id = current_setting('test.team_workout_id')::uuid
    returning id
  $$,
  $$select null::uuid where false$$,
  'coach training access is read only'
);

select results_eq(
  $$select count(*) from public.achievements where user_id = '30000000-0000-4000-8000-000000000003'::uuid$$,
  array[0::bigint],
  'coach does not receive global achievement visibility through assignment'
);

set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';
select results_eq(
  $$select count(*) from public.workouts where user_id = '30000000-0000-4000-8000-000000000003'::uuid$$,
  array[0::bigint],
  'team ownership alone does not grant athlete workout access'
);

set local request.jwt.claim.sub = '40000000-0000-4000-8000-000000000004';
select results_eq(
  $$select count(*) from public.workouts where user_id = '30000000-0000-4000-8000-000000000003'::uuid$$,
  array[0::bigint],
  'staff admin authority alone does not grant athlete workout access'
);

set local request.jwt.claim.sub = '50000000-0000-4000-8000-000000000005';
select results_eq(
  $$select count(*) from public.workouts where user_id = '30000000-0000-4000-8000-000000000003'::uuid$$,
  array[0::bigint],
  'unassigned coach cannot read athlete training data'
);

set local request.jwt.claim.sub = '60000000-0000-4000-8000-000000000006';
select results_eq(
  $$select count(*) from public.workouts where user_id = '30000000-0000-4000-8000-000000000003'::uuid$$,
  array[2::bigint],
  'accepted friendship access continues independently for personal and team workouts'
);

set local request.jwt.claim.sub = '40000000-0000-4000-8000-000000000004';
select lives_ok(
  $$select public.end_coach_athlete_assignment(current_setting('test.coach_access_assignment_id')::uuid)$$,
  'team admin can end the coaching assignment transactionally'
);

set local request.jwt.claim.sub = '20000000-0000-4000-8000-000000000002';
select results_eq(
  $$select count(*) from public.workouts where user_id = '30000000-0000-4000-8000-000000000003'::uuid$$,
  array[0::bigint],
  'ending the assignment immediately revokes coach workout access'
);

select results_eq(
  $$
    select count(*)
    from public.coach_athlete_assignments
    where id = current_setting('test.coach_access_assignment_id')::uuid
      and active = false
      and ended_at is not null
  $$,
  array[1::bigint],
  'ended assignment remains available historically to its coach participant'
);

set local request.jwt.claim.sub = '30000000-0000-4000-8000-000000000003';
select results_eq(
  $$select count(*) from public.friendships$$,
  array[1::bigint],
  'coach assignment creation and ending do not manufacture friendships'
);

set local request.jwt.claim.sub = '70000000-0000-4000-8000-000000000007';
select throws_ok(
  $$
    insert into public.workouts (workout_date, title, workout_type, user_id, team_id)
    values (
      current_date,
      'Outsider Fake Team Workout',
      'running',
      '70000000-0000-4000-8000-000000000007'::uuid,
      current_setting('test.coach_access_team_id')::uuid
    )
  $$,
  '42501',
  null,
  'non-athlete outsider cannot tag a workout to an arbitrary team'
);

select lives_ok(
  $$
    insert into public.workouts (workout_date, title, workout_type, user_id)
    values (
      current_date,
      'Outsider Personal Workout',
      'running',
      '70000000-0000-4000-8000-000000000007'::uuid
    )
  $$,
  'existing personal workout creation remains backward compatible'
);

select * from finish();
rollback;
