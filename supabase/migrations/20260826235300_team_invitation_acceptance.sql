-- Migration A follow-up: controlled team invitation acceptance.
-- Acceptance is transactional and does not create or alter friendship records.

-- Team-created invitations must begin pending; acceptance happens through the RPC below.
drop policy if exists team_invitations_admin_insert on public.team_invitations;
create policy team_invitations_admin_insert on public.team_invitations
for insert to authenticated
with check (
  invited_by = (select auth.uid())
  and status = 'pending'
  and accepted_at is null
  and private.can_manage_team((select auth.uid()), team_id)
);

create or replace function public.accept_team_invitation(p_invitation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_email text := lower(coalesce((select auth.jwt() ->> 'email'), ''));
  v_invitation public.team_invitations%rowtype;
  v_membership_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select *
  into v_invitation
  from public.team_invitations ti
  where ti.id = p_invitation_id
  for update;

  if not found then
    raise exception 'team invitation not found' using errcode = '22023';
  end if;

  if v_invitation.status <> 'pending' then
    raise exception 'team invitation is not pending' using errcode = '22023';
  end if;

  if v_invitation.expires_at is not null and v_invitation.expires_at <= now() then
    raise exception 'team invitation has expired' using errcode = '22023';
  end if;

  if v_invitation.invited_user_id is not null then
    if v_invitation.invited_user_id <> v_user_id then
      raise exception 'team invitation belongs to another user' using errcode = '42501';
    end if;
  elsif v_invitation.email is null or lower(v_invitation.email) <> v_email then
    raise exception 'team invitation email does not match authenticated user' using errcode = '42501';
  end if;

  insert into public.team_memberships (
    team_id,
    user_id,
    member_type,
    management_role,
    status,
    invited_by,
    joined_at,
    ended_at
  ) values (
    v_invitation.team_id,
    v_user_id,
    v_invitation.member_type,
    v_invitation.management_role,
    'active',
    v_invitation.invited_by,
    now(),
    null
  )
  on conflict (team_id, user_id) do update set
    member_type = excluded.member_type,
    management_role = excluded.management_role,
    status = 'active',
    invited_by = excluded.invited_by,
    joined_at = now(),
    ended_at = null
  returning id into v_membership_id;

  update public.team_invitations
  set status = 'accepted',
      invited_user_id = coalesce(invited_user_id, v_user_id),
      accepted_at = now()
  where id = p_invitation_id;

  return v_membership_id;
end;
$$;

revoke all privileges on function public.accept_team_invitation(uuid) from public, anon, authenticated;
grant execute on function public.accept_team_invitation(uuid) to authenticated;
