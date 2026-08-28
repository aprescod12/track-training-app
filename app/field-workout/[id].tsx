import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import FormScreen from "../../components/FormScreen";
import { supabase } from "../../lib/supabase";
import { useAppColors } from "../../lib/theme";
import {
  fieldEventLabel,
  isVerticalJump,
  trainingDomainLabel,
  type FieldAttemptOutcome,
} from "../../lib/trainingDomains";

type FieldAttempt = {
  id: string;
  attempt_number: number;
  mark_m: number | null;
  outcome: FieldAttemptOutcome;
  notes: string | null;
};

type FieldEntry = {
  id: string;
  event_code: string | null;
  implement_weight_kg: number | null;
  notes: string | null;
  exercise: string | null;
  exercises: { name: string } | null;
  field_attempts: FieldAttempt[] | null;
};

type FieldWorkout = {
  id: string;
  user_id: string;
  workout_date: string;
  title: string;
  notes: string | null;
  workout_type: string;
  workout_entries: FieldEntry[];
};

function prettyDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function outcomeLabel(outcome: FieldAttemptOutcome) {
  if (outcome === "unmeasured") return "Unmeasured";
  return outcome.charAt(0).toUpperCase() + outcome.slice(1);
}

export default function FieldWorkoutDetailScreen() {
  const c = useAppColors();
  const params = useLocalSearchParams<{
    id?: string | string[];
    saved?: string | string[];
    trainingBest?: string | string[];
  }>();
  const workoutId = Array.isArray(params.id) ? params.id[0] : params.id;
  const trainingBest = Array.isArray(params.trainingBest)
    ? params.trainingBest[0]
    : params.trainingBest;

  const [workout, setWorkout] = useState<FieldWorkout | null>(null);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!workoutId) return;
    setLoading(true);
    setError(null);
    try {
      const { data: userData } = await supabase.auth.getUser();
      setViewerId(userData.user?.id ?? null);

      const { data, error: workoutError } = await supabase
        .from("workouts")
        .select(
          `
          id,
          user_id,
          workout_date,
          title,
          notes,
          workout_type,
          workout_entries(
            id,
            event_code,
            implement_weight_kg,
            notes,
            exercise,
            exercises(name),
            field_attempts(id, attempt_number, mark_m, outcome, notes)
          )
        `
        )
        .eq("id", workoutId)
        .single();

      if (workoutError) throw workoutError;
      setWorkout(data as unknown as FieldWorkout);
    } catch (loadError: any) {
      setWorkout(null);
      setError(loadError?.message ?? String(loadError));
    } finally {
      setLoading(false);
    }
  }, [workoutId]);

  useEffect(() => {
    load();
  }, [load]);

  const isOwner = !!workout && viewerId === workout.user_id;
  const entries = useMemo(() => workout?.workout_entries ?? [], [workout]);

  async function deleteWorkout() {
    if (!workout || !isOwner || deleting) return;
    setDeleting(true);
    setError(null);
    try {
      const { error: deleteError } = await supabase.from("workouts").delete().eq("id", workout.id);
      if (deleteError) throw deleteError;
      router.replace("/(tabs)/log");
    } catch (deleteError: any) {
      setError(deleteError?.message ?? String(deleteError));
      setDeleting(false);
    }
  }

  return (
    <FormScreen contentContainerStyle={{ width: "100%", maxWidth: 820, alignSelf: "center" }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <Text style={{ fontSize: 22, fontWeight: "900", color: c.text }}>Field workout</Text>
        <Pressable onPress={() => router.back()} style={{ paddingHorizontal: 10, paddingVertical: 6 }}>
          <Text style={{ color: c.subtext, fontWeight: "700" }}>Back</Text>
        </Pressable>
      </View>

      {trainingBest && (
        <View
          style={{
            borderWidth: 1,
            borderColor: c.border,
            backgroundColor: c.card,
            borderRadius: 14,
            padding: 12,
            gap: 2,
          }}
        >
          <Text style={{ color: c.text, fontWeight: "900" }}>🏆 New training best</Text>
          <Text style={{ color: c.subtext }}>{Number(trainingBest).toFixed(2)} m</Text>
        </View>
      )}

      {error && <Text style={{ color: "#ef4444", fontWeight: "700" }}>{error}</Text>}

      {loading ? (
        <View style={{ alignItems: "center", paddingVertical: 24, gap: 8 }}>
          <ActivityIndicator />
          <Text style={{ color: c.subtext }}>Loading workout…</Text>
        </View>
      ) : workout ? (
        <>
          <View
            style={{
              borderWidth: 1,
              borderColor: c.border,
              backgroundColor: c.card,
              borderRadius: 16,
              padding: 14,
              gap: 7,
            }}
          >
            <Text style={{ color: c.text, fontSize: 20, fontWeight: "900" }}>{workout.title}</Text>
            <Text style={{ color: c.subtext }}>{prettyDate(workout.workout_date)}</Text>
            <Text style={{ color: c.subtext, fontWeight: "700" }}>
              {trainingDomainLabel(workout.workout_type)}
            </Text>
            {!!workout.notes && <Text style={{ color: c.text }}>{workout.notes}</Text>}
          </View>

          {entries.map((entry) => {
            const attempts = [...(entry.field_attempts ?? [])].sort(
              (a, b) => a.attempt_number - b.attempt_number
            );
            const vertical = isVerticalJump(entry.event_code);
            const validMarks = attempts
              .filter((attempt) => attempt.outcome === "valid" || attempt.outcome === "clear")
              .map((attempt) => attempt.mark_m)
              .filter((mark): mark is number => mark != null);
            const bestMark = validMarks.length ? Math.max(...validMarks) : null;

            return (
              <View
                key={entry.id}
                style={{
                  borderWidth: 1,
                  borderColor: c.border,
                  backgroundColor: c.card,
                  borderRadius: 16,
                  padding: 14,
                  gap: 12,
                }}
              >
                <View style={{ gap: 4 }}>
                  <Text style={{ color: c.text, fontSize: 18, fontWeight: "900" }}>
                    {fieldEventLabel(entry.event_code) || entry.exercises?.name || entry.exercise || "Field Event"}
                  </Text>
                  {entry.implement_weight_kg != null && (
                    <Text style={{ color: c.subtext, fontWeight: "700" }}>
                      {entry.implement_weight_kg} kg implement
                    </Text>
                  )}
                  {bestMark != null && (
                    <Text style={{ color: c.subtext }}>
                      Best {vertical ? "clear" : "mark"}: {bestMark.toFixed(2)} m
                    </Text>
                  )}
                  {!!entry.notes && <Text style={{ color: c.text }}>{entry.notes}</Text>}
                </View>

                <View style={{ gap: 8 }}>
                  {attempts.map((attempt) => (
                    <View
                      key={attempt.id}
                      style={{
                        borderWidth: 1,
                        borderColor: c.border,
                        backgroundColor: c.bg,
                        borderRadius: 12,
                        padding: 11,
                        gap: 4,
                      }}
                    >
                      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
                        <Text style={{ color: c.text, fontWeight: "800" }}>
                          Attempt {attempt.attempt_number}
                        </Text>
                        <Text style={{ color: c.subtext, fontWeight: "800" }}>
                          {outcomeLabel(attempt.outcome)}
                        </Text>
                      </View>
                      {attempt.mark_m != null && (
                        <Text style={{ color: c.text, fontSize: 17, fontWeight: "900" }}>
                          {attempt.mark_m.toFixed(2)} m
                        </Text>
                      )}
                      {!!attempt.notes && <Text style={{ color: c.subtext }}>{attempt.notes}</Text>}
                    </View>
                  ))}
                </View>
              </View>
            );
          })}

          {isOwner && (
            <Pressable
              onPress={deleteWorkout}
              disabled={deleting}
              style={{
                borderWidth: 1,
                borderColor: c.border,
                backgroundColor: c.card,
                borderRadius: 14,
                padding: 13,
                alignItems: "center",
                opacity: deleting ? 0.6 : 1,
              }}
            >
              <Text style={{ color: "#ef4444", fontWeight: "800" }}>
                {deleting ? "Deleting…" : "Delete workout"}
              </Text>
            </Pressable>
          )}
        </>
      ) : (
        <Text style={{ color: c.subtext }}>Workout not found or not visible to this account.</Text>
      )}
    </FormScreen>
  );
}
