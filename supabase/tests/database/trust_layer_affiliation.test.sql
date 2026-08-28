begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(20);

insert into auth.users (id, email) values
  ('a1000000-0000-4000-8000-000000000001', 'org-owner-affiliation@example.com'),
  ('a2000000-0000-4000-8000-000000000002', 'org-admin-affiliation@example.com'),
  ('a3000000-0000-4000-8000-000000000003', 'other-org-owner-affiliation@example.com'),
  ('a4000000-0000-4000-8000-000000000004', 'team-owner-affiliation@example.com'),
  ('a5000000-0000-4000-8000-000000000005', 'team-admin-affiliation@example.com'),
  ('a6000000-0000-4000-8000-000000000006', 'athlete-affiliation@example.com');

set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000001';

select lives_ok(
  $$select public.create_organization('Affiliation University', 'affiliation-university', 'college')$$,
  'organization owner can create the target organization'
);

do $$
begin
  perform set_config(
    'test.affiliation_org_id',
    (select id::text from public.organizations where slug = 'affiliation-university'),
    true
  );
end;
$$;

select lives_ok(
  $$
    insert into public.organization_memberships (
      organization_id, user_id, role, status, invited_by, joined_at
    ) values (
      current_setting('test.affiliation_org_id')::uuid,
      'a2000000-0000-4000-8000-000000000002'::uuid,
      'admin', 'active',
      'a1000000-0000-4000-8000-000000000001'::uuid,
      now()
    )
  $$,
  'organization owner can add an organization admin'
);

set local request.jwt.claim.sub = 'a3000000-0000-4000-8000-000000000003';
select lives_ok(
  $$select public.create_organization('Other Affiliation University', 'other-affiliation-university', 'college')$$,
  'unrelated organization owner can create a separate organization'
);

set local request.jwt.claim.sub = 'a4000000-0000-4000-8000-000000000004';
select lives_ok(
  $$select public.create_team('Independent Affiliation Team', 'independent-affiliation-team', 'staff')$$,
  'team owner can create an independent team'
);

do $$
begin
  perform set_config(
    'test.affiliation_team_id',
    (select id::text from public.teams where slug = 'independent-affiliation-team'),
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
        current_setting('test.affiliation_team_id')::uuid,
        'a5000000-0000-4000-8000-000000000005'::uuid,
        'staff', 'admin', 'active',
        'a4000000-0000-4000-8000-000000000004'::uuid,
        now()
      ),
      (
        current_setting('test.affiliation_team_id')::uuid,
        'a6000000-0000-4000-8000-000000000006'::uuid,
        'athlete', 'member', 'active',
        'a4000000-0000-4000-8000-000000000004'::uuid,
        now()
      )
  $$,
  'team owner can establish admin and athlete memberships'
);

set local request.jwt.claim.sub = 'a6000000-0000-4000-8000-000000000006';
select lives_ok(
  $$
    insert into public.workouts (workout_date, title, workout_type, user_id, team_id)
    values (
      current_date,
      'Affiliation Trust Boundary Workout',
      'running',
      'a6000000-0000-4000-8000-000000000006'::uuid,
      current_setting('test.affiliation_team_id')::uuid
    )
  $$,
  'athlete can create a team-context workout before affiliation'
);

set local request.jwt.claim.sub = 'a5000000-0000-4000-8000-000000000005';
select throws_ok(
  $$
    select public.request_organization_affiliation(
      current_setting('test.affiliation_team_id')::uuid,
      current_setting('test.affiliation_org_id')::uuid
    )
  $$,
  '42501',
  null,
  'ordinary team admin cannot initiate governance-level organization affiliation'
);

set local request.jwt.claim.sub = 'a4000000-0000-4000-8000-000000000004';
select lives_ok(
  $$
    select public.request_organization_affiliation(
      current_setting('test.affiliation_team_id')::uuid,
      current_setting('test.affiliation_org_id')::uuid
    )
  $$,
  'team owner can request organization affiliation'
);

do $$
begin
  perform set_config(
    'test.affiliation_request_id',
    (
      select id::text
      from public.organization_affiliation_requests
      where team_id = current_setting('test.affiliation_team_id')::uuid
        and status = 'pending'
    ),
    true
  );
end;
$$;

select results_eq(
  $$select organization_id from public.teams where id = current_setting('test.affiliation_team_id')::uuid$$,
  array[null::uuid],
  'requesting affiliation does not attach the team before approval'
);

set local request.jwt.claim.sub = 'a2000000-0000-4000-8000-000000000002';
select results_eq(
  $$
    select count(*) from public.organization_affiliation_requests
    where id = current_setting('test.affiliation_request_id')::uuid
  $$,
  array[1::bigint],
  'target organization admin can see the pending affiliation request'
);

set local request.jwt.claim.sub = 'a3000000-0000-4000-8000-000000000003';
select throws_ok(
  $$
    select public.resolve_organization_affiliation(
      current_setting('test.affiliation_request_id')::uuid,
      true
    )
  $$,
  '42501',
  null,
  'unrelated organization owner cannot approve another organization affiliation'
);

set local request.jwt.claim.sub = 'a4000000-0000-4000-8000-000000000004';
select throws_ok(
  $$
    insert into public.organization_affiliation_requests (
      team_id, organization_id, requested_by, status
    ) values (
      current_setting('test.affiliation_team_id')::uuid,
      current_setting('test.affiliation_org_id')::uuid,
      'a4000000-0000-4000-8000-000000000004'::uuid,
      'pending'
    )
  $$,
  '42501',
  null,
  'team owner cannot bypass the controlled affiliation RPC with a direct table insert'
);

set local request.jwt.claim.sub = 'a2000000-0000-4000-8000-000000000002';
select lives_ok(
  $$
    select public.resolve_organization_affiliation(
      current_setting('test.affiliation_request_id')::uuid,
      true
    )
  $$,
  'target organization admin can approve the affiliation transactionally'
);

set local request.jwt.claim.sub = 'a4000000-0000-4000-8000-000000000004';
select results_eq(
  $$select organization_id from public.teams where id = current_setting('test.affiliation_team_id')::uuid$$,
  array[current_setting('test.affiliation_org_id')::uuid],
  'approved affiliation is the only path that updates the team organization link'
);

select throws_ok(
  $$
    update public.teams
    set organization_id = null
    where id = current_setting('test.affiliation_team_id')::uuid
  $$,
  '42501',
  null,
  'team owner cannot directly rewrite organization affiliation after Migration C'
);

set local request.jwt.claim.sub = 'a2000000-0000-4000-8000-000000000002';
select results_eq(
  $$
    select count(*) from public.team_memberships
    where team_id = current_setting('test.affiliation_team_id')::uuid
      and user_id = 'a2000000-0000-4000-8000-000000000002'::uuid
  $$,
  array[0::bigint],
  'organization admin approval does not create team membership'
);

select results_eq(
  $$select count(*) from public.workouts where user_id = 'a6000000-0000-4000-8000-000000000006'::uuid$$,
  array[0::bigint],
  'organization governance does not gain athlete workout access through affiliation'
);

select results_eq(
  $$select count(*) from public.friendships$$,
  array[0::bigint],
  'organization affiliation remains independent from friendships'
);

select results_eq(
  $$select count(*) from public.coach_athlete_assignments$$,
  array[0::bigint],
  'organization affiliation does not manufacture coach-athlete assignments'
);

set local request.jwt.claim.sub = 'a4000000-0000-4000-8000-000000000004';
select throws_ok(
  $$
    select public.request_organization_affiliation(
      current_setting('test.affiliation_team_id')::uuid,
      current_setting('test.affiliation_org_id')::uuid
    )
  $$,
  '23514',
  null,
  'an already affiliated team cannot open a second affiliation request'
);

select * from finish();
rollback;
