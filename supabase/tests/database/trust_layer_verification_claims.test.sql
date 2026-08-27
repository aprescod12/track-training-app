begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(26);

insert into auth.users (id, email) values
  ('91000000-0000-4000-8000-000000000001', 'team-owner-trust@example.com'),
  ('92000000-0000-4000-8000-000000000002', 'athlete-trust@example.com'),
  ('93000000-0000-4000-8000-000000000003', 'claimant-trust@example.com'),
  ('94000000-0000-4000-8000-000000000004', 'outsider-trust@example.com'),
  ('95000000-0000-4000-8000-000000000005', 'reviewer-trust@example.com'),
  ('96000000-0000-4000-8000-000000000006', 'org-owner-trust@example.com');

set local role authenticated;
set local request.jwt.claim.sub = '91000000-0000-4000-8000-000000000001';

select lives_ok(
  $$select public.create_team('Trust Verification Team', 'trust-verification-team', 'staff')$$,
  'team owner can create the private trust-test team'
);

do $$
begin
  perform set_config(
    'test.trust_team_id',
    (select id::text from public.teams where slug = 'trust-verification-team'),
    true
  );
end;
$$;

select lives_ok(
  $$
    insert into public.team_memberships (
      team_id, user_id, member_type, management_role, status, invited_by, joined_at
    ) values (
      current_setting('test.trust_team_id')::uuid,
      '92000000-0000-4000-8000-000000000002'::uuid,
      'athlete', 'member', 'active',
      '91000000-0000-4000-8000-000000000001'::uuid,
      now()
    )
  $$,
  'team owner can add the athlete used for trust-boundary testing'
);

set local request.jwt.claim.sub = '92000000-0000-4000-8000-000000000002';
select lives_ok(
  $$
    insert into public.workouts (workout_date, title, workout_type, user_id, team_id)
    values (
      current_date,
      'Trust Boundary Team Workout',
      'track',
      '92000000-0000-4000-8000-000000000002'::uuid,
      current_setting('test.trust_team_id')::uuid
    )
  $$,
  'active athlete can create a team-context workout before verification'
);

set local request.jwt.claim.sub = '91000000-0000-4000-8000-000000000001';
select results_eq(
  $$select count(*) from public.workouts where user_id = '92000000-0000-4000-8000-000000000002'::uuid$$,
  array[0::bigint],
  'team ownership does not grant athlete workout visibility before verification'
);

select lives_ok(
  $$
    select public.request_verification(
      'official_website',
      null,
      current_setting('test.trust_team_id')::uuid,
      '{"source":"official athletics site"}'::jsonb,
      'verification/team/trust-team.pdf'
    )
  $$,
  'team owner can submit a verification request'
);

do $$
begin
  perform set_config(
    'test.team_verification_request_id',
    (
      select id::text from public.verification_requests
      where team_id = current_setting('test.trust_team_id')::uuid
        and status = 'pending'
    ),
    true
  );
end;
$$;

select results_eq(
  $$select verification_status from public.teams where id = current_setting('test.trust_team_id')::uuid$$,
  array['pending'::text],
  'submitting verification moves the visible trust signal to pending'
);

select results_eq(
  $$select count(*) from public.verification_requests where id = current_setting('test.team_verification_request_id')::uuid$$,
  array[1::bigint],
  'team owner can read the verification request and its evidence metadata'
);

set local request.jwt.claim.sub = '94000000-0000-4000-8000-000000000004';
select results_eq(
  $$select count(*) from public.verification_requests$$,
  array[0::bigint],
  'unrelated authenticated user cannot read verification evidence'
);

set local request.jwt.claim.sub = '91000000-0000-4000-8000-000000000001';
select throws_ok(
  $$
    update public.teams
    set verification_status = 'verified', verified_at = now()
    where id = current_setting('test.trust_team_id')::uuid
  $$,
  '42501',
  null,
  'ordinary team governance cannot self-award verified status'
);

set local role service_role;
select lives_ok(
  $$
    select public.resolve_verification_request(
      current_setting('test.team_verification_request_id')::uuid,
      true,
      '95000000-0000-4000-8000-000000000005'::uuid,
      'Official source confirmed'
    )
  $$,
  'privileged reviewer workflow can approve team verification'
);

set local role authenticated;
set local request.jwt.claim.sub = '91000000-0000-4000-8000-000000000001';
select results_eq(
  $$
    select count(*)
    from public.teams
    where id = current_setting('test.trust_team_id')::uuid
      and verification_status = 'verified'
      and verified_at is not null
  $$,
  array[1::bigint],
  'approved verification updates the team trust signal transactionally'
);

select results_eq(
  $$select count(*) from public.workouts where user_id = '92000000-0000-4000-8000-000000000002'::uuid$$,
  array[0::bigint],
  'verification does not grant athlete workout visibility'
);

set local request.jwt.claim.sub = '93000000-0000-4000-8000-000000000003';
select lives_ok(
  $$
    select public.submit_entity_claim(
      'owner',
      null,
      current_setting('test.trust_team_id')::uuid,
      current_setting('test.team_verification_request_id')::uuid
    )
  $$,
  'authenticated claimant can submit a claim for an existing team'
);

do $$
begin
  perform set_config(
    'test.team_claim_id',
    (
      select id::text from public.entity_claims
      where claimant_user_id = '93000000-0000-4000-8000-000000000003'::uuid
        and team_id = current_setting('test.trust_team_id')::uuid
    ),
    true
  );
end;
$$;

select results_eq(
  $$select count(*) from public.entity_claims where id = current_setting('test.team_claim_id')::uuid$$,
  array[1::bigint],
  'claimant can read their own claim'
);

set local request.jwt.claim.sub = '91000000-0000-4000-8000-000000000001';
select results_eq(
  $$select count(*) from public.entity_claims$$,
  array[0::bigint],
  'entity governance does not automatically receive claimant-private claim records'
);

set local role service_role;
select lives_ok(
  $$
    select public.resolve_entity_claim(
      current_setting('test.team_claim_id')::uuid,
      true,
      '95000000-0000-4000-8000-000000000005'::uuid
    )
  $$,
  'privileged reviewer workflow can approve an entity claim'
);

set local role authenticated;
set local request.jwt.claim.sub = '93000000-0000-4000-8000-000000000003';
select results_eq(
  $$
    select count(*) from public.entity_claims
    where id = current_setting('test.team_claim_id')::uuid
      and status = 'approved'
      and resolved_at is not null
  $$,
  array[1::bigint],
  'claimant sees the approved claim decision'
);

select results_eq(
  $$
    select count(*) from public.team_memberships
    where team_id = current_setting('test.trust_team_id')::uuid
      and user_id = '93000000-0000-4000-8000-000000000003'::uuid
  $$,
  array[0::bigint],
  'claim approval does not invent a team membership or requested role mutation'
);

select results_eq(
  $$select count(*) from public.friendships$$,
  array[0::bigint],
  'verification and claim workflows remain independent from friendships'
);

select throws_ok(
  $$
    insert into public.entity_claims (
      team_id, claimant_user_id, requested_role, status
    ) values (
      current_setting('test.trust_team_id')::uuid,
      '93000000-0000-4000-8000-000000000003'::uuid,
      'owner',
      'pending'
    )
  $$,
  '42501',
  null,
  'authenticated clients cannot bypass the controlled claim RPC with direct writes'
);

set local request.jwt.claim.sub = '96000000-0000-4000-8000-000000000006';
select lives_ok(
  $$select public.create_organization('Trust Test University', 'trust-test-university', 'college')$$,
  'organization owner can create the organization used for verification testing'
);

do $$
begin
  perform set_config(
    'test.trust_organization_id',
    (select id::text from public.organizations where slug = 'trust-test-university'),
    true
  );
end;
$$;

select lives_ok(
  $$
    select public.request_verification(
      'official_domain',
      current_setting('test.trust_organization_id')::uuid,
      null,
      '{"domain":"example.edu"}'::jsonb,
      null
    )
  $$,
  'organization owner can submit organization verification'
);

do $$
begin
  perform set_config(
    'test.org_verification_request_id',
    (
      select id::text from public.verification_requests
      where organization_id = current_setting('test.trust_organization_id')::uuid
        and status = 'pending'
    ),
    true
  );
end;
$$;

set local role service_role;
select lives_ok(
  $$
    select public.resolve_verification_request(
      current_setting('test.org_verification_request_id')::uuid,
      true,
      '95000000-0000-4000-8000-000000000005'::uuid,
      null
    )
  $$,
  'privileged reviewer workflow can approve organization verification'
);

set local role authenticated;
set local request.jwt.claim.sub = '96000000-0000-4000-8000-000000000006';
select results_eq(
  $$
    select count(*) from public.organizations
    where id = current_setting('test.trust_organization_id')::uuid
      and verification_status = 'verified'
      and verified_at is not null
  $$,
  array[1::bigint],
  'organization verification updates only the organization trust signal'
);

set local request.jwt.claim.sub = '91000000-0000-4000-8000-000000000001';
select throws_ok(
  $$
    select public.request_verification(
      'official_website',
      current_setting('test.trust_organization_id')::uuid,
      current_setting('test.trust_team_id')::uuid,
      null,
      null
    )
  $$,
  '22023',
  null,
  'verification request requires exactly one entity target'
);

select throws_ok(
  $$
    select public.request_verification(
      'social_media',
      null,
      current_setting('test.trust_team_id')::uuid,
      null,
      null
    )
  $$,
  '22023',
  null,
  'verification method is limited to the contract-supported methods'
);

select * from finish();
rollback;
