begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(20);

insert into auth.users (id, email) values
  ('81000000-0000-4000-8000-000000000001', 'owner-integrity@example.com'),
  ('82000000-0000-4000-8000-000000000002', 'coach-one-integrity@example.com'),
  ('83000000-0000-4000-8000-000000000003', 'coach-two-integrity@example.com'),
  ('84000000-0000-4000-8000-000000000004', 'athlete-integrity@example.com'),
  ('85000000-0000-4000-8000-000000000005', 'staff-admin-integrity@example.com'),
  ('86000000-0000-4000-8000-000000000006', 'inactive-coach-integrity@example.com');

set local role authenticated;
set local request.jwt.claim.sub = '81000000-0000-4000-8000-000000000001';

select lives_ok(
  $$select public.create_team('Assignment Integrity Team', 'assignment-integrity-team', 'coach')$$,
  'owner can create assignment-integrity team'
);

do $$
begin
  perform set_config(
    'test.assignment_integrity_team_id',
    (select id::text from public.teams where slug = 'assignment-integrity-team'),
    true
  );
end;
$$;

select lives_ok(
  $$
    insert into public.team_memberships (
      team_id, user_id, member_type, management_role, status, invited_by, joined_at, ended_at
    ) values
      (
        current_setting('test.assignment_integrity_team_id')::uuid,
        '82000000-0000-4000-8000-000000000002'::uuid,
        'coach', 'member', 'active',
        '81000000-0000-4000-8000-000000000001'::uuid, now(), null
      ),
      (
        current_setting('test.assignment_integrity_team_id')::uuid,
        '83000000-0000-4000-8000-000000000003'::uuid,
        'coach', 'member', 'active',
        '81000000-0000-4000-8000-000000000001'::uuid, now(), null
      ),
      (
        current_setting('test.assignment_integrity_team_id')::uuid,
        '84000000-0000-4000-8000-000000000004'::uuid,
        'athlete', 'member', 'active',
        '81000000-0000-4000-8000-000000000001'::uuid, now(), null
      ),
      (
        current_setting('test.assignment_integrity_team_id')::uuid,
        '85000000-0000-4000-8000-000000000005'::uuid,
        'staff', 'admin', 'active',
        '81000000-0000-4000-8000-000000000001'::uuid, now(), null
      ),
      (
        current_setting('test.assignment_integrity_team_id')::uuid,
        '86000000-0000-4000-8000-000000000006'::uuid,
        'coach', 'member', 'inactive',
        '81000000-0000-4000-8000-000000000001'::uuid, now() - interval '30 days', now()
      )
  $$,
  'owner can establish active and historical memberships for invariant tests'
);

do $$
begin
  perform set_config('test.integrity_coach_one_membership_id', (
    select id::text from public.team_memberships
    where team_id = current_setting('test.assignment_integrity_team_id')::uuid
      and user_id = '82000000-0000-4000-8000-000000000002'::uuid
  ), true);
  perform set_config('test.integrity_coach_two_membership_id', (
    select id::text from public.team_memberships
    where team_id = current_setting('test.assignment_integrity_team_id')::uuid
      and user_id = '83000000-0000-4000-8000-000000000003'::uuid
  ), true);
  perform set_config('test.integrity_athlete_membership_id', (
    select id::text from public.team_memberships
    where team_id = current_setting('test.assignment_integrity_team_id')::uuid
      and user_id = '84000000-0000-4000-8000-000000000004'::uuid
  ), true);
  perform set_config('test.integrity_staff_membership_id', (
    select id::text from public.team_memberships
    where team_id = current_setting('test.assignment_integrity_team_id')::uuid
      and user_id = '85000000-0000-4000-8000-000000000005'::uuid
  ), true);
  perform set_config('test.integrity_inactive_coach_membership_id', (
    select id::text from public.team_memberships
    where team_id = current_setting('test.assignment_integrity_team_id')::uuid
      and user_id = '86000000-0000-4000-8000-000000000006'::uuid
  ), true);
end;
$$;

set local request.jwt.claim.sub = '85000000-0000-4000-8000-000000000005';

select lives_ok(
  $$
    select public.assign_coach_to_athlete(
      current_setting('test.assignment_integrity_team_id')::uuid,
      current_setting('test.integrity_coach_one_membership_id')::uuid,
      current_setting('test.integrity_athlete_membership_id')::uuid,
      true
    )
  $$,
  'team admin can assign an active coach as the primary coach'
);

select results_eq(
  $$
    select count(*) from public.coach_athlete_assignments
    where team_id = current_setting('test.assignment_integrity_team_id')::uuid
      and athlete_membership_id = current_setting('test.integrity_athlete_membership_id')::uuid
      and active
      and is_primary
  $$,
  array[1::bigint],
  'an athlete has exactly one active primary coach after first assignment'
);

select throws_ok(
  $$
    select public.assign_coach_to_athlete(
      current_setting('test.assignment_integrity_team_id')::uuid,
      current_setting('test.integrity_coach_two_membership_id')::uuid,
      current_setting('test.integrity_athlete_membership_id')::uuid,
      true
    )
  $$,
  '23505',
  null,
  'a second active primary coach for the same athlete/team is rejected'
);

select lives_ok(
  $$
    select public.assign_coach_to_athlete(
      current_setting('test.assignment_integrity_team_id')::uuid,
      current_setting('test.integrity_coach_two_membership_id')::uuid,
      current_setting('test.integrity_athlete_membership_id')::uuid,
      false
    )
  $$,
  'a second active non-primary coach is allowed'
);

select throws_ok(
  $$
    select public.assign_coach_to_athlete(
      current_setting('test.assignment_integrity_team_id')::uuid,
      current_setting('test.integrity_staff_membership_id')::uuid,
      current_setting('test.integrity_athlete_membership_id')::uuid,
      false
    )
  $$,
  '23514',
  null,
  'staff membership cannot be used as coach membership in an assignment'
);

select throws_ok(
  $$
    select public.assign_coach_to_athlete(
      current_setting('test.assignment_integrity_team_id')::uuid,
      current_setting('test.integrity_coach_one_membership_id')::uuid,
      current_setting('test.integrity_staff_membership_id')::uuid,
      false
    )
  $$,
  '23514',
  null,
  'staff membership cannot be used as athlete membership in an assignment'
);

select throws_ok(
  $$
    select public.assign_coach_to_athlete(
      current_setting('test.assignment_integrity_team_id')::uuid,
      current_setting('test.integrity_inactive_coach_membership_id')::uuid,
      current_setting('test.integrity_athlete_membership_id')::uuid,
      false
    )
  $$,
  '23514',
  null,
  'inactive coach membership cannot create a new active assignment'
);

select results_eq(
  $$select count(*) from public.coach_athlete_assignments$$,
  array[2::bigint],
  'team admin can read the two valid assignment rows'
);

set local request.jwt.claim.sub = '82000000-0000-4000-8000-000000000002';
select throws_ok(
  $$
    select public.assign_coach_to_athlete(
      current_setting('test.assignment_integrity_team_id')::uuid,
      current_setting('test.integrity_coach_two_membership_id')::uuid,
      current_setting('test.integrity_athlete_membership_id')::uuid,
      false
    )
  $$,
  '42501',
  null,
  'ordinary coach without admin authority cannot manage assignments'
);

set local request.jwt.claim.sub = '85000000-0000-4000-8000-000000000005';

do $$
begin
  perform set_config('test.integrity_primary_assignment_id', (
    select id::text from public.coach_athlete_assignments
    where coach_membership_id = current_setting('test.integrity_coach_one_membership_id')::uuid
      and athlete_membership_id = current_setting('test.integrity_athlete_membership_id')::uuid
  ), true);
end;
$$;

select lives_ok(
  $$select public.end_coach_athlete_assignment(current_setting('test.integrity_primary_assignment_id')::uuid)$$,
  'team admin can end the active primary assignment'
);

select lives_ok(
  $$
    select public.assign_coach_to_athlete(
      current_setting('test.assignment_integrity_team_id')::uuid,
      current_setting('test.integrity_coach_two_membership_id')::uuid,
      current_setting('test.integrity_athlete_membership_id')::uuid,
      true
    )
  $$,
  'another active coach can become primary after the previous primary ends'
);

select results_eq(
  $$
    select count(*) from public.coach_athlete_assignments
    where id = current_setting('test.integrity_primary_assignment_id')::uuid
      and active = false
      and ended_at is not null
  $$,
  array[1::bigint],
  'ended primary assignment is retained with historical end timestamp'
);

set local request.jwt.claim.sub = '84000000-0000-4000-8000-000000000004';
select results_eq(
  $$select count(*) from public.coach_athlete_assignments$$,
  array[2::bigint],
  'athlete participant can see current and historical assignments involving them'
);

select lives_ok(
  $$
    insert into public.workouts (workout_date, title, workout_type, user_id, team_id)
    values (
      current_date,
      'Membership Revocation Team Workout',
      'running',
      '84000000-0000-4000-8000-000000000004'::uuid,
      current_setting('test.assignment_integrity_team_id')::uuid
    )
  $$,
  'active athlete can create team workout before membership ends'
);

set local request.jwt.claim.sub = '83000000-0000-4000-8000-000000000003';
select results_eq(
  $$select count(*) from public.workouts where user_id = '84000000-0000-4000-8000-000000000004'::uuid$$,
  array[1::bigint],
  'active assigned coach can read team workout while both memberships remain active'
);

set local request.jwt.claim.sub = '85000000-0000-4000-8000-000000000005';
select lives_ok(
  $$
    update public.team_memberships
    set status = 'inactive', ended_at = now()
    where id = current_setting('test.integrity_athlete_membership_id')::uuid
  $$,
  'team admin can deactivate the athlete membership without deleting history'
);

set local request.jwt.claim.sub = '83000000-0000-4000-8000-000000000003';
select results_eq(
  $$select count(*) from public.workouts where user_id = '84000000-0000-4000-8000-000000000004'::uuid$$,
  array[0::bigint],
  'active assignment no longer grants access after athlete membership becomes inactive'
);

set local request.jwt.claim.sub = '85000000-0000-4000-8000-000000000005';
select throws_ok(
  $$
    insert into public.coach_athlete_assignments (
      team_id, coach_membership_id, athlete_membership_id, created_by
    ) values (
      current_setting('test.assignment_integrity_team_id')::uuid,
      current_setting('test.integrity_coach_one_membership_id')::uuid,
      current_setting('test.integrity_athlete_membership_id')::uuid,
      '85000000-0000-4000-8000-000000000005'::uuid
    )
  $$,
  '42501',
  null,
  'even a team admin cannot bypass controlled RPCs with direct assignment-table writes'
);

select * from finish();
rollback;
