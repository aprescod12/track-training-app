import { supabase } from "./supabase";

export type ExerciseScoreType = "max_weight" | "min_time" | "max_reps";
export type ExerciseCategory = "track" | "lift" | "other";

function inferDistanceM(name: string): number | null {
  const s = name.trim().toLowerCase();

  const m = s.match(/\b(\d+)\s*(m|meter|meters)\b/);
  if (m) return Number(m[1]);

  const km = s.match(/\b(\d+(?:\.\d+)?)\s*(k|km|kilometer|kilometers)\b/);
  if (km) return Math.round(Number(km[1]) * 1000);

  const mi = s.match(/\b(\d+(?:\.\d+)?)\s*(mi|mile|miles)\b/);
  if (mi) return Math.round(Number(mi[1]) * 1609.344);

  return null;
}

export async function findExerciseIdByName(name: string): Promise<string | null> {
  const cleaned = name.trim();
  if (!cleaned) return null;

  const { data, error } = await supabase
    .from("exercises")
    .select("exercise_id")
    .ilike("name", cleaned)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data?.exercise_id ?? null;
}

export async function searchExercisesByName(query: string) {
  const cleaned = query.trim();
  if (!cleaned) return [];

  const { data, error } = await supabase
    .from("exercises")
    .select("exercise_id, name, category, distance_m, score_type, created_by")
    .ilike("name", `%${cleaned}%`)
    .order("name")
    .limit(12);

  if (error) throw error;
  return data ?? [];
}

export async function createCustomExercise(input: {
  name: string;
  category: ExerciseCategory;
  score_type: ExerciseScoreType;
  distance_m?: number | null;
  created_by: string;
}): Promise<string> {
  const cleaned = input.name.trim();
  if (!cleaned) throw new Error("Exercise name is required.");

  const distance_m =
    input.category === "track"
      ? input.distance_m ?? inferDistanceM(cleaned)
      : null;

  const { data, error } = await supabase
    .from("exercises")
    .insert([
      {
        name: cleaned,
        category: input.category,
        score_type: input.score_type,
        distance_m,
        created_by: input.created_by,
      },
    ])
    .select("exercise_id")
    .single();

  if (error) throw error;
  return data.exercise_id;
}

export async function getOrCreateExerciseId(name: string): Promise<string | null> {
  return findExerciseIdByName(name);
}