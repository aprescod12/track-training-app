import { useEffect, useMemo, useState, useCallback } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { supabase } from "../../../lib/supabase";
import FormScreen from "../../../components/FormScreen";
import { useAppColors } from "../../../lib/theme";

type EntrySetRow = {
  set_number: number;
  rep_number: number | null;
  time_text: string | null;
  reps: number | null;
  weight: number | null;
};

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
  entry_sets?: EntrySetRow[] | null;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  username: string | null;
};

type Workout = {
  id: string;
  workout_date: string;
  title: string;
  notes: string | null;
  workout_type: "track" | "lift" | string;
  user_id: string;
  profiles?: ProfileRow | null;
  workout_entries: Entry[];
};

function fmtNum(n: number | null | undefined) {
  if (n === null || n === undefined) return "";
  return String(n);
}

function firstNameFromFullName(fullName: string | null | undefined) {
  const t = (fullName ?? "").trim();
  if (!t) return null;
  return t.split(/\s+/)[0] ?? null;
}

function possessive(name: string) {
  return name.endsWith("s") || name.endsWith("S") ? `${name}'` : `${name}'s`;
}

function formatPrettyDate(ymd: string) {
  const d = new Date(ymd + "T00:00:00");
  if (isNaN(d.getTime())) return ymd;

  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function FriendWorkoutDetail() {
  const c = useAppColors();

  const params = useLocalSearchParams<{ workoutId?: string | string[] }>();
  const workoutId =
    typeof params.workoutId === "string"
      ? params.workoutId
      : Array.isArray(params.workoutId)
      ? params.workoutId[0]
      : undefined;

  const [item, setItem] = useState<Workout | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!workoutId) return;
  
    setLoading(true);
    setError(null);
  
    const { data, error } = await supabase
      .from("workouts")
      .select(
        `
        id,
        workout_date,
        title,
        notes,
        workout_type,
        user_id,
        profiles:profiles!workouts_user_id_profiles_fkey (
          id,
          full_name,
          username
        ),
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
          notes,
          entry_sets(set_number, rep_number, time_text, reps, weight)
        )
      `
      )
      .eq("id", workoutId)
      .single();
  
    if (error) {
      setError(error.message);
      setItem(null);
      setLoading(false);
      return;
    }
  
    setItem(data as any);
    setLoading(false);
  }, [workoutId]);

  useEffect(() => {
    load();
  }, [load]);

  const entries = useMemo(() => item?.workout_entries ?? [], [item]);

  const pageTitle = useMemo(() => {
    if (!item) return "Workout";

    const fn = firstNameFromFullName(item.profiles?.full_name);
    const fallback = item.profiles?.username ? item.profiles.username : "Friend";
    const who = fn ?? fallback;

    const kind = item.workout_type === "lift" ? "Lift" : "Workout";
    return `${possessive(who)} ${kind}`;
  }, [item]);

  return (
    <FormScreen>
      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 22, fontWeight: "800", color: c.text }}>{pageTitle}</Text>
        {error && (
          <Text style={{ color: "#ef4444", fontWeight: "600" }}>
            {error}
          </Text>
        )}
      </View>

      {loading && !item && (
        <View
          style={{
            borderWidth: 1,
            borderColor: c.border,
            backgroundColor: c.card,
            borderRadius: 14,
            padding: 14,
            flexDirection: "row",
            gap: 10,
            alignItems: "center",
          }}
        >
          <ActivityIndicator />
          <Text style={{ color: c.text }}>Loading…</Text>
        </View>
      )}

      {item && (
        <>
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
            <View style={{ gap: 4 }}>
              <Text style={{ fontSize: 18, fontWeight: "800", color: c.text }}>{item.title}</Text>
              <Text style={{ color: c.subtext }}>{formatPrettyDate(item.workout_date)}</Text>
            </View>

            {!!item.profiles?.full_name || !!item.profiles?.username ? (
              <Text style={{ color: c.subtext }}>
                {item.profiles?.full_name ?? "Unknown"}
                {item.profiles?.username ? ` • @${item.profiles.username}` : ""}
              </Text>
            ) : null}

            {!!item.notes && <Text style={{ color: c.text }}>{item.notes}</Text>}
          </View>

          <View style={{ gap: 4 }}>
            <Text style={{ fontSize: 16, fontWeight: "800", color: c.text }}>Entries</Text>
            <Text style={{ color: c.subtext }}>Workout details, sets, times, and notes.</Text>
          </View>

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
                    padding: 14,
                    gap: 12,
                  }}
                >
                  <View style={{ gap: 6 }}>
                    <Text style={{ fontWeight: "800", color: c.text }}>
                      {e.exercises?.name ?? e.exercise ?? "Entry"}
                    </Text>

                    {e.sets !== null && (
                      <View
                        style={{
                          alignSelf: "flex-start",
                          borderWidth: 1,
                          borderColor: c.border,
                          borderRadius: 999,
                          paddingVertical: 4,
                          paddingHorizontal: 10,
                          backgroundColor: c.bg,
                        }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: "800", color: c.text }}>
                          {e.sets} {e.sets === 1 ? "set" : "sets"}
                        </Text>
                      </View>
                    )}
                  </View>

                  {isLiftEntry && (
                    <View style={{ gap: 8 }}>
                      <Text style={{ fontWeight: "800", color: c.text }}>Lift Sets</Text>

                      {(e.lift_reps ?? []).map((r, idx) => {
                        const w = e.lift_weights?.[idx] ?? null;
                        if (r === null && w === null) return null;

                        return (
                          <View
                            key={idx}
                            style={{
                              borderWidth: 1,
                              borderColor: c.border,
                              backgroundColor: c.bg,
                              borderRadius: 12,
                              padding: 12,
                              gap: 4,
                            }}
                          >
                            <Text style={{ fontWeight: "700", color: c.text }}>Set {idx + 1}</Text>
                            <Text style={{ color: c.subtext }}>
                              {r !== null ? `${r} reps` : "—"} {w !== null ? `@ ${fmtNum(w)}` : ""}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  )}

                  {!isLiftEntry && isTrackEntry && (
                    <View style={{ gap: 10 }}>
                      {e.reps !== null && <Text style={{ color: c.subtext }}>Reps: {e.reps}</Text>}

                      {Array.isArray(e.set_times) && e.set_times.length ? (
                        <View style={{ gap: 8 }}>
                          <Text style={{ fontWeight: "800", color: c.text }}>Times</Text>
                          {e.set_times.map((row, sIdx) => (
                            <View
                              key={sIdx}
                              style={{
                                borderWidth: 1,
                                borderColor: c.border,
                                backgroundColor: c.bg,
                                borderRadius: 12,
                                padding: 12,
                                gap: 4,
                              }}
                            >
                              <Text style={{ fontWeight: "700", color: c.text }}>Set {sIdx + 1}</Text>
                              <Text style={{ color: c.subtext }}>
                                {(row ?? []).filter(Boolean).join(" • ") || "—"}
                              </Text>
                            </View>
                          ))}
                        </View>
                      ) : (
                        <Text style={{ color: c.subtext }}>No times recorded.</Text>
                      )}

                      {e.weight !== null && (
                        <Text style={{ color: c.subtext }}>Weight: {fmtNum(e.weight)}</Text>
                      )}
                    </View>
                  )}

                  {Array.isArray(e.entry_sets) && e.entry_sets.length ? (
                    <View style={{ gap: 8 }}>
                      <Text style={{ fontWeight: "800", color: c.text }}>Recorded Set Rows</Text>

                      {e.entry_sets.map((s, idx) => (
                        <View
                          key={idx}
                          style={{
                            borderWidth: 1,
                            borderColor: c.border,
                            backgroundColor: c.bg,
                            borderRadius: 12,
                            padding: 12,
                            gap: 4,
                          }}
                        >
                          <Text style={{ fontWeight: "700", color: c.text }}>
                            Set {s.set_number}
                            {s.rep_number ? `.${s.rep_number}` : ""}
                          </Text>

                          <Text style={{ color: c.subtext }}>
                            {s.time_text ? s.time_text : ""}
                            {s.reps !== null ? `${s.time_text ? " • " : ""}${s.reps} reps` : ""}
                            {s.weight !== null
                              ? `${s.time_text || s.reps !== null ? " • " : ""}@ ${fmtNum(s.weight)}`
                              : ""}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : null}

                  {!!e.notes && (
                    <View style={{ gap: 6 }}>
                      <Text style={{ fontWeight: "800", color: c.text }}>Notes</Text>
                      <Text style={{ color: c.subtext }}>{e.notes}</Text>
                    </View>
                  )}
                </View>
              );
            })
          ) : (
            <View
              style={{
                borderWidth: 1,
                borderColor: c.border,
                backgroundColor: c.card,
                borderRadius: 14,
                padding: 14,
              }}
            >
              <Text style={{ color: c.subtext }}>No entries found.</Text>
            </View>
          )}
        </>
      )}
    </FormScreen>
  );
}