# Supabase development workflow

This directory contains the repository-managed Supabase configuration and migrations for the Track Training app.

## Connected production project

- Project name: `aprescod12's Track Training`
- Project reference: `pxkpfgultgopernrmqzv`
- PostgreSQL: 17

Do not commit project secrets, database passwords, service-role keys, or local environment files.

## Migration baseline

The production project was originally created through the Supabase dashboard and did not have repository-managed migration history.

The existing production `public` schema has now been captured in:

- `20260730040000_initial_schema_baseline.sql`
- `20260730041000_auth_storage_baseline.sql`

These migrations document the schema, auth trigger, and avatar storage bucket that already exist remotely.

The baseline must not be applied back to the existing production project as though these objects were new.

## Production security migration

`20260730043000_production_foundation_security.sql` hardens the existing schema by:

- consolidating duplicated RLS policies;
- removing anonymous Data API access;
- limiting authenticated table privileges;
- preserving owner and accepted-friend workout visibility;
- adding `WITH CHECK` protection to update policies;
- keeping `workout_summary_v` as a security-invoker view;
- fixing mutable function search paths;
- removing unused duplicate PR trigger functions;
- revoking direct RPC execution of internal and trigger functions;
- restricting avatar listing and writes to each authenticated user's own folder.

The complete migration was executed against production inside a `BEGIN ... ROLLBACK` transaction. PostgreSQL accepted it and the rollback left production unchanged.

## Signup compatibility

`20260730050000_signup_username_compatibility.sql` adds the username-availability RPC used during signup and maintains automatic profile creation through the auth user trigger.

## Local development

Start the local Supabase stack:

```bash
npx supabase start
```

Rebuild the local database entirely from migrations:

```bash
npx supabase db reset
```

Lint the database schema:

```bash
npx supabase db lint
```

Inspect local service URLs and keys:

```bash
npx supabase status
```

Stop the local stack:

```bash
npx supabase stop
```

Local Expo development should use `.env.local` with the local Supabase URL and publishable key. `.env.local` must never be committed.

## Validation completed

The migration stack has been validated locally with:

- a clean `supabase db reset`;
- `supabase db lint` with no schema errors;
- signup and duplicate-username checks;
- automatic profile creation;
- authentication and sign-in;
- avatar upload;
- workout creation, editing, and deletion;
- non-friend workout privacy;
- pending friendship privacy;
- accepted-friend workout visibility;
- prevention of friend edits/deletes to another user's workout;
- removal of workout visibility immediately after unfriending.

Production remains unchanged until the production migrations are deliberately deployed.

## Future schema changes

For every schema change:

1. Create a new timestamped migration.
2. Run `npx supabase db reset`.
3. Run `npx supabase db lint`.
4. Run the relevant application regression tests.
5. Review the migration before deploying it remotely.

Never use dashboard-only schema changes as the long-term source of truth.
