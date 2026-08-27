-- Migration A: team identity foundation.
-- Implements the approved team / organization schema contract without changing workout access.
-- Hosted Supabase deployment remains intentionally separate from repository implementation.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  organization_type text not null,
  website text,
  city text,
  state_region text,
  country text,
  verification_status text not null default 'unverified',
  verified_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint organizations_slug_unique unique (slug),
  constraint organizations_type_check check (
    organization_type in ('college', 'high_school', 'club', 'travel', 'governing_body', 'independent', 'other')
  ),
  constraint organizations_verification_status_check check (
    verification_status in ('unverified', 'pending', 'verified')
  ),
  constraint organizations_verified_at_check check (
    (verification_status = 'verified' and verified_at is not null)
    or verification_status <> 'verified'
  )
);

create table public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  role text not null,
  status text not null,
  invited_by uuid references auth.users(id),
  joined_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_memberships_org_user_unique unique (organization_id, user_id),
  constraint organization_memberships_role_check check (role in ('owner', 'admin', 'member')),
  constraint organization_memberships_status_check check (status in ('pending', 'active', 'inactive', 'removed')),
  constraint organization_memberships_active_joined_check check (status <> 'active' or joined_at is not null),
  constraint organization_memberships_ended_check check (
    status not in ('inactive', 'removed') or ended_at is not null
  )
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  name text not null,
  slug text not null,
  sport text not null default 'track_and_field',
  description text,
  city text,
  state_region text,
  country text,
  visibility text not null default 'public',
  verification_status text not null default 'unverified',
  verified_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint teams_visibility_check check (visibility in ('public', 'unlisted', 'private')),
  constraint teams_verification_status_check check (verification_status in ('unverified', 'pending', 'verified')),
  constraint teams_verified_at_check check (
    (verification_status = 'verified' and verified_at is not null)
    or verification_status <> 'verified'
  )
);

create unique index teams_affiliated_slug_unique_idx
  on public.teams (organization_id, slug)
  where organization_id is not null;
create unique index teams_independent_slug_unique_idx
  on public.teams (slug)
  where organization_id is null;

create table public.team_memberships (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  member_type text not null,
  management_role text not null default 'member',
  status text not null,
  invited_by uuid references auth.users(id),
  joined_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint team_memberships_team_user_unique unique (team_id, user_id),
  constraint team_memberships_team_id_id_unique unique (team_id, id),
  constraint team_memberships_member_type_check check (member_type in ('athlete', 'coach', 'staff')),
  constraint team_memberships_management_role_check check (management_role in ('member', 'admin', 'owner')),
  constraint team_memberships_status_check check (status in ('pending', 'active', 'inactive', 'removed')),
  constraint team_memberships_active_joined_check check (status <> 'active' or joined_at is not null),
  constraint team_memberships_ended_check check (
    status not in ('inactive', 'removed') or ended_at is not null
  )
);

create table public.team_groups (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  name text not null,
  group_type text,
  parent_group_id uuid,
  sort_order integer,
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint team_groups_team_id_id_unique unique (team_id, id),
  constraint team_groups_parent_same_team_fkey
    foreign key (team_id, parent_group_id)
    references public.team_groups(team_id, id)
);

create table public.team_group_memberships (
  team_id uuid not null references public.teams(id) on delete cascade,
  group_id uuid not null,
  team_membership_id uuid not null,
  created_at timestamptz not null default now(),
  constraint team_group_memberships_group_member_unique unique (group_id, team_membership_id),
  constraint team_group_memberships_group_same_team_fkey
    foreign key (team_id, group_id)
    references public.team_groups(team_id, id)
    on delete cascade,
  constraint team_group_memberships_member_same_team_fkey
    foreign key (team_id, team_membership_id)
    references public.team_memberships(team_id, id)
    on delete cascade
);

create table public.team_invitations (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  email text,
  invited_user_id uuid references auth.users(id) on delete set null,
  member_type text not null,
  management_role text not null default 'member',
  invited_by uuid not null references auth.users(id),
  status text not null default 'pending',
  token_hash text,
  expires_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint team_invitations_target_check check (email is not null or invited_user_id is not null),
  constraint team_invitations_member_type_check check (member_type in ('athlete', 'coach', 'staff')),
  constraint team_invitations_management_role_check check (management_role in ('member', 'admin', 'owner')),
  constraint team_invitations_status_check check (status in ('pending', 'accepted', 'declined', 'expired', 'revoked')),
  constraint team_invitations_accepted_at_check check (status <> 'accepted' or accepted_at is not null)
);

create index organization_memberships_user_id_idx on public.organization_memberships (user_id);
create index organization_memberships_organization_id_idx on public.organization_memberships (organization_id);
create index teams_organization_id_idx on public.teams (organization_id);
create index team_memberships_user_id_idx on public.team_memberships (user_id);
create index team_memberships_team_id_idx on public.team_memberships (team_id);
create index team_groups_team_id_idx on public.team_groups (team_id);
create index team_groups_parent_group_id_idx on public.team_groups (parent_group_id);
create index team_group_memberships_team_membership_id_idx on public.team_group_memberships (team_membership_id);
create index team_invitations_team_id_idx on public.team_invitations (team_id);
create index team_invitations_invited_user_id_idx on public.team_invitations (invited_user_id);
create index team_invitations_email_idx on public.team_invitations (lower(email)) where email is not null;

create or replace function private.organization_has_members(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_memberships om
    where om.organization_id = p_organization_id
  );
$$;

create or replace function private.team_has_members(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.team_memberships tm
    where tm.team_id = p_team_id
  );
$$;

create or replace function private.is_organization_member(p_user_id uuid, p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id = (select auth.uid())
    and exists (
      select 1
      from public.organization_memberships om
      where om.organization_id = p_organization_id
        and om.user_id = p_user_id
        and om.status = 'active'
    );
$$;

create or replace function private.is_organization_admin(p_user_id uuid, p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id = (select auth.uid())
    and exists (
      select 1
      from public.organization_memberships om
      where om.organization_id = p_organization_id
        and om.user_id = p_user_id
        and om.status = 'active'
        and om.role in ('owner', 'admin')
    );
$$;

create or replace function private.is_team_member(p_user_id uuid, p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id = (select auth.uid())
    and exists (
      select 1
      from public.team_memberships tm
      where tm.team_id = p_team_id
        and tm.user_id = p_user_id
        and tm.status = 'active'
    );
$$;

create or replace function private.is_team_admin(p_user_id uuid, p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id = (select auth.uid())
    and exists (
      select 1
      from public.team_memberships tm
      where tm.team_id = p_team_id
        and tm.user_id = p_user_id
        and tm.status = 'active'
        and tm.management_role in ('owner', 'admin')
    );
$$;

create or replace function private.can_manage_team(p_user_id uuid, p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_team_admin(p_user_id, p_team_id);
$$;

create or replace function private.enforce_team_group_hierarchy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cycle boolean;
begin
  if new.parent_group_id is null then
    return new;
  end if;

  if new.parent_group_id = new.id then
    raise exception 'team group cannot be its own parent' using errcode = '23514';
  end if;

  with recursive ancestors as (
    select g.id, g.parent_group_id
    from public.team_groups g
    where g.team_id = new.team_id
      and g.id = new.parent_group_id

    union

    select g.id, g.parent_group_id
    from public.team_groups g
    join ancestors a on g.id = a.parent_group_id
    where g.team_id = new.team_id
  )
  select exists (select 1 from ancestors where id = new.id)
  into v_cycle;

  if v_cycle then
    raise exception 'team group hierarchy cannot contain cycles' using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all privileges on function private.organization_has_members(uuid) from public, anon, authenticated;
revoke all privileges on function private.team_has_members(uuid) from public, anon, authenticated;
revoke all privileges on function private.is_organization_member(uuid, uuid) from public, anon, authenticated;
revoke all privileges on function private.is_organization_admin(uuid, uuid) from public, anon, authenticated;
revoke all privileges on function private.is_team_member(uuid, uuid) from public, anon, authenticated;
revoke all privileges on function private.is_team_admin(uuid, uuid) from public, anon, authenticated;
revoke all privileges on function private.can_manage_team(uuid, uuid) from public, anon, authenticated;
revoke all privileges on function private.enforce_team_group_hierarchy() from public, anon, authenticated;
grant execute on function private.organization_has_members(uuid) to authenticated;
grant execute on function private.team_has_members(uuid) to authenticated;
grant execute on function private.is_organization_member(uuid, uuid) to authenticated;
grant execute on function private.is_organization_admin(uuid, uuid) to authenticated;
grant execute on function private.is_team_member(uuid, uuid) to authenticated;
grant execute on function private.is_team_admin(uuid, uuid) to authenticated;
grant execute on function private.can_manage_team(uuid, uuid) to authenticated;

create trigger organizations_set_updated_at
before update on public.organizations
for each row execute function public.set_updated_at();

create trigger organization_memberships_set_updated_at
before update on public.organization_memberships
for each row execute function public.set_updated_at();

create trigger teams_set_updated_at
before update on public.teams
for each row execute function public.set_updated_at();

create trigger team_memberships_set_updated_at
before update on public.team_memberships
for each row execute function public.set_updated_at();

create trigger team_groups_set_updated_at
before update on public.team_groups
for each row execute function public.set_updated_at();

create trigger team_groups_hierarchy_guard
before insert or update of team_id, parent_group_id on public.team_groups
for each row execute function private.enforce_team_group_hierarchy();

alter table public.organizations enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.teams enable row level security;
alter table public.team_memberships enable row level security;
alter table public.team_groups enable row level security;
alter table public.team_group_memberships enable row level security;
alter table public.team_invitations enable row level security;

revoke all privileges on table public.organizations from anon, authenticated;
revoke all privileges on table public.organization_memberships from anon, authenticated;
revoke all privileges on table public.teams from anon, authenticated;
revoke all privileges on table public.team_memberships from anon, authenticated;
revoke all privileges on table public.team_groups from anon, authenticated;
revoke all privileges on table public.team_group_memberships from anon, authenticated;
revoke all privileges on table public.team_invitations from anon, authenticated;

grant select on public.organizations to authenticated;
grant insert (name, slug, organization_type, website, city, state_region, country, created_by)
  on public.organizations to authenticated;
grant update (name, slug, organization_type, website, city, state_region, country, archived_at)
  on public.organizations to authenticated;

grant select on public.organization_memberships to authenticated;
grant insert (organization_id, user_id, role, status, invited_by, joined_at, ended_at)
  on public.organization_memberships to authenticated;
grant update (role, status, joined_at, ended_at)
  on public.organization_memberships to authenticated;

grant select on public.teams to authenticated;
grant insert (organization_id, name, slug, sport, description, city, state_region, country, visibility, created_by)
  on public.teams to authenticated;
grant update (organization_id, name, slug, sport, description, city, state_region, country, visibility, archived_at)
  on public.teams to authenticated;

grant select on public.team_memberships to authenticated;
grant insert (team_id, user_id, member_type, management_role, status, invited_by, joined_at, ended_at)
  on public.team_memberships to authenticated;
grant update (member_type, management_role, status, joined_at, ended_at)
  on public.team_memberships to authenticated;

grant select on public.team_groups to authenticated;
grant insert (team_id, name, group_type, parent_group_id, sort_order, is_active, created_by)
  on public.team_groups to authenticated;
grant update (name, group_type, parent_group_id, sort_order, is_active)
  on public.team_groups to authenticated;

grant select, insert, delete on public.team_group_memberships to authenticated;

grant select on public.team_invitations to authenticated;
grant insert (team_id, email, invited_user_id, member_type, management_role, invited_by, status, token_hash, expires_at, accepted_at)
  on public.team_invitations to authenticated;
grant update (status, expires_at, accepted_at)
  on public.team_invitations to authenticated;

create policy organizations_authenticated_select on public.organizations
for select to authenticated
using (true);

create policy organizations_creator_insert on public.organizations
for insert to authenticated
with check ((select auth.uid()) = created_by and verification_status = 'unverified' and verified_at is null);

create policy organizations_admin_update on public.organizations
for update to authenticated
using (private.is_organization_admin((select auth.uid()), id))
with check (private.is_organization_admin((select auth.uid()), id));

create policy organization_memberships_member_select on public.organization_memberships
for select to authenticated
using (
  user_id = (select auth.uid())
  or private.is_organization_member((select auth.uid()), organization_id)
);

create policy organization_memberships_manager_or_initial_owner_insert on public.organization_memberships
for insert to authenticated
with check (
  private.is_organization_admin((select auth.uid()), organization_id)
  or (
    user_id = (select auth.uid())
    and role = 'owner'
    and status = 'active'
    and exists (
      select 1
      from public.organizations o
      where o.id = organization_id
        and o.created_by = (select auth.uid())
    )
    and not private.organization_has_members(organization_id)
  )
);

create policy organization_memberships_admin_update on public.organization_memberships
for update to authenticated
using (private.is_organization_admin((select auth.uid()), organization_id))
with check (private.is_organization_admin((select auth.uid()), organization_id));

create policy teams_authenticated_select on public.teams
for select to authenticated
using (
  visibility in ('public', 'unlisted')
  or private.is_team_member((select auth.uid()), id)
);

create policy teams_creator_insert on public.teams
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and verification_status = 'unverified'
  and verified_at is null
  and (
    organization_id is null
    or private.is_organization_admin((select auth.uid()), organization_id)
  )
);

create policy teams_admin_update on public.teams
for update to authenticated
using (private.can_manage_team((select auth.uid()), id))
with check (
  private.can_manage_team((select auth.uid()), id)
  and (
    organization_id is null
    or private.is_organization_admin((select auth.uid()), organization_id)
  )
);

create policy team_memberships_team_select on public.team_memberships
for select to authenticated
using (
  user_id = (select auth.uid())
  or private.is_team_admin((select auth.uid()), team_id)
  or (
    status = 'active'
    and private.is_team_member((select auth.uid()), team_id)
  )
);

create policy team_memberships_manager_or_initial_owner_insert on public.team_memberships
for insert to authenticated
with check (
  private.can_manage_team((select auth.uid()), team_id)
  or (
    user_id = (select auth.uid())
    and management_role = 'owner'
    and status = 'active'
    and exists (
      select 1
      from public.teams t
      where t.id = team_id
        and t.created_by = (select auth.uid())
    )
    and not private.team_has_members(team_id)
  )
);

create policy team_memberships_admin_update on public.team_memberships
for update to authenticated
using (private.can_manage_team((select auth.uid()), team_id))
with check (private.can_manage_team((select auth.uid()), team_id));

create policy team_groups_team_select on public.team_groups
for select to authenticated
using (private.is_team_member((select auth.uid()), team_id));

create policy team_groups_admin_insert on public.team_groups
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and private.can_manage_team((select auth.uid()), team_id)
);

create policy team_groups_admin_update on public.team_groups
for update to authenticated
using (private.can_manage_team((select auth.uid()), team_id))
with check (private.can_manage_team((select auth.uid()), team_id));

create policy team_group_memberships_team_select on public.team_group_memberships
for select to authenticated
using (private.is_team_member((select auth.uid()), team_id));

create policy team_group_memberships_admin_insert on public.team_group_memberships
for insert to authenticated
with check (private.can_manage_team((select auth.uid()), team_id));

create policy team_group_memberships_admin_delete on public.team_group_memberships
for delete to authenticated
using (private.can_manage_team((select auth.uid()), team_id));

create policy team_invitations_target_or_admin_select on public.team_invitations
for select to authenticated
using (
  private.can_manage_team((select auth.uid()), team_id)
  or invited_user_id = (select auth.uid())
  or (
    email is not null
    and lower(email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
  )
);

create policy team_invitations_admin_insert on public.team_invitations
for insert to authenticated
with check (
  invited_by = (select auth.uid())
  and private.can_manage_team((select auth.uid()), team_id)
);

create policy team_invitations_admin_update on public.team_invitations
for update to authenticated
using (private.can_manage_team((select auth.uid()), team_id))
with check (private.can_manage_team((select auth.uid()), team_id));

create or replace function public.create_organization(
  p_name text,
  p_slug text,
  p_organization_type text,
  p_website text default null,
  p_city text default null,
  p_state_region text default null,
  p_country text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_organization_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  insert into public.organizations (
    name, slug, organization_type, website, city, state_region, country, created_by
  ) values (
    p_name, p_slug, p_organization_type, p_website, p_city, p_state_region, p_country, v_user_id
  )
  returning id into v_organization_id;

  insert into public.organization_memberships (
    organization_id, user_id, role, status, joined_at
  ) values (
    v_organization_id, v_user_id, 'owner', 'active', now()
  );

  return v_organization_id;
end;
$$;

create or replace function public.create_team(
  p_name text,
  p_slug text,
  p_member_type text,
  p_organization_id uuid default null,
  p_description text default null,
  p_city text default null,
  p_state_region text default null,
  p_country text default null,
  p_visibility text default 'public'
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_team_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if p_organization_id is not null
     and not private.is_organization_admin(v_user_id, p_organization_id) then
    raise exception 'organization affiliation requires organization admin authority' using errcode = '42501';
  end if;

  insert into public.teams (
    organization_id, name, slug, description, city, state_region, country, visibility, created_by
  ) values (
    p_organization_id, p_name, p_slug, p_description, p_city, p_state_region, p_country, p_visibility, v_user_id
  )
  returning id into v_team_id;

  insert into public.team_memberships (
    team_id, user_id, member_type, management_role, status, joined_at
  ) values (
    v_team_id, v_user_id, p_member_type, 'owner', 'active', now()
  );

  return v_team_id;
end;
$$;

revoke all privileges on function public.create_organization(text, text, text, text, text, text, text) from public, anon;
revoke all privileges on function public.create_team(text, text, text, uuid, text, text, text, text, text) from public, anon;
grant execute on function public.create_organization(text, text, text, text, text, text, text) to authenticated;
grant execute on function public.create_team(text, text, text, uuid, text, text, text, text, text) to authenticated;
