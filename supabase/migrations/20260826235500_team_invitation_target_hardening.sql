-- Migration A invitation target hardening.
-- Email-only invitations must never use a blank identity value.

alter table public.team_invitations
  add constraint team_invitations_email_nonblank_check
  check (email is null or btrim(email) <> '');

create unique index team_invitations_pending_user_unique_idx
  on public.team_invitations (team_id, invited_user_id)
  where status = 'pending' and invited_user_id is not null;

create unique index team_invitations_pending_email_unique_idx
  on public.team_invitations (team_id, lower(email))
  where status = 'pending' and email is not null;
