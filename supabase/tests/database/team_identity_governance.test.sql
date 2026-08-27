begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(11);

insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'owner-governance@example.com'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'admin-governance@example.com'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'member-governance@example.com');

set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

select lives_ok(
  $$select public.create_team('Governance Test Team', 'governance-test-team', 'coach', null, null, null, null, null, 'private')$$,
  'owner can create a private team'
);

do $$
begin
  perform set_config(
    'test.governance_team_id',
    (select id::text from public.teams where slug = 'governance-test-team'),
    true
  );
end;
$$;

select results_eq(
  $$
    select count(*)
    from public.team_memberships
    where team_id = current_setting('test.governance_team_id')::uuid
      and user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid
      and management_role = 'owner'
      and status = 'active'
  $$,
  array[1::bigint],
  'private-team creator is bootstrapped as active owner'
);

select lives_ok(
  $$
    insert into public.team_memberships (
      team_id, user_id, member_type, management_role, status, invited_by, joined_at
    ) values (
      current_setting('test.governance_team_id')::uuid,
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid,
      'staff',
      'admin',
      'active',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
      now()
    )
  $$,
  'owner can add a team admin'
);

set local request.jwt.claim.sub = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

select results_eq(
  $$
    update public.team_memberships
    set status = 'inactive', ended_at = now()
    where team_id = current_setting('test.governance_team_id')::uuid
      and user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid
    returning user_id
  $$,
  $$select null::uuid where false$$,
  'team admin cannot deactivate an owner membership'
);

select throws_ok(
  $$
    update public.team_memberships
    set management_role = 'owner'
    where team_id = current_setting('test.governance_team_id')::uuid
      and user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid
  $$,
  '42501',
  null,
  'team admin cannot promote themselves to owner'
);

select throws_ok(
  $$
    insert into public.team_invitations (
      team_id, invited_user_id, member_type, management_role, invited_by, status
    ) values (
      current_setting('test.governance_team_id')::uuid,
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid,
      'staff',
      'owner',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid,
      'pending'
    )
  $$,
  '42501',
  null,
  'team admin cannot issue an owner invitation'
);

select lives_ok(
  $$
    insert into public.team_invitations (
      team_id, invited_user_id, member_type, management_role, invited_by, status
    ) values (
      current_setting('test.governance_team_id')::uuid,
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid,
      'staff',
      'member',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid,
      'pending'
    )
  $$,
  'team admin can issue a normal membership invitation'
);

select results_eq(
  $$
    update public.teams
    set name = 'Admin Renamed Team'
    where id = current_setting('test.governance_team_id')::uuid
    returning id
  $$,
  $$select null::uuid where false$$,
  'team admin cannot change team governance settings'
);

set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

select lives_ok(
  $$
    update public.teams
    set name = 'Owner Renamed Team'
    where id = current_setting('test.governance_team_id')::uuid
  $$,
  'team owner can change team settings'
);

select results_eq(
  $$select name from public.teams where id = current_setting('test.governance_team_id')::uuid$$,
  array['Owner Renamed Team'::text],
  'owner team-setting update persists'
);

select results_eq(
  $$select count(*) from public.friendships$$,
  array[0::bigint],
  'governance changes remain independent from friendships'
);

select * from finish();
rollback;
