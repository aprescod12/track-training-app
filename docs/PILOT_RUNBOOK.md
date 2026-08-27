# Track Training App - Pilot 1 Runbook

**Status:** Active Phase 4 operating plan  
**Pilot:** Individual Athletes  
**Initial cohort:** 3-5 athletes  
**Target environment:** EAS preview / staging services  
**Production roadmap phase:** Phase 4 - Pilot

## 1. Goal

Validate that a small group of real athletes can onboard, log training, navigate the app, receive scheduled training, and recover from ordinary failure states without developer intervention.

Pilot 1 is intentionally smaller than the coach/event-group rollout. The goal is reliability evidence, not feature breadth.

## 2. Entry Gate

Do not invite pilot users until all of the following are true on `main`:

- GitHub Actions app checks are green.
- Supabase migration replay, schema lint, and database authorization tests are green.
- Expo public configuration validation passes.
- Production bundle export passes for iOS and Android.
- The EAS `preview` profile uses internal distribution.
- iOS bundle identifier and Android package identifier are configured.
- Sentry is enabled with PII collection disabled.
- Hosted Supabase migration history matches repository migrations.
- No known authorization regression is open.

## 3. Preview Build

Create a production-like internal build rather than giving pilot athletes a development client.

```bash
eas build --platform ios --profile preview
```

For Android:

```bash
eas build --platform android --profile preview
```

The `preview` profile is the pilot distribution profile. Development builds remain for engineering use; production builds remain reserved for store/release operation.

For iOS ad hoc distribution, register pilot devices with EAS before building or refresh the provisioning profile when adding a new device.

## 4. Athlete Onboarding Checklist

For every pilot athlete, verify:

1. They install the current preview build.
2. They can sign up or sign in successfully.
3. Their session survives an app restart.
4. Their profile can be completed without exposing private data to another account.
5. They can log one track workout.
6. They can log one lift workout.
7. Both workouts appear in history and calendar.
8. They can open workout details after restarting the app.
9. They can create and open a personal calendar event.
10. Notification permission behavior is understandable and non-blocking.
11. No raw Supabase/Sentry/backend error is shown to them.

## 5. Team-Workflow Smoke Check

Even though Pilot 1 is athlete-focused, each release candidate must keep the Phase 3 workflow healthy.

Before distribution, use controlled test accounts to verify:

- a team coach can create a workout template;
- a coach can assign an explicitly authorized athlete;
- the athlete can see the assignment in Team Training and Calendar;
- skipped/unavailable outcomes submit without fake workout rows;
- completed/partial/modified outcomes can attach the athlete's own workout;
- the coach can review the athlete submission;
- an unassigned coach cannot read the submission or linked team-context workout;
- a team administrator without explicit coaching authorization cannot read sensitive submission data.

## 6. Pilot Feedback

Collect feedback after the first session and again after approximately one week.

Use the same questions for every athlete:

- What did you try to do first?
- Was anything difficult to find?
- Did any save, login, calendar, notification, or workout action appear to fail?
- Did you ever repeat an action because you were unsure whether it saved?
- What part felt slow?
- What information did you expect to see but could not find?
- What feature felt unnecessary or distracting?
- Would you trust this app with your normal weekly training log? Why or why not?

Classify feedback as `bug`, `reliability`, `usability`, `missing-core`, or `later`.

Do not expand scope from one-off feature requests unless the request blocks the core training workflow for multiple users.

## 7. Metrics for Pilot 1

Only report metrics that can be measured from production systems.

Core pilot metrics:

- pilot athletes activated;
- weekly active pilot athletes;
- workouts logged per athlete;
- failed workout/submission attempts observed in telemetry;
- crash-free sessions from Sentry;
- invitation acceptance when team invitations are introduced to the cohort;
- assignment completion when coach workflow enters Pilot 2;
- database/API latency for the core log/read flows where measured;
- support incidents per pilot athlete.

Do not infer retention, crash-free rate, or failure rate from anecdotes.

## 8. Privacy and Telemetry Rules

Never place the following in Sentry messages, breadcrumbs, analytics payloads, or pilot spreadsheets:

- authentication tokens;
- passwords;
- athlete private notes;
- injury/illness note text;
- readiness/wellness answers;
- raw workout notes unless the user explicitly submits them as support context.

Identifiers used for operational debugging should be the minimum needed to reproduce an issue.

## 9. Reliability Triage

Prioritize pilot issues in this order:

1. authorization/privacy regression;
2. data loss or duplicate writes;
3. login/session failure;
4. assignment/submission failure;
5. crash or blocked navigation;
6. severe latency/loading problem;
7. confusing but recoverable UX;
8. cosmetic issue;
9. new feature request.

Any authorization/privacy regression blocks further pilot distribution until fixed and re-verified.

## 10. Release and Rollback

Before each preview release:

- record the Git commit SHA;
- require green CI;
- record the EAS build identifier/link in the pilot log;
- note schema migrations included since the prior build;
- run the onboarding and team-workflow smoke checks.

If a release introduces a blocking regression, stop distributing that build and return testers to the most recent known-good build or release a corrected preview build from a known-good commit.

Do not use an OTA update to bypass a native-runtime incompatibility. `runtimeVersion` compatibility remains authoritative.

## 11. Pilot 1 Exit Criteria

Pilot 1 is complete when:

- 3-5 athletes have used the preview build for real training;
- onboarding and workout logging are repeatable without developer intervention;
- no unresolved critical authorization or data-loss issue remains;
- crashes and failed saves are understood and within an acceptable pilot level;
- the most common usability problems have been fixed or documented;
- pilot evidence is recorded without inventing metrics;
- the app is stable enough to add one coach and one event group for Pilot 2.

## 12. Next Pilot

Pilot 2 introduces one coach and one event group and specifically validates roster management, workout assignments, athlete submissions, notifications, coach review, and the coach dashboard under real team usage.
