begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(5);

insert into auth.users (id, email) values
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'coach-privacy@example.com'),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'athlete-privacy@example.com');

set local role authenticated;
set local request.jwt.claim.sub = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

select lives_ok(
  $$select public.create_team('Privacy Test Team', 'privacy-test-team', 'coach')$$,
  'coach can create a team for privacy regression testing'
);

do $$
begin
  perform set_config(
    'test.privacy_team_id',
    (select id::text from public.teams where slug = 'privacy-test-team'),
    true
  );
end;
$$;

select lives_ok(
  $$
    insert into public.team_memberships (
      team_id, user_id, member_type, management_role, status, invited_by, joined_at
    ) values (
      current_setting('test.privacy_team_id')::uuid,
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'::uuid,
      'athlete',
      'member',
      'active',
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd'::uuid,
      now()
    )
  $$,
  'coach can add athlete to team without creating a social relationship'
);

set local request.jwt.claim.sub = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

select lives_ok(
  $$
    insert into public.workouts (workout_date, title, workout_type, user_id)
    values (
      current_date,
      'Athlete Personal Session',
      'running',
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'::uuid
    )
  $$,
  'athlete can create an existing-schema workout normally'
);

set local request.jwt.claim.sub = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

select results_eq(
  $$select count(*) from public.workouts where user_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'::uuid$$,
  array[0::bigint],
  'same-team coach cannot read athlete workout without friendship or coaching authorization'
);

select results_eq(
  $$select count(*) from public.friendships$$,
  array[0::bigint],
  'team membership does not create friendship records'
);

select * from finish();
rollback;
