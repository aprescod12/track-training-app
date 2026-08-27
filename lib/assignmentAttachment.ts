import { supabase } from "./supabase";
import type { AssignmentOutcome } from "./training";

const client = supabase as any;

export type PersonalWorkoutCandidate = {
  id: string;
  workout_date: string;
  title: string;
  workout_type: "track" | "lift";
  notes: string | null;
};

export async function getPersonalWorkoutCandidates(date: string) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const uid = userData.user?.id;
  if (!uid) return [] as PersonalWorkoutCandidate[];

  const { data, error } = await client
    .from("workouts")
    .select("id, workout_date, title, workout_type, notes")
    .eq("user_id", uid)
    .is("team_id", null)
    .eq("workout_date", date)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return ((data ?? []) as any[]).map((row) => ({
    id: String(row.id),
    workout_date: String(row.workout_date),
    title: String(row.title),
    workout_type: row.workout_type === "lift" ? "lift" : "track",
    notes: row.notes ?? null,
  })) as PersonalWorkoutCandidate[];
}

export async function attachWorkoutToAssignment(params: {
  recipientId: string;
  workoutId: string;
  completionStatus: Extract<AssignmentOutcome, "completed" | "partially_completed" | "modified">;
  athleteNote?: string | null;
}) {
  const { data, error } = await client.rpc("attach_workout_to_assignment", {
    p_assignment_recipient_id: params.recipientId,
    p_workout_id: params.workoutId,
    p_completion_status: params.completionStatus,
    p_athlete_note: params.athleteNote?.trim() || null,
  });

  if (error) throw error;
  return data as string;
}
