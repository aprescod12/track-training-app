import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  Animated,
  Easing,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import PrimaryButton from "../components/PrimaryButton";
import FormScreen from "../components/FormScreen";
import { supabase } from "../lib/supabase";
import { formatYMD } from "../lib/date";

type ToastState = { open: boolean; message: string };

// ---- Shared input styling (dark-mode safe) ----
const placeholderColor = "#8A8A8A";
const inputStyle = {
  borderWidth: 1,
  borderRadius: 12,
  padding: 12,
  backgroundColor: "white",
  color: "black",
} as const;

type EntryDraft = {
  exercise: string;

  // shared
  sets: string;
  notes: string;

  // track
  reps: string;
  set_times: string[][];
  activeSet: number;
  timesApplicable: boolean;

  // lift (per set)
  lift_reps: string[];
  lift_weights: string[];

  // optional track-only weight (sled/medball/etc.)
  weight: string;
};

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

export default function ModalScreen() {
  const params = useLocalSearchParams<{ date?: string }>();

  const [date] = useState(() =>
    typeof params.date === "string" ? params.date : formatYMD(new Date())
  );

  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [workoutType, setWorkoutType] = useState<"track" | "lift">("track");
  const isLift = workoutType === "lift";

  const [entries, setEntries] = useState<EntryDraft[]>([
    {
      exercise: "",
      sets: "",
      notes: "",
      reps: "",
      set_times: [[]],
      activeSet: 0,
      lift_reps: [""],
      lift_weights: [""],
      weight: "",
      timesApplicable: true,
    },
  ]);

  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [toast, setToast] = useState<ToastState>({
    open: false,
    message: "Workout saved",
  });

  // --- Toast animation ---
  const translateY = useRef(new Animated.Value(30)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  const showToast = (message: string) => {
    setToast({ open: true, message });
    translateY.setValue(30);
    opacity.setValue(0);

    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 160,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  };

  const hideToast = () => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: 140,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 18,
        duration: 140,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(() => setToast((t) => ({ ...t, open: false })));
  };

  useEffect(() => {
    if (!toast.open) return;
    const t = setTimeout(() => {
      hideToast();
      router.replace("/(tabs)/log");
    }, 900);
    return () => clearTimeout(t);
  }, [toast.open]);

  function addEntry() {
    setEntries((prev) => [
      ...prev,
      {
        exercise: "",
        sets: "",
        notes: "",
        reps: "",
        set_times: [[]],
        activeSet: 0,
        lift_reps: [""],
        lift_weights: [""],
        weight: "",
        timesApplicable: true,
      },
    ]);
  }

  function removeEntry(index: number) {
    setEntries((prev) => {
      const copy = prev.filter((_, i) => i !== index);
      return copy.length
        ? copy
        : [
            {
              exercise: "",
              sets: "",
              notes: "",
              reps: "",
              set_times: [[]],
              activeSet: 0,
              lift_reps: [""],
              lift_weights: [""],
              weight: "",
              timesApplicable: true,
            },
          ];
    });
  }

  function updateEntryField(index: number, patch: Partial<EntryDraft>) {
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

      const prevTimes = Array.isArray(next.set_times) ? next.set_times : [[]];
      next.set_times = resizeSetTimes(prevTimes, setsN, repsN);

      const maxSetIndex = Math.max(0, setsN - 1);
      next.activeSet = Math.min(next.activeSet ?? 0, maxSetIndex);

      copy[index] = next;
      return copy;
    });
  }

  function updateLiftSets(index: number, setsValue: string) {
    setEntries((prev) => {
      const copy = [...prev];
      const cur = copy[index];
      const next = { ...cur, sets: setsValue };

      const setsN = Math.max(toPosInt(setsValue), 1);
      next.lift_reps = resizeFlat(next.lift_reps ?? [""], setsN);
      next.lift_weights = resizeFlat(next.lift_weights ?? [""], setsN);

      copy[index] = next;
      return copy;
    });
  }

  function updateLiftArray(
    index: number,
    key: "lift_reps" | "lift_weights",
    setIdx: number,
    value: string
  ) {
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
  
    // 1) Try find existing (case-insensitive)
    const { data: existing, error: findErr } = await supabase
      .from("exercises")
      .select("exercise_id,name")
      .ilike("name", cleaned)
      .limit(1)
      .maybeSingle();
  
    if (findErr) throw findErr;
    if (existing?.exercise_id) return existing.exercise_id;
  
    // 2) Create
    const { data: created, error: insErr } = await supabase
      .from("exercises")
      .insert([{ name: cleaned }])
      .select("exercise_id")
      .single();
  
    if (insErr) throw insErr;
    return created.exercise_id;
  }

  async function saveWorkout() {
    try {
      setSaving(true);
      setStatus(null);

      const trimmedTitle = title.trim() || "Workout";

      const { data: workout, error: wErr } = await supabase
        .from("workouts")
        .insert({
          workout_date: date,
          title: trimmedTitle,
          notes,
          workout_type: workoutType,
        })
        .select("id")
        .single();

      if (wErr) throw wErr;
      if (!workout?.id) throw new Error("Workout insert failed (no id returned).");

      const cleanedEntries = entries
        .map((e) => {
          const setsN = Math.max(toPosInt(e.sets), 1);

          if (workoutType === "lift") {
            const repsArr = (e.lift_reps ?? []).slice(0, setsN).map((x) => x.trim());
            const wArr = (e.lift_weights ?? []).slice(0, setsN).map((x) => x.trim());

            const lift_reps = repsArr.map((x) => (x ? parseInt(x, 10) : null));
            const lift_weights = wArr.map((x) => (x ? Number(x) : null));

            return {
              exercise: e.exercise.trim() || null,
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
              exercise: e.exercise.trim() || null,
              sets: setsN,
              reps: repsN || null,
              set_times,
              weight: e.weight.trim() ? Number(e.weight) : null,
              notes: e.notes.trim() || null,
            };
          }
        })
        .filter((row) => row.exercise);

        if (cleanedEntries.length) {
          // Create/link exercises first
          const payload = [];
        
          for (const e of cleanedEntries) {
            const exId = await getOrCreateExerciseId(e.exercise ?? "");
            payload.push({
              workout_id: workout.id,
              exercise_id: exId,              
              ...e,
            });
          }
        
          const { error: eErr } = await supabase.from("workout_entries").insert(payload);
          if (eErr) throw eErr;
        }

      showToast("Workout saved ✅");
    } catch (e: any) {
      setStatus(`Error: ${e?.message ?? String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <FormScreen>
        <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
          <Pressable
            onPress={() => router.back()}
            style={{
              borderWidth: 1,
              borderRadius: 999,
              paddingVertical: 6,
              paddingHorizontal: 14,
            }}
          >
            <Text style={{ fontWeight: "600" }}>Cancel</Text>
          </Pressable>
        </View>

        <Text style={{ fontSize: 22, fontWeight: "800" }}>
          {isLift ? "Log Lift" : "Log Track"}
        </Text>

        <View style={{ flexDirection: "row", gap: 10 }}>
          <Pressable
            onPress={() => setWorkoutType("track")}
            style={{
              flex: 1,
              borderWidth: 1,
              borderRadius: 999,
              paddingVertical: 10,
              alignItems: "center",
              backgroundColor: workoutType === "track" ? "black" : "transparent",
            }}
          >
            <Text style={{ fontWeight: "700", color: workoutType === "track" ? "white" : "black" }}>
              Track
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setWorkoutType("lift")}
            style={{
              flex: 1,
              borderWidth: 1,
              borderRadius: 999,
              paddingVertical: 10,
              alignItems: "center",
              backgroundColor: workoutType === "lift" ? "black" : "transparent",
            }}
          >
            <Text style={{ fontWeight: "700", color: workoutType === "lift" ? "white" : "black" }}>
              Lift
            </Text>
          </Pressable>
        </View>

        <Text style={{ opacity: 0.7 }}>Date</Text>
        <Text style={{ fontWeight: "700" }}>{date}</Text>

        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Workout Title"
          placeholderTextColor={placeholderColor}
          style={inputStyle}
        />

        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder="Notes (optional)"
          multiline
          placeholderTextColor={placeholderColor}
          style={[inputStyle, { minHeight: 80 }]}
        />

        <Text style={{ fontWeight: "700" }}>Entries</Text>

        {entries.map((entry, index) => (
          <View
            key={index}
            style={{ borderWidth: 1, borderRadius: 14, padding: 12, gap: 10 }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ fontWeight: "800" }}>Entry {index + 1}</Text>
              <Pressable onPress={() => removeEntry(index)}>
                <Text style={{ color: "red", fontWeight: "700" }}>Remove</Text>
              </Pressable>
            </View>

            <TextInput
              value={entry.exercise}
              onChangeText={(v) => updateEntryField(index, { exercise: v })}
              placeholder={isLift ? "Exercise (e.g., Bench Press)" : "Exercise (e.g., 4x30m blocks)"}
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

                <TextInput
                  value={entry.notes}
                  onChangeText={(v) => updateEntryField(index, { notes: v })}
                  placeholder="Entry notes (optional)"
                  placeholderTextColor={placeholderColor}
                  style={inputStyle}
                />
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

                <View style={{ flexDirection: "row", gap: 10 }}>
                  <Pressable
                    onPress={() => {
                      const setsN = Math.max(toPosInt(entry.sets), 1);
                      const repsN = Math.max(toPosInt(entry.reps), 0);
                      const prevTimes = Array.isArray(entry.set_times) ? entry.set_times : [[]];
                      const rebuilt = resizeSetTimes(prevTimes, setsN, repsN);

                      updateEntryField(index, { timesApplicable: true, set_times: rebuilt });
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
                    onPress={() => updateEntryField(index, { timesApplicable: false, set_times: [[]] })}
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
                  <>
                    <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                      {Array.from({ length: Math.max(toPosInt(entry.sets), 1) }, (_, sIdx) => (
                        <Pressable
                          key={sIdx}
                          onPress={() => updateEntryField(index, { activeSet: sIdx })}
                          style={{
                            borderWidth: 1,
                            borderRadius: 999,
                            paddingVertical: 6,
                            paddingHorizontal: 10,
                            backgroundColor: entry.activeSet === sIdx ? "black" : "transparent",
                          }}
                        >
                          <Text
                            style={{
                              color: entry.activeSet === sIdx ? "white" : "black",
                              fontWeight: "700",
                            }}
                          >
                            Set {sIdx + 1}
                          </Text>
                        </Pressable>
                      ))}
                    </View>

                    <View style={{ gap: 8 }}>
                      <Text style={{ fontWeight: "700" }}>
                        Times — Set {entry.activeSet + 1}
                      </Text>

                      {(entry.set_times?.[entry.activeSet] ?? []).map((t, repIdx) => (
                        <TextInput
                          key={repIdx}
                          value={t}
                          onChangeText={(v) => {
                            const next = entry.set_times.map((row) => [...row]);
                            next[entry.activeSet][repIdx] = v;
                            updateEntryField(index, { set_times: next });
                          }}
                          placeholder={`Rep ${repIdx + 1} time`}
                          placeholderTextColor={placeholderColor}
                          style={inputStyle}
                        />
                      ))}
                    </View>
                  </>
                )}

                <TextInput
                  value={entry.weight}
                  onChangeText={(v) => updateEntryField(index, { weight: v })}
                  placeholder="Weight (optional)"
                  keyboardType="numeric"
                  placeholderTextColor={placeholderColor}
                  style={inputStyle}
                />

                <TextInput
                  value={entry.notes}
                  onChangeText={(v) => updateEntryField(index, { notes: v })}
                  placeholder="Entry notes (optional)"
                  placeholderTextColor={placeholderColor}
                  style={inputStyle}
                />
              </View>
            )}
          </View>
        ))}

        <PrimaryButton
          title={isLift ? "Add another lift" : "Add another rep/drill"}
          onPress={addEntry}
        />

        <Pressable
          onPress={saveWorkout}
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
            <Text style={{ fontSize: 16, fontWeight: "600" }}>Save workout</Text>
          )}
        </Pressable>

        {!!status && <Text style={{ marginTop: 6 }}>{status}</Text>}
      </FormScreen>

      {toast.open && (
        <View
          pointerEvents="box-none"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 18,
            paddingHorizontal: 16,
          }}
        >
          <Pressable
            onPress={() => {
              hideToast();
              router.replace("/(tabs)/log");
            }}
          >
            <Animated.View
              style={{
                transform: [{ translateY }],
                opacity,
                borderWidth: 1,
                borderRadius: 18,
                paddingVertical: 12,
                paddingHorizontal: 14,
                backgroundColor: "white",
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 999,
                    borderWidth: 1,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ fontWeight: "900" }}>✓</Text>
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: "800" }}>{toast.message}</Text>
                  <Text style={{ opacity: 0.7 }}>Back to Workouts…</Text>
                </View>

                <Text style={{ opacity: 0.7 }}>Tap</Text>
              </View>
            </Animated.View>
          </Pressable>
        </View>
      )}
    </View>
  );
}