-- Migration C: verification, entity claims, and organization affiliation trust layer.
-- Trust signals never grant training access. Verification/claim decisions are handled by
-- privileged backend workflows; organization affiliation is approved by organization governance.

create table public.verification_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  team_id uuid references public.teams(id) on delete cascade,
  submitted_by uuid not null references auth.users(id),
  verification_method text not null,
  status text not null default 'pending',
  evidence_metadata jsonb,
  evidence_file_path text,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  review_notes text,
  constraint verification_requests_exactly_one_target_check
    check (num_nonnulls(organization_id, team_id) = 1),
  constraint verification_requests_method_check
    check (
      verification_method in (
        'official_email',
        'official_domain',
        'school_directory',
        'official_website',
        'governing_body',
        'documentation',
        'manual_review'
      )
    ),
  constraint verification_requests_status_check
    check (status in ('pending', 'approved', 'rejected', 'withdrawn')),
  constraint verification_requests_review_state_check
    check (
      (status = 'pending' and reviewed_at is null and reviewed_by is null)
      or (status = 'withdrawn' and reviewed_at is null and reviewed_by is null)
      or (status in ('approved', 'rejected') and reviewed_at is not null and reviewed_by is not null)
    ),
  constraint verification_requests_evidence_file_path_check
    check (evidence_file_path is null or length(btrim(evidence_file_path)) > 0)
);

create table public.entity_claims (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  team_id uuid references public.teams(id) on delete cascade,
  claimant_user_id uuid not null references auth.users(id),
  requested_role text not null,
  verification_request_id uuid references public.verification_requests(id) on delete set null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id),
  constraint entity_claims_exactly_one_target_check
    check (num_nonnulls(organization_id, team_id) = 1),
  constraint entity_claims_requested_role_check
    check (length(btrim(requested_role)) > 0),
  constraint entity_claims_status_check
    check (status in ('pending', 'approved', 'rejected')),
  constraint entity_claims_resolution_state_check
    check (
      (status = 'pending' and resolved_at is null and resolved_by is null)
      or (status in ('approved', 'rejected') and resolved_at is not null and resolved_by is not null)
    )
);

create table public.organization_affiliation_requests (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  requested_by uuid not null references auth.users(id),
  status text not null default 'pending',
  approved_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint organization_affiliation_requests_status_check
    check (status in ('pending', 'approved', 'rejected')),
  constraint organization_affiliation_requests_resolution_state_check
    check (
      (status = 'pending' and resolved_at is null and approved_by is null)
      or (status = 'approved' and resolved_at is not null and approved_by is not null)
      or (status = 'rejected' and resolved_at is not null and approved_by is null)
    )
);

create index verification_requests_submitted_by_idx
  on public.verification_requests (submitted_by, submitted_at desc);
create index verification_requests_organization_idx
  on public.verification_requests (organization_id, submitted_at desc)
  where organization_id is not null;
create index verification_requests_team_idx
  on public.verification_requests (team_id, submitted_at desc)
  where team_id is not null;
create unique index verification_requests_one_pending_organization_idx
  on public.verification_requests (organization_id)
  where organization_id is not null and status = 'pending';
create unique index verification_requests_one_pending_team_idx
  on public.verification_requests (team_id)
  where team_id is not null and status = 'pending';

create index entity_claims_claimant_idx
  on public.entity_claims (claimant_user_id, created_at desc);
create index entity_claims_organization_idx
  on public.entity_claims (organization_id, created_at desc)
  where organization_id is not null;
create index entity_claims_team_idx
  on public.entity_claims (team_id, created_at desc)
  where team_id is not null;
create unique index entity_claims_one_pending_claimant_organization_idx
  on public.entity_claims (claimant_user_id, organization_id)
  where organization_id is not null and status = 'pending';
create unique index entity_claims_one_pending_claimant_team_idx
  on public.entity_claims (claimant_user_id, team_id)
  where team_id is not null and status = 'pending';

create index organization_affiliation_requests_organization_idx
  on public.organization_affiliation_requests (organization_id, created_at desc);
create index organization_affiliation_requests_requested_by_idx
  on public.organization_affiliation_requests (requested_by, created_at desc);
create unique index organization_affiliation_requests_one_pending_team_idx
  on public.organization_affiliation_requests (team_id)
  where status = 'pending';

-- Once Migration C is present, organization affiliation for an existing team can only
-- change through the controlled affiliation approval path below.
revoke update (organization_id) on public.teams from authenticated;
revoke update (verification_status, verified_at) on public.teams from authenticated;
revoke update (verification_status, verified_at) on public.organizations from authenticated;

grant usage on schema private to service_role;

create or replace function private.request_verification(
  p_verification_method text,
  p_organization_id uuid default null,
  p_team_id uuid default null,
  p_evidence_metadata jsonb default null,
  p_evidence_file_path text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_request_id uuid;
  v_status text;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if num_nonnulls(p_organization_id, p_team_id) <> 1 then
    raise exception 'exactly one verification target is required' using errcode = '22023';
  end if;

  if p_verification_method not in (
    'official_email',
    'official_domain',
    'school_directory',
    'official_website',
    'governing_body',
    'documentation',
    'manual_review'
  ) then
    raise exception 'unsupported verification method' using errcode = '22023';
  end if;

  if p_evidence_file_path is not null and length(btrim(p_evidence_file_path)) = 0 then
    raise exception 'evidence file path cannot be blank' using errcode = '22023';
  end if;

  if p_organization_id is not null then
    if not private.is_organization_admin(v_user_id, p_organization_id) then
      raise exception 'organization admin authority required' using errcode = '42501';
    end if;

    select o.verification_status
    into v_status
    from public.organizations o
    where o.id = p_organization_id
    for update;

    if not found then
      raise exception 'organization not found' using errcode = '22023';
    end if;

    if v_status = 'verified' then
      raise exception 'organization is already verified' using errcode = '23514';
    end if;
  else
    if not private.is_team_owner(v_user_id, p_team_id) then
      raise exception 'team owner authority required' using errcode = '42501';
    end if;

    select t.verification_status
    into v_status
    from public.teams t
    where t.id = p_team_id
    for update;

    if not found then
      raise exception 'team not found' using errcode = '22023';
    end if;

    if v_status = 'verified' then
      raise exception 'team is already verified' using errcode = '23514';
    end if;
  end if;

  insert into public.verification_requests (
    organization_id,
    team_id,
    submitted_by,
    verification_method,
    status,
    evidence_metadata,
    evidence_file_path
  ) values (
    p_organization_id,
    p_team_id,
    v_user_id,
    p_verification_method,
    'pending',
    p_evidence_metadata,
    p_evidence_file_path
  )
  returning id into v_request_id;

  if p_organization_id is not null then
    update public.organizations
    set verification_status = 'pending',
        verified_at = null
    where id = p_organization_id;
  else
    update public.teams
    set verification_status = 'pending',
        verified_at = null
    where id = p_team_id;
  end if;

  return v_request_id;
end;
$$;

create or replace function public.request_verification(
  p_verification_method text,
  p_organization_id uuid default null,
  p_team_id uuid default null,
  p_evidence_metadata jsonb default null,
  p_evidence_file_path text default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.request_verification(
    p_verification_method,
    p_organization_id,
    p_team_id,
    p_evidence_metadata,
    p_evidence_file_path
  );
$$;

create or replace function private.submit_entity_claim(
  p_requested_role text,
  p_organization_id uuid default null,
  p_team_id uuid default null,
  p_verification_request_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_claim_id uuid;
  v_verification_organization_id uuid;
  v_verification_team_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if num_nonnulls(p_organization_id, p_team_id) <> 1 then
    raise exception 'exactly one claim target is required' using errcode = '22023';
  end if;

  if p_requested_role is null or length(btrim(p_requested_role)) = 0 then
    raise exception 'requested role is required' using errcode = '22023';
  end if;

  if p_verification_request_id is not null then
    select vr.organization_id, vr.team_id
    into v_verification_organization_id, v_verification_team_id
    from public.verification_requests vr
    where vr.id = p_verification_request_id;

    if not found then
      raise exception 'verification request not found' using errcode = '22023';
    end if;

    if v_verification_organization_id is distinct from p_organization_id
       or v_verification_team_id is distinct from p_team_id then
      raise exception 'verification request must target the same entity as the claim'
        using errcode = '23514';
    end if;
  end if;

  insert into public.entity_claims (
    organization_id,
    team_id,
    claimant_user_id,
    requested_role,
    verification_request_id,
    status
  ) values (
    p_organization_id,
    p_team_id,
    v_user_id,
    btrim(p_requested_role),
    p_verification_request_id,
    'pending'
  )
  returning id into v_claim_id;

  return v_claim_id;
end;
$$;

create or replace function public.submit_entity_claim(
  p_requested_role text,
  p_organization_id uuid default null,
  p_team_id uuid default null,
  p_verification_request_id uuid default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.submit_entity_claim(
    p_requested_role,
    p_organization_id,
    p_team_id,
    p_verification_request_id
  );
$$;

create or replace function private.request_organization_affiliation(
  p_team_id uuid,
  p_organization_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_request_id uuid;
  v_current_organization_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if not private.is_team_owner(v_user_id, p_team_id) then
    raise exception 'team owner authority required' using errcode = '42501';
  end if;

  select t.organization_id
  into v_current_organization_id
  from public.teams t
  where t.id = p_team_id
  for update;

  if not found then
    raise exception 'team not found' using errcode = '22023';
  end if;

  if v_current_organization_id is not null then
    raise exception 'team is already affiliated with an organization' using errcode = '23514';
  end if;

  if not exists (select 1 from public.organizations o where o.id = p_organization_id) then
    raise exception 'organization not found' using errcode = '22023';
  end if;

  insert into public.organization_affiliation_requests (
    team_id,
    organization_id,
    requested_by,
    status
  ) values (
    p_team_id,
    p_organization_id,
    v_user_id,
    'pending'
  )
  returning id into v_request_id;

  return v_request_id;
end;
$$;

create or replace function public.request_organization_affiliation(
  p_team_id uuid,
  p_organization_id uuid
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.request_organization_affiliation(p_team_id, p_organization_id);
$$;

create or replace function private.resolve_organization_affiliation(
  p_request_id uuid,
  p_approve boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_request public.organization_affiliation_requests%rowtype;
  v_current_organization_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select *
  into v_request
  from public.organization_affiliation_requests r
  where r.id = p_request_id
  for update;

  if not found then
    raise exception 'organization affiliation request not found' using errcode = '22023';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'organization affiliation request is already resolved' using errcode = '23514';
  end if;

  if not private.is_organization_admin(v_user_id, v_request.organization_id) then
    raise exception 'organization admin authority required' using errcode = '42501';
  end if;

  if p_approve then
    select t.organization_id
    into v_current_organization_id
    from public.teams t
    where t.id = v_request.team_id
    for update;

    if not found then
      raise exception 'team not found' using errcode = '22023';
    end if;

    if v_current_organization_id is not null then
      raise exception 'team affiliation changed while request was pending' using errcode = '23514';
    end if;

    update public.teams
    set organization_id = v_request.organization_id
    where id = v_request.team_id;

    update public.organization_affiliation_requests
    set status = 'approved',
        approved_by = v_user_id,
        resolved_at = now()
    where id = p_request_id;
  else
    update public.organization_affiliation_requests
    set status = 'rejected',
        approved_by = null,
        resolved_at = now()
    where id = p_request_id;
  end if;

  return p_request_id;
end;
$$;

create or replace function public.resolve_organization_affiliation(
  p_request_id uuid,
  p_approve boolean
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.resolve_organization_affiliation(p_request_id, p_approve);
$$;

create or replace function private.resolve_verification_request(
  p_request_id uuid,
  p_approve boolean,
  p_reviewed_by uuid,
  p_review_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.verification_requests%rowtype;
begin
  if p_reviewed_by is null then
    raise exception 'reviewed_by is required' using errcode = '22023';
  end if;

  select *
  into v_request
  from public.verification_requests vr
  where vr.id = p_request_id
  for update;

  if not found then
    raise exception 'verification request not found' using errcode = '22023';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'verification request is already resolved' using errcode = '23514';
  end if;

  update public.verification_requests
  set status = case when p_approve then 'approved' else 'rejected' end,
      reviewed_at = now(),
      reviewed_by = p_reviewed_by,
      review_notes = p_review_notes
  where id = p_request_id;

  if v_request.organization_id is not null then
    update public.organizations
    set verification_status = case when p_approve then 'verified' else 'unverified' end,
        verified_at = case when p_approve then now() else null end
    where id = v_request.organization_id;
  else
    update public.teams
    set verification_status = case when p_approve then 'verified' else 'unverified' end,
        verified_at = case when p_approve then now() else null end
    where id = v_request.team_id;
  end if;

  return p_request_id;
end;
$$;

create or replace function public.resolve_verification_request(
  p_request_id uuid,
  p_approve boolean,
  p_reviewed_by uuid,
  p_review_notes text default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.resolve_verification_request(
    p_request_id,
    p_approve,
    p_reviewed_by,
    p_review_notes
  );
$$;

create or replace function private.resolve_entity_claim(
  p_claim_id uuid,
  p_approve boolean,
  p_resolved_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claim public.entity_claims%rowtype;
begin
  if p_resolved_by is null then
    raise exception 'resolved_by is required' using errcode = '22023';
  end if;

  select *
  into v_claim
  from public.entity_claims ec
  where ec.id = p_claim_id
  for update;

  if not found then
    raise exception 'entity claim not found' using errcode = '22023';
  end if;

  if v_claim.status <> 'pending' then
    raise exception 'entity claim is already resolved' using errcode = '23514';
  end if;

  update public.entity_claims
  set status = case when p_approve then 'approved' else 'rejected' end,
      resolved_at = now(),
      resolved_by = p_resolved_by
  where id = p_claim_id;

  -- Approval records the trust decision only. The contract does not define an automatic
  -- membership/role mutation for claims, so no team/organization membership is created here.
  return p_claim_id;
end;
$$;

create or replace function public.resolve_entity_claim(
  p_claim_id uuid,
  p_approve boolean,
  p_resolved_by uuid
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.resolve_entity_claim(p_claim_id, p_approve, p_resolved_by);
$$;

alter table public.verification_requests enable row level security;
alter table public.entity_claims enable row level security;
alter table public.organization_affiliation_requests enable row level security;

revoke all privileges on table public.verification_requests from anon, authenticated;
revoke all privileges on table public.entity_claims from anon, authenticated;
revoke all privileges on table public.organization_affiliation_requests from anon, authenticated;

grant select on public.verification_requests to authenticated;
grant select on public.entity_claims to authenticated;
grant select on public.organization_affiliation_requests to authenticated;

create policy verification_requests_governance_select
on public.verification_requests
for select to authenticated
using (
  submitted_by = (select auth.uid())
  or (
    organization_id is not null
    and private.is_organization_admin((select auth.uid()), organization_id)
  )
  or (
    team_id is not null
    and private.is_team_owner((select auth.uid()), team_id)
  )
);

create policy entity_claims_claimant_select
on public.entity_claims
for select to authenticated
using (claimant_user_id = (select auth.uid()));

create policy organization_affiliation_requests_governance_select
on public.organization_affiliation_requests
for select to authenticated
using (
  requested_by = (select auth.uid())
  or private.is_team_owner((select auth.uid()), team_id)
  or private.is_organization_admin((select auth.uid()), organization_id)
);

revoke all privileges on function private.request_verification(text, uuid, uuid, jsonb, text) from public, anon, authenticated, service_role;
revoke all privileges on function private.submit_entity_claim(text, uuid, uuid, uuid) from public, anon, authenticated, service_role;
revoke all privileges on function private.request_organization_affiliation(uuid, uuid) from public, anon, authenticated, service_role;
revoke all privileges on function private.resolve_organization_affiliation(uuid, boolean) from public, anon, authenticated, service_role;
revoke all privileges on function private.resolve_verification_request(uuid, boolean, uuid, text) from public, anon, authenticated, service_role;
revoke all privileges on function private.resolve_entity_claim(uuid, boolean, uuid) from public, anon, authenticated, service_role;

grant execute on function private.request_verification(text, uuid, uuid, jsonb, text) to authenticated;
grant execute on function private.submit_entity_claim(text, uuid, uuid, uuid) to authenticated;
grant execute on function private.request_organization_affiliation(uuid, uuid) to authenticated;
grant execute on function private.resolve_organization_affiliation(uuid, boolean) to authenticated;
grant execute on function private.resolve_verification_request(uuid, boolean, uuid, text) to service_role;
grant execute on function private.resolve_entity_claim(uuid, boolean, uuid) to service_role;

revoke all privileges on function public.request_verification(text, uuid, uuid, jsonb, text) from public, anon, authenticated, service_role;
revoke all privileges on function public.submit_entity_claim(text, uuid, uuid, uuid) from public, anon, authenticated, service_role;
revoke all privileges on function public.request_organization_affiliation(uuid, uuid) from public, anon, authenticated, service_role;
revoke all privileges on function public.resolve_organization_affiliation(uuid, boolean) from public, anon, authenticated, service_role;
revoke all privileges on function public.resolve_verification_request(uuid, boolean, uuid, text) from public, anon, authenticated, service_role;
revoke all privileges on function public.resolve_entity_claim(uuid, boolean, uuid) from public, anon, authenticated, service_role;

grant execute on function public.request_verification(text, uuid, uuid, jsonb, text) to authenticated;
grant execute on function public.submit_entity_claim(text, uuid, uuid, uuid) to authenticated;
grant execute on function public.request_organization_affiliation(uuid, uuid) to authenticated;
grant execute on function public.resolve_organization_affiliation(uuid, boolean) to authenticated;
grant execute on function public.resolve_verification_request(uuid, boolean, uuid, text) to service_role;
grant execute on function public.resolve_entity_claim(uuid, boolean, uuid) to service_role;
