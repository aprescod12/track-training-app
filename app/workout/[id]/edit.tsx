import { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { Stack, useLocalSearchParams, router } from "expo-router";
import PrimaryButton from "../../../components/PrimaryButton";
import { supabase } from "../../../lib/supabase";

type WorkoutRow = {
  id: string;
  title: string | null;
  notes: string | null;
  workout_type: "track" | "lift";
  workout_entries: EntryRow[] | null;
};

type EntryRow = {
  id: string;
  exercise: string | null;
  sets: number | null;
  reps: number | null;
  set_times: string[][] | null;
  lift_reps: (number | null)[] | null;
  lift_weights: (number | null)[] | null;
  weight: number | null;
  notes: string | null;
};

type EntryDraft = {
  exercise: string;

  sets: string;

  // track
  reps: string;
  timesApplicable: boolean;
  set_times: string[][]; // if timesApplicable=false, we still keep something local, but save null

  // lift
  lift_reps: string[];
  lift_weights: string[];

  // track optional
  weight: string;

  notes: string;
};

const placeholderColor = "#8A8A8A";
const inputStyle = {
  borderWidth: 1,
  borderRadius: 12,
  padding: 12,
  backgroundColor: "white",
  color: "black",
} as const;

function toPosInt(s: string) {
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function resizeFlat(arr: string[], n: number) {
  const next = arr.slice(0, n);
  while (next.length < n) next.push("");
  return next;
}

function resizeSetTimes(prev: string[][], setsN: number, repsN: number) {
  const next: string[][] = [];
  for (let s = 0; s < setsN; s++) {
    const existingRow = prev[s] ?? [];
    const row = existingRow.slice(0, repsN);
    while (row.length < repsN) row.push("");
    next.push(row);
  }
  return next;
}

export default function EditWorkout() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");

  const [workoutType, setWorkoutType] = useState<"track" | "lift">("track");
  const isLift = workoutType === "lift";

  const [entries, setEntries] = useState<EntryDraft[]>([]);
  const [status, setStatus] = useState("Loading...");
  const [saving, setSaving] = useState(false);

  async function load() {
    if (!id) return;

    setStatus("Loading...");

    const { data, error } = await supabase
      .from("workouts")
      .select(
        `
        id,
        title,
        notes,
        workout_type,
        workout_entries(
          id,
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
      .eq("id", id)
      .single();

    if (error) {
      setStatus("Error: " + error.message);
      return;
    }

    const row = data as unknown as WorkoutRow;

    setTitle(row.title ?? "");
    setNotes(row.notes ?? "");
    setWorkoutType(row.workout_type);

    const drafts: EntryDraft[] =
      (row.workout_entries ?? []).map((e) => {
        const setsN = e.sets ?? 1;

        // Track
        const repsN = e.reps ?? 0;
        const timesApplicable = e.set_times !== null; // if null => N/A
        const localTimes = Array.isArray(e.set_times)
          ? e.set_times
          : resizeSetTimes([[]], setsN, repsN);

        // Lift arrays (convert to strings)
        const liftRepsStr = (e.lift_reps ?? []).map((x) => (x === null || x === undefined ? "" : String(x)));
        const liftWeightsStr = (e.lift_weights ?? []).map((x) => (x === null || x === undefined ? "" : String(x)));

        return {
          exercise: e.exercise ?? "",
          sets: String(setsN),

          reps: String(repsN || ""),
          timesApplicable,
          set_times: localTimes,

          lift_reps: liftRepsStr.length ? liftRepsStr : [""],
          lift_weights: liftWeightsStr.length ? liftWeightsStr : [""],

          weight: e.weight === null || e.weight === undefined ? "" : String(e.weight),
          notes: e.notes ?? "",
        };
      }) ?? [];

    setEntries(drafts.length ? drafts : [
      {
        exercise: "",
        sets: "1",
        reps: "",
        timesApplicable: true,
        set_times: [[]],
        lift_reps: [""],
        lift_weights: [""],
        weight: "",
        notes: "",
      },
    ]);

    setStatus("Ready ✅");
  }

  useEffect(() => {
    load();
  }, [id]);

  function addEntry() {
    setEntries((prev) => [
      ...prev,
      {
        exercise: "",
        sets: "1",
        reps: "",
        timesApplicable: true,
        set_times: [[]],
        lift_reps: [""],
        lift_weights: [""],
        weight: "",
        notes: "",
      },
    ]);
  }

  function removeEntry(index: number) {
    setEntries((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.length ? next : [
        {
          exercise: "",
          sets: "1",
          reps: "",
          timesApplicable: true,
          set_times: [[]],
          lift_reps: [""],
          lift_weights: [""],
          weight: "",
          notes: "",
        },
      ];
    });
  }

  function patchEntry(index: number, patch: Partial<EntryDraft>) {
    setEntries((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], ...patch };
      return copy;
    });
  }

  function updateTrackSetsOrReps(index: number, key: "sets" | "reps", value: string) {
    setEntries((prev) => {
      const copy = [...prev];
      const cur = copy[index];
      const next = { ...cur, [key]: value };

      const setsN = Math.max(toPosInt(next.sets), 1);
      const repsN = Math.max(toPosInt(next.reps), 0);

      // if times applicable, maintain shape; if not, keep local times minimal
      const prevTimes = Array.isArray(next.set_times) ? next.set_times : [[]];
      next.set_times = resizeSetTimes(prevTimes, setsN, repsN);

      copy[index] = next;
      return copy;
    });
  }

  function updateLiftSets(index: number, value: string) {
    setEntries((prev) => {
      const copy = [...prev];
      const cur = copy[index];
      const setsN = Math.max(toPosInt(value), 1);

      copy[index] = {
        ...cur,
        sets: value,
        lift_reps: resizeFlat(cur.lift_reps ?? [""], setsN),
        lift_weights: resizeFlat(cur.lift_weights ?? [""], setsN),
      };
      return copy;
    });
  }

  function updateLiftArray(index: number, key: "lift_reps" | "lift_weights", setIdx: number, value: string) {
    setEntries((prev) => {
      const copy = [...prev];
      const cur = copy[index];
      const arr = [...(cur[key] ?? [])];
      arr[setIdx] = value;
      copy[index] = { ...cur, [key]: arr };
      return copy;
    });
  }

  async function save() {
    if (!id) return;

    try {
      setSaving(true);
      setStatus("Saving...");

      const trimmedTitle = title.trim() || "Workout";

      // 1) Update workout
      const { error: wErr } = await supabase
        .from("workouts")
        .update({ title: trimmedTitle, notes })
        .eq("id", id);

      if (wErr) throw wErr;

      // 2) Replace entries (MVP approach)
      const { error: delErr } = await supabase
        .from("workout_entries")
        .delete()
        .eq("workout_id", id);

      if (delErr) throw delErr;

      // 3) Build payload
      const cleanedEntries = entries
        .map((e) => {
          const setsN = Math.max(toPosInt(e.sets), 1);
          const exercise = e.exercise.trim();
          if (!exercise) return null;

          if (workoutType === "lift") {
            const repsArr = (e.lift_reps ?? []).slice(0, setsN).map((x) => x.trim());
            const wArr = (e.lift_weights ?? []).slice(0, setsN).map((x) => x.trim());

            const lift_reps = repsArr.map((x) => (x ? parseInt(x, 10) : null));
            const lift_weights = wArr.map((x) => (x ? Number(x) : null));

            return {
              workout_id: id,
              exercise,
              sets: setsN,
              lift_reps,
              lift_weights,
              notes: e.notes.trim() || null,
            };
          } else {
            const repsN = toPosInt(e.reps);
            const prevTimes = Array.isArray(e.set_times) ? e.set_times : [[]];

            const set_times = e.timesApplicable
              ? resizeSetTimes(prevTimes, setsN, repsN).map((row) => row.map((t) => t.trim()))
              : null;

            return {
              workout_id: id,
              exercise,
              sets: setsN,
              reps: repsN || null,
              set_times,
              weight: e.weight.trim() ? Number(e.weight) : null,
              notes: e.notes.trim() || null,
            };
          }
        })
        .filter(Boolean) as any[];

      if (cleanedEntries.length) {
        const { error: insErr } = await supabase.from("workout_entries").insert(cleanedEntries);
        if (insErr) throw insErr;
      }

      setStatus("Saved ✅");
      router.back();
    } catch (e: any) {
      setStatus("Error: " + (e?.message ?? String(e)));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: "Edit Workout" }} />

      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Text style={{ opacity: 0.7 }}>{status}</Text>

        <Text style={{ fontWeight: "800" }}>Title</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Workout title"
          placeholderTextColor={placeholderColor}
          style={inputStyle}
        />

        <Text style={{ fontWeight: "800" }}>Notes</Text>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder="Notes"
          multiline
          placeholderTextColor={placeholderColor}
          style={[inputStyle, { minHeight: 80 }]}
        />

        <Text style={{ fontWeight: "800" }}>Entries</Text>

        {entries.map((entry, index) => (
          <View key={index} style={{ borderWidth: 1, borderRadius: 14, padding: 12, gap: 10 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ fontWeight: "800" }}>Entry {index + 1}</Text>
              <Pressable onPress={() => removeEntry(index)}>
                <Text style={{ color: "red", fontWeight: "700" }}>Remove</Text>
              </Pressable>
            </View>

            <TextInput
              value={entry.exercise}
              onChangeText={(v) => patchEntry(index, { exercise: v })}
              placeholder="Exercise"
              placeholderTextColor={placeholderColor}
              style={inputStyle}
            />

            <TextInput
              value={entry.sets}
              onChangeText={(v) => {
                if (isLift) updateLiftSets(index, v);
                else updateTrackSetsOrReps(index, "sets", v);
              }}
              placeholder="Sets"
              keyboardType="numeric"
              placeholderTextColor={placeholderColor}
              style={inputStyle}
            />

            {isLift ? (
              <View style={{ gap: 10 }}>
                <Text style={{ fontWeight: "800" }}>Per-set log</Text>

                <View style={{ flexDirection: "row", gap: 8 }}>
                  {(entry.lift_reps ?? []).map((val, sIdx) => (
                    <TextInput
                      key={`r-${sIdx}`}
                      value={val}
                      onChangeText={(v) => updateLiftArray(index, "lift_reps", sIdx, v)}
                      placeholder="Reps"
                      keyboardType="numeric"
                      placeholderTextColor={placeholderColor}
                      style={[inputStyle, { flex: 1, textAlign: "center" }]}
                    />
                  ))}
                </View>

                <View style={{ flexDirection: "row", gap: 8 }}>
                  {(entry.lift_weights ?? []).map((val, sIdx) => (
                    <TextInput
                      key={`w-${sIdx}`}
                      value={val}
                      onChangeText={(v) => updateLiftArray(index, "lift_weights", sIdx, v)}
                      placeholder="Weight"
                      keyboardType="numeric"
                      placeholderTextColor={placeholderColor}
                      style={[inputStyle, { flex: 1, textAlign: "center" }]}
                    />
                  ))}
                </View>
              </View>
            ) : (
              <View style={{ gap: 10 }}>
                <TextInput
                  value={entry.reps}
                  onChangeText={(v) => updateTrackSetsOrReps(index, "reps", v)}
                  placeholder="Reps"
                  keyboardType="numeric"
                  placeholderTextColor={placeholderColor}
                  style={inputStyle}
                />

                {/* times toggle */}
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <Pressable
                    onPress={() => {
                      const setsN = Math.max(toPosInt(entry.sets), 1);
                      const repsN = Math.max(toPosInt(entry.reps), 0);
                      const prevTimes = Array.isArray(entry.set_times) ? entry.set_times : [[]];
                      const rebuilt = resizeSetTimes(prevTimes, setsN, repsN);

                      patchEntry(index, { timesApplicable: true, set_times: rebuilt });
                    }}
                    style={{
                      flex: 1,
                      borderWidth: 1,
                      borderRadius: 999,
                      paddingVertical: 8,
                      alignItems: "center",
                      backgroundColor: entry.timesApplicable ? "black" : "transparent",
                    }}
                  >
                    <Text style={{ fontWeight: "700", color: entry.timesApplicable ? "white" : "black" }}>
                      Times Applicable
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => patchEntry(index, { timesApplicable: false, set_times: [[]] })}
                    style={{
                      flex: 1,
                      borderWidth: 1,
                      borderRadius: 999,
                      paddingVertical: 8,
                      alignItems: "center",
                      backgroundColor: !entry.timesApplicable ? "black" : "transparent",
                    }}
                  >
                    <Text style={{ fontWeight: "700", color: !entry.timesApplicable ? "white" : "black" }}>
                      Times Not Applicable
                    </Text>
                  </Pressable>
                </View>

                {/* show set_times only if applicable */}
                {entry.timesApplicable && (
                  <View style={{ gap: 8 }}>
                    <Text style={{ fontWeight: "800" }}>Times</Text>
                    {entry.set_times.map((row, sIdx) => (
                      <View key={sIdx} style={{ gap: 6 }}>
                        <Text style={{ fontWeight: "700" }}>Set {sIdx + 1}</Text>
                        {row.map((t, repIdx) => (
                          <TextInput
                            key={repIdx}
                            value={t}
                            onChangeText={(v) => {
                              const next = entry.set_times.map((r) => [...r]);
                              next[sIdx][repIdx] = v;
                              patchEntry(index, { set_times: next });
                            }}
                            placeholder={`Rep ${repIdx + 1} time`}
                            placeholderTextColor={placeholderColor}
                            style={inputStyle}
                          />
                        ))}
                      </View>
                    ))}
                  </View>
                )}

                <TextInput
                  value={entry.weight}
                  onChangeText={(v) => patchEntry(index, { weight: v })}
                  placeholder="Weight (optional)"
                  keyboardType="numeric"
                  placeholderTextColor={placeholderColor}
                  style={inputStyle}
                />
              </View>
            )}

            <TextInput
              value={entry.notes}
              onChangeText={(v) => patchEntry(index, { notes: v })}
              placeholder="Entry notes (optional)"
              placeholderTextColor={placeholderColor}
              style={inputStyle}
            />
          </View>
        ))}

        <PrimaryButton title="Add entry" onPress={addEntry} />

        <Pressable
          onPress={save}
          disabled={saving}
          style={{
            borderWidth: 1,
            borderRadius: 12,
            padding: 14,
            alignItems: "center",
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? (
            <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
              <ActivityIndicator />
              <Text style={{ fontSize: 16, fontWeight: "600" }}>Saving…</Text>
            </View>
          ) : (
            <Text style={{ fontSize: 16, fontWeight: "600" }}>Save changes</Text>
          )}
        </Pressable>

        <PrimaryButton title="Cancel" onPress={() => router.back()} />
      </ScrollView>
    </>
  );
}