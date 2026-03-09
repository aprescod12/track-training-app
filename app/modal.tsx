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
import {
  findExerciseIdByName,
  searchExercisesByName,
  createCustomExercise,
} from "../lib/exercises";
import { useAppColors } from "../lib/theme";
import { computeNewPRsForWorkout, upsertExercisePRs } from "../lib/pr";
import {
  createPRAchievementsFromHits,
  maybeCreateWorkoutStreakAchievement,
  maybeCreateWeeklyWorkoutCountAchievement,
  maybeCreateDistanceMilestoneAchievement,
  maybeCreateComebackAchievement,
} from "../lib/achievements";

type ToastState = { open: boolean; message: string };

type EntryDraft = {
  exercise: string;

  // new
  selectedExerciseId?: string | null;
  pendingCustomExercise?: {
    name: string;
    category: "track" | "lift" | "other";
    score_type: "max_weight" | "min_time" | "max_reps";
  } | null;

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

type ExerciseSearchResult = {
  exercise_id: string;
  name: string;
  category: string | null;
  distance_m: number | null;
  score_type: string | null;
  created_by: string | null;
};

function buildEntrySetsFromTrack(entryId: string, setTimes: string[][] | null) {
  if (!setTimes || !Array.isArray(setTimes)) return [];

  const rows: any[] = [];
  for (let s = 0; s < setTimes.length; s++) {
    const repTimes = setTimes[s] ?? [];
    for (let r = 0; r < repTimes.length; r++) {
      const t = (repTimes[r] ?? "").trim();
      if (!t) continue;
      rows.push({
        entry_id: entryId,
        set_number: s + 1,
        rep_number: r + 1,
        time_text: t,
      });
    }
  }
  return rows;
}

// NOTE: we set rep_number = 1 for lift rows to avoid the UNIQUE constraint
// allowing duplicates when rep_number is null.
function buildEntrySetsFromLift(
  entryId: string,
  liftReps: (number | null)[] | null,
  liftWeights: (number | null)[] | null
) {
  const repsArr = Array.isArray(liftReps) ? liftReps : [];
  const wArr = Array.isArray(liftWeights) ? liftWeights : [];

  const n = Math.max(repsArr.length, wArr.length);
  const rows: any[] = [];

  for (let i = 0; i < n; i++) {
    const reps = repsArr[i] ?? null;
    const weight = wArr[i] ?? null;
    if (reps == null && weight == null) continue;

    rows.push({
      entry_id: entryId,
      set_number: i + 1,
      rep_number: 1,
      reps,
      weight,
    });
  }

  return rows;
}

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
    exercise: "",
    selectedExerciseId: null,
    pendingCustomExercise: null,
    sets: "",
    notes: "",
    reps: "",
    set_times: [[]],
    activeSet: 0,
    lift_reps: [""],
    lift_weights: [""],
    weight: "",
    timesApplicable: true,
  };
}

export default function ModalScreen() {
  const c = useAppColors();

  const placeholderColor = "#8A8A8A";
  const inputStyle = {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 12,
    padding: 12,
    backgroundColor: c.bg,
    color: c.text,
  } as const;

  const params = useLocalSearchParams<{ date?: string }>();

  const [date] = useState(() =>
    typeof params.date === "string" ? params.date : formatYMD(new Date())
  );

  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [workoutType, setWorkoutType] = useState<"track" | "lift">("track");
  const isLift = workoutType === "lift";

  const [entries, setEntries] = useState<EntryDraft[]>([makeBlankEntry()]);

  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const searchTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  const [exerciseSuggestions, setExerciseSuggestions] = useState<
    Record<number, ExerciseSearchResult[]>
  >({}); 

  const [toast, setToast] = useState<ToastState>({
    open: false,
    message: "Workout saved",
  });

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

  const [prBanner, setPrBanner] = useState<{ open: boolean; message: string }>({
    open: false,
    message: "",
  });

  const prTranslateY = useRef(new Animated.Value(-60)).current;
  const prOpacity = useRef(new Animated.Value(0)).current;

  const showPRBanner = (message: string) => {
    setPRBannerSafe(true, message);
  };

  const setPRBannerSafe = (open: boolean, message: string) => {
    setPrBanner({ open, message });
    if (open) {
      prTranslateY.setValue(-60);
      prOpacity.setValue(0);

      Animated.parallel([
        Animated.timing(prOpacity, {
          toValue: 1,
          duration: 180,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(prTranslateY, {
          toValue: 0,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();

      setTimeout(() => {
        hidePRBanner();
      }, 1200);
    }
  };

  const hidePRBanner = () => {
    Animated.parallel([
      Animated.timing(prOpacity, {
        toValue: 0,
        duration: 160,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(prTranslateY, {
        toValue: -60,
        duration: 200,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(() => setPrBanner({ open: false, message: "" }));
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
    setEntries((prev) => [...prev, makeBlankEntry()]);
  }

  function removeEntry(index: number) {
    setEntries((prev) => {
      const copy = prev.filter((_, i) => i !== index);
      return copy.length ? copy : [makeBlankEntry()];
    });
  
    setExerciseSuggestions((prev) => {
      const next: Record<number, ExerciseSearchResult[]> = {};
      Object.entries(prev).forEach(([k, v]) => {
        const key = Number(k);
        if (key < index) next[key] = v;
        else if (key > index) next[key - 1] = v;
      });
      return next;
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

  function loadExerciseSuggestions(index: number, query: string) {
    const cleaned = query.trim();
  
    if (searchTimers.current[index]) {
      clearTimeout(searchTimers.current[index]);
    }
  
    searchTimers.current[index] = setTimeout(async () => {
      if (!cleaned) {
        setExerciseSuggestions((prev) => ({ ...prev, [index]: [] }));
        return;
      }
  
      try {
        const results = await searchExercisesByName(cleaned);
        setExerciseSuggestions((prev) => ({ ...prev, [index]: results }));
      } catch (err) {
        console.log("Exercise suggestion error:", err);
        setExerciseSuggestions((prev) => ({ ...prev, [index]: [] }));
      }
    }, 300);
  }

  function createExerciseFromInput(index: number) {
    const name = entries[index].exercise.trim();
    if (!name) return;
  
    const category = workoutType === "lift" ? "lift" : "track";
    const score_type = workoutType === "lift" ? "max_weight" : "min_time";
  
    updateEntryField(index, {
      exercise: name,
      selectedExerciseId: null,
      pendingCustomExercise: {
        name,
        category,
        score_type,
      },
    });
  
    setExerciseSuggestions((prev) => ({ ...prev, [index]: [] }));
  }

  async function saveWorkout() {
    try {
      setSaving(true);
      setStatus(null);

      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id ?? null;
      if (!uid) throw new Error("Not signed in.");

      const trimmedTitle = title.trim() || "Workout";

      const { data: workout, error: wErr } = await supabase
        .from("workouts")
        .insert({
          user_id: uid,
          workout_date: date,
          title: trimmedTitle,
          notes: notes.trim() || null,
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
              selectedExerciseId: e.selectedExerciseId ?? null,
              pendingCustomExercise: e.pendingCustomExercise ?? null,
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
              selectedExerciseId: e.selectedExerciseId ?? null,
              pendingCustomExercise: e.pendingCustomExercise ?? null,
              sets: setsN,
              reps: repsN || null,
              set_times,
              weight: e.weight.trim() ? Number(e.weight) : null,
              notes: e.notes.trim() || null,
            };
          }
        })
        .filter((row) => row.exercise);

      const payload: any[] = [];

      for (const e of cleanedEntries) {
        let exId: string | null = null;
      
        if (e.selectedExerciseId) {
          exId = e.selectedExerciseId;
        } else if (e.pendingCustomExercise) {
          exId = await createCustomExercise({
            name: e.pendingCustomExercise.name,
            category: e.pendingCustomExercise.category,
            score_type: e.pendingCustomExercise.score_type,
            created_by: uid,
          });
        } else {
          exId = await findExerciseIdByName(e.exercise ?? "");
        }
      
        if (!exId) {
          throw new Error(
            `Exercise "${e.exercise}" was not found. Please select an existing exercise or create a custom one.`
          );
        }
      
        const { selectedExerciseId, pendingCustomExercise, ...entryData } = e as any;
      
        payload.push({
          user_id: uid,
          workout_id: workout.id,
          exercise_id: exId,
          ...entryData,
        });
      }

      if (payload.length) {
        const { data: insertedEntries, error: eErr } = await supabase
          .from("workout_entries")
          .insert(payload)
          .select("id, set_times, lift_reps, lift_weights");

        if (eErr) throw eErr;

        const allSetRows: any[] = [];

        for (const row of insertedEntries ?? []) {
          if (workoutType === "lift") {
            allSetRows.push(...buildEntrySetsFromLift(row.id, row.lift_reps, row.lift_weights));
          } else {
            allSetRows.push(...buildEntrySetsFromTrack(row.id, row.set_times));
          }
        }

        if (allSetRows.length) {
          const { error: sErr } = await supabase.from("entry_sets").insert(allSetRows);
          if (sErr) {
            await supabase.from("workouts").delete().eq("id", workout.id);
            throw sErr;
          }
        }
      }

      try {
        const hits = await computeNewPRsForWorkout(workout.id);
        await upsertExercisePRs(hits);

        if (uid) {
          if (hits.length) {
            await createPRAchievementsFromHits({
              userId: uid,
              workoutId: workout.id,
              hits,
            });
          }

          await maybeCreateWorkoutStreakAchievement({
            userId: uid,
            workoutId: workout.id,
          });

          await maybeCreateWeeklyWorkoutCountAchievement({
            userId: uid,
            workoutId: workout.id,
          });

          await maybeCreateDistanceMilestoneAchievement({
            userId: uid,
            workoutId: workout.id,
          });

          await maybeCreateComebackAchievement({
            userId: uid,
            workoutId: workout.id,
          });
        }

        if (hits.length) {
          const label =
            hits.length === 1 ? `🏆 New PR: ${hits[0].exercise_name}` : `🏆 ${hits.length} New PRs`;

          showPRBanner(label);
        }

        showToast("Workout saved ✅");
      } catch (err) {
        console.log("PR compute/upsert/achievement error:", err);
        showToast("Workout saved ✅");
      }
    } catch (e: any) {
      setStatus(`Error: ${e?.message ?? String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <FormScreen contentContainerStyle={{ paddingBottom: 28 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
  <View style={{ flex: 1, gap: 4 }}>
    <Text style={{ fontSize: 22, fontWeight: "800", color: c.text }}>
      {isLift ? "Log Lift" : "Log Track"}
    </Text>
    <Text style={{ color: c.subtext }}>
      Add your workout details, entries, and notes for {date}.
    </Text>
  </View>

  <Pressable
    onPress={() => router.back()}
    style={{
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 999,
      paddingVertical: 6,
      paddingHorizontal: 14,
      backgroundColor: c.card,
    }}
  >
    <Text style={{ fontWeight: "600", color: c.text }}>Cancel</Text>
  </Pressable>
</View>

        <View
          style={{
            borderWidth: 1,
            borderColor: c.border,
            backgroundColor: c.card,
            borderRadius: 14,
            padding: 14,
            gap: 12,
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: "800", color: c.text }}>Workout Details</Text>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable
              onPress={() => setWorkoutType("track")}
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: c.border,
                borderRadius: 999,
                paddingVertical: 10,
                alignItems: "center",
                backgroundColor: workoutType === "track" ? c.primary : c.bg,
              }}
            >
              <Text style={{ fontWeight: "700", color: workoutType === "track" ? c.primaryText : c.text }}>
                Track
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setWorkoutType("lift")}
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: c.border,
                borderRadius: 999,
                paddingVertical: 10,
                alignItems: "center",
                backgroundColor: workoutType === "lift" ? c.primary : c.bg,
              }}
            >
              <Text style={{ fontWeight: "700", color: workoutType === "lift" ? c.primaryText : c.text }}>
                Lift
              </Text>
            </Pressable>
          </View>

          <View style={{ gap: 6 }}>
            <Text style={{ fontWeight: "800", color: c.text }}>Date</Text>
            <View
              style={{
                borderWidth: 1,
                borderColor: c.border,
                borderRadius: 12,
                padding: 12,
                backgroundColor: c.bg,
              }}
            >
              <Text style={{ fontWeight: "700", color: c.text }}>{date}</Text>
            </View>
          </View>

          <View style={{ gap: 6 }}>
            <Text style={{ fontWeight: "800", color: c.text }}>Title</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Workout title"
              placeholderTextColor={placeholderColor}
              style={inputStyle}
            />
          </View>

          <View style={{ gap: 6 }}>
            <Text style={{ fontWeight: "800", color: c.text }}>Notes</Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Notes (optional)"
              multiline
              placeholderTextColor={placeholderColor}
              style={[inputStyle, { minHeight: 90, textAlignVertical: "top" }]}
            />
          </View>
        </View>

        <View style={{ gap: 10 }}>
          <Text style={{ fontSize: 16, fontWeight: "800", color: c.text }}>Entries</Text>
          <Text style={{ color: c.subtext }}>
            {isLift
              ? "Add each lift and record reps and weight by set."
              : "Add each drill, sprint, or rep-based track entry."}
          </Text>
        </View>

        {entries.map((entry, index) => (
          <View
            key={index}
            style={{
              borderWidth: 1,
              borderColor: c.border,
              backgroundColor: c.card,
              borderRadius: 14,
              padding: 14,
              gap: 12,
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ fontWeight: "800", color: c.text }}>Entry {index + 1}</Text>
              <Pressable onPress={() => removeEntry(index)}>
                <Text style={{ color: "#DC2626", fontWeight: "700" }}>Remove</Text>
              </Pressable>
            </View>

            <View style={{ gap: 6 }}>
  <Text style={{ fontWeight: "700", color: c.text }}>Exercise</Text>
  <TextInput
    value={entry.exercise}
    onChangeText={(v) => {
      updateEntryField(index, {
        exercise: v,
        selectedExerciseId: null,
        pendingCustomExercise: null,
      });
      loadExerciseSuggestions(index, v);
    }}
    placeholder={isLift ? "Bench Press" : "200m"}
    placeholderTextColor={placeholderColor}
    style={inputStyle}
  />

  <Text style={{ color: c.subtext, fontSize: 12 }}>
    Choose an existing exercise below when possible.
  </Text>

  {entry.pendingCustomExercise && (
  <Text style={{ color: c.subtext, fontSize: 12 }}>
    Will create custom exercise on save.
  </Text>
)}

  {(() => {
    const suggestions = exerciseSuggestions[index] ?? [];
    const exactMatch = suggestions.some(
      (s) => s.name.toLowerCase() === entry.exercise.trim().toLowerCase()
    );

    if (suggestions.length === 0 && !entry.exercise.trim()) return null;

    return (
      <View
        style={{
          borderWidth: 1,
          borderColor: c.border,
          borderRadius: 12,
          backgroundColor: c.bg,
          overflow: "hidden",
        }}
      >
        {suggestions.map((item) => (
          <Pressable
            key={item.exercise_id}
            onPress={() => {
              updateEntryField(index, {
                exercise: item.name,
                selectedExerciseId: item.exercise_id,
                pendingCustomExercise: null,
              });
              setExerciseSuggestions((prev) => ({ ...prev, [index]: [] }));
            }}
            style={{
              paddingVertical: 10,
              paddingHorizontal: 12,
              borderBottomWidth: 1,
              borderBottomColor: c.border,
            }}
          >
            <Text style={{ color: c.text, fontWeight: "700" }}>{item.name}</Text>
            <Text style={{ color: c.subtext, fontSize: 12 }}>
              {item.category ?? "other"}
            </Text>
          </Pressable>
        ))}

        {!exactMatch && entry.exercise.trim() !== "" && (
          <Pressable
            onPress={() => createExerciseFromInput(index)}
            style={{
              paddingVertical: 10,
              paddingHorizontal: 12,
              backgroundColor: c.card,
            }}
          >
            <Text style={{ color: c.primary, fontWeight: "700" }}>
              Create "{entry.exercise.trim()}"
            </Text>
          </Pressable>
        )}
      </View>
    );
  })()}
</View>

            <View style={{ gap: 6 }}>
              <Text style={{ fontWeight: "700", color: c.text }}>Sets</Text>
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
            </View>

            {isLift ? (
              <View style={{ gap: 12 }}>
                <Text style={{ fontWeight: "800", color: c.text }}>Per-Set Log</Text>

                <View style={{ gap: 8 }}>
                  <Text style={{ fontWeight: "700", color: c.text }}>Reps</Text>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    {(entry.lift_reps ?? []).map((val, sIdx) => (
                      <TextInput
                        key={`r-${sIdx}`}
                        value={val}
                        onChangeText={(v) => updateLiftArray(index, "lift_reps", sIdx, v)}
                        placeholder={`S${sIdx + 1}`}
                        keyboardType="numeric"
                        placeholderTextColor={placeholderColor}
                        style={[inputStyle, { flex: 1, textAlign: "center" }]}
                      />
                    ))}
                  </View>
                </View>

                <View style={{ gap: 8 }}>
                  <Text style={{ fontWeight: "700", color: c.text }}>Weight</Text>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    {(entry.lift_weights ?? []).map((val, sIdx) => (
                      <TextInput
                        key={`w-${sIdx}`}
                        value={val}
                        onChangeText={(v) => updateLiftArray(index, "lift_weights", sIdx, v)}
                        placeholder={`S${sIdx + 1}`}
                        keyboardType="numeric"
                        placeholderTextColor={placeholderColor}
                        style={[inputStyle, { flex: 1, textAlign: "center" }]}
                      />
                    ))}
                  </View>
                </View>

                <View style={{ gap: 6 }}>
                  <Text style={{ fontWeight: "700", color: c.text }}>Entry Notes</Text>
                  <TextInput
                    value={entry.notes}
                    onChangeText={(v) => updateEntryField(index, { notes: v })}
                    placeholder="Entry notes (optional)"
                    placeholderTextColor={placeholderColor}
                    style={inputStyle}
                  />
                </View>
              </View>
            ) : (
              <View style={{ gap: 12 }}>
                <View style={{ gap: 6 }}>
                  <Text style={{ fontWeight: "700", color: c.text }}>Reps</Text>
                  <TextInput
                    value={entry.reps}
                    onChangeText={(v) => updateTrackSetsOrReps(index, "reps", v)}
                    placeholder="Reps"
                    keyboardType="numeric"
                    placeholderTextColor={placeholderColor}
                    style={inputStyle}
                  />
                </View>

                <View style={{ gap: 8 }}>
                  <Text style={{ fontWeight: "700", color: c.text }}>Times</Text>
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
                        borderColor: c.border,
                        borderRadius: 999,
                        paddingVertical: 8,
                        alignItems: "center",
                        backgroundColor: entry.timesApplicable ? c.primary : c.bg,
                      }}
                    >
                      <Text style={{ fontWeight: "700", color: entry.timesApplicable ? c.primaryText : c.text }}>
                        Applicable
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={() => updateEntryField(index, { timesApplicable: false, set_times: [[]] })}
                      style={{
                        flex: 1,
                        borderWidth: 1,
                        borderColor: c.border,
                        borderRadius: 999,
                        paddingVertical: 8,
                        alignItems: "center",
                        backgroundColor: !entry.timesApplicable ? c.primary : c.bg,
                      }}
                    >
                      <Text style={{ fontWeight: "700", color: !entry.timesApplicable ? c.primaryText : c.text }}>
                        Not Applicable
                      </Text>
                    </Pressable>
                  </View>
                </View>

                {entry.timesApplicable && (
                  <View style={{ gap: 10 }}>
                    <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                      {Array.from({ length: Math.max(toPosInt(entry.sets), 1) }, (_, sIdx) => (
                        <Pressable
                          key={sIdx}
                          onPress={() => updateEntryField(index, { activeSet: sIdx })}
                          style={{
                            borderWidth: 1,
                            borderColor: c.border,
                            borderRadius: 999,
                            paddingVertical: 6,
                            paddingHorizontal: 10,
                            backgroundColor: entry.activeSet === sIdx ? c.primary : c.bg,
                          }}
                        >
                          <Text
                            style={{
                              color: entry.activeSet === sIdx ? c.primaryText : c.text,
                              fontWeight: "700",
                            }}
                          >
                            Set {sIdx + 1}
                          </Text>
                        </Pressable>
                      ))}
                    </View>

                    <View style={{ gap: 8 }}>
                      <Text style={{ fontWeight: "700", color: c.text }}>
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
                  </View>
                )}

                <View style={{ gap: 6 }}>
                  <Text style={{ fontWeight: "700", color: c.text }}>Weight</Text>
                  <TextInput
                    value={entry.weight}
                    onChangeText={(v) => updateEntryField(index, { weight: v })}
                    placeholder="Weight (optional)"
                    keyboardType="numeric"
                    placeholderTextColor={placeholderColor}
                    style={inputStyle}
                  />
                </View>

                <View style={{ gap: 6 }}>
                  <Text style={{ fontWeight: "700", color: c.text }}>Entry Notes</Text>
                  <TextInput
                    value={entry.notes}
                    onChangeText={(v) => updateEntryField(index, { notes: v })}
                    placeholder="Entry notes (optional)"
                    placeholderTextColor={placeholderColor}
                    style={inputStyle}
                  />
                </View>
              </View>
            )}
          </View>
        ))}

        <PrimaryButton title={isLift ? "Add another lift" : "Add another rep/drill"} onPress={addEntry} />

        <Pressable
          onPress={saveWorkout}
          disabled={saving}
          style={{
            borderWidth: 1,
            borderColor: c.border,
            backgroundColor: c.card,
            borderRadius: 14,
            padding: 14,
            alignItems: "center",
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? (
            <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
              <ActivityIndicator />
              <Text style={{ fontSize: 16, fontWeight: "600", color: c.text }}>Saving…</Text>
            </View>
          ) : (
            <Text style={{ fontSize: 16, fontWeight: "700", color: c.text }}>Save workout</Text>
          )}
        </Pressable>

        {!!status && (
          <View
            style={{
              borderWidth: 1,
              borderColor: c.border,
              backgroundColor: c.card,
              borderRadius: 14,
              padding: 12,
            }}
          >
            <Text style={{ color: c.text }}>{status}</Text>
          </View>
        )}
      </FormScreen>

      {prBanner.open && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 10,
            left: 0,
            right: 0,
            paddingHorizontal: 16,
          }}
        >
          <Animated.View
            style={{
              transform: [{ translateY: prTranslateY }],
              opacity: prOpacity,
              borderWidth: 1,
              borderColor: c.border,
              borderRadius: 18,
              paddingVertical: 12,
              paddingHorizontal: 14,
              backgroundColor: c.card,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: c.border,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: c.bg,
                }}
              >
                <Text style={{ fontWeight: "900", color: c.text }}>🏆</Text>
              </View>

              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: "900", color: c.text }}>New PR!</Text>
                <Text style={{ color: c.subtext }} numberOfLines={1}>
                  {prBanner.message}
                </Text>
              </View>
            </View>
          </Animated.View>
        </View>
      )}

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
                borderColor: c.border,
                borderRadius: 18,
                paddingVertical: 12,
                paddingHorizontal: 14,
                backgroundColor: c.card,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: c.border,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ fontWeight: "900", color: c.text }}>✓</Text>
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: "800", color: c.text }}>{toast.message}</Text>
                  <Text style={{ color: c.subtext }}>Back to Workouts…</Text>
                </View>

                <Text style={{ color: c.subtext }}>Tap</Text>
              </View>
            </Animated.View>
          </Pressable>
        </View>
      )}
    </View>
  );
}