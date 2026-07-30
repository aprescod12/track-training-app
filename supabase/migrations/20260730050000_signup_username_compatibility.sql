-- Preserve secure sign-up after removing anonymous reads from public.profiles.
-- Username availability is exposed as a narrow boolean RPC, while profile creation
-- remains inside the auth.users trigger so it also works when email confirmation
-- is enabled and signUp does not immediately return an authenticated session.

create or replace function public.is_username_available(candidate text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    candidate is not null
    and lower(btrim(candidate)) ~ '^[a-z0-9_]{3,20}$'
    and not exists (
      select 1
      from public.profiles p
      where p.username = lower(btrim(candidate))
    );
$$;

revoke all privileges on function public.is_username_available(text) from public, anon, authenticated;
grant execute on function public.is_username_available(text) to anon, authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  requested_full_name text := nullif(btrim(coalesce(new.raw_user_meta_data->>'full_name', '')), '');
  requested_username text := nullif(lower(btrim(coalesce(new.raw_user_meta_data->>'username', ''))), '');
begin
  insert into public.profiles (id, full_name, username)
  values (new.id, requested_full_name, requested_username);

  return new;
end;
$$;

revoke all privileges on function public.handle_new_user() from public, anon, authenticated;
