# Application Environments

Track Training uses three environment levels. They serve different purposes and should not share production data.

## Local development

Local development is the developer sandbox. Supabase CLI/Docker can provide a disposable local database built from the repository migrations.

Use this environment for:

- migration development and resets
- destructive database testing
- automated tests and CI
- feature development before a hosted build is needed

For a local Expo session, `EXPO_PUBLIC_APP_ENV` may be set to `local`. If it is omitted, the app currently defaults to `local` for backward compatibility with existing ignored `.env.local` files.

A developer may intentionally point a local app session at staging for integration testing, but that does not make the hosted staging database disposable.

## Staging / pilot

The existing hosted Supabase project is the staging/pilot backend:

- Supabase project: `aprescod12's Track Training`
- Project ref: `pxkpfgultgopernrmqzv`
- Purpose: TestFlight/preview builds, teammate testing, and pilot data

The EAS `preview` build profile sets:

```text
EXPO_PUBLIC_APP_ENV=staging
```

The Expo `preview` environment must provide the staging project's public client variables:

```text
EXPO_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_ANON_KEY
```

Do not commit keys to the repository. The Supabase URL and anon/publishable key are client-visible by design, but environment configuration should still be managed through the build environment rather than copied into source files.

Runtime guardrails require a staging build to connect to project ref `pxkpfgultgopernrmqzv`.

## Production

A clean production Supabase project has not been created yet. It should be created when the app is ready for a real production launch, using the repository migration stack as the source of truth from day one.

The EAS `production` build profile sets:

```text
EXPO_PUBLIC_APP_ENV=production
```

A production build is rejected at runtime if it points to the staging/pilot Supabase project. Production configuration also requires an HTTPS Supabase URL.

Until the production Supabase project exists, do not configure the Expo `production` environment with the staging project's Supabase variables.

## Promotion path

Changes should move through the environments in this order:

```text
Local Supabase / CI
        ↓
Staging / pilot Supabase
        ↓
Production Supabase
```

Repository migrations are the authoritative schema history. A migration should pass locally and in CI before it is deliberately applied to a hosted environment.

## Data expectations

The staging/pilot database contains real testing activity from the developer and invited teammates. Treat it as useful pilot data: it can contain test records and does not need to be pristine, but it should not be reset or destructively modified without a deliberate decision.

When production is created, decide separately whether selected pilot accounts/data should be migrated or whether production users should start fresh.
