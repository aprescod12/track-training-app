begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(19);

insert into auth.users (id, email) values
  ('d1000000-0000-4000-8000-000000000001', 'attach-owner@example.com'),
  ('d2000000-0000-4000-8000-000000000002', 'attach-coach@example.com'),
  ('d3000000-0000-4000-8000-000000000003', 'attach-athlete-a@example.com'),
  ('d4000000-0000-4000-8000-000000000004', 'attach-athlete-b@example.com');

set local role authenticated;
set local request.jwt.claim.sub = 'd1000000-0000-4000-8000-000000000001';
select lives_ok(
  $$select public.create_team('Attachment Team', 'attachment-team', 'staff')$$,
  'owner can create attachment team'
);

do $$
begin
  perform set_config('test.attach_team_id', (select id::text from public.teams where slug='attachment-team'), true);
end;
$$;

select lives_ok(
  $$
    insert into public.team_memberships (team_id,user_id,member_type,management_role,status,invited_by,joined_at,ended_at)
    values
      (current_setting('test.attach_team_id')::uuid,'d2000000-0000-4000-8000-000000000002','coach','member','active','d1000000-0000-4000-8000-000000000001',now(),null),
      (current_setting('test.attach_team_id')::uuid,'d3000000-0000-4000-8000-000000000003','athlete','member','active','d1000000-0000-4000-8000-000000000001',now(),null),
      (current_setting('test.attach_team_id')::uuid,'d4000000-0000-4000-8000-000000000004','athlete','member','active','d1000000-0000-4000-8000-000000000001',now(),null)
  $$,
  'owner can establish attachment memberships'
);

do $$
begin
  perform set_config('test.attach_coach_id', (select id::text from public.team_memberships where team_id=current_setting('test.attach_team_id')::uuid and user_id='d2000000-0000-4000-8000-000000000002'), true);
  perform set_config('test.attach_athlete_a_id', (select id::text from public.team_memberships where team_id=current_setting('test.attach_team_id')::uuid and user_id='d3000000-0000-4000-8000-000000000003'), true);
  perform set_config('test.attach_athlete_b_id', (select id::text from public.team_memberships where team_id=current_setting('test.attach_team_id')::uuid and user_id='d4000000-0000-4000-8000-000000000004'), true);
end;
$$;

select lives_ok(
  $$select public.assign_coach_to_athlete(current_setting('test.attach_team_id')::uuid,current_setting('test.attach_coach_id')::uuid,current_setting('test.attach_athlete_a_id')::uuid,true)$$,
  'owner assigns coach to athlete A'
);
select lives_ok(
  $$select public.assign_coach_to_athlete(current_setting('test.attach_team_id')::uuid,current_setting('test.attach_coach_id')::uuid,current_setting('test.attach_athlete_b_id')::uuid,true)$$,
  'owner assigns coach to athlete B'
);

set local request.jwt.claim.sub = 'd2000000-0000-4000-8000-000000000002';
select lives_ok(
  $$insert into public.workout_templates(team_id,created_by_membership_id,title,workout_type) values(current_setting('test.attach_team_id')::uuid,current_setting('test.attach_coach_id')::uuid,'Attachment Template','track')$$,
  'coach creates attachment template'
);
do $$
begin
  perform set_config('test.attach_template_id', (select id::text from public.workout_templates where team_id=current_setting('test.attach_team_id')::uuid and title='Attachment Template'), true);
end;
$$;
select lives_ok(
  $$insert into public.workout_template_entries(template_id,sort_order,exercise_name_snapshot,sets,reps,distance_m) values(current_setting('test.attach_template_id')::uuid,0,'150m',2,1,150)$$,
  'coach populates attachment template'
);
select lives_ok(
  $$select public.create_workout_assignment(current_setting('test.attach_team_id')::uuid,current_setting('test.attach_template_id')::uuid,current_date+1,null,null,false,'{}'::uuid[],array[current_setting('test.attach_athlete_a_id')::uuid])$$,
  'coach creates athlete A assignment'
);
select lives_ok(
  $$select public.create_workout_assignment(current_setting('test.attach_team_id')::uuid,current_setting('test.attach_template_id')::uuid,current_date+1,null,null,false,'{}'::uuid[],array[current_setting('test.attach_athlete_b_id')::uuid])$$,
  'coach creates athlete B assignment'
);
do $$
begin
  perform set_config('test.attach_recipient_a', (
    select war.id::text from public.workout_assignment_recipients war join public.workout_assignments wa on wa.id=war.assignment_id
    where war.athlete_membership_id=current_setting('test.attach_athlete_a_id')::uuid and wa.scheduled_date=current_date+1
  ), true);
  perform set_config('test.attach_recipient_b', (
    select war.id::text from public.workout_assignment_recipients war join public.workout_assignments wa on wa.id=war.assignment_id
    where war.athlete_membership_id=current_setting('test.attach_athlete_b_id')::uuid and wa.scheduled_date=current_date+1
  ), true);
end;
$$;

set local request.jwt.claim.sub = 'd3000000-0000-4000-8000-000000000003';
select lives_ok(
  $$insert into public.workouts(workout_date,title,workout_type,user_id,team_id) values(current_date+1,'Personal Attachment Candidate','track','d3000000-0000-4000-8000-000000000003',null)$$,
  'athlete A logs ordinary personal workout first'
);
select lives_ok(
  $$insert into public.workouts(workout_date,title,workout_type,user_id,team_id) values(current_date+2,'Wrong Date Candidate','track','d3000000-0000-4000-8000-000000000003',null)$$,
  'athlete A can have unrelated personal workout on another date'
);
do $$
begin
  perform set_config('test.attach_workout_a', (select id::text from public.workouts where title='Personal Attachment Candidate' and user_id='d3000000-0000-4000-8000-000000000003'), true);
  perform set_config('test.attach_wrong_date_workout', (select id::text from public.workouts where title='Wrong Date Candidate' and user_id='d3000000-0000-4000-8000-000000000003'), true);
end;
$$;

set local request.jwt.claim.sub = 'd2000000-0000-4000-8000-000000000002';
select results_eq(
  $$select count(*) from public.workouts where id=current_setting('test.attach_workout_a')::uuid$$,
  array[0::bigint],
  'coach cannot see personal workout before athlete attaches it'
);

set local request.jwt.claim.sub = 'd3000000-0000-4000-8000-000000000003';
select throws_ok(
  $$select public.attach_workout_to_assignment(current_setting('test.attach_recipient_b')::uuid,current_setting('test.attach_workout_a')::uuid,'completed',null)$$,
  '42501', null,
  'athlete cannot attach workout to another athlete assignment'
);
select throws_ok(
  $$select public.attach_workout_to_assignment(current_setting('test.attach_recipient_a')::uuid,current_setting('test.attach_wrong_date_workout')::uuid,'completed',null)$$,
  '23514', null,
  'attachment requires workout date to match assignment schedule'
);
select throws_ok(
  $$select public.attach_workout_to_assignment(current_setting('test.attach_recipient_a')::uuid,current_setting('test.attach_workout_a')::uuid,'skipped',null)$$,
  '22023', null,
  'attachment accepts only performance completion outcomes'
);
select lives_ok(
  $$select public.attach_workout_to_assignment(current_setting('test.attach_recipient_a')::uuid,current_setting('test.attach_workout_a')::uuid,'completed','Attached intentionally')$$,
  'athlete explicitly attaches personal workout and submits atomically'
);
select results_eq(
  $$select team_id from public.workouts where id=current_setting('test.attach_workout_a')::uuid$$,
  array[current_setting('test.attach_team_id')::uuid],
  'attached workout becomes team-context only after explicit workflow'
);
select results_eq(
  $$select completion_status from public.workout_assignment_submissions where assignment_recipient_id=current_setting('test.attach_recipient_a')::uuid$$,
  array['completed'::text],
  'attachment atomically creates completed assignment submission'
);

set local request.jwt.claim.sub = 'd2000000-0000-4000-8000-000000000002';
select results_eq(
  $$select count(*) from public.workouts where id=current_setting('test.attach_workout_a')::uuid$$,
  array[1::bigint],
  'authorized coach can see workout after explicit team-context attachment'
);
select results_eq(
  $$select count(*) from public.friendships$$,
  array[0::bigint],
  'attachment workflow never creates friendship side effects'
);

select * from finish();
rollback;
