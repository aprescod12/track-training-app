import { useCallback, useMemo, useState } from "react";
import { View, Text, ActivityIndicator, Alert, Pressable } from "react-native";
import { useFocusEffect, router } from "expo-router";
import { supabase } from "../../lib/supabase";
import FormScreen from "../../components/FormScreen";
import { useAppColors } from "../../lib/theme";
import { formatYMD } from "../../lib/date";

type TrackWorkoutRow = {
  id: string;
  workout_date: string;
  title: string | null;
  notes: string | null;
};

type TopExerciseRow = {
  exercise_id: string;
  name: string;
  entryCount: number;
  totalSets: number;
  totalReps: number;
  totalDistanceM: number;
};

function addDays(d: Date, n: number) {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function prettyDate(ymd: string) {
  const d = new Date(`${ymd}T00:00:00`);
  if (isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export default function TrackStatsScreen() {
  const c = useAppColors();

  const [range, setRange] = useState<7 | 30>(7);
  const [loading, setLoading] = useState(true);

  const [stats, setStats] = useState({
    totalWorkouts: 0,
    totalDistanceM: 0,
    avgDistancePerWorkoutM: 0,
    totalSets: 0,
    totalReps: 0,
    newPRs: 0,
  });

  const [recentWorkouts, setRecentWorkouts] = useState<TrackWorkoutRow[]>([]);
  const [topExercises, setTopExercises] = useState<TopExerciseRow[]>([]);

  const rangeLabel = useMemo(() => (range === 7 ? "Last 7 Days" : "Last 30 Days"), [range]);

  const load = useCallback(async () => {
    try {
      setLoading(true);

      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      const uid = userRes.user?.id ?? null;

      if (userErr || !uid) {
        setStats({
          totalWorkouts: 0,
          totalDistanceM: 0,
          avgDistancePerWorkoutM: 0,
          totalSets: 0,
          totalReps: 0,
          newPRs: 0,
        });
        setRecentWorkouts([]);
        setTopExercises([]);
        return;
      }

      const today = startOfToday();
      const startDate = addDays(today, -(range - 1));
      const startKey = formatYMD(startDate);
      const endKey = formatYMD(today);

      const { data: workoutRows, error: workoutErr } = await supabase
        .from("workouts")
        .select("id, workout_date, title, notes")
        .eq("user_id", uid)
        .eq("workout_type", "track")
        .gte("workout_date", startKey)
        .lte("workout_date", endKey)
        .order("workout_date", { ascending: false })
        .order("created_at", { ascending: false });

      if (workoutErr) throw workoutErr;

      const trackWorkouts = (workoutRows ?? []) as TrackWorkoutRow[];
      setRecentWorkouts(trackWorkouts.slice(0, 8));

      if (trackWorkouts.length === 0) {
        setStats({
          totalWorkouts: 0,
          totalDistanceM: 0,
          avgDistancePerWorkoutM: 0,
          totalSets: 0,
          totalReps: 0,
          newPRs: 0,
        });
        setTopExercises([]);
        return;
      }

      const { data: entryRows, error: entryErr } = await supabase
        .from("workout_entries")
        .select(`
          id,
          exercise_id,
          reps,
          sets,
          exercises(name, distance_m),
          workouts!inner(id, user_id, workout_type, workout_date)
        `)
        .eq("user_id", uid)
        .eq("workouts.user_id", uid)
        .eq("workouts.workout_type", "track")
        .gte("workouts.workout_date", startKey)
        .lte("workouts.workout_date", endKey);

      if (entryErr) throw entryErr;

      const rows = (entryRows ?? []) as any[];

      let totalDistanceM = 0;
      let totalSets = 0;
      let totalReps = 0;

      const exerciseMap: Record<string, TopExerciseRow> = {};

      for (const r of rows) {
        const exerciseId = r.exercise_id ?? "unknown";
        const name = r.exercises?.name ?? "Unknown Exercise";
        const perRep = Number(r.exercises?.distance_m ?? 0);
        const reps = Number(r.reps ?? 1);
        const sets = Number(r.sets ?? 1);
        const distance = perRep * reps * sets;

        totalDistanceM += distance;
        totalSets += sets;
        totalReps += reps * sets;

        if (!exerciseMap[exerciseId]) {
          exerciseMap[exerciseId] = {
            exercise_id: exerciseId,
            name,
            entryCount: 0,
            totalSets: 0,
            totalReps: 0,
            totalDistanceM: 0,
          };
        }

        exerciseMap[exerciseId].entryCount += 1;
        exerciseMap[exerciseId].totalSets += sets;
        exerciseMap[exerciseId].totalReps += reps * sets;
        exerciseMap[exerciseId].totalDistanceM += distance;
      }

      const top = Object.values(exerciseMap)
        .sort((a, b) => {
          if (b.entryCount !== a.entryCount) return b.entryCount - a.entryCount;
          if (b.totalSets !== a.totalSets) return b.totalSets - a.totalSets;
          return b.totalDistanceM - a.totalDistanceM;
        })
        .slice(0, 5);

      setTopExercises(top);

      const avgDistancePerWorkoutM =
        trackWorkouts.length > 0 ? totalDistanceM / trackWorkouts.length : 0;

      let newPRs = 0;

      const startIso = new Date(`${startKey}T00:00:00`).toISOString();
      const endExclusiveIso = new Date(`${formatYMD(addDays(today, 1))}T00:00:00`).toISOString();

      const { count: prCount, error: prErr } = await supabase
        .from("exercise_prs")
        .select("*", { count: "exact", head: true })
        .eq("user_id", uid)
        .gte("updated_at", startIso)
        .lt("updated_at", endExclusiveIso)
        .not("best_time_entry_id", "is", null);

      if (!prErr) {
        newPRs = prCount ?? 0;
      } else {
        console.log("track PR count query skipped:", prErr.message);
      }

      setStats({
        totalWorkouts: trackWorkouts.length,
        totalDistanceM,
        avgDistancePerWorkoutM,
        totalSets,
        totalReps,
        newPRs,
      });
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to load track stats");
      setStats({
        totalWorkouts: 0,
        totalDistanceM: 0,
        avgDistancePerWorkoutM: 0,
        totalSets: 0,
        totalReps: 0,
        newPRs: 0,
      });
      setRecentWorkouts([]);
      setTopExercises([]);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  function StatCard({
    label,
    value,
    sublabel,
    flex = 1,
  }: {
    label: string;
    value: string | number;
    sublabel?: string;
    flex?: number;
  }) {
    return (
      <View
        style={{
          flex,
          borderWidth: 1,
          borderColor: c.border,
          backgroundColor: c.bg,
          borderRadius: 16,
          padding: 14,
          gap: 6,
          minHeight: 96,
        }}
      >
        <Text style={{ color: c.subtext, fontWeight: "700", fontSize: 13 }}>{label}</Text>
        <Text style={{ color: c.text, fontSize: 24, fontWeight: "900" }}>{value}</Text>
        {!!sublabel && <Text style={{ color: c.subtext, fontSize: 12 }}>{sublabel}</Text>}
      </View>
    );
  }

  return (
    <FormScreen>
      <View style={{ gap: 14 }}>
        <View style={{ gap: 4 }}>
          <Text style={{ fontSize: 24, fontWeight: "900", color: c.text }}>Track Stats</Text>
          <Text style={{ color: c.subtext }}>{rangeLabel}</Text>
        </View>

        {/* Range selector */}
        <View style={{ gap: 10 }}>
          <View
            style={{
              flexDirection: "row",
              borderWidth: 1,
              borderColor: c.border,
              backgroundColor: c.card,
              borderRadius: 14,
              padding: 4,
              gap: 4,
            }}
          >
            {[7, 30].map((d) => {
              const selected = d === range;

              return (
                <Pressable
                  key={d}
                  onPress={() => setRange(d as 7 | 30)}
                  style={{
                    flex: 1,
                    borderRadius: 10,
                    paddingVertical: 10,
                    paddingHorizontal: 8,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: selected ? c.primary : "transparent",
                    borderWidth: selected ? 0 : 1,
                    borderColor: selected ? "transparent" : c.border,
                  }}
                >
                  <Text
                    style={{
                      fontWeight: "800",
                      color: selected ? c.primaryText : c.text,
                      fontSize: 13,
                    }}
                  >
                    {d} Days
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {loading ? (
          <View style={{ marginTop: 4, flexDirection: "row", alignItems: "center", gap: 10 }}>
            <ActivityIndicator />
            <Text style={{ color: c.subtext }}>Loading track stats…</Text>
          </View>
        ) : (
          <>
            <View
              style={{
                borderWidth: 1,
                borderColor: c.border,
                backgroundColor: c.card,
                borderRadius: 18,
                padding: 16,
                gap: 10,
              }}
            >
              <Text style={{ fontSize: 17, fontWeight: "900", color: c.text }}>Performance</Text>

              <View style={{ flexDirection: "row", gap: 10 }}>
                <StatCard
                  label="Distance Ran"
                  value={`${(stats.totalDistanceM / 1000).toFixed(2)} km`}
                  sublabel="Total distance in period"
                  flex={1.4}
                />
                <StatCard
                  label="Total Workouts"
                  value={stats.totalWorkouts}
                  sublabel="Track sessions"
                />
              </View>

              <View style={{ flexDirection: "row", gap: 10 }}>
                <StatCard
                  label="Distance / Workout"
                  value={
                    stats.totalWorkouts > 0
                      ? `${(stats.avgDistancePerWorkoutM / 1000).toFixed(2)} km`
                      : "0.00 km"
                  }
                  sublabel="Average track session"
                />
                <StatCard
                  label="New PRs"
                  value={stats.newPRs}
                  sublabel="PR updates in period"
                />
              </View>
            </View>

            <View
              style={{
                borderWidth: 1,
                borderColor: c.border,
                backgroundColor: c.card,
                borderRadius: 18,
                padding: 16,
                gap: 10,
              }}
            >
              <Text style={{ fontSize: 17, fontWeight: "900", color: c.text }}>Volume</Text>

              <View style={{ flexDirection: "row", gap: 10 }}>
                <StatCard
                  label="Total Sets"
                  value={stats.totalSets}
                  sublabel="Track sets completed"
                />
                <StatCard
                  label="Total Reps"
                  value={stats.totalReps}
                  sublabel="Track reps completed"
                />
              </View>
            </View>

            <View
              style={{
                borderWidth: 1,
                borderColor: c.border,
                backgroundColor: c.card,
                borderRadius: 18,
                padding: 16,
                gap: 12,
              }}
            >
              <Text style={{ fontSize: 17, fontWeight: "900", color: c.text }}>Most Logged Exercises</Text>

              {topExercises.length === 0 ? (
                <Text style={{ color: c.subtext }}>No track exercises logged in this period.</Text>
              ) : (
                topExercises.map((ex, idx) => (
                  <View
                    key={`${ex.exercise_id}-${idx}`}
                    style={{
                      borderWidth: 1,
                      borderColor: c.border,
                      backgroundColor: c.bg,
                      borderRadius: 14,
                      padding: 12,
                      gap: 6,
                    }}
                  >
                    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
                      <Text style={{ color: c.text, fontWeight: "800", flex: 1 }}>{ex.name}</Text>
                      <Text style={{ color: c.subtext }}>#{idx + 1}</Text>
                    </View>

                    <Text style={{ color: c.subtext }}>
                      Logged {ex.entryCount} time{ex.entryCount === 1 ? "" : "s"}
                    </Text>

                    <Text style={{ color: c.subtext }}>
                      {ex.totalSets} sets • {ex.totalReps} reps • {(ex.totalDistanceM / 1000).toFixed(2)} km
                    </Text>

                    <Pressable onPress={() => router.push(`/history/${ex.exercise_id}`)}>
                      <Text style={{ color: c.text, fontWeight: "800" }}>View history →</Text>
                    </Pressable>
                  </View>
                ))
              )}
            </View>

            <View
              style={{
                borderWidth: 1,
                borderColor: c.border,
                backgroundColor: c.card,
                borderRadius: 18,
                padding: 16,
                gap: 12,
              }}
            >
              <Text style={{ fontSize: 17, fontWeight: "900", color: c.text }}>Recent Track Workouts</Text>

              {recentWorkouts.length === 0 ? (
                <Text style={{ color: c.subtext }}>No track workouts logged in this period.</Text>
              ) : (
                recentWorkouts.map((w) => (
                  <Pressable
                    key={w.id}
                    onPress={() => router.push(`/workout/${w.id}`)}
                    style={{
                      borderWidth: 1,
                      borderColor: c.border,
                      backgroundColor: c.bg,
                      borderRadius: 14,
                      padding: 12,
                      gap: 6,
                    }}
                  >
                    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
                      <Text style={{ color: c.text, fontWeight: "800", flex: 1 }}>
                        {w.title?.trim() || "Track Workout"}
                      </Text>
                      <Text style={{ color: c.subtext }}>{prettyDate(w.workout_date)}</Text>
                    </View>

                    {!!w.notes && (
                      <Text numberOfLines={2} style={{ color: c.subtext }}>
                        {w.notes}
                      </Text>
                    )}

                    <Text style={{ color: c.text, fontWeight: "800" }}>View workout →</Text>
                  </Pressable>
                ))
              )}
            </View>
          </>
        )}
      </View>
    </FormScreen>
  );
}