import { useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, Modal, Pressable, ActivityIndicator } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import PrimaryButton from "../../components/PrimaryButton";
import { supabase } from "../../lib/supabase";

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
  // keep simple; you can format decimals later
  return String(n);
}

export default function WorkoutDetail() {
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

  async function load() {
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
  }

  useEffect(() => {
    load();
  }, [workoutId]);

  const entries = useMemo(() => item?.workout_entries ?? [], [item]);

  return (
    <>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Text style={{ fontSize: 22, fontWeight: "800" }}>Workout</Text>
        <Text style={{ opacity: 0.7 }}>{status}</Text>

        {item && (
          <>
            <View style={{ borderWidth: 1, borderRadius: 14, padding: 12, gap: 8 }}>
              <Text style={{ fontWeight: "800" }}>{item.title}</Text>
              <Text style={{ opacity: 0.7 }}>{item.workout_date}</Text>
              {!!item.notes && <Text>{item.notes}</Text>}

              <View style={{ gap: 10, marginTop: 6 }}>
                <PrimaryButton
                  title="Edit"
                  onPress={() => router.push(`/workout/${item.id}/edit`)}
                />
                <PrimaryButton title="Delete" onPress={() => setConfirmOpen(true)} />
              </View>
            </View>

            <Text style={{ fontWeight: "800" }}>Entries</Text>

            {entries.length ? (
              entries.map((e) => {
                const isLiftEntry =
                  Array.isArray(e.lift_reps) ||
                  Array.isArray(e.lift_weights);

                const isTrackEntry =
                  e.set_times !== undefined || e.reps !== undefined;

                return (
                  <View
                    key={e.id}
                    style={{ borderWidth: 1, borderRadius: 14, padding: 12, gap: 6 }}
                  >
                    <Text style={{ fontWeight: "700" }}>
                      {e.exercises?.name ?? e.exercise ?? "Entry"}
                    </Text>

                    {/* Shared */}
                    {e.sets !== null && <Text style={{ opacity: 0.8 }}>Sets: {e.sets}</Text>}

                    {/* ---------- LIFT ---------- */}
                    {isLiftEntry && (
                      <View style={{ gap: 6, marginTop: 2 }}>
                        <Text style={{ fontWeight: "800" }}>Lift sets</Text>

                        {(e.lift_reps ?? []).map((r, idx) => {
                          const w = e.lift_weights?.[idx] ?? null;
                          const setNo = idx + 1;

                          // show only if at least one value exists
                          if (r === null && w === null) return null;

                          return (
                            <Text key={idx} style={{ opacity: 0.85 }}>
                              Set {setNo}: {r !== null ? `${r} reps` : "—"}{" "}
                              {w !== null ? `@ ${fmtNum(w)}` : ""}
                            </Text>
                          );
                        })}

                        {/* fallback if arrays were empty */}
                        {!((e.lift_reps ?? []).some((x) => x !== null) || (e.lift_weights ?? []).some((x) => x !== null)) && (
                          <Text style={{ opacity: 0.7 }}>No per-set lift data.</Text>
                        )}
                      </View>
                    )}

                    {/* ---------- TRACK ---------- */}
                    {!isLiftEntry && isTrackEntry && (
                      <View style={{ gap: 6, marginTop: 2 }}>
                        {e.reps !== null && (
                          <Text style={{ opacity: 0.8 }}>Reps: {e.reps}</Text>
                        )}

                        {/* times */}
                        {e.set_times === null ? (
                          <Text style={{ opacity: 0.8 }}>Times: N/A</Text>
                        ) : Array.isArray(e.set_times) && e.set_times.length ? (
                          <View style={{ gap: 6 }}>
                            <Text style={{ fontWeight: "800" }}>Times</Text>
                            {e.set_times.map((row, sIdx) => (
                              <View key={sIdx} style={{ gap: 2 }}>
                                <Text style={{ fontWeight: "700", opacity: 0.85 }}>
                                  Set {sIdx + 1}
                                </Text>
                                <Text style={{ opacity: 0.85 }}>
                                  {(row ?? [])
                                    .map((t, i) => (t?.trim() ? `Rep ${i + 1}: ${t}` : null))
                                    .filter(Boolean)
                                    .join("  •  ") || "—"}
                                </Text>
                              </View>
                            ))}
                          </View>
                        ) : (
                          <Text style={{ opacity: 0.7 }}>No times recorded.</Text>
                        )}

                        {e.weight !== null && (
                          <Text style={{ opacity: 0.8 }}>Weight: {fmtNum(e.weight)}</Text>
                        )}
                      </View>
                    )}

                    {!!e.notes && <Text style={{ opacity: 0.8 }}>{e.notes}</Text>}
                  </View>
                );
              })
            ) : (
              <Text style={{ opacity: 0.7 }}>No entries found.</Text>
            )}
          </>
        )}
      </ScrollView>

      {/* Delete confirm modal */}
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
              backgroundColor: "white",
              borderWidth: 1,
              borderRadius: 16,
              padding: 18,
              gap: 14,
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: "800" }}>Delete workout?</Text>

            <Text style={{ opacity: 0.75 }}>
              This will permanently delete the workout and all entries.
            </Text>

            {deleting && (
              <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                <ActivityIndicator />
                <Text>Deleting…</Text>
              </View>
            )}

            <View style={{ gap: 10 }}>
              <PrimaryButton
                title="Cancel"
                onPress={() => setConfirmOpen(false)}
                disabled={deleting}
              />

              <PrimaryButton
                title="Delete permanently"
                disabled={deleting}
                onPress={async () => {
                  if (!workoutId) return;

                  try {
                    setDeleting(true);
                    setStatus("Deleting...");

                    const { error } = await supabase
                      .from("workouts")
                      .delete()
                      .eq("id", workoutId);

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