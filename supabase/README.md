# Supabase development workflow

This directory begins the repository-managed Supabase workflow for the Track Training app.

## Connected production project

- Project name: `aprescod12's Track Training`
- Project reference: `pxkpfgultgopernrmqzv`
- PostgreSQL: 17

Do not commit project secrets, database passwords, service-role keys, or local environment files.

## Current migration

`migrations/20260730043000_production_foundation_security.sql` is a production-hardening migration for the schema that already exists in the connected project. It:

- replaces duplicated RLS policies with one explicit set;
- removes Data API access for anonymous users;
- grants authenticated users only the table privileges required by the current application;
- preserves owner and accepted-friend workout visibility;
- adds `WITH CHECK` protection to update policies;
- keeps `workout_summary_v` as a security-invoker view;
- fixes mutable function search paths;
- removes unused duplicate PR trigger functions;
- revokes direct RPC execution of internal and trigger functions;
- restricts avatar listing and writes to each authenticated user's own folder.

The migration was executed inside a `BEGIN ... ROLLBACK` transaction against the connected production schema on July 30, 2026. PostgreSQL accepted the complete migration and the transaction was rolled back, so production was not changed during validation.

## Important baseline note

The connected project was originally created through the Supabase dashboard and currently has no migration history. This first migration therefore assumes the existing tables, views, triggers, and functions are present.

Before using `supabase db reset` as a complete local bootstrap, pull the current production schema into a separate baseline migration using the Supabase CLI and review the generated SQL:

```bash
npx supabase login
npx supabase link --project-ref pxkpfgultgopernrmqzv
npx supabase db pull initial_schema_baseline
npx supabase migration list
```

Place the generated baseline before the security migration. Do not apply the generated baseline back to production; it documents objects that already exist.

## Local workflow

```bash
npx supabase start
npx supabase db reset
npx supabase gen types typescript --local > lib/database.types.ts
```

After every schema change:

```bash
npx supabase db lint
npx supabase migration list
```

Test authentication, workout creation/editing/deletion, calendar events, friend requests, friend workout visibility, personal records, achievements, and avatar uploads before promoting a migration to production.
