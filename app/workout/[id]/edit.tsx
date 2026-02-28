import { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, ActivityIndicator, Alert } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import PrimaryButton from "../../../components/PrimaryButton";
import FormScreen from "../../../components/FormScreen";
import { supabase } from "../../../lib/supabase";
import { useNavigation } from "@react-navigation/native";

type WorkoutRow = {
  id: string;
  title: string | null;
  notes: string | null;
  workout_type: "track" | "lift";
  workout_entries: EntryRow[] | null;
};

type EntryRow = {
  id: string;
  exercise_id: string | null;
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
  id?: string;  // DB id (existing rows)
  key: string;  // stable key for React list

  exercise_id?: string | null;
  exercise: string;
  sets: string;

  // track
  reps: string;
  timesApplicable: boolean;
  set_times: string[][];

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

function makeBlankEntry(): EntryDraft {
  return {
    key: `new-${Date.now()}-${Math.random()}`,
    id: undefined,
    exercise: "",
    sets: "1",
    reps: "",
    timesApplicable: true,
    set_times: [[]],
    lift_reps: [""],
    lift_weights: [""],
    weight: "",
    notes: "",
  };
}

export default function EditWorkout() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();

  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [workoutType, setWorkoutType] = useState<"track" | "lift">("track");
  const isLift = workoutType === "lift";

  const [entries, setEntries] = useState<EntryDraft[]>([]);
  const [deletedEntryIds, setDeletedEntryIds] = useState<string[]>([]);

  const [status, setStatus] = useState("Loading...");
  const [saving, setSaving] = useState(false);

  // unsaved changes guard
  const [initialSnapshot, setInitialSnapshot] = useState<string>("");

  const isDirty = useMemo(() => {
    if (!initialSnapshot) return false;
    const now = JSON.stringify({ title, notes, workoutType, entries, deletedEntryIds });
    return now !== initialSnapshot;
  }, [title, notes, workoutType, entries, deletedEntryIds, initialSnapshot]);

  useEffect(() => {
    const sub = navigation.addListener("beforeRemove", (e: any) => {
      if (!isDirty || saving) return;

      e.preventDefault();

      Alert.alert("Discard changes?", "You have unsaved changes.", [
        { text: "Keep editing", style: "cancel" },
        { text: "Discard", style: "destructive", onPress: () => navigation.dispatch(e.data.action) },
      ]);
    });

    return sub as any;
  }, [navigation, isDirty, saving]);

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
          exercise_id,
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

    const drafts: EntryDraft[] = (row.workout_entries ?? []).map((e) => {
      const setsN = e.sets ?? 1;

      // track
      const repsN = e.reps ?? 0;
      const timesApplicable = e.set_times !== null;
      const localTimes = Array.isArray(e.set_times)
        ? e.set_times
        : resizeSetTimes([[]], setsN, repsN);

      // lift arrays -> strings
      const liftRepsStr = (e.lift_reps ?? []).map((x) => (x == null ? "" : String(x)));
      const liftWeightsStr = (e.lift_weights ?? []).map((x) => (x == null ? "" : String(x)));

      return {
        id: e.id,
        key: e.id,
        exercise_id: (e as any).exercise_id ?? null,
        exercise: e.exercise ?? "",
        sets: String(setsN),

        reps: repsN ? String(repsN) : "",
        timesApplicable,
        set_times: localTimes,

        lift_reps: liftRepsStr.length ? liftRepsStr : [""],
        lift_weights: liftWeightsStr.length ? liftWeightsStr : [""],

        weight: e.weight == null ? "" : String(e.weight),
        notes: e.notes ?? "",
      };
    });

    const finalEntries = drafts.length ? drafts : [makeBlankEntry()];
    setEntries(finalEntries);
    setDeletedEntryIds([]);

    setStatus("Ready ✅");

    const snap = JSON.stringify({
      title: row.title ?? "",
      notes: row.notes ?? "",
      workoutType: row.workout_type,
      entries: finalEntries,
      deletedEntryIds: [],
    });
    setInitialSnapshot(snap);
  }

  useEffect(() => {
    load();
  }, [id]);

  function addEntry() {
    setEntries((prev) => [...prev, makeBlankEntry()]);
  }

  function removeEntry(index: number) {
    setEntries((prev) => {
      const target = prev[index];
      if (target?.id) {
        setDeletedEntryIds((ids) => [...ids, target.id!]);
      }
      const next = prev.filter((_, i) => i !== index);
      return next.length ? next : [makeBlankEntry()];
    });
  }

  function patchEntry(index: number, patch: Partial<EntryDraft>) {
    setEntries((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], ...patch };
      return copy;
    });
  }

  // --------- Track set/rep controls ----------
  function addTrackSet(index: number) {
    setEntries((prev) => {
      const copy = [...prev];
      const cur = copy[index];
      const setsN = Math.max(toPosInt(cur.sets), 1) + 1;
      const repsN = Math.max(toPosInt(cur.reps), 0);
      const nextTimes = resizeSetTimes(cur.set_times ?? [[]], setsN, repsN);
      copy[index] = { ...cur, sets: String(setsN), set_times: nextTimes };
      return copy;
    });
  }

  function removeTrackSet(index: number) {
    setEntries((prev) => {
      const copy = [...prev];
      const cur = copy[index];
      const setsN = Math.max(toPosInt(cur.sets), 1);
      const nextSets = Math.max(1, setsN - 1);
      const repsN = Math.max(toPosInt(cur.reps), 0);
      const nextTimes = resizeSetTimes(cur.set_times ?? [[]], nextSets, repsN);
      copy[index] = { ...cur, sets: String(nextSets), set_times: nextTimes };
      return copy;
    });
  }

  function addTrackRep(index: number) {
    setEntries((prev) => {
      const copy = [...prev];
      const cur = copy[index];
      const repsN = Math.max(toPosInt(cur.reps), 0) + 1;
      const setsN = Math.max(toPosInt(cur.sets), 1);
      const nextTimes = resizeSetTimes(cur.set_times ?? [[]], setsN, repsN);
      copy[index] = { ...cur, reps: String(repsN), set_times: nextTimes };
      return copy;
    });
  }

  function removeTrackRep(index: number) {
    setEntries((prev) => {
      const copy = [...prev];
      const cur = copy[index];
      const repsN = Math.max(toPosInt(cur.reps), 0);
      const nextReps = Math.max(0, repsN - 1);
      const setsN = Math.max(toPosInt(cur.sets), 1);
      const nextTimes = resizeSetTimes(cur.set_times ?? [[]], setsN, nextReps);
      copy[index] = { ...cur, reps: nextReps ? String(nextReps) : "", set_times: nextTimes };
      return copy;
    });
  }

  // --------- Lift set controls ----------
  function addLiftSet(index: number) {
    setEntries((prev) => {
      const copy = [...prev];
      const cur = copy[index];
      const setsN = Math.max(toPosInt(cur.sets), 1) + 1;
      copy[index] = {
        ...cur,
        sets: String(setsN),
        lift_reps: resizeFlat(cur.lift_reps ?? [""], setsN),
        lift_weights: resizeFlat(cur.lift_weights ?? [""], setsN),
      };
      return copy;
    });
  }

  function removeLiftSet(index: number) {
    setEntries((prev) => {
      const copy = [...prev];
      const cur = copy[index];
      const setsN = Math.max(toPosInt(cur.sets), 1);
      const nextSets = Math.max(1, setsN - 1);
      copy[index] = {
        ...cur,
        sets: String(nextSets),
        lift_reps: resizeFlat(cur.lift_reps ?? [""], nextSets),
        lift_weights: resizeFlat(cur.lift_weights ?? [""], nextSets),
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

  async function getOrCreateExerciseId(name: string) {
    const cleaned = name.trim();
    if (!cleaned) return null;
  
    const { data: existing, error: findErr } = await supabase
      .from("exercises")
      .select("exercise_id")
      .ilike("name", cleaned)
      .limit(1)
      .maybeSingle();
  
    if (findErr) throw findErr;
    if (existing?.exercise_id) return existing.exercise_id;
  
    const { data: created, error: insertErr } = await supabase
      .from("exercises")
      .insert([{ name: cleaned }])
      .select("exercise_id")
      .single();
  
    if (!insertErr) return created.exercise_id;
  
    // unique violation (race condition) -> retry fetch
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

      // 2) Build update/insert payloads
      const updates: any[] = [];
      const inserts: any[] = [];

      for (const e of entries) {
        const exercise = e.exercise.trim();
        if (!exercise) continue;

        const exercise_id = await getOrCreateExerciseId(exercise);

        const setsN = Math.max(toPosInt(e.sets), 1);

        if (workoutType === "lift") {
          const repsArr = (e.lift_reps ?? []).slice(0, setsN).map((x) => x.trim());
          const wArr = (e.lift_weights ?? []).slice(0, setsN).map((x) => x.trim());

          const lift_reps = repsArr.map((x) => (x ? parseInt(x, 10) : null));
          const lift_weights = wArr.map((x) => (x ? Number(x) : null));

          const row = {
            workout_id: id,
            exercise_id,
            exercise,
            sets: setsN,
            lift_reps,
            lift_weights,
            notes: e.notes.trim() || null,
          };

          if (e.id) updates.push({ id: e.id, ...row });
          else inserts.push(row);
        } else {
          const repsN = toPosInt(e.reps);
          const prevTimes = Array.isArray(e.set_times) ? e.set_times : [[]];

          const set_times = e.timesApplicable
            ? resizeSetTimes(prevTimes, setsN, Math.max(repsN, 0)).map((row) => row.map((t) => t.trim()))
            : null;

          const row = {
            workout_id: id,
            exercise_id,
            exercise,
            sets: setsN,
            reps: repsN || null,
            set_times,
            weight: e.weight.trim() ? Number(e.weight) : null,
            notes: e.notes.trim() || null,
          };

          if (e.id) updates.push({ id: e.id, ...row });
          else inserts.push(row);
        }
      }

      // 3) Delete only removed entries
      if (deletedEntryIds.length) {
        const { error: delErr } = await supabase
          .from("workout_entries")
          .delete()
          .in("id", deletedEntryIds);

        if (delErr) throw delErr;
      }

      // 4) Update existing rows
      for (const u of updates) {
        const { id: entryId, ...patch } = u;
        const { error } = await supabase
          .from("workout_entries")
          .update(patch)
          .eq("id", entryId);

        if (error) throw error;
      }

      // 5) Insert new rows
      if (inserts.length) {
        const { error: insErr } = await supabase.from("workout_entries").insert(inserts);
        if (insErr) throw insErr;
      }

      setStatus("Saved ✅");
      setDeletedEntryIds([]);

      const snap = JSON.stringify({
        title: trimmedTitle,
        notes,
        workoutType,
        entries,
        deletedEntryIds: [],
      });
      setInitialSnapshot(snap);

      router.back();
    } catch (e: any) {
      setStatus("Error: " + (e?.message ?? String(e)));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <FormScreen>
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
          <View key={entry.key} style={{ borderWidth: 1, borderRadius: 14, padding: 12, gap: 10 }}>
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

            {/* Sets + quick buttons */}
            <View style={{ gap: 8 }}>
              <TextInput
                value={entry.sets}
                onChangeText={(v) => patchEntry(index, { sets: v })}
                placeholder="Sets"
                keyboardType="numeric"
                placeholderTextColor={placeholderColor}
                style={inputStyle}
              />

              <View style={{ flexDirection: "row", gap: 10 }}>
                <PrimaryButton title="+ Set" onPress={() => (isLift ? addLiftSet(index) : addTrackSet(index))} />
                <PrimaryButton title="- Set" onPress={() => (isLift ? removeLiftSet(index) : removeTrackSet(index))} />
              </View>
            </View>

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
                  onChangeText={(v) => patchEntry(index, { reps: v })}
                  placeholder="Reps"
                  keyboardType="numeric"
                  placeholderTextColor={placeholderColor}
                  style={inputStyle}
                />

                <View style={{ flexDirection: "row", gap: 10 }}>
                  <PrimaryButton title="+ Rep" onPress={() => addTrackRep(index)} />
                  <PrimaryButton title="- Rep" onPress={() => removeTrackRep(index)} />
                </View>

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

        <PrimaryButton
          title="Cancel"
          onPress={() => {
            if (!isDirty) return router.back();

            Alert.alert("Discard changes?", "You have unsaved changes.", [
              { text: "Keep editing", style: "cancel" },
              { text: "Discard", style: "destructive", onPress: () => router.back() },
            ]);
          }}
        />
      </FormScreen>
    </>
  );
}