-- Migration A authorization hardening.
-- Separates team/organization ownership from ordinary admin authority and makes
-- private-team owner bootstrap independent of team visibility RLS.

create or replace function private.is_organization_owner(p_user_id uuid, p_organization_id uuid)
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
        and om.role = 'owner'
    );
$$;

create or replace function private.is_team_owner(p_user_id uuid, p_team_id uuid)
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
        and tm.management_role = 'owner'
    );
$$;

create or replace function private.is_team_creator(p_user_id uuid, p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id = (select auth.uid())
    and exists (
      select 1
      from public.teams t
      where t.id = p_team_id
        and t.created_by = p_user_id
    );
$$;

revoke all privileges on function private.is_organization_owner(uuid, uuid) from public, anon, authenticated;
revoke all privileges on function private.is_team_owner(uuid, uuid) from public, anon, authenticated;
revoke all privileges on function private.is_team_creator(uuid, uuid) from public, anon, authenticated;
grant execute on function private.is_organization_owner(uuid, uuid) to authenticated;
grant execute on function private.is_team_owner(uuid, uuid) to authenticated;
grant execute on function private.is_team_creator(uuid, uuid) to authenticated;

-- Team settings are governance-level changes: owners, not ordinary admins, update the team row.
drop policy if exists teams_admin_update on public.teams;
create policy teams_owner_update on public.teams
for update to authenticated
using (private.is_team_owner((select auth.uid()), id))
with check (
  private.is_team_owner((select auth.uid()), id)
  and (
    organization_id is null
    or private.is_organization_admin((select auth.uid()), organization_id)
  )
);

-- Bootstrap the first owner through a visibility-independent creator check.
drop policy if exists team_memberships_manager_or_initial_owner_insert on public.team_memberships;
create policy team_memberships_manager_or_initial_owner_insert on public.team_memberships
for insert to authenticated
with check (
  (
    private.can_manage_team((select auth.uid()), team_id)
    and (
      management_role <> 'owner'
      or private.is_team_owner((select auth.uid()), team_id)
    )
  )
  or (
    user_id = (select auth.uid())
    and management_role = 'owner'
    and status = 'active'
    and private.is_team_creator((select auth.uid()), team_id)
    and not private.team_has_members(team_id)
  )
);

-- Admins may manage normal roster state, but only owners may modify an owner membership.
drop policy if exists team_memberships_admin_update on public.team_memberships;
create policy team_memberships_admin_update on public.team_memberships
for update to authenticated
using (
  private.can_manage_team((select auth.uid()), team_id)
  and (
    management_role <> 'owner'
    or private.is_team_owner((select auth.uid()), team_id)
  )
)
with check (
  private.can_manage_team((select auth.uid()), team_id)
  and (
    management_role <> 'owner'
    or private.is_team_owner((select auth.uid()), team_id)
  )
);

-- Management-role changes are deliberately not a generic client UPDATE surface.
revoke update (management_role) on public.team_memberships from authenticated;

-- Apply the same owner boundary to organization governance.
drop policy if exists organization_memberships_manager_or_initial_owner_insert on public.organization_memberships;
create policy organization_memberships_manager_or_initial_owner_insert on public.organization_memberships
for insert to authenticated
with check (
  (
    private.is_organization_admin((select auth.uid()), organization_id)
    and (
      role <> 'owner'
      or private.is_organization_owner((select auth.uid()), organization_id)
    )
  )
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

drop policy if exists organization_memberships_admin_update on public.organization_memberships;
create policy organization_memberships_admin_update on public.organization_memberships
for update to authenticated
using (
  private.is_organization_admin((select auth.uid()), organization_id)
  and (
    role <> 'owner'
    or private.is_organization_owner((select auth.uid()), organization_id)
  )
)
with check (
  private.is_organization_admin((select auth.uid()), organization_id)
  and (
    role <> 'owner'
    or private.is_organization_owner((select auth.uid()), organization_id)
  )
);

revoke update (role) on public.organization_memberships from authenticated;

-- Admins can invite ordinary members/admins; only an owner can issue an owner invitation.
drop policy if exists team_invitations_admin_insert on public.team_invitations;
create policy team_invitations_admin_insert on public.team_invitations
for insert to authenticated
with check (
  invited_by = (select auth.uid())
  and status = 'pending'
  and accepted_at is null
  and private.can_manage_team((select auth.uid()), team_id)
  and (
    management_role <> 'owner'
    or private.is_team_owner((select auth.uid()), team_id)
  )
);

-- Invitation state transitions are controlled by RPCs rather than generic client writes.
revoke update (status, accepted_at) on public.team_invitations from authenticated;
