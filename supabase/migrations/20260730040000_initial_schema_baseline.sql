


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_friends"("viewer" "uuid", "owner" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.friendships f
    where f.status = 'accepted'
      and f.user_low = least(viewer, owner)
      and f.user_high = greatest(viewer, owner)
  );
$$;


ALTER FUNCTION "public"."is_friends"("viewer" "uuid", "owner" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."normalize_username"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if new.username is not null then
    new.username := lower(new.username);
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."normalize_username"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."parse_time_to_seconds"("t" "text") RETURNS double precision
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
declare
  s text;
  mm text;
  rest text;
  minutes double precision;
  seconds double precision;
begin
  s := btrim(coalesce(t, ''));
  if s = '' then
    return null;
  end if;

  if position(':' in s) > 0 then
    mm := split_part(s, ':', 1);
    rest := split_part(s, ':', 2);

    minutes := mm::double precision;
    seconds := rest::double precision;

    return minutes * 60.0 + seconds;
  end if;

  return s::double precision;
exception when others then
  return null;
end;
$$;


ALTER FUNCTION "public"."parse_time_to_seconds"("t" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recompute_exercise_pr"("p_user_id" "uuid", "p_exercise_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  t record;
  w record;
begin
  /*
    Track: fastest single rep for that exercise for that user
    We look at entry_sets.time_text, parse it, take min seconds.
  */
  select
    public.parse_time_to_seconds(es.time_text) as best_time_sec,
    es.time_text as best_time_text,
    we.id as best_time_entry_id,
    es.set_number as best_time_set_number,
    es.rep_number as best_time_rep_number
  into t
  from public.workouts wo
  join public.workout_entries we on we.workout_id = wo.id
  join public.entry_sets es on es.entry_id = we.id
  where wo.user_id = p_user_id
    and we.exercise_id = p_exercise_id
    and coalesce(btrim(es.time_text), '') <> ''
    and public.parse_time_to_seconds(es.time_text) is not null
  order by public.parse_time_to_seconds(es.time_text) asc, wo.workout_date asc, we.id asc, es.set_number asc, es.rep_number asc
  limit 1;

  /*
    Lift: max weight for that exercise for that user
    We look at entry_sets.weight, take max.
  */
  select
    es.weight as best_weight,
    es.reps as best_reps,
    we.id as best_weight_entry_id,
    es.set_number as best_weight_set_number
  into w
  from public.workouts wo
  join public.workout_entries we on we.workout_id = wo.id
  join public.entry_sets es on es.entry_id = we.id
  where wo.user_id = p_user_id
    and we.exercise_id = p_exercise_id
    and es.weight is not null
  order by es.weight desc nulls last, wo.workout_date asc, we.id asc, es.set_number asc
  limit 1;

  -- Upsert the PR row
  insert into public.exercise_prs (
    user_id,
    exercise_id,

    best_time_sec,
    best_time_text,
    best_time_entry_id,
    best_time_set_number,
    best_time_rep_number,

    best_weight,
    best_reps,
    best_weight_entry_id,
    best_weight_set_number,

    updated_at
  )
  values (
    p_user_id,
    p_exercise_id,

    t.best_time_sec,
    t.best_time_text,
    t.best_time_entry_id,
    t.best_time_set_number,
    t.best_time_rep_number,

    w.best_weight,
    w.best_reps,
    w.best_weight_entry_id,
    w.best_weight_set_number,

    now()
  )
  on conflict (user_id, exercise_id) do update set
    best_time_sec = excluded.best_time_sec,
    best_time_text = excluded.best_time_text,
    best_time_entry_id = excluded.best_time_entry_id,
    best_time_set_number = excluded.best_time_set_number,
    best_time_rep_number = excluded.best_time_rep_number,

    best_weight = excluded.best_weight,
    best_reps = excluded.best_reps,
    best_weight_entry_id = excluded.best_weight_entry_id,
    best_weight_set_number = excluded.best_weight_set_number,

    updated_at = now();

end;
$$;


ALTER FUNCTION "public"."recompute_exercise_pr"("p_user_id" "uuid", "p_exercise_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tg_entry_sets_recompute_pr"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_entry_id uuid;
  v_user_id uuid;
  v_exercise_id uuid;
begin
  v_entry_id := coalesce(new.entry_id, old.entry_id);

  -- look up user + exercise from the entry_id
  select wo.user_id, we.exercise_id
  into v_user_id, v_exercise_id
  from public.workout_entries we
  join public.workouts wo on wo.id = we.workout_id
  where we.id = v_entry_id;

  if v_user_id is not null and v_exercise_id is not null then
    perform public.recompute_exercise_pr(v_user_id, v_exercise_id);
  end if;

  return null;
end;
$$;


ALTER FUNCTION "public"."tg_entry_sets_recompute_pr"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tg_workout_entries_recompute_pr"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid;
begin
  select user_id into v_user_id
  from public.workouts
  where id = coalesce(new.workout_id, old.workout_id);

  if v_user_id is null then
    return null;
  end if;

  -- recompute old exercise
  if old.exercise_id is not null then
    perform public.recompute_exercise_pr(v_user_id, old.exercise_id);
  end if;

  -- recompute new exercise
  if new.exercise_id is not null then
    perform public.recompute_exercise_pr(v_user_id, new.exercise_id);
  end if;

  return null;
end;
$$;


ALTER FUNCTION "public"."tg_workout_entries_recompute_pr"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_recompute_pr_after_entry_delete"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_user_id uuid;
  v_exercise_id uuid;
begin
  -- Prefer values from workout_entries itself (works during CASCADE)
  v_user_id := old.user_id;
  v_exercise_id := old.exercise_id;

  -- If old.user_id is null (shouldn't happen often), fall back to workouts lookup
  if v_user_id is null then
    select w.user_id into v_user_id
    from public.workouts w
    where w.id = old.workout_id;
  end if;

  if v_user_id is not null and v_exercise_id is not null then
    perform public.recompute_exercise_pr(v_user_id, v_exercise_id);
  end if;

  return old;
end;
$$;


ALTER FUNCTION "public"."trg_recompute_pr_after_entry_delete"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_recompute_pr_after_entry_update"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_user_id uuid;
begin
  v_user_id := new.user_id;
  if v_user_id is null then
    select w.user_id into v_user_id from public.workouts w where w.id = new.workout_id;
  end if;

  if v_user_id is null then
    return new;
  end if;

  -- recompute old exercise
  if old.exercise_id is not null then
    perform public.recompute_exercise_pr(v_user_id, old.exercise_id);
  end if;

  -- recompute new exercise
  if new.exercise_id is not null then
    perform public.recompute_exercise_pr(v_user_id, new.exercise_id);
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."trg_recompute_pr_after_entry_update"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_recompute_pr_after_set_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_exercise_id uuid;
  v_workout_id uuid;
  v_user_id uuid;
begin
  -- get entry -> exercise/workout
  select we.exercise_id, we.workout_id
    into v_exercise_id, v_workout_id
  from public.workout_entries we
  where we.id = coalesce(new.entry_id, old.entry_id);

  if v_exercise_id is null or v_workout_id is null then
    return coalesce(new, old);
  end if;

  select w.user_id into v_user_id
  from public.workouts w
  where w.id = v_workout_id;

  if v_user_id is null then
    return coalesce(new, old);
  end if;

  perform public.recompute_exercise_pr(v_user_id, v_exercise_id);

  return coalesce(new, old);
end;
$$;


ALTER FUNCTION "public"."trg_recompute_pr_after_set_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_workout_entries_recompute_pr"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  rec record;
  v_user_id uuid;
begin
  -- OLD TABLE contains all workout_entries deleted in the statement (including cascade)
  for rec in
    select distinct workout_id, exercise_id
    from old_rows
    where exercise_id is not null
  loop
    -- During cascade (workouts -> workout_entries), the workout row still exists here
    select user_id into v_user_id
    from public.workouts
    where id = rec.workout_id;

    if v_user_id is null then
      continue;
    end if;

    perform public.recompute_exercise_pr(v_user_id, rec.exercise_id);
  end loop;

  return null;
end;
$$;


ALTER FUNCTION "public"."trg_workout_entries_recompute_pr"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."achievements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "workout_id" "uuid",
    "exercise_id" "uuid",
    "value_num" numeric,
    "value_text" "text",
    "meta" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "dedupe_key" "text"
);


ALTER TABLE "public"."achievements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."calendar_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "title" "text" NOT NULL,
    "notes" "text",
    "starts_at" timestamp with time zone NOT NULL,
    "ends_at" timestamp with time zone,
    "reminder_minutes" integer,
    "notification_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."calendar_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."entry_sets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "entry_id" "uuid" NOT NULL,
    "set_number" integer NOT NULL,
    "rep_number" integer,
    "time_text" "text",
    "reps" integer,
    "weight" numeric,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "entry_sets_rep_number_check" CHECK ((("rep_number" IS NULL) OR ("rep_number" > 0))),
    CONSTRAINT "entry_sets_reps_check" CHECK ((("reps" IS NULL) OR ("reps" >= 0))),
    CONSTRAINT "entry_sets_set_number_check" CHECK (("set_number" > 0)),
    CONSTRAINT "entry_sets_weight_check" CHECK ((("weight" IS NULL) OR ("weight" >= (0)::numeric)))
);


ALTER TABLE "public"."entry_sets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."exercise_prs" (
    "user_id" "uuid" NOT NULL,
    "exercise_id" "uuid" NOT NULL,
    "best_time_sec" double precision,
    "best_time_text" "text",
    "best_weight" double precision,
    "best_reps" integer,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "best_time_entry_id" "uuid",
    "best_time_set_number" integer,
    "best_time_rep_number" integer,
    "best_weight_entry_id" "uuid",
    "best_weight_set_number" integer
);


ALTER TABLE "public"."exercise_prs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."exercises" (
    "exercise_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "category" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "distance_m" numeric,
    "score_type" "text" NOT NULL,
    "created_by" "uuid",
    CONSTRAINT "exercises_category_check" CHECK (("category" = ANY (ARRAY['track'::"text", 'lift'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."exercises" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."friendships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_low" "uuid" NOT NULL,
    "user_high" "uuid" NOT NULL,
    "requester_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "friendships_pair_check" CHECK (("user_low" < "user_high")),
    CONSTRAINT "friendships_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'blocked'::"text"])))
);


ALTER TABLE "public"."friendships" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "full_name" "text",
    "role" "text" DEFAULT 'athlete'::"text",
    "school" "text",
    "team" "text",
    "grad_year" integer,
    "events" "text"[],
    "bio" "text",
    "avatar_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "featured_exercise_id" "uuid",
    "username" "text",
    CONSTRAINT "username_format_check" CHECK (("username" ~ '^[a-z0-9_]{3,20}$'::"text"))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workout_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "workout_id" "uuid" NOT NULL,
    "label" "text",
    "value" "text",
    "notes" "text",
    "exercise" "text",
    "reps" integer,
    "time" "text",
    "weight" numeric,
    "sets" integer DEFAULT 1,
    "times" "text"[],
    "set_times" "text"[],
    "lift_reps" integer[],
    "lift_weights" numeric[],
    "exercise_id" "uuid",
    "distance_m" numeric,
    "user_id" "uuid" DEFAULT "auth"."uid"(),
    CONSTRAINT "workout_entries_reps_nonneg" CHECK ((("reps" IS NULL) OR ("reps" >= 0))),
    CONSTRAINT "workout_entries_sets_nonneg" CHECK ((("sets" IS NULL) OR ("sets" >= 0))),
    CONSTRAINT "workout_entries_weight_nonneg" CHECK ((("weight" IS NULL) OR ("weight" >= (0)::numeric)))
);


ALTER TABLE "public"."workout_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workouts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "workout_date" "date" NOT NULL,
    "title" "text" NOT NULL,
    "notes" "text",
    "workout_type" "text" DEFAULT 'track'::"text" NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    CONSTRAINT "workouts_workout_type_check" CHECK (("workout_type" = ANY (ARRAY['track'::"text", 'lift'::"text"])))
);


ALTER TABLE "public"."workouts" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."workout_summary_v" WITH ("security_invoker"='true') AS
 WITH "entry_set_rollup" AS (
         SELECT "es"."entry_id",
            ("count"(*))::integer AS "total_sets",
            (COALESCE("sum"(
                CASE
                    WHEN (("es"."reps" IS NOT NULL) AND ("es"."reps" > 0)) THEN "es"."reps"
                    ELSE 1
                END), (0)::bigint))::integer AS "total_reps"
           FROM "public"."entry_sets" "es"
          GROUP BY "es"."entry_id"
        ), "entry_rollup" AS (
         SELECT "we"."id" AS "entry_id",
            "we"."workout_id",
            "we"."exercise_id",
            COALESCE("esr"."total_sets", 0) AS "total_sets",
            COALESCE("esr"."total_reps", 0) AS "total_reps",
            "e"."distance_m"
           FROM (("public"."workout_entries" "we"
             LEFT JOIN "entry_set_rollup" "esr" ON (("esr"."entry_id" = "we"."id")))
             LEFT JOIN "public"."exercises" "e" ON (("e"."exercise_id" = "we"."exercise_id")))
        ), "workout_rollup" AS (
         SELECT "w"."id" AS "workout_id",
            "w"."user_id",
            "w"."workout_date",
            "w"."workout_type",
            (COALESCE("sum"("er"."total_sets"), (0)::bigint))::integer AS "total_sets",
            COALESCE("sum"(
                CASE
                    WHEN ("er"."distance_m" IS NOT NULL) THEN ("er"."distance_m" * ("er"."total_reps")::numeric)
                    ELSE (0)::numeric
                END), (0)::numeric) AS "distance_m_total"
           FROM ("public"."workouts" "w"
             LEFT JOIN "entry_rollup" "er" ON (("er"."workout_id" = "w"."id")))
          GROUP BY "w"."id", "w"."user_id", "w"."workout_date", "w"."workout_type"
        )
 SELECT "workout_id",
    "user_id",
    "workout_date",
    "workout_type",
    "total_sets",
    "distance_m_total"
   FROM "workout_rollup";


ALTER VIEW "public"."workout_summary_v" OWNER TO "postgres";


ALTER TABLE ONLY "public"."achievements"
    ADD CONSTRAINT "achievements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."calendar_events"
    ADD CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."entry_sets"
    ADD CONSTRAINT "entry_sets_entry_set_rep_unique" UNIQUE ("entry_id", "set_number", "rep_number");



ALTER TABLE ONLY "public"."entry_sets"
    ADD CONSTRAINT "entry_sets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."exercise_prs"
    ADD CONSTRAINT "exercise_prs_pkey" PRIMARY KEY ("user_id", "exercise_id");



ALTER TABLE ONLY "public"."exercises"
    ADD CONSTRAINT "exercises_pkey" PRIMARY KEY ("exercise_id");



ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_pair_unique" UNIQUE ("user_low", "user_high");



ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_username_unique" UNIQUE ("username");



ALTER TABLE ONLY "public"."workout_entries"
    ADD CONSTRAINT "workout_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workouts"
    ADD CONSTRAINT "workouts_pkey" PRIMARY KEY ("id");



CREATE INDEX "achievements_created_idx" ON "public"."achievements" USING "btree" ("created_at" DESC);



CREATE INDEX "achievements_user_created_idx" ON "public"."achievements" USING "btree" ("user_id", "created_at" DESC);



CREATE UNIQUE INDEX "achievements_user_dedupe_idx" ON "public"."achievements" USING "btree" ("user_id", "dedupe_key") WHERE ("dedupe_key" IS NOT NULL);



CREATE INDEX "calendar_events_user_starts_at_idx" ON "public"."calendar_events" USING "btree" ("user_id", "starts_at");



CREATE INDEX "entry_sets_entry_id_idx" ON "public"."entry_sets" USING "btree" ("entry_id");



CREATE INDEX "entry_sets_entry_set_rep_idx" ON "public"."entry_sets" USING "btree" ("entry_id", "set_number", "rep_number");



CREATE INDEX "exercises_name_idx" ON "public"."exercises" USING "btree" ("name");



CREATE UNIQUE INDEX "exercises_name_unique_idx" ON "public"."exercises" USING "btree" ("lower"("name"));



CREATE INDEX "friendships_status_idx" ON "public"."friendships" USING "btree" ("status");



CREATE INDEX "friendships_user_high_idx" ON "public"."friendships" USING "btree" ("user_high");



CREATE INDEX "friendships_user_low_idx" ON "public"."friendships" USING "btree" ("user_low");



CREATE INDEX "profiles_full_name_idx" ON "public"."profiles" USING "btree" ("full_name");



CREATE INDEX "profiles_username_idx" ON "public"."profiles" USING "btree" ("username");



CREATE INDEX "workout_entries_exercise_id_idx" ON "public"."workout_entries" USING "btree" ("exercise_id");



CREATE INDEX "workout_entries_workout_exercise_idx" ON "public"."workout_entries" USING "btree" ("workout_id", "exercise_id");



CREATE INDEX "workout_entries_workout_id_idx" ON "public"."workout_entries" USING "btree" ("workout_id");



CREATE INDEX "workouts_user_date_idx" ON "public"."workouts" USING "btree" ("user_id", "workout_date" DESC);



CREATE INDEX "workouts_workout_date_idx" ON "public"."workouts" USING "btree" ("workout_date" DESC);



CREATE OR REPLACE TRIGGER "entry_sets_recompute_pr_after_delete" AFTER DELETE ON "public"."entry_sets" FOR EACH ROW EXECUTE FUNCTION "public"."trg_recompute_pr_after_set_change"();



CREATE OR REPLACE TRIGGER "entry_sets_recompute_pr_after_insert" AFTER INSERT ON "public"."entry_sets" FOR EACH ROW EXECUTE FUNCTION "public"."trg_recompute_pr_after_set_change"();



CREATE OR REPLACE TRIGGER "entry_sets_recompute_pr_after_update" AFTER UPDATE ON "public"."entry_sets" FOR EACH ROW EXECUTE FUNCTION "public"."trg_recompute_pr_after_set_change"();



CREATE OR REPLACE TRIGGER "profiles_normalize_username" BEFORE INSERT OR UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."normalize_username"();



CREATE OR REPLACE TRIGGER "profiles_set_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "workout_entries_recompute_pr_after_delete" AFTER DELETE ON "public"."workout_entries" FOR EACH ROW EXECUTE FUNCTION "public"."trg_recompute_pr_after_entry_delete"();



CREATE OR REPLACE TRIGGER "workout_entries_recompute_pr_after_update" AFTER UPDATE OF "exercise_id" ON "public"."workout_entries" FOR EACH ROW EXECUTE FUNCTION "public"."trg_recompute_pr_after_entry_update"();



ALTER TABLE ONLY "public"."achievements"
    ADD CONSTRAINT "achievements_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("exercise_id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."achievements"
    ADD CONSTRAINT "achievements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."achievements"
    ADD CONSTRAINT "achievements_workout_id_fkey" FOREIGN KEY ("workout_id") REFERENCES "public"."workouts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."calendar_events"
    ADD CONSTRAINT "calendar_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."entry_sets"
    ADD CONSTRAINT "entry_sets_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "public"."workout_entries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exercises"
    ADD CONSTRAINT "exercises_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_user_high_fkey" FOREIGN KEY ("user_high") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_user_low_fkey" FOREIGN KEY ("user_low") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_featured_exercise_id_fkey" FOREIGN KEY ("featured_exercise_id") REFERENCES "public"."exercises"("exercise_id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workout_entries"
    ADD CONSTRAINT "workout_entries_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("exercise_id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."workout_entries"
    ADD CONSTRAINT "workout_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workout_entries"
    ADD CONSTRAINT "workout_entries_user_id_profiles_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workout_entries"
    ADD CONSTRAINT "workout_entries_workout_id_fkey" FOREIGN KEY ("workout_id") REFERENCES "public"."workouts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workouts"
    ADD CONSTRAINT "workouts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workouts"
    ADD CONSTRAINT "workouts_user_id_profiles_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



CREATE POLICY "Users can insert own profile" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view own profile" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



ALTER TABLE "public"."achievements" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "achievements_friends_select" ON "public"."achievements" FOR SELECT USING ("public"."is_friends"("auth"."uid"(), "user_id"));



CREATE POLICY "achievements_owner_all" ON "public"."achievements" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "calendar_delete_own" ON "public"."calendar_events" FOR DELETE USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."calendar_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "calendar_insert_own" ON "public"."calendar_events" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "calendar_select_own" ON "public"."calendar_events" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "calendar_update_own" ON "public"."calendar_events" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "delete own events" ON "public"."calendar_events" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "entries_delete_own" ON "public"."workout_entries" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "entries_insert_own" ON "public"."workout_entries" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND (EXISTS ( SELECT 1
   FROM "public"."workouts" "w"
  WHERE (("w"."id" = "workout_entries"."workout_id") AND ("w"."user_id" = "auth"."uid"()))))));



CREATE POLICY "entries_select_own" ON "public"."workout_entries" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "entries_update_own" ON "public"."workout_entries" FOR UPDATE USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."entry_sets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "entry_sets_delete_own" ON "public"."entry_sets" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."workout_entries" "we"
  WHERE (("we"."id" = "entry_sets"."entry_id") AND ("we"."user_id" = "auth"."uid"())))));



CREATE POLICY "entry_sets_friends_select" ON "public"."entry_sets" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."workout_entries" "we"
     JOIN "public"."workouts" "w" ON (("w"."id" = "we"."workout_id")))
  WHERE (("we"."id" = "entry_sets"."entry_id") AND "public"."is_friends"("auth"."uid"(), "w"."user_id")))));



CREATE POLICY "entry_sets_insert_own" ON "public"."entry_sets" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."workout_entries" "we"
  WHERE (("we"."id" = "entry_sets"."entry_id") AND ("we"."user_id" = "auth"."uid"())))));



CREATE POLICY "entry_sets_owner_all" ON "public"."entry_sets" USING ((EXISTS ( SELECT 1
   FROM ("public"."workout_entries" "we"
     JOIN "public"."workouts" "w" ON (("w"."id" = "we"."workout_id")))
  WHERE (("we"."id" = "entry_sets"."entry_id") AND ("w"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."workout_entries" "we"
     JOIN "public"."workouts" "w" ON (("w"."id" = "we"."workout_id")))
  WHERE (("we"."id" = "entry_sets"."entry_id") AND ("w"."user_id" = "auth"."uid"())))));



CREATE POLICY "entry_sets_select_own" ON "public"."entry_sets" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."workout_entries" "we"
  WHERE (("we"."id" = "entry_sets"."entry_id") AND ("we"."user_id" = "auth"."uid"())))));



CREATE POLICY "entry_sets_update_own" ON "public"."entry_sets" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."workout_entries" "e"
  WHERE (("e"."id" = "entry_sets"."entry_id") AND ("e"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."exercise_prs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "exercise_prs_modify_own" ON "public"."exercise_prs" TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "exercise_prs_select_self_and_friends" ON "public"."exercise_prs" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."friendships" "f"
  WHERE (("f"."status" = 'accepted'::"text") AND ((("f"."user_low" = "auth"."uid"()) AND ("f"."user_high" = "exercise_prs"."user_id")) OR (("f"."user_high" = "auth"."uid"()) AND ("f"."user_low" = "exercise_prs"."user_id"))))))));



ALTER TABLE "public"."exercises" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "exercises_delete_own" ON "public"."exercises" FOR DELETE TO "authenticated" USING (("created_by" = "auth"."uid"()));



CREATE POLICY "exercises_insert_own" ON "public"."exercises" FOR INSERT TO "authenticated" WITH CHECK (("created_by" = "auth"."uid"()));



CREATE POLICY "exercises_select_authenticated" ON "public"."exercises" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "exercises_update_own" ON "public"."exercises" FOR UPDATE TO "authenticated" USING (("created_by" = "auth"."uid"())) WITH CHECK (("created_by" = "auth"."uid"()));



ALTER TABLE "public"."friendships" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "friendships_delete_participant" ON "public"."friendships" FOR DELETE USING ((("auth"."uid"() = "user_low") OR ("auth"."uid"() = "user_high")));



CREATE POLICY "friendships_insert_request" ON "public"."friendships" FOR INSERT WITH CHECK ((("requester_id" = "auth"."uid"()) AND (("auth"."uid"() = "user_low") OR ("auth"."uid"() = "user_high")) AND ("user_low" < "user_high")));



CREATE POLICY "friendships_select_participant" ON "public"."friendships" FOR SELECT USING ((("auth"."uid"() = "user_low") OR ("auth"."uid"() = "user_high")));



CREATE POLICY "friendships_update_participant" ON "public"."friendships" FOR UPDATE USING ((("auth"."uid"() = "user_low") OR ("auth"."uid"() = "user_high"))) WITH CHECK ((("auth"."uid"() = "user_low") OR ("auth"."uid"() = "user_high")));



CREATE POLICY "insert own events" ON "public"."calendar_events" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_insert_own" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "profiles_public_read" ON "public"."profiles" FOR SELECT USING (true);



CREATE POLICY "profiles_select_all" ON "public"."profiles" FOR SELECT USING (true);



CREATE POLICY "profiles_update_own" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "select own events" ON "public"."calendar_events" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "update own events" ON "public"."calendar_events" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."workout_entries" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "workout_entries_friends_select" ON "public"."workout_entries" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."workouts" "w"
  WHERE (("w"."id" = "workout_entries"."workout_id") AND "public"."is_friends"("auth"."uid"(), "w"."user_id")))));



CREATE POLICY "workout_entries_owner_all" ON "public"."workout_entries" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."workouts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "workouts_delete_own" ON "public"."workouts" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "workouts_friends_select" ON "public"."workouts" FOR SELECT USING ("public"."is_friends"("auth"."uid"(), "user_id"));



CREATE POLICY "workouts_insert_own" ON "public"."workouts" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "workouts_owner_all" ON "public"."workouts" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "workouts_select_own" ON "public"."workouts" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "workouts_update_own" ON "public"."workouts" FOR UPDATE USING (("auth"."uid"() = "user_id"));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_friends"("viewer" "uuid", "owner" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_friends"("viewer" "uuid", "owner" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_friends"("viewer" "uuid", "owner" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_friends"("viewer" "uuid", "owner" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."normalize_username"() TO "anon";
GRANT ALL ON FUNCTION "public"."normalize_username"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."normalize_username"() TO "service_role";



GRANT ALL ON FUNCTION "public"."parse_time_to_seconds"("t" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."parse_time_to_seconds"("t" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."parse_time_to_seconds"("t" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."recompute_exercise_pr"("p_user_id" "uuid", "p_exercise_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."recompute_exercise_pr"("p_user_id" "uuid", "p_exercise_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."recompute_exercise_pr"("p_user_id" "uuid", "p_exercise_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."tg_entry_sets_recompute_pr"() TO "anon";
GRANT ALL ON FUNCTION "public"."tg_entry_sets_recompute_pr"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."tg_entry_sets_recompute_pr"() TO "service_role";



GRANT ALL ON FUNCTION "public"."tg_workout_entries_recompute_pr"() TO "anon";
GRANT ALL ON FUNCTION "public"."tg_workout_entries_recompute_pr"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."tg_workout_entries_recompute_pr"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_recompute_pr_after_entry_delete"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_recompute_pr_after_entry_delete"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_recompute_pr_after_entry_delete"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_recompute_pr_after_entry_update"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_recompute_pr_after_entry_update"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_recompute_pr_after_entry_update"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_recompute_pr_after_set_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_recompute_pr_after_set_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_recompute_pr_after_set_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_workout_entries_recompute_pr"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_workout_entries_recompute_pr"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_workout_entries_recompute_pr"() TO "service_role";



GRANT ALL ON TABLE "public"."achievements" TO "anon";
GRANT ALL ON TABLE "public"."achievements" TO "authenticated";
GRANT ALL ON TABLE "public"."achievements" TO "service_role";



GRANT ALL ON TABLE "public"."calendar_events" TO "anon";
GRANT ALL ON TABLE "public"."calendar_events" TO "authenticated";
GRANT ALL ON TABLE "public"."calendar_events" TO "service_role";



GRANT ALL ON TABLE "public"."entry_sets" TO "anon";
GRANT ALL ON TABLE "public"."entry_sets" TO "authenticated";
GRANT ALL ON TABLE "public"."entry_sets" TO "service_role";



GRANT ALL ON TABLE "public"."exercise_prs" TO "anon";
GRANT ALL ON TABLE "public"."exercise_prs" TO "authenticated";
GRANT ALL ON TABLE "public"."exercise_prs" TO "service_role";



GRANT ALL ON TABLE "public"."exercises" TO "anon";
GRANT ALL ON TABLE "public"."exercises" TO "authenticated";
GRANT ALL ON TABLE "public"."exercises" TO "service_role";



GRANT ALL ON TABLE "public"."friendships" TO "anon";
GRANT ALL ON TABLE "public"."friendships" TO "authenticated";
GRANT ALL ON TABLE "public"."friendships" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."workout_entries" TO "anon";
GRANT ALL ON TABLE "public"."workout_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."workout_entries" TO "service_role";



GRANT ALL ON TABLE "public"."workouts" TO "anon";
GRANT ALL ON TABLE "public"."workouts" TO "authenticated";
GRANT ALL ON TABLE "public"."workouts" TO "service_role";



GRANT ALL ON TABLE "public"."workout_summary_v" TO "anon";
GRANT ALL ON TABLE "public"."workout_summary_v" TO "authenticated";
GRANT ALL ON TABLE "public"."workout_summary_v" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







