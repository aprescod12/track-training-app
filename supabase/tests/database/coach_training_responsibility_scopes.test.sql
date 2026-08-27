begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(32);

insert into auth.users (id, email) values
  ('e1000000-0000-4000-8000-000000000001', 'scope-owner@example.com'),
  ('e2000000-0000-4000-8000-000000000002', 'scope-track-coach@example.com'),
  ('e3000000-0000-4000-8000-000000000003', 'scope-athlete@example.com');

set local role authenticated;
set local request.jwt.claim.sub = 'e1000000-0000-4000-8000-000000000001';

select lives_ok(
  $$select public.create_team('Coach Scope Team', 'coach-scope-team', 'coach')$$,
  'coach owner can create a team'
);

do $$
begin
  perform set_config(
    'test.scope_team_id',
    (select id::text from public.teams where slug = 'coach-scope-team'),
    true
  );
  perform set_config(
    'test.scope_owner_membership_id',
    (
      select id::text
      from public.team_memberships
      where team_id = current_setting('test.scope_team_id')::uuid
        and user_id = 'e1000000-0000-4000-8000-000000000001'::uuid
    ),
    true
  );
end;
$$;

select lives_ok(
  $$
    insert into public.team_memberships (
      team_id, user_id, member_type, management_role, status, invited_by, joined_at, ended_at
    ) values
      (
        current_setting('test.scope_team_id')::uuid,
        'e2000000-0000-4000-8000-000000000002'::uuid,
        'coach', 'member', 'active',
        'e1000000-0000-4000-8000-000000000001'::uuid,
        now(), null
      ),
      (
        current_setting('test.scope_team_id')::uuid,
        'e3000000-0000-4000-8000-000000000003'::uuid,
        'athlete', 'member', 'active',
        'e1000000-0000-4000-8000-000000000001'::uuid,
        now(), null
      )
  $$,
  'owner can establish coach and athlete memberships'
);

do $$
begin
  perform set_config(
    'test.scope_coach_membership_id',
    (
      select id::text
      from public.team_memberships
      where team_id = current_setting('test.scope_team_id')::uuid
        and user_id = 'e2000000-0000-4000-8000-000000000002'::uuid
    ),
    true
  );
  perform set_config(
    'test.scope_athlete_membership_id',
    (
      select id::text
      from public.team_memberships
      where team_id = current_setting('test.scope_team_id')::uuid
        and user_id = 'e3000000-0000-4000-8000-000000000003'::uuid
    ),
    true
  );
end;
$$;

select results_eq(
  $$
    select count(*)
    from public.coach_training_permissions
    where team_id = current_setting('test.scope_team_id')::uuid
      and coach_membership_id = current_setting('test.scope_owner_membership_id')::uuid
      and can_prescribe
      and can_review
  $$,
  array[2::bigint],
  'team creator coach starts with Track and Lift authority'
);

select results_eq(
  $$
    select count(*)
    from public.coach_training_permissions
    where team_id = current_setting('test.scope_team_id')::uuid
      and coach_membership_id = current_setting('test.scope_coach_membership_id')::uuid
      and (can_prescribe or can_review)
  $$,
  array[0::bigint],
  'new non-owner coach starts without prescription or formal review authority'
);

select lives_ok(
  $$
    update public.team_memberships
    set role_title = 'Assistant Coach - Sprints'
    where id = current_setting('test.scope_coach_membership_id')::uuid
  $$,
  'team manager can set a descriptive coaching title'
);

select results_eq(
  $$
    select role_title
    from public.team_memberships
    where id = current_setting('test.scope_coach_membership_id')::uuid
  $$,
  array['Assistant Coach - Sprints'::text],
  'coaching title is descriptive team metadata'
);

select lives_ok(
  $$
    insert into public.team_groups (team_id, name, group_type, is_active, created_by)
    values (
      current_setting('test.scope_team_id')::uuid,
      'Sprints',
      'event_group',
      true,
      'e1000000-0000-4000-8000-000000000001'::uuid
    )
  $$,
  'team manager can create a training group'
);

do $$
begin
  perform set_config(
    'test.scope_group_id',
    (
      select id::text
      from public.team_groups
      where team_id = current_setting('test.scope_team_id')::uuid
        and name = 'Sprints'
    ),
    true
  );
end;
$$;

select lives_ok(
  $$
    insert into public.team_group_memberships (team_id, group_id, team_membership_id)
    values
      (
        current_setting('test.scope_team_id')::uuid,
        current_setting('test.scope_group_id')::uuid,
        current_setting('test.scope_coach_membership_id')::uuid
      ),
      (
        current_setting('test.scope_team_id')::uuid,
        current_setting('test.scope_group_id')::uuid,
        current_setting('test.scope_athlete_membership_id')::uuid
      )
  $$,
  'coach and athlete may share the same organizational group'
);

select results_eq(
  $$
    select count(*)
    from public.coach_athlete_assignments
    where team_id = current_setting('test.scope_team_id')::uuid
  $$,
  array[0::bigint],
  'group membership does not create coaching authorization'
);

set local request.jwt.claim.sub = 'e3000000-0000-4000-8000-000000000003';

select lives_ok(
  $$
    insert into public.workouts (workout_date, title, workout_type, user_id, team_id)
    values
      (
        current_date,
        'Scope Athlete Track Performance',
        'track',
        'e3000000-0000-4000-8000-000000000003'::uuid,
        current_setting('test.scope_team_id')::uuid
      ),
      (
        current_date,
        'Scope Athlete Lift Performance',
        'lift',
        'e3000000-0000-4000-8000-000000000003'::uuid,
        current_setting('test.scope_team_id')::uuid
      )
  $$,
  'athlete can log track and lift performance in team context'
);

set local request.jwt.claim.sub = 'e2000000-0000-4000-8000-000000000002';

select results_eq(
  $$
    select count(*)
    from public.workouts
    where user_id = 'e3000000-0000-4000-8000-000000000003'::uuid
      and team_id = current_setting('test.scope_team_id')::uuid
  $$,
  array[0::bigint],
  'sharing a group does not let a coach read athlete training'
);

set local request.jwt.claim.sub = 'e1000000-0000-4000-8000-000000000001';

select lives_ok(
  $$
    select public.assign_coach_to_athlete(
      current_setting('test.scope_team_id')::uuid,
      current_setting('test.scope_coach_membership_id')::uuid,
      current_setting('test.scope_athlete_membership_id')::uuid,
      true
    )
  $$,
  'manager explicitly authorizes the track coach for the athlete'
);

select lives_ok(
  $$
    select public.assign_coach_to_athlete(
      current_setting('test.scope_team_id')::uuid,
      current_setting('test.scope_owner_membership_id')::uuid,
      current_setting('test.scope_athlete_membership_id')::uuid,
      false
    )
  $$,
  'owner coach is separately authorized for the athlete'
);

select lives_ok(
  $$
    update public.coach_training_permissions
    set can_prescribe = true,
        can_review = true,
        granted_by = 'e1000000-0000-4000-8000-000000000001'::uuid
    where team_id = current_setting('test.scope_team_id')::uuid
      and coach_membership_id = current_setting('test.scope_coach_membership_id')::uuid
      and workout_type = 'track'
  $$,
  'manager grants Track authority to the sprint coach'
);

select results_eq(
  $$
    select count(*)
    from public.coach_training_permissions
    where team_id = current_setting('test.scope_team_id')::uuid
      and coach_membership_id = current_setting('test.scope_coach_membership_id')::uuid
      and workout_type = 'track'
      and can_prescribe
      and can_review
  $$,
  array[1::bigint],
  'Track authority is active for the sprint coach'
);

select results_eq(
  $$
    select count(*)
    from public.coach_training_permissions
    where team_id = current_setting('test.scope_team_id')::uuid
      and coach_membership_id = current_setting('test.scope_coach_membership_id')::uuid
      and workout_type = 'lift'
      and not can_prescribe
      and not can_review
  $$,
  array[1::bigint],
  'Lift authority remains disabled for the sprint coach'
);

set local request.jwt.claim.sub = 'e2000000-0000-4000-8000-000000000002';

select results_eq(
  $$
    select count(*)
    from public.workouts
    where user_id = 'e3000000-0000-4000-8000-000000000003'::uuid
      and team_id = current_setting('test.scope_team_id')::uuid
  $$,
  array[2::bigint],
  'explicitly assigned coach can view athlete Track and Lift performance'
);

select lives_ok(
  $$
    insert into public.workout_templates (
      team_id, created_by_membership_id, title, workout_type
    ) values (
      current_setting('test.scope_team_id')::uuid,
      current_setting('test.scope_coach_membership_id')::uuid,
      'Sprint Coach Track Template',
      'track'
    )
  $$,
  'Track-authorized coach can create Track prescription template'
);

select throws_ok(
  $$
    insert into public.workout_templates (
      team_id, created_by_membership_id, title, workout_type
    ) values (
      current_setting('test.scope_team_id')::uuid,
      current_setting('test.scope_coach_membership_id')::uuid,
      'Sprint Coach Lift Bypass',
      'lift'
    )
  $$,
  '42501',
  null,
  'Track-only coach cannot create Lift prescription template'
);

do $$
begin
  perform set_config(
    'test.scope_track_template_id',
    (
      select id::text
      from public.workout_templates
      where team_id = current_setting('test.scope_team_id')::uuid
        and title = 'Sprint Coach Track Template'
    ),
    true
  );
end;
$$;

select lives_ok(
  $$
    insert into public.workout_template_entries (
      template_id, sort_order, exercise_name_snapshot, sets, reps, distance_m
    ) values (
      current_setting('test.scope_track_template_id')::uuid,
      0,
      '60m sprint',
      4,
      1,
      60
    )
  $$,
  'Track-authorized coach can populate Track prescription'
);

select lives_ok(
  $$
    select public.create_workout_assignment(
      current_setting('test.scope_team_id')::uuid,
      current_setting('test.scope_track_template_id')::uuid,
      current_date + 1,
      null,
      'Track scope assignment',
      false,
      '{}'::uuid[],
      array[current_setting('test.scope_athlete_membership_id')::uuid]
    )
  $$,
  'Track-authorized coach can assign Track prescription to authorized athlete'
);

set local request.jwt.claim.sub = 'e1000000-0000-4000-8000-000000000001';

select lives_ok(
  $$
    insert into public.workout_templates (
      team_id, created_by_membership_id, title, workout_type
    ) values (
      current_setting('test.scope_team_id')::uuid,
      current_setting('test.scope_owner_membership_id')::uuid,
      'Owner Lift Template',
      'lift'
    )
  $$,
  'full-scope owner coach can create Lift prescription template'
);

do $$
begin
  perform set_config(
    'test.scope_lift_template_id',
    (
      select id::text
      from public.workout_templates
      where team_id = current_setting('test.scope_team_id')::uuid
        and title = 'Owner Lift Template'
    ),
    true
  );
end;
$$;

select lives_ok(
  $$
    insert into public.workout_template_entries (
      template_id, sort_order, exercise_name_snapshot, sets, reps, target_weight
    ) values (
      current_setting('test.scope_lift_template_id')::uuid,
      0,
      'Back Squat',
      3,
      5,
      100
    )
  $$,
  'full-scope owner coach can populate Lift prescription'
);

select lives_ok(
  $$
    select public.create_workout_assignment(
      current_setting('test.scope_team_id')::uuid,
      current_setting('test.scope_lift_template_id')::uuid,
      current_date + 2,
      null,
      'Lift scope assignment',
      false,
      '{}'::uuid[],
      array[current_setting('test.scope_athlete_membership_id')::uuid]
    )
  $$,
  'full-scope owner coach can assign Lift prescription'
);

do $$
begin
  perform set_config(
    'test.scope_track_recipient_id',
    (
      select war.id::text
      from public.workout_assignment_recipients war
      join public.workout_assignments wa on wa.id = war.assignment_id
      where war.athlete_membership_id = current_setting('test.scope_athlete_membership_id')::uuid
        and wa.workout_type_snapshot = 'track'
        and wa.scheduled_date = current_date + 1
    ),
    true
  );
  perform set_config(
    'test.scope_lift_recipient_id',
    (
      select war.id::text
      from public.workout_assignment_recipients war
      join public.workout_assignments wa on wa.id = war.assignment_id
      where war.athlete_membership_id = current_setting('test.scope_athlete_membership_id')::uuid
        and wa.workout_type_snapshot = 'lift'
        and wa.scheduled_date = current_date + 2
    ),
    true
  );
end;
$$;

set local request.jwt.claim.sub = 'e3000000-0000-4000-8000-000000000003';

select lives_ok(
  $$
    select public.submit_workout_assignment(
      current_setting('test.scope_track_recipient_id')::uuid,
      'unavailable',
      null,
      'other',
      'Track submission'
    )
  $$,
  'athlete can submit Track assignment outcome'
);

select lives_ok(
  $$
    select public.submit_workout_assignment(
      current_setting('test.scope_lift_recipient_id')::uuid,
      'unavailable',
      null,
      'other',
      'Lift submission'
    )
  $$,
  'athlete can submit Lift assignment outcome'
);

do $$
begin
  perform set_config(
    'test.scope_track_submission_id',
    (
      select id::text
      from public.workout_assignment_submissions
      where assignment_recipient_id = current_setting('test.scope_track_recipient_id')::uuid
    ),
    true
  );
  perform set_config(
    'test.scope_lift_submission_id',
    (
      select id::text
      from public.workout_assignment_submissions
      where assignment_recipient_id = current_setting('test.scope_lift_recipient_id')::uuid
    ),
    true
  );
end;
$$;

set local request.jwt.claim.sub = 'e2000000-0000-4000-8000-000000000002';

select results_eq(
  $$
    select count(*)
    from public.coach_assignment_dashboard_v
    where athlete_user_id = 'e3000000-0000-4000-8000-000000000003'::uuid
  $$,
  array[2::bigint],
  'Track-only coach can view assigned athlete submissions across both domains'
);

select results_eq(
  $$
    select count(*)
    from public.coach_assignment_dashboard_v
    where athlete_user_id = 'e3000000-0000-4000-8000-000000000003'::uuid
      and workout_type_snapshot = 'lift'
  $$,
  array[1::bigint],
  'Track-only coach retains visibility into assigned athlete Lift context'
);

select lives_ok(
  $$
    select public.review_workout_assignment_submission(
      current_setting('test.scope_track_submission_id')::uuid,
      'Track coach reviewed Track work'
    )
  $$,
  'Track-authorized coach can formally review Track submission'
);

select throws_ok(
  $$
    select public.review_workout_assignment_submission(
      current_setting('test.scope_lift_submission_id')::uuid,
      'Track coach should not review Lift work'
    )
  $$,
  '42501',
  null,
  'Track-only coach cannot formally review Lift submission'
);

select results_eq(
  $$
    select count(*)
    from public.workout_assignment_submissions
    where id = current_setting('test.scope_lift_submission_id')::uuid
      and reviewed_at is null
      and reviewed_by_membership_id is null
      and coach_note is null
  $$,
  array[1::bigint],
  'unauthorized Lift review leaves review metadata untouched'
);

select results_eq(
  $$select count(*) from public.friendships$$,
  array[0::bigint],
  'groups and coaching responsibilities never create friendships'
);

select * from finish();
rollback;
