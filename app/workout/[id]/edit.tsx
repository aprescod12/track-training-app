import { useEffect, useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  Modal,
} from "react-native";
import { useLocalSearchParams, router, Stack } from "expo-router";
import PrimaryButton from "../../../components/PrimaryButton";
import FormScreen from "../../../components/FormScreen";
import { supabase } from "../../../lib/supabase";
import { getOrCreateExerciseId } from "../../../lib/exercises";
import { useNavigation } from "@react-navigation/native";
import { useAppColors } from "../../../lib/theme";

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
  id?: string;
  key: string;

  exercise_id?: string | null;
  exercise: string;
  sets: string;

  reps: string;
  timesApplicable: boolean;
  set_times: string[][];

  lift_reps: string[];
  lift_weights: string[];

  weight: string;
  notes: string;
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
  const c = useAppColors();

  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();

  const placeholderColor = c.dark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.35)";
  const inputStyle = {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 12,
    padding: 12,
    backgroundColor: c.bg,
    color: c.text,
  } as const;

  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [workoutType, setWorkoutType] = useState<"track" | "lift">("track");
  const isLift = workoutType === "lift";

  const [entries, setEntries] = useState<EntryDraft[]>([]);
  const [deletedEntryIds, setDeletedEntryIds] = useState<string[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [allowExit, setAllowExit] = useState(false);

  const [initialSnapshot, setInitialSnapshot] = useState<string>("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<any | null>(null);

  useEffect(() => {
    setEntries((prev) => {
      if (!prev.length) return prev;

      return prev.map((e) => {
        const setsN = Math.max(toPosInt(e.sets), 1);

        if (workoutType === "lift") {
          return {
            ...e,
            reps: "",
            timesApplicable: false,
            set_times: [[]],
            lift_reps: resizeFlat(e.lift_reps ?? [""], setsN),
            lift_weights: resizeFlat(e.lift_weights ?? [""], setsN),
            weight: "",
          };
        } else {
          const repsN = Math.max(toPosInt(e.reps), 0);
          return {
            ...e,
            lift_reps: [""],
            lift_weights: [""],
            timesApplicable: true,
            set_times: resizeSetTimes(e.set_times ?? [[]], setsN, repsN),
          };
        }
      });
    });
  }, [workoutType]);

  const isDirty = useMemo(() => {
    if (!initialSnapshot) return false;
    const now = JSON.stringify({ title, notes, workoutType, entries, deletedEntryIds });
    return now !== initialSnapshot;
  }, [title, notes, workoutType, entries, deletedEntryIds, initialSnapshot]);

  useEffect(() => {
    const sub = navigation.addListener("beforeRemove", (e: any) => {
      if (allowExit || !isDirty || saving) return;
  
      e.preventDefault();
      setPendingAction(e.data.action);
      setConfirmOpen(true);
    });
  
    return sub as any;
  }, [navigation, isDirty, saving, allowExit]);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);

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
      setError(error.message);
      return;
    }

    const row = data as unknown as WorkoutRow;

    setTitle(row.title ?? "");
    setNotes(row.notes ?? "");
    setWorkoutType(row.workout_type);

    const drafts: EntryDraft[] = (row.workout_entries ?? []).map((e) => {
      const setsN = e.sets ?? 1;
      const repsN = e.reps ?? 0;
      const timesApplicable = e.set_times !== null;
      const localTimes = Array.isArray(e.set_times) ? e.set_times : resizeSetTimes([[]], setsN, repsN);

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

    const snap = JSON.stringify({
      title: row.title ?? "",
      notes: row.notes ?? "",
      workoutType: row.workout_type,
      entries: finalEntries,
      deletedEntryIds: [],
    });
    setInitialSnapshot(snap);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  function closeConfirm() {
    setConfirmOpen(false);
    setPendingAction(null);
  }

  function discardChanges() {
    setConfirmOpen(false);
    setAllowExit(true);
  
    if (pendingAction?.type === "GO_BACK") {
      setPendingAction(null);
      router.back();
      return;
    }
  
    if (pendingAction) {
      const action = pendingAction;
      setPendingAction(null);
      navigation.dispatch(action);
      return;
    }
  
    router.back();
  }

  useEffect(() => {
    if (!allowExit) return;
  
    const id = setTimeout(() => setAllowExit(false), 0);
    return () => clearTimeout(id);
  }, [allowExit]);

  function addEntry() {
    setEntries((prev) => [...prev, makeBlankEntry()]);
  }

  function removeEntry(index: number) {
    setEntries((prev) => {
      const target = prev[index];
      if (target?.id) setDeletedEntryIds((ids) => [...ids, target.id!]);
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

  async function save() {
    if (!id) return;

    try {
      setSaving(true);
      setError(null);

      const trimmedTitle = title.trim() || "Workout";

      const { error: wErr } = await supabase
        .from("workouts")
        .update({ title: trimmedTitle, notes, workout_type: workoutType })
        .eq("id", id);

      if (wErr) throw wErr;

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
            reps: null,
            set_times: null,
            weight: null,
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
            lift_reps: null,
            lift_weights: null,
            weight: e.weight.trim() ? Number(e.weight) : null,
            notes: e.notes.trim() || null,
          };

          if (e.id) updates.push({ id: e.id, ...row });
          else inserts.push(row);
        }
      }

      const updatedEntryIds: string[] = updates.map((u) => u.id);

      if (deletedEntryIds.length) {
        const { error: delErr } = await supabase.from("workout_entries").delete().in("id", deletedEntryIds);
        if (delErr) throw delErr;
      }

      for (const u of updates) {
        const { id: entryId, ...patch } = u;
        const { error } = await supabase.from("workout_entries").update(patch).eq("id", entryId);
        if (error) throw error;
      }

      let inserted: any[] = [];
      if (inserts.length) {
        const { data, error: insErr } = await supabase
          .from("workout_entries")
          .insert(inserts)
          .select("id, set_times, lift_reps, lift_weights");

        if (insErr) throw insErr;
        inserted = data ?? [];
      }

      if (updatedEntryIds.length) {
        const { error: delSetsErr } = await supabase.from("entry_sets").delete().in("entry_id", updatedEntryIds);
        if (delSetsErr) throw delSetsErr;

        const idToDraft = new Map(entries.filter((e) => e.id).map((e) => [e.id!, e]));
        const setRows: any[] = [];

        for (const entryId of updatedEntryIds) {
          const d = idToDraft.get(entryId);
          if (!d) continue;

          const setsN = Math.max(toPosInt(d.sets), 1);

          if (workoutType === "lift") {
            const repsArr = (d.lift_reps ?? [])
              .slice(0, setsN)
              .map((x) => x.trim())
              .map((x) => (x ? parseInt(x, 10) : null));

            const wArr = (d.lift_weights ?? [])
              .slice(0, setsN)
              .map((x) => x.trim())
              .map((x) => (x ? Number(x) : null));

            setRows.push(...buildEntrySetsFromLift(entryId, repsArr, wArr));
          } else {
            const repsN = Math.max(toPosInt(d.reps), 0);
            const setTimes = d.timesApplicable
              ? resizeSetTimes(d.set_times ?? [[]], setsN, repsN).map((row) => row.map((t) => t.trim()))
              : null;

            setRows.push(...buildEntrySetsFromTrack(entryId, setTimes));
          }
        }

        if (setRows.length) {
          const { error: insSetsErr } = await supabase.from("entry_sets").insert(setRows);
          if (insSetsErr) throw insSetsErr;
        }
      }

      if (inserted.length) {
        const setRows: any[] = [];
        for (const row of inserted) {
          if (workoutType === "lift") {
            setRows.push(...buildEntrySetsFromLift(row.id, row.lift_reps, row.lift_weights));
          } else {
            setRows.push(...buildEntrySetsFromTrack(row.id, row.set_times));
          }
        }

        if (setRows.length) {
          const { error: insSetsErr } = await supabase.from("entry_sets").insert(setRows);
          if (insSetsErr) throw insSetsErr;
        }
      }

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
      setError(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  }

  const pillStyle = (active: boolean) => ({
    flex: 1,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: "center" as const,
    backgroundColor: active ? c.primary : c.bg,
  });

  return (
    <FormScreen edges={["left", "right"]} contentContainerStyle={{ paddingBottom: 28 }}>
      <Stack.Screen
        options={{
          title: "Edit Workout",
          headerShown: true,
          headerStyle: { backgroundColor: c.bg },
          headerTintColor: c.text,
          contentStyle: { backgroundColor: c.bg },
        }}
      />

      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ fontSize: 22, fontWeight: "800", color: c.text }}>Edit Workout</Text>
          <Text style={{ color: c.subtext }}>
            Update workout details, entries, and notes.
          </Text>
        </View>

        <Pressable
          onPress={() => {
            if (!isDirty) {
              router.back();
              return;
            }

            setPendingAction({ type: "GO_BACK" });
            setConfirmOpen(true);
          }}
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

      {error && (
        <Text style={{ color: "#ef4444", fontWeight: "600" }}>
          {error}
        </Text>
      )}

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
          <Pressable onPress={() => setWorkoutType("track")} style={pillStyle(!isLift)}>
            <Text style={{ fontWeight: "700", color: !isLift ? c.primaryText : c.text }}>Track</Text>
          </Pressable>

          <Pressable onPress={() => setWorkoutType("lift")} style={pillStyle(isLift)}>
            <Text style={{ fontWeight: "700", color: isLift ? c.primaryText : c.text }}>Lift</Text>
          </Pressable>
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
            placeholder="Notes"
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
            ? "Update each lift and record reps and weight by set."
            : "Update each drill, sprint, or rep-based track entry."}
        </Text>
      </View>

      {entries.map((entry, index) => (
        <View
          key={entry.key}
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
              onChangeText={(v) => patchEntry(index, { exercise: v })}
              placeholder="Exercise"
              placeholderTextColor={placeholderColor}
              style={inputStyle}
            />
          </View>

          <View style={{ gap: 8 }}>
            <Text style={{ fontWeight: "700", color: c.text }}>Sets</Text>

            <TextInput
              value={entry.sets}
              onChangeText={(v) => {
                if (isLift) {
                  const setsN = Math.max(toPosInt(v), 1);
                  patchEntry(index, {
                    sets: v,
                    lift_reps: resizeFlat(entry.lift_reps ?? [""], setsN),
                    lift_weights: resizeFlat(entry.lift_weights ?? [""], setsN),
                  });
                } else {
                  const setsN = Math.max(toPosInt(v), 1);
                  const repsN = Math.max(toPosInt(entry.reps), 0);
                  patchEntry(index, {
                    sets: v,
                    set_times: resizeSetTimes(entry.set_times ?? [[]], setsN, repsN),
                  });
                }
              }}
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
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              <View style={{ gap: 6 }}>
                <Text style={{ fontWeight: "700", color: c.text }}>Reps</Text>
                <TextInput
                  value={entry.reps}
                  onChangeText={(v) => {
                    const repsN = Math.max(toPosInt(v), 0);
                    const setsN = Math.max(toPosInt(entry.sets), 1);
                    patchEntry(index, {
                      reps: v,
                      set_times: resizeSetTimes(entry.set_times ?? [[]], setsN, repsN),
                    });
                  }}
                  placeholder="Reps"
                  keyboardType="numeric"
                  placeholderTextColor={placeholderColor}
                  style={inputStyle}
                />
              </View>

              <View style={{ flexDirection: "row", gap: 10 }}>
                <PrimaryButton title="+ Rep" onPress={() => addTrackRep(index)} />
                <PrimaryButton title="- Rep" onPress={() => removeTrackRep(index)} />
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
                      patchEntry(index, { timesApplicable: true, set_times: rebuilt });
                    }}
                    style={pillStyle(entry.timesApplicable)}
                  >
                    <Text style={{ fontWeight: "700", color: entry.timesApplicable ? c.primaryText : c.text }}>
                      Applicable
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => patchEntry(index, { timesApplicable: false, set_times: [[]] })}
                    style={pillStyle(!entry.timesApplicable)}
                  >
                    <Text style={{ fontWeight: "700", color: !entry.timesApplicable ? c.primaryText : c.text }}>
                      Not Applicable
                    </Text>
                  </Pressable>
                </View>
              </View>

              {entry.timesApplicable && (
                <View style={{ gap: 8 }}>
                  <Text style={{ fontWeight: "800", color: c.text }}>Times</Text>

                  {entry.set_times.map((row, sIdx) => (
                    <View key={sIdx} style={{ gap: 6 }}>
                      <Text style={{ fontWeight: "700", color: c.text }}>Set {sIdx + 1}</Text>

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

              <View style={{ gap: 6 }}>
                <Text style={{ fontWeight: "700", color: c.text }}>Weight</Text>
                <TextInput
                  value={entry.weight}
                  onChangeText={(v) => patchEntry(index, { weight: v })}
                  placeholder="Weight (optional)"
                  keyboardType="numeric"
                  placeholderTextColor={placeholderColor}
                  style={inputStyle}
                />
              </View>
            </View>
          )}

          <View style={{ gap: 6 }}>
            <Text style={{ fontWeight: "700", color: c.text }}>Entry Notes</Text>
            <TextInput
              value={entry.notes}
              onChangeText={(v) => patchEntry(index, { notes: v })}
              placeholder="Entry notes (optional)"
              placeholderTextColor={placeholderColor}
              style={inputStyle}
            />
          </View>
        </View>
      ))}

      <PrimaryButton title={isLift ? "Add another lift" : "Add another rep/drill"} onPress={addEntry} />

      <Pressable
        onPress={save}
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
          <Text style={{ fontSize: 16, fontWeight: "700", color: c.text }}>Save changes</Text>
        )}
      </Pressable>

      <Modal visible={confirmOpen} transparent animationType="fade">
        <Pressable
          onPress={closeConfirm}
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
            <Text style={{ fontSize: 18, fontWeight: "800", color: c.text }}>
              Discard changes?
            </Text>

            <Text style={{ color: c.subtext }}>
              You have unsaved changes. Are you sure you want to leave this screen?
            </Text>

            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 10 }}>
              <Pressable
                onPress={closeConfirm}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: c.border,
                  backgroundColor: c.bg,
                }}
              >
                <Text style={{ color: c.text, fontWeight: "700" }}>Keep editing</Text>
              </Pressable>

              <Pressable
                onPress={discardChanges}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderRadius: 10,
                  backgroundColor: "#DC2626",
                }}
              >
                <Text style={{ color: "white", fontWeight: "700" }}>Discard</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </FormScreen>
  );
}