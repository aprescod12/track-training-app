begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(31);

insert into auth.users (id, email) values
  ('91000000-0000-4000-8000-000000000001', 'template-owner@example.com'),
  ('92000000-0000-4000-8000-000000000002', 'template-coach@example.com'),
  ('93000000-0000-4000-8000-000000000003', 'template-athlete@example.com'),
  ('94000000-0000-4000-8000-000000000004', 'template-admin@example.com'),
  ('95000000-0000-4000-8000-000000000005', 'template-outsider@example.com');

set local role authenticated;
set local request.jwt.claim.sub = '91000000-0000-4000-8000-000000000001';

select lives_ok(
  $$select public.create_team('Template Foundation Team', 'template-foundation-team', 'coach')$$,
  'owner can create template foundation team'
);

do $$
begin
  perform set_config(
    'test.template_team_id',
    (select id::text from public.teams where slug = 'template-foundation-team'),
    true
  );
  perform set_config(
    'test.template_owner_membership_id',
    (
      select id::text
      from public.team_memberships
      where team_id = current_setting('test.template_team_id')::uuid
        and user_id = '91000000-0000-4000-8000-000000000001'::uuid
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
        current_setting('test.template_team_id')::uuid,
        '92000000-0000-4000-8000-000000000002'::uuid,
        'coach', 'member', 'active',
        '91000000-0000-4000-8000-000000000001'::uuid, now(), null
      ),
      (
        current_setting('test.template_team_id')::uuid,
        '93000000-0000-4000-8000-000000000003'::uuid,
        'athlete', 'member', 'active',
        '91000000-0000-4000-8000-000000000001'::uuid, now(), null
      ),
      (
        current_setting('test.template_team_id')::uuid,
        '94000000-0000-4000-8000-000000000004'::uuid,
        'staff', 'admin', 'active',
        '91000000-0000-4000-8000-000000000001'::uuid, now(), null
      )
  $$,
  'owner can establish coach athlete and staff memberships'
);

do $$
begin
  perform set_config(
    'test.template_coach_membership_id',
    (
      select id::text
      from public.team_memberships
      where team_id = current_setting('test.template_team_id')::uuid
        and user_id = '92000000-0000-4000-8000-000000000002'::uuid
    ),
    true
  );
end;
$$;

set local request.jwt.claim.sub = '95000000-0000-4000-8000-000000000005';
select lives_ok(
  $$select public.create_team('Template Outsider Team', 'template-outsider-team', 'coach')$$,
  'outsider can independently create another team'
);

set local request.jwt.claim.sub = '92000000-0000-4000-8000-000000000002';

select lives_ok(
  $$
    insert into public.workout_templates (
      team_id,
      created_by_membership_id,
      title,
      workout_type,
      description
    ) values (
      current_setting('test.template_team_id')::uuid,
      current_setting('test.template_coach_membership_id')::uuid,
      'Acceleration Monday',
      'track',
      'Reusable acceleration session'
    )
  $$,
  'active team coach can create a reusable workout template'
);

do $$
begin
  perform set_config(
    'test.workout_template_id',
    (
      select id::text
      from public.workout_templates
      where team_id = current_setting('test.template_team_id')::uuid
        and title = 'Acceleration Monday'
    ),
    true
  );
end;
$$;

select lives_ok(
  $$
    insert into public.workout_template_entries (
      template_id,
      sort_order,
      exercise_name_snapshot,
      sets,
      reps,
      distance_m,
      recovery_seconds,
      intensity_text,
      notes
    ) values
      (
        current_setting('test.workout_template_id')::uuid,
        0,
        '30m acceleration',
        4,
        1,
        30,
        180,
        '95%',
        'Full recovery between reps'
      ),
      (
        current_setting('test.workout_template_id')::uuid,
        1,
        '60m sprint',
        3,
        1,
        60,
        300,
        '95%',
        null
      )
  $$,
  'active team coach can create ordered prescription entries'
);

select results_eq(
  $$select count(*) from public.workout_templates$$,
  array[1::bigint],
  'coach can read the team template library'
);

select results_eq(
  $$select count(*) from public.workout_template_entries$$,
  array[2::bigint],
  'coach can read template prescription entries'
);

select throws_ok(
  $$
    insert into public.workout_template_entries (
      template_id, sort_order, exercise_name_snapshot, sets
    ) values (
      current_setting('test.workout_template_id')::uuid,
      2,
      'Invalid negative set prescription',
      -1
    )
  $$,
  '23514',
  null,
  'negative prescription counts are rejected'
);

select throws_ok(
  $$
    insert into public.workout_template_entries (
      template_id, sort_order, exercise_name_snapshot
    ) values (
      current_setting('test.workout_template_id')::uuid,
      1,
      'Duplicate sort order'
    )
  $$,
  '23505',
  null,
  'duplicate entry sort order within one template is rejected'
);

select lives_ok(
  $$
    update public.workout_templates
    set title = 'Acceleration Monday - Updated'
    where id = current_setting('test.workout_template_id')::uuid
  $$,
  'active team coach can edit an active template'
);

select results_eq(
  $$
    select title
    from public.workout_templates
    where id = current_setting('test.workout_template_id')::uuid
  $$,
  array['Acceleration Monday - Updated'::text],
  'coach template edit is persisted'
);

set local request.jwt.claim.sub = '93000000-0000-4000-8000-000000000003';

select results_eq(
  $$select count(*) from public.workout_templates$$,
  array[0::bigint],
  'ordinary athlete does not receive the full coach template library'
);

select results_eq(
  $$select count(*) from public.workout_template_entries$$,
  array[0::bigint],
  'ordinary athlete does not receive coach template prescription rows'
);

select throws_ok(
  $$
    insert into public.workout_templates (
      team_id, created_by_membership_id, title, workout_type
    ) values (
      current_setting('test.template_team_id')::uuid,
      current_setting('test.template_owner_membership_id')::uuid,
      'Athlete Bypass Template',
      'track'
    )
  $$,
  '42501',
  null,
  'athlete cannot create a coach template through direct client insert'
);

set local request.jwt.claim.sub = '94000000-0000-4000-8000-000000000004';

select results_eq(
  $$select count(*) from public.workout_templates$$,
  array[1::bigint],
  'team manager can read non-athlete template metadata for operations'
);

select results_eq(
  $$select count(*) from public.workout_template_entries$$,
  array[2::bigint],
  'team manager can read template prescription metadata'
);

select lives_ok(
  $$
    update public.workout_templates
    set title = 'Admin Should Not Change This'
    where id = current_setting('test.workout_template_id')::uuid
  $$,
  'manager update attempt is safely filtered by RLS rather than widening coaching authority'
);

select results_eq(
  $$
    select title
    from public.workout_templates
    where id = current_setting('test.workout_template_id')::uuid
  $$,
  array['Acceleration Monday - Updated'::text],
  'team manager cannot edit coach-authored training content solely through admin status'
);

select throws_ok(
  $$
    insert into public.workout_template_entries (
      template_id, sort_order, exercise_name_snapshot
    ) values (
      current_setting('test.workout_template_id')::uuid,
      2,
      'Admin Bypass Entry'
    )
  $$,
  '42501',
  null,
  'team manager cannot add prescription rows solely through admin status'
);

set local request.jwt.claim.sub = '95000000-0000-4000-8000-000000000005';

select results_eq(
  $$select count(*) from public.workout_templates$$,
  array[0::bigint],
  'coach from another team cannot read this team template library'
);

select results_eq(
  $$select count(*) from public.workout_template_entries$$,
  array[0::bigint],
  'coach from another team cannot read this team prescription entries'
);

select throws_ok(
  $$
    insert into public.workout_template_entries (
      template_id, sort_order, exercise_name_snapshot
    ) values (
      current_setting('test.workout_template_id')::uuid,
      2,
      'Cross Team Bypass Entry'
    )
  $$,
  '42501',
  null,
  'coach from another team cannot mutate this team template'
);

set local request.jwt.claim.sub = '92000000-0000-4000-8000-000000000002';

select lives_ok(
  $$
    update public.workout_templates
    set is_active = false,
        archived_at = now()
    where id = current_setting('test.workout_template_id')::uuid
  $$,
  'active coach can archive a reusable template without deleting history'
);

select results_eq(
  $$
    select count(*)
    from public.workout_templates
    where id = current_setting('test.workout_template_id')::uuid
      and is_active = false
      and archived_at is not null
  $$,
  array[1::bigint],
  'archived template retains explicit inactive historical state'
);

select lives_ok(
  $$
    update public.workout_templates
    set title = 'Archived Template Mutation Attempt'
    where id = current_setting('test.workout_template_id')::uuid
  $$,
  'archived template mutation attempt is safely filtered by RLS'
);

select results_eq(
  $$
    select title
    from public.workout_templates
    where id = current_setting('test.workout_template_id')::uuid
  $$,
  array['Acceleration Monday - Updated'::text],
  'archived template is immutable through normal coach client updates'
);

select throws_ok(
  $$
    insert into public.workout_template_entries (
      template_id, sort_order, exercise_name_snapshot
    ) values (
      current_setting('test.workout_template_id')::uuid,
      2,
      'Archived Template Entry Mutation'
    )
  $$,
  '42501',
  null,
  'archived template cannot receive new prescription entries'
);

select throws_ok(
  $$delete from public.workout_templates where id = current_setting('test.workout_template_id')::uuid$$,
  '42501',
  null,
  'authenticated coach cannot hard-delete a template through the client API'
);

select results_eq(
  $$select count(*) from public.friendships$$,
  array[0::bigint],
  'template lifecycle never creates friendships'
);

set local request.jwt.claim.sub = '93000000-0000-4000-8000-000000000003';

select lives_ok(
  $$
    insert into public.workouts (workout_date, title, workout_type, user_id, team_id)
    values (
      current_date,
      'Existing Personal Logging Still Works',
      'track',
      '93000000-0000-4000-8000-000000000003'::uuid,
      null
    )
  $$,
  'D1 does not break existing personal athlete workout logging'
);

select results_eq(
  $$
    select count(*)
    from public.workouts
    where user_id = '93000000-0000-4000-8000-000000000003'::uuid
      and team_id is null
  $$,
  array[1::bigint],
  'existing athlete workout remains personal after D1'
);

select * from finish();
rollback;
