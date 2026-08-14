-- Harden friendship state transitions so authorization does not depend on client UI behavior.
-- Requests must begin as pending, only the non-requesting participant may accept them,
-- and friendship identity fields cannot be changed through authenticated client updates.

-- The client only needs to update the status column when accepting a request.
-- Revoke table-wide UPDATE so user_low, user_high, and requester_id remain immutable.
revoke update on table public.friendships from authenticated;
grant update (status) on table public.friendships to authenticated;

-- Replace the broader insert/update policies from the production foundation migration.
drop policy if exists friendships_requester_insert on public.friendships;
drop policy if exists friendships_participant_update on public.friendships;

-- A requester may only create a canonical pending request that includes themselves.
create policy friendships_requester_insert on public.friendships
  for insert to authenticated
  with check (
    requester_id = (select auth.uid())
    and status = 'pending'
    and ((select auth.uid()) = user_low or (select auth.uid()) = user_high)
    and user_low < user_high
  );

-- Only the recipient of a pending request may accept it.
-- Column-level privileges above ensure the participant/requester identity cannot be rewritten.
create policy friendships_recipient_accept on public.friendships
  for update to authenticated
  using (
    status = 'pending'
    and requester_id <> (select auth.uid())
    and ((select auth.uid()) = user_low or (select auth.uid()) = user_high)
  )
  with check (
    status = 'accepted'
    and requester_id <> (select auth.uid())
    and ((select auth.uid()) = user_low or (select auth.uid()) = user_high)
  );
