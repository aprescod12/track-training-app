import { supabase } from "./supabase";

/*
PR system responsibilities

Option 4:
- Compute PR hits for a newly saved workout (so UI can celebrate)

Option 3:
- Persist PRs in exercise_prs table for fast lookup
*/

export type PRHit = {
  exercise_id: string;
  exercise_name: string;
  mode: "track" | "lift";

  best_time_text?: string;
  best_time_sec?: number;

  best_weight?: number;
  best_reps?: number | null;

  entry_id?: string;
  set_number?: number;
};

type EntrySetRow = {
  set_number: number;
  rep_number: number | null;
  time_text: string | null;
  reps: number | null;
  weight: number | null;
};

type WorkoutEntryRow = {
  id: string;
  exercise_id: string | null;
  // Option A: to-one embed
  exercises: { name: string } | null;
  entry_sets: EntrySetRow[] | null;
};

function parseTimeToSeconds(t: string): number | null {
  const s = (t ?? "").trim();
  if (!s) return null;

  // mm:ss(.xx)
  if (s.includes(":")) {
    const [mm, rest] = s.split(":");
    const minutes = Number(mm);
    const seconds = Number(rest);
    if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return null;
    return minutes * 60 + seconds;
  }

  // plain seconds
  const seconds = Number(s);
  if (!Number.isFinite(seconds)) return null;
  return seconds;
}

/**
 * Track: choose the single fastest rep time (minSec) and remember which set it occurred in.
 * Lift: choose the single highest weight (maxWeight) and remember which set it occurred in.
 */
function getCurrentBestFromSets(sets: EntrySetRow[] | null | undefined) {
  let minSec = Infinity;
  let minText: string | null = null;
  let minSet: number | null = null;

  let maxWeight = -Infinity;
  let maxReps: number | null = null;
  let maxSet: number | null = null;

  for (const s of sets ?? []) {
    const tt = (s.time_text ?? "").trim();
    if (tt) {
      const sec = parseTimeToSeconds(tt);
      if (sec != null && Number.isFinite(sec) && sec < minSec) {
        minSec = sec;
        minText = tt;
        minSet = s.set_number;
      }
    }

    if (s.weight != null) {
      const w = Number(s.weight);
      if (Number.isFinite(w) && w > maxWeight) {
        maxWeight = w;
        maxReps = s.reps ?? null;
        maxSet = s.set_number;
      }
    }
  }

  return {
    hasTrack: minSec !== Infinity,
    minSec: minSec === Infinity ? null : minSec,
    minText,
    minSet,

    hasLift: maxWeight !== -Infinity,
    maxWeight: maxWeight === -Infinity ? null : maxWeight,
    maxReps,
    maxSet,
  };
}

/**
 * Option 4:
 * Compute which entries in workoutId set a new PR vs that user's prior history up to that workout date.
 *
 * Track PR rule: new fastest single rep time
 * Lift PR rule: new highest single weight
 */
export async function computeNewPRsForWorkout(workoutId: string): Promise<PRHit[]> {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr) return [];

  const uid = userData.user?.id;
  if (!uid) return [];

  const { data: workout, error } = await supabase
    .from("workouts")
    .select(
      `
      id,
      user_id,
      workout_date,
      workout_entries(
        id,
        exercise_id,
        exercises:exercises!workout_entries_exercise_id_fkey(name),
        entry_sets(set_number, rep_number, time_text, reps, weight)
      )
    `
    )
    .eq("id", workoutId)
    .single();

  if (error || !workout) return [];
  if (workout.user_id !== uid) return [];

  const workoutDate: string = workout.workout_date;

  // Supabase nested results rarely perfectly match TS, so cast through unknown safely.
  const entries = (workout.workout_entries ?? []) as unknown as WorkoutEntryRow[];

  const exerciseIds = Array.from(
    new Set(entries.map((e) => e.exercise_id).filter((x): x is string => !!x))
  );
  if (!exerciseIds.length) return [];

  // Pull prior history for ALL these exercises in ONE query (scoped to this user)
  const { data: hist, error: histErr } = await supabase
    .from("workout_entries")
    .select(
      `
      id,
      exercise_id,
      workout_id,
      workouts!inner(user_id, workout_date),
      entry_sets(time_text, weight)
    `
    )
    .in("exercise_id", exerciseIds)
    .eq("workouts.user_id", uid)
    .neq("workout_id", workoutId)
    .lte("workouts.workout_date", workoutDate)
    .limit(5000);

  if (histErr) return [];

  // Build previous bests per exercise
  const prevBest: Record<
    string,
    { bestSec: number | null; bestWeight: number | null; hasTrack: boolean; hasLift: boolean }
  > = {};

  for (const row of (hist as any[]) ?? []) {
    const exId: string | null = row.exercise_id ?? null;
    if (!exId) continue;

    if (!prevBest[exId]) {
      prevBest[exId] = { bestSec: null, bestWeight: null, hasTrack: false, hasLift: false };
    }

    for (const s of (row.entry_sets ?? []) as any[]) {
      const tt = (s.time_text ?? "").trim();
      if (tt) {
        const sec = parseTimeToSeconds(tt);
        if (sec != null && Number.isFinite(sec)) {
          prevBest[exId].hasTrack = true;
          prevBest[exId].bestSec =
            prevBest[exId].bestSec == null ? sec : Math.min(prevBest[exId].bestSec, sec);
        }
      }

      if (s.weight != null) {
        const w = Number(s.weight);
        if (Number.isFinite(w)) {
          prevBest[exId].hasLift = true;
          prevBest[exId].bestWeight =
            prevBest[exId].bestWeight == null ? w : Math.max(prevBest[exId].bestWeight, w);
        }
      }
    }
  }

  const hits: PRHit[] = [];

  for (const e of entries) {
    if (!e.exercise_id) continue;

    const cur = getCurrentBestFromSets(e.entry_sets ?? null);
    const prev = prevBest[e.exercise_id];

    // Mode per entry: if it has any time_text => track else lift
    const mode: "track" | "lift" = cur.hasTrack ? "track" : "lift";

    if (mode === "track") {
      if (cur.minSec == null || !cur.minText) continue;

      const isPR = !prev || !prev.hasTrack || prev.bestSec == null ? true : cur.minSec < prev.bestSec;

      if (isPR) {
        hits.push({
          exercise_id: e.exercise_id,
          exercise_name: e.exercises?.name ?? "Exercise",
          mode: "track",
          best_time_text: cur.minText,
          best_time_sec: cur.minSec,
          entry_id: e.id,
          set_number: cur.minSet ?? undefined,
        });
      }
    } else {
      if (cur.maxWeight == null) continue;

      const isPR =
        !prev || !prev.hasLift || prev.bestWeight == null ? true : cur.maxWeight > prev.bestWeight;

      if (isPR) {
        hits.push({
          exercise_id: e.exercise_id,
          exercise_name: e.exercises?.name ?? "Exercise",
          mode: "lift",
          best_weight: cur.maxWeight,
          best_reps: cur.maxReps ?? null,
          entry_id: e.id,
          set_number: cur.maxSet ?? undefined,
        });
      }
    }
  }

  return hits;
}

/**
 * Option 3:
 * Persist PRs into exercise_prs for fast lookup.
 *
 * IMPORTANT:
 * This writes only the mode fields for the PR. It does NOT clear the other mode’s value.
 * If you want to store both track + lift for the same exercise_id, either:
 *  - split track/lift exercises into different exercise_id rows, OR
 *  - make exercise_prs store BOTH best_time_* and best_weight at the same time.
 *
 * This version keeps your earlier behavior: track hits write time fields; lift hits write weight fields.
 */
export async function upsertExercisePRs(hits: PRHit[]) {
  if (!hits.length) return;

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr) return;

  const uid = userData.user?.id;
  if (!uid) return;

  const rows = hits.map((h) => ({
    user_id: uid,
    exercise_id: h.exercise_id,

    best_time_sec: h.mode === "track" ? h.best_time_sec ?? null : null,
    best_time_text: h.mode === "track" ? h.best_time_text ?? null : null,

    best_weight: h.mode === "lift" ? h.best_weight ?? null : null,
    best_reps: h.mode === "lift" ? h.best_reps ?? null : null,

    updated_at: new Date().toISOString(),
  }));

  await supabase.from("exercise_prs").upsert(rows, { onConflict: "user_id,exercise_id" });
}