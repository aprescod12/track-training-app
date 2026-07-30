-- Local baseline objects outside the public schema.

-- Create profiles automatically when a Supabase Auth user is created.
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- Recreate the public avatar bucket used by the application.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update
set
  name = excluded.name,
  public = excluded.public;
