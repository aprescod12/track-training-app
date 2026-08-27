-- Allow a private team creator to complete the zero-member bootstrap transaction.
-- This exception disappears as soon as the first team membership exists, so created_by
-- never becomes a permanent authorization relationship.

drop policy if exists teams_authenticated_select on public.teams;
create policy teams_authenticated_select on public.teams
for select to authenticated
using (
  visibility in ('public', 'unlisted')
  or private.is_team_member((select auth.uid()), id)
  or (
    created_by = (select auth.uid())
    and not private.team_has_members(id)
  )
);
