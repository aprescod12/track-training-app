import { supabase } from "./supabase";

type ExercisePRRow = {
  user_id: string;
  exercise_id: string;

  best_time_sec: number | null;
  best_time_text: string | null;
  best_time_entry_id: string | null;
  best_time_set_number: number | null;
  best_time_rep_number: number | null;

  best_weight: number | null;
  best_reps: number | null;
  best_weight_entry_id: string | null;
  best_weight_set_number: number | null;

  updated_at: string;
};

type PRAchievementInput = {
  userId: string;
  workoutId: string;
  exerciseId: string;
  before: ExercisePRRow | null;
  after: ExercisePRRow | null;
};

type PRHit =
  | {
      mode: "track";
      exercise_id: string;
      exercise_name: string;
      best_time_sec: number;
      best_time_text: string;
      entry_id: string;
      set_number: number;
    }
  | {
      mode: "lift";
      exercise_id: string;
      exercise_name: string;
      best_weight: number;
      best_reps: number | null;
      entry_id: string;
      set_number: number;
    };

function isBetterTime(before: ExercisePRRow | null, after: ExercisePRRow | null) {
  const prev = before?.best_time_sec;
  const next = after?.best_time_sec;

  if (next == null) return false;
  if (prev == null) return true;
  return next < prev;
}

function isBetterWeight(before: ExercisePRRow | null, after: ExercisePRRow | null) {
  const prevW = before?.best_weight;
  const nextW = after?.best_weight;

  if (nextW == null) return false;
  if (prevW == null) return true;
  if (nextW > prevW) return true;

  if (nextW === prevW) {
    const prevR = before?.best_reps ?? 0;
    const nextR = after?.best_reps ?? 0;
    return nextR > prevR;
  }

  return false;
}

export async function getExercisePRMap(userId: string, exerciseIds: string[]) {
  if (!userId || exerciseIds.length === 0) return new Map<string, ExercisePRRow>();

  const { data, error } = await supabase
    .from("exercise_prs")
    .select(`
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
    `)
    .eq("user_id", userId)
    .in("exercise_id", exerciseIds);

  if (error) throw error;

  const map = new Map<string, ExercisePRRow>();
  for (const row of (data ?? []) as ExercisePRRow[]) {
    map.set(row.exercise_id, row);
  }
  return map;
}

export async function createPRAchievementsFromDiff(input: PRAchievementInput) {
  const { userId, workoutId, exerciseId, before, after } = input;

  if (!userId || !workoutId || !exerciseId || !after) return;

  const inserts: Array<Record<string, any>> = [];

  if (isBetterTime(before, after) && after.best_time_sec != null) {
    inserts.push({
      user_id: userId,
      workout_id: workoutId,
      exercise_id: exerciseId,
      type: "pr_time",
      value_num: after.best_time_sec,
      value_text: after.best_time_text,
      dedupe_key: `pr_time:${exerciseId}:${after.best_time_entry_id ?? "none"}:${after.best_time_set_number ?? "none"}:${after.best_time_rep_number ?? "none"}:${after.best_time_sec}`,
      meta: {
        entry_id: after.best_time_entry_id,
        set_number: after.best_time_set_number,
        rep_number: after.best_time_rep_number,
        kind: "time",
      },
    });
  }

  if (isBetterWeight(before, after) && after.best_weight != null) {
    inserts.push({
      user_id: userId,
      workout_id: workoutId,
      exercise_id: exerciseId,
      type: "pr_weight",
      value_num: after.best_weight,
      value_text:
        after.best_reps != null
          ? `${after.best_reps} reps @ ${after.best_weight}`
          : String(after.best_weight),
      dedupe_key: `pr_weight:${exerciseId}:${after.best_weight_entry_id ?? "none"}:${after.best_weight_set_number ?? "none"}:${after.best_weight}:${after.best_reps ?? "none"}`,
      meta: {
        entry_id: after.best_weight_entry_id,
        set_number: after.best_weight_set_number,
        reps: after.best_reps,
        kind: "weight",
      },
    });
  }

  if (!inserts.length) return;

  const { error } = await supabase.from("achievements").insert(inserts);
  if (error) {
    if ((error as any).code !== "23505") {
      throw error;
    }
  }
}

export async function createPRAchievementsFromHits(args: {
  userId: string;
  workoutId: string;
  hits: PRHit[];
}) {
  const { userId, workoutId, hits } = args;

  if (!userId || !workoutId || !hits.length) return;

  const inserts: Array<Record<string, any>> = [];

  for (const hit of hits) {
    if (hit.mode === "track") {
      inserts.push({
        user_id: userId,
        workout_id: workoutId,
        exercise_id: hit.exercise_id,
        type: "pr_time",
        value_num: hit.best_time_sec,
        value_text: hit.best_time_text,
        dedupe_key: `pr_time:${hit.exercise_id}:${hit.entry_id}:${hit.set_number}:${hit.best_time_sec}`,
        meta: {
          entry_id: hit.entry_id,
          set_number: hit.set_number,
          kind: "time",
          exercise_name: hit.exercise_name,
        },
      });
    } else {
      inserts.push({
        user_id: userId,
        workout_id: workoutId,
        exercise_id: hit.exercise_id,
        type: "pr_weight",
        value_num: hit.best_weight,
        value_text:
          hit.best_reps != null
            ? `${hit.best_reps} reps @ ${hit.best_weight}`
            : String(hit.best_weight),
        dedupe_key: `pr_weight:${hit.exercise_id}:${hit.entry_id}:${hit.set_number}:${hit.best_weight}:${hit.best_reps ?? "none"}`,
        meta: {
          entry_id: hit.entry_id,
          set_number: hit.set_number,
          reps: hit.best_reps,
          kind: "weight",
          exercise_name: hit.exercise_name,
        },
      });
    }
  }

  if (!inserts.length) return;

  const { error } = await supabase.from("achievements").insert(inserts);

  if (error && (error as any).code !== "23505") {
    throw error;
  }
}

function ymdToDate(ymd: string) {
    return new Date(ymd + "T00:00:00");
  }
  
  function formatYMDLocal(d: Date) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  
  function addDays(d: Date, n: number) {
    const copy = new Date(d);
    copy.setDate(copy.getDate() + n);
    return copy;
  }
  
  function computeCurrentWorkoutStreak(sortedDatesDesc: string[]) {
    if (!sortedDatesDesc.length) return 0;
  
    let streak = 1;
    let prev = ymdToDate(sortedDatesDesc[0]);
  
    for (let i = 1; i < sortedDatesDesc.length; i++) {
      const cur = ymdToDate(sortedDatesDesc[i]);
      const expectedPrev = addDays(cur, 1);
  
      if (formatYMDLocal(expectedPrev) === formatYMDLocal(prev)) {
        streak += 1;
        prev = cur;
      } else {
        break;
      }
    }
  
    return streak;
  }
  
  export async function maybeCreateWorkoutStreakAchievement(args: {
    userId: string;
    workoutId: string;
  }) {
    const { userId, workoutId } = args;
    if (!userId || !workoutId) return;
  
    const { data: workouts, error } = await supabase
      .from("workouts")
      .select("id, workout_date")
      .eq("user_id", userId)
      .order("workout_date", { ascending: false });
  
    if (error) throw error;
  
    const uniqueDates = Array.from(
      new Set(((workouts ?? []) as Array<{ id: string; workout_date: string }>).map((w) => w.workout_date))
    ).sort((a, b) => (a < b ? 1 : -1));
  
    const streak = computeCurrentWorkoutStreak(uniqueDates);
    const milestones = new Set([3, 5, 7, 10, 14, 30]);
  
    if (!milestones.has(streak)) return;
  
    const dedupeKey = `workout_streak:${streak}:${uniqueDates[0]}`;
  
    const { error: insertErr } = await supabase.from("achievements").insert({
      user_id: userId,
      workout_id: workoutId,
      exercise_id: null,
      type: "workout_streak",
      value_num: streak,
      value_text: `${streak} workouts in a row`,
      dedupe_key: dedupeKey,
      meta: {
        days: streak,
        latest_workout_date: uniqueDates[0] ?? null,
      },
    });
  
    if (insertErr && (insertErr as any).code !== "23505") {
      throw insertErr;
    }
  }

  function startOfWeekMonday(d: Date) {
    const copy = new Date(d);
    const day = (copy.getDay() + 6) % 7; // Mon=0 ... Sun=6
    copy.setDate(copy.getDate() - day);
    copy.setHours(0, 0, 0, 0);
    return copy;
  }
  
  export async function maybeCreateWeeklyWorkoutCountAchievement(args: {
    userId: string;
    workoutId: string;
  }) {
    const { userId, workoutId } = args;
    if (!userId || !workoutId) return;
  
    const now = new Date();
    const weekStart = startOfWeekMonday(now);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
  
    const weekStartYMD = formatYMDLocal(weekStart);
    const weekEndYMD = formatYMDLocal(weekEnd);
  
    const { data, error } = await supabase
      .from("workouts")
      .select("id")
      .eq("user_id", userId)
      .gte("workout_date", weekStartYMD)
      .lte("workout_date", weekEndYMD);
  
    if (error) throw error;
  
    const count = (data ?? []).length;
    const milestones = new Set([3, 5, 7]);
  
    if (!milestones.has(count)) return;
  
    const dedupeKey = `weekly_workout_count:${count}:${weekStartYMD}`;
  
    const { error: insertErr } = await supabase.from("achievements").insert({
      user_id: userId,
      workout_id: workoutId,
      exercise_id: null,
      type: "weekly_workout_count",
      value_num: count,
      value_text: `${count} workouts this week`,
      dedupe_key: dedupeKey,
      meta: {
        count,
        week_start: weekStartYMD,
        week_end: weekEndYMD,
      },
    });
  
    if (insertErr && (insertErr as any).code !== "23505") {
      throw insertErr;
    }
  }

  export async function maybeCreateDistanceMilestoneAchievement(args: {
    userId: string;
    workoutId: string;
  }) {
    const { userId, workoutId } = args;
    if (!userId || !workoutId) return;
  
    const now = new Date();
    const weekStart = startOfWeekMonday(now);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
  
    const weekStartYMD = formatYMDLocal(weekStart);
    const weekEndYMD = formatYMDLocal(weekEnd);
  
    const { data, error } = await supabase
      .from("workout_entries")
      .select(`
        reps,
        sets,
        exercises(distance_m),
        workouts!inner(user_id, workout_date, workout_type)
      `)
      .eq("user_id", userId)
      .eq("workouts.user_id", userId)
      .gte("workouts.workout_date", weekStartYMD)
      .lte("workouts.workout_date", weekEndYMD);
  
    if (error) throw error;
  
    const totalDistanceM = (data ?? []).reduce((sum: number, r: any) => {
      if (r.workouts?.workout_type !== "track") return sum;
      const perRep = Number(r.exercises?.distance_m ?? 0);
      const reps = Number(r.reps ?? 1);
      const sets = Number(r.sets ?? 1);
      return sum + perRep * reps * sets;
    }, 0);
  
    const milestones = [5000, 10000, 20000, 50000];
    const hit = milestones
      .filter((m) => totalDistanceM >= m)
      .sort((a, b) => b - a)[0];
  
    if (!hit) return;
  
    const kmText =
      hit >= 1000 ? `${(hit / 1000).toFixed(hit % 1000 === 0 ? 0 : 1)} km this week` : `${hit} m this week`;
  
    const dedupeKey = `distance_milestone:${hit}:${weekStartYMD}`;
  
    const { error: insertErr } = await supabase.from("achievements").insert({
      user_id: userId,
      workout_id: workoutId,
      exercise_id: null,
      type: "distance_milestone",
      value_num: hit,
      value_text: kmText,
      dedupe_key: dedupeKey,
      meta: {
        distance_m: hit,
        period: "week",
        week_start: weekStartYMD,
        week_end: weekEndYMD,
        total_distance_m: totalDistanceM,
      },
    });
  
    if (insertErr && (insertErr as any).code !== "23505") {
      throw insertErr;
    }
  }

  function diffDays(a: Date, b: Date) {
    const msPerDay = 1000 * 60 * 60 * 24;
    const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
    const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
    return Math.floor((utcA - utcB) / msPerDay);
  }
  
  export async function maybeCreateComebackAchievement(args: {
    userId: string;
    workoutId: string;
  }) {
    const { userId, workoutId } = args;
    if (!userId || !workoutId) return;
  
    const { data, error } = await supabase
      .from("workouts")
      .select("id, workout_date")
      .eq("user_id", userId)
      .order("workout_date", { ascending: false })
      .limit(2);
  
    if (error) throw error;
  
    const rows = (data ?? []) as Array<{ id: string; workout_date: string }>;
    if (rows.length < 2) return;
  
    const latest = rows[0];
    const previous = rows[1];
  
    if (!latest?.workout_date || !previous?.workout_date) return;
  
    const latestDate = ymdToDate(latest.workout_date);
    const previousDate = ymdToDate(previous.workout_date);
    const daysAway = diffDays(latestDate, previousDate);
  
    let milestone: number | null = null;
    if (daysAway >= 60) milestone = 60;
    else if (daysAway >= 30) milestone = 30;
    else if (daysAway >= 14) milestone = 14;
  
    if (!milestone) return;
  
    const dedupeKey = `comeback:${milestone}:${latest.workout_date}`;
  
    const { error: insertErr } = await supabase.from("achievements").insert({
      user_id: userId,
      workout_id: workoutId,
      exercise_id: null,
      type: "comeback",
      value_num: daysAway,
      value_text: `First workout in ${daysAway} days`,
      dedupe_key: dedupeKey,
      meta: {
        days_away: daysAway,
        milestone,
        latest_workout_date: latest.workout_date,
        previous_workout_date: previous.workout_date,
      },
    });
  
    if (insertErr && (insertErr as any).code !== "23505") {
      throw insertErr;
    }
  }