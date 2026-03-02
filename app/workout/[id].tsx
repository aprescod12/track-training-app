import { useEffect, useMemo, useState, useCallback } from "react";
import { View, Text, Modal, Pressable, ActivityIndicator } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import PrimaryButton from "../../components/PrimaryButton";
import { supabase } from "../../lib/supabase";
import FormScreen from "../../components/FormScreen";
import { useAppColors } from "../../lib/theme";

type Entry = {
  id: string;
  exercise_id: string | null;
  exercises?: { name: string } | null;
  exercise: string | null;
  sets: number | null;
  notes: string | null;
  reps: number | null;
  set_times: string[][] | null;
  lift_reps: (number | null)[] | null;
  lift_weights: (number | null)[] | null;
  weight: number | null;
};

type Workout = {
  id: string;
  workout_date: string;
  title: string;
  notes: string | null;
  workout_entries: Entry[];
};

function fmtNum(n: number | null | undefined) {
  if (n === null || n === undefined) return "";
  return String(n);
}

export default function WorkoutDetail() {
  const c = useAppColors();

  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const workoutId =
    typeof params.id === "string"
      ? params.id
      : Array.isArray(params.id)
      ? params.id[0]
      : undefined;

  const [item, setItem] = useState<Workout | null>(null);
  const [status, setStatus] = useState("Loading...");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!workoutId) return;
    setStatus("Loading...");

    const { data, error } = await supabase
      .from("workouts")
      .select(
        `
        id,
        workout_date,
        title,
        notes,
        workout_entries(
          id,
          exercise_id,
          exercises(name),
          exercise,
          sets,
          reps,
          set_times,
          lift_reps,
          lift_weights,
          weight,
          notes
        )
      `
      )
      .eq("id", workoutId)
      .single();

    if (error) {
      setStatus("Error: " + error.message);
      setItem(null);
      return;
    }

    setItem(data as any);
    setStatus("Loaded ✅");
  }, [workoutId]);

  useEffect(() => {
    load();
  }, [load]);

  const entries = useMemo(() => item?.workout_entries ?? [], [item]);

  return (
    <>
      <FormScreen edges={["left", "right"]}>
        <Text style={{ fontSize: 22, fontWeight: "800", color: c.text }}>Workout</Text>
        <Text style={{ color: c.subtext }}>{status}</Text>

        {item && (
          <>
            <View
              style={{
                borderWidth: 1,
                borderColor: c.border,
                backgroundColor: c.card,
                borderRadius: 14,
                padding: 12,
                gap: 8,
              }}
            >
              <Text style={{ fontWeight: "800", color: c.text }}>{item.title}</Text>
              <Text style={{ color: c.subtext }}>{item.workout_date}</Text>
              {!!item.notes && <Text style={{ color: c.text }}>{item.notes}</Text>}

              <View style={{ gap: 10, marginTop: 6 }}>
                <PrimaryButton title="Edit" onPress={() => router.push(`/workout/${item.id}/edit`)} />
                <PrimaryButton title="Delete" onPress={() => setConfirmOpen(true)} />
              </View>
            </View>

            <Text style={{ fontWeight: "800", color: c.text }}>Entries</Text>

            {entries.length ? (
              entries.map((e) => {
                const isLiftEntry = Array.isArray(e.lift_reps) || Array.isArray(e.lift_weights);
                const isTrackEntry = e.set_times !== undefined || e.reps !== undefined;

                return (
                  <View
                    key={e.id}
                    style={{
                      borderWidth: 1,
                      borderColor: c.border,
                      backgroundColor: c.card,
                      borderRadius: 14,
                      padding: 12,
                      gap: 6,
                    }}
                  >
                    <Text style={{ fontWeight: "700", color: c.text }}>
                      {e.exercises?.name ?? e.exercise ?? "Entry"}
                    </Text>

                    {e.sets !== null && <Text style={{ color: c.subtext }}>Sets: {e.sets}</Text>}

                    {isLiftEntry && (
                      <View style={{ gap: 6, marginTop: 2 }}>
                        <Text style={{ fontWeight: "800", color: c.text }}>Lift sets</Text>

                        {(e.lift_reps ?? []).map((r, idx) => {
                          const w = e.lift_weights?.[idx] ?? null;
                          if (r === null && w === null) return null;
                          return (
                            <Text key={idx} style={{ color: c.subtext }} numberOfLines={2}>
                              Set {idx + 1}: {r !== null ? `${r} reps` : "—"} {w !== null ? `@ ${fmtNum(w)}` : ""}
                            </Text>
                          );
                        })}
                      </View>
                    )}

                    {!isLiftEntry && isTrackEntry && (
                      <View style={{ gap: 6, marginTop: 2 }}>
                        {e.reps !== null && <Text style={{ color: c.subtext }}>Reps: {e.reps}</Text>}

                        {Array.isArray(e.set_times) && e.set_times.length ? (
                          <View style={{ gap: 6 }}>
                            <Text style={{ fontWeight: "800", color: c.text }}>Times</Text>
                            {e.set_times.map((row, sIdx) => (
                              <Text key={sIdx} style={{ color: c.subtext }} numberOfLines={3}>
                                Set {sIdx + 1}: {(row ?? []).filter(Boolean).join(" • ") || "—"}
                              </Text>
                            ))}
                          </View>
                        ) : (
                          <Text style={{ color: c.subtext }}>No times recorded.</Text>
                        )}

                        {e.weight !== null && <Text style={{ color: c.subtext }}>Weight: {fmtNum(e.weight)}</Text>}
                      </View>
                    )}

                    {!!e.notes && <Text style={{ color: c.subtext }}>{e.notes}</Text>}
                  </View>
                );
              })
            ) : (
              <Text style={{ color: c.subtext }}>No entries found.</Text>
            )}
          </>
        )}
      </FormScreen>

      <Modal visible={confirmOpen} transparent animationType="fade">
        <Pressable
          onPress={() => !deleting && setConfirmOpen(false)}
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.35)",
            justifyContent: "center",
            alignItems: "center",
            padding: 20,
          }}
        >
          <Pressable
            onPress={() => {}}
            style={{
              width: "100%",
              maxWidth: 420,
              backgroundColor: c.card,
              borderWidth: 1,
              borderColor: c.border,
              borderRadius: 16,
              padding: 18,
              gap: 14,
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: "800", color: c.text }}>Delete workout?</Text>
            <Text style={{ color: c.subtext }}>This will permanently delete the workout and all entries.</Text>

            {deleting && (
              <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                <ActivityIndicator />
                <Text style={{ color: c.text }}>Deleting…</Text>
              </View>
            )}

            <View style={{ gap: 10 }}>
              <PrimaryButton title="Cancel" onPress={() => setConfirmOpen(false)} disabled={deleting} />

              <PrimaryButton
                title="Delete permanently"
                disabled={deleting}
                onPress={async () => {
                  if (!workoutId) return;
                  try {
                    setDeleting(true);
                    setStatus("Deleting...");

                    const { error } = await supabase.from("workouts").delete().eq("id", workoutId);
                    if (error) {
                      setStatus("Error: " + error.message);
                      return;
                    }

                    setStatus("Deleted ✅");
                    setConfirmOpen(false);
                    router.replace("/(tabs)/log");
                  } finally {
                    setDeleting(false);
                  }
                }}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}