begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(25);

select has_table('public', 'organizations', 'organizations table exists');
select has_table('public', 'teams', 'teams table exists');
select has_table('public', 'team_memberships', 'team memberships table exists');

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'owner@example.com'),
  ('22222222-2222-4222-8222-222222222222', 'athlete@example.com'),
  ('33333333-3333-4333-8333-333333333333', 'outsider@example.com'),
  ('44444444-4444-4444-8444-444444444444', 'invited@example.com');

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

select lives_ok(
  $$select public.create_organization('Villanova University', 'villanova-university', 'college')$$,
  'authenticated user can create an organization transactionally'
);

select results_eq(
  $$
    select count(*)
    from public.organization_memberships om
    join public.organizations o on o.id = om.organization_id
    where o.slug = 'villanova-university'
      and om.user_id = '11111111-1111-4111-8111-111111111111'::uuid
      and om.role = 'owner'
      and om.status = 'active'
  $$,
  array[1::bigint],
  'organization creator becomes active owner'
);

select lives_ok(
  $$
    select public.create_team(
      'Villanova Track & Field',
      'villanova-track-field',
      'coach',
      (select id from public.organizations where slug = 'villanova-university'),
      null,
      'Villanova',
      'PA',
      'USA',
      'private'
    )
  $$,
  'organization owner can create an affiliated team transactionally'
);

select results_eq(
  $$
    select count(*)
    from public.team_memberships tm
    join public.teams t on t.id = tm.team_id
    where t.slug = 'villanova-track-field'
      and tm.user_id = '11111111-1111-4111-8111-111111111111'::uuid
      and tm.member_type = 'coach'
      and tm.management_role = 'owner'
      and tm.status = 'active'
  $$,
  array[1::bigint],
  'team creator becomes active team owner'
);

select results_eq(
  $$select count(*) from public.friendships$$,
  array[0::bigint],
  'team creation does not manufacture friendships'
);

do $$
begin
  perform set_config(
    'test.organization_id',
    (select id::text from public.organizations where slug = 'villanova-university'),
    true
  );
  perform set_config(
    'test.team_id',
    (select id::text from public.teams where slug = 'villanova-track-field'),
    true
  );
end;
$$;

select lives_ok(
  $$
    insert into public.team_memberships (
      team_id, user_id, member_type, management_role, status, invited_by, joined_at
    ) values (
      current_setting('test.team_id')::uuid,
      '22222222-2222-4222-8222-222222222222'::uuid,
      'athlete',
      'member',
      'active',
      '11111111-1111-4111-8111-111111111111'::uuid,
      now()
    )
  $$,
  'team owner can add an athlete membership'
);

set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';

select results_eq(
  $$select count(*) from public.team_memberships where team_id = current_setting('test.team_id')::uuid$$,
  array[2::bigint],
  'active athlete can see the active team roster'
);

set local request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';

select results_eq(
  $$select count(*) from public.teams where id = current_setting('test.team_id')::uuid$$,
  array[0::bigint],
  'outsider cannot read a private team'
);

select throws_ok(
  $$
    insert into public.team_memberships (
      team_id, user_id, member_type, management_role, status, joined_at
    ) values (
      current_setting('test.team_id')::uuid,
      '33333333-3333-4333-8333-333333333333'::uuid,
      'athlete',
      'member',
      'active',
      now()
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "team_memberships"',
  'outsider cannot self-add to a team'
);

set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

select lives_ok(
  $$
    insert into public.team_groups (team_id, name, group_type, created_by)
    values (
      current_setting('test.team_id')::uuid,
      'Sprints',
      'event_group',
      '11111111-1111-4111-8111-111111111111'::uuid
    )
  $$,
  'team owner can create a root team group'
);

select lives_ok(
  $$
    insert into public.team_groups (team_id, name, group_type, parent_group_id, created_by)
    select
      current_setting('test.team_id')::uuid,
      'Short Sprints',
      'training_group',
      g.id,
      '11111111-1111-4111-8111-111111111111'::uuid
    from public.team_groups g
    where g.team_id = current_setting('test.team_id')::uuid
      and g.name = 'Sprints'
  $$,
  'team owner can create a nested team group'
);

select throws_ok(
  $$
    update public.team_groups parent
    set parent_group_id = child.id
    from public.team_groups child
    where parent.name = 'Sprints'
      and child.name = 'Short Sprints'
      and parent.team_id = current_setting('test.team_id')::uuid
      and child.team_id = parent.team_id
  $$,
  '23514',
  'team group hierarchy cannot contain cycles',
  'team group hierarchy rejects cycles'
);

select lives_ok(
  $$select public.create_team('Independent Sprint Club', 'independent-sprint-club', 'coach')$$,
  'team owner can also create an independent team'
);

do $$
begin
  perform set_config(
    'test.independent_team_id',
    (select id::text from public.teams where slug = 'independent-sprint-club'),
    true
  );
end;
$$;

select throws_ok(
  $$
    insert into public.team_group_memberships (team_id, group_id, team_membership_id)
    select
      current_setting('test.team_id')::uuid,
      target_group.id,
      other_membership.id
    from public.team_groups target_group
    join public.team_memberships other_membership
      on other_membership.team_id = current_setting('test.independent_team_id')::uuid
     and other_membership.user_id = '11111111-1111-4111-8111-111111111111'::uuid
    where target_group.team_id = current_setting('test.team_id')::uuid
      and target_group.name = 'Sprints'
  $$,
  '23503',
  null,
  'group membership rejects a membership from another team'
);

select lives_ok(
  $$
    insert into public.team_group_memberships (team_id, group_id, team_membership_id)
    select
      current_setting('test.team_id')::uuid,
      g.id,
      tm.id
    from public.team_groups g
    join public.team_memberships tm
      on tm.team_id = current_setting('test.team_id')::uuid
     and tm.user_id = '22222222-2222-4222-8222-222222222222'::uuid
    where g.team_id = current_setting('test.team_id')::uuid
      and g.name = 'Sprints'
  $$,
  'team owner can place an athlete into a team group'
);

select lives_ok(
  $$
    insert into public.team_invitations (
      team_id, invited_user_id, member_type, management_role, invited_by, status
    ) values (
      current_setting('test.team_id')::uuid,
      '44444444-4444-4444-8444-444444444444'::uuid,
      'athlete',
      'member',
      '11111111-1111-4111-8111-111111111111'::uuid,
      'pending'
    )
  $$,
  'team owner can create a pending invitation'
);

do $$
begin
  perform set_config(
    'test.invitation_id',
    (
      select id::text
      from public.team_invitations
      where team_id = current_setting('test.team_id')::uuid
        and invited_user_id = '44444444-4444-4444-8444-444444444444'::uuid
    ),
    true
  );
end;
$$;

set local request.jwt.claim.sub = '44444444-4444-4444-8444-444444444444';

select lives_ok(
  $$select public.accept_team_invitation(current_setting('test.invitation_id')::uuid)$$,
  'invited user can accept the invitation transactionally'
);

select results_eq(
  $$
    select count(*)
    from public.team_memberships
    where team_id = current_setting('test.team_id')::uuid
      and user_id = '44444444-4444-4444-8444-444444444444'::uuid
      and status = 'active'
      and member_type = 'athlete'
  $$,
  array[1::bigint],
  'accepting invitation creates an active team membership'
);

select results_eq(
  $$select count(*) from public.friendships$$,
  array[0::bigint],
  'accepting a team invitation still does not create a friendship'
);

set local request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';

select throws_ok(
  $$
    select public.create_team(
      'Impersonating Team',
      'impersonating-team',
      'coach',
      current_setting('test.organization_id')::uuid
    )
  $$,
  '42501',
  'organization affiliation requires organization admin authority',
  'outsider cannot attach a team to an organization they do not govern'
);

set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

select throws_ok(
  $$
    update public.teams
    set verification_status = 'verified', verified_at = now()
    where id = current_setting('test.team_id')::uuid
  $$,
  '42501',
  null,
  'ordinary team owner cannot self-award verification'
);

select results_eq(
  $$
    select verification_status
    from public.teams
    where id = current_setting('test.team_id')::uuid
  $$,
  array['unverified'::text],
  'team remains unverified after rejected self-verification'
);

select * from finish();
rollback;
