import { supabase } from "./supabase";

function inferDistanceM(name: string): number | null {
  const s = name.trim().toLowerCase();

  // "200m", "200 m", "200 meters"
  const m = s.match(/\b(\d+)\s*(m|meter|meters)\b/);
  if (m) return Number(m[1]);

  // "5k", "5 km", "5 kilometers"
  const km = s.match(/\b(\d+(?:\.\d+)?)\s*(k|km|kilometer|kilometers)\b/);
  if (km) return Math.round(Number(km[1]) * 1000);

  // "1 mile", "2.5 miles"
  const mi = s.match(/\b(\d+(?:\.\d+)?)\s*(mi|mile|miles)\b/);
  if (mi) return Math.round(Number(mi[1]) * 1609.344);

  return null;
}

export async function getOrCreateExerciseId(name: string): Promise<string | null> {
  const cleaned = name.trim();
  if (!cleaned) return null;

  // 1) Find (case-insensitive)
  const { data: existing, error: findErr } = await supabase
    .from("exercises")
    .select("exercise_id")
    .ilike("name", cleaned)
    .limit(1)
    .maybeSingle();

  if (findErr) throw findErr;
  if (existing?.exercise_id) return existing.exercise_id;

  // 2) Create (with inferred distance)
  const distance_m = inferDistanceM(cleaned);

  const { data: created, error: insertErr } = await supabase
    .from("exercises")
    .insert([{ name: cleaned, distance_m }])
    .select("exercise_id")
    .single();

  // success
  if (!insertErr) return created.exercise_id;

  // unique violation race -> refetch
  if (insertErr.code === "23505") {
    const { data: retry, error: retryErr } = await supabase
      .from("exercises")
      .select("exercise_id")
      .ilike("name", cleaned)
      .limit(1)
      .maybeSingle();

    if (retryErr) throw retryErr;
    if (!retry?.exercise_id) throw new Error("Exercise exists but could not be fetched.");
    return retry.exercise_id;
  }

  throw insertErr;
}