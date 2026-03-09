import { useMemo, useState, useEffect, useCallback } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import FormScreen from "../../components/FormScreen";
import { useAppColors } from "../../lib/theme";
import LeaderboardCard from "../../components/leaderboard/LeaderboardCard";
import {
  ExerciseLeaderboardMeta,
  FULL_SUMMARY_LEADERBOARD_METRICS,
  FullSummaryLeaderboardMetricKey,
  LEADERBOARD_RANGES,
  LeaderboardRangeKey,
  LeaderboardRow,
  formatExerciseLeaderboardValue,
  formatSummaryLeaderboardValue,
} from "../../components/leaderboard/types";
import { supabase } from "../../lib/supabase";

type Mode = "summary" | "exercise";
type ExerciseGroup = "track" | "lift";

type SummaryAggregate = {
  user_id: string;
  display_name: string;
  total_workouts: number;
  distance: number;
  track_workouts: number;
  lift_workouts: number;
  total_sets: number;
};

type WorkoutSummaryViewRow = {
  user_id: string;
  workout_date: string;
  workout_type: "track" | "lift" | string | null;
  total_sets: number | null;
  distance_m_total: number | string | null;
};

type ExerciseChip = ExerciseLeaderboardMeta & {
  category_group: ExerciseGroup;
};

function inferExerciseScoreType(e: {
  name?: string | null;
  category?: string | null;
  distance_m?: number | null;
}): "max_weight" | "min_time" | "max_reps" {
  const rawName = e.name ?? "";
  const name = rawName.toLowerCase().trim();
  const category = (e.category ?? "").toLowerCase();
  const distance = Number(e.distance_m ?? 0);

  if (category === "track") return "min_time";
  if (category === "lift") return "max_weight";

  if (distance > 0) return "min_time";

  if (
    name.includes("pull-up") ||
    name.includes("pull up") ||
    name.includes("push-up") ||
    name.includes("push up") ||
    name.includes("sit-up") ||
    name.includes("sit up") ||
    name.includes("dip") ||
    name.includes("plank")
  ) {
    return "max_reps";
  }

  if (
    name.includes("run") ||
    name.includes("mile") ||
    /^\d+\s*m$/.test(name) ||
    /^\d+\s*k$/.test(name)
  ) {
    return "min_time";
  }

  return "max_weight";
}

function inferExerciseGroup(e: {
  category?: string | null;
  distance_m?: number | null;
  score_type?: string | null;
}): ExerciseGroup {
  const category = (e.category ?? "").toLowerCase();
  const distance = Number(e.distance_m ?? 0);
  const scoreType = (e.score_type ?? "").toLowerCase();

  if (category === "track") return "track";
  if (category === "lift") return "lift";
  if (distance > 0) return "track";
  if (scoreType === "min_time") return "track";
  return "lift";
}

function getRangeStartDate(range: LeaderboardRangeKey): string | null {
  const now = new Date();

  if (range === "all") return null;

  const d = new Date(now);

  if (range === "30d") d.setDate(d.getDate() - 30);
  else if (range === "3m") d.setMonth(d.getMonth() - 3);
  else if (range === "6m") d.setMonth(d.getMonth() - 6);
  else if (range === "1y") d.setFullYear(d.getFullYear() - 1);

  return d.toISOString().slice(0, 10);
}

function emptySummaryRows(): Record<FullSummaryLeaderboardMetricKey, LeaderboardRow[]> {
  return {
    total_workouts: [],
    distance: [],
    track_workouts: [],
    lift_workouts: [],
    total_sets: [],
  };
}

export default function LeaderboardScreen() {
  const c = useAppColors();

  const [range, setRange] = useState<LeaderboardRangeKey>("30d");
  const [mode, setMode] = useState<Mode>("summary");
  const [activeSummaryMetric, setActiveSummaryMetric] =
    useState<FullSummaryLeaderboardMetricKey>("total_workouts");

  const [exerciseGroup, setExerciseGroup] = useState<ExerciseGroup>("track");
  const [activeExerciseId, setActiveExerciseId] = useState<string>("");
  const [exercises, setExercises] = useState<ExerciseChip[]>([]);
  const [loadingExercises, setLoadingExercises] = useState(true);

  const [exerciseRows, setExerciseRows] = useState<LeaderboardRow[]>([]);
  const [loadingExerciseRows, setLoadingExerciseRows] = useState(false);

  const [summaryRows, setSummaryRows] = useState<
    Record<FullSummaryLeaderboardMetricKey, LeaderboardRow[]>
  >(emptySummaryRows());
  const [loadingSummaryRows, setLoadingSummaryRows] = useState(false);

  const filteredExercises = useMemo(
    () => exercises.filter((e) => e.category_group === exerciseGroup),
    [exercises, exerciseGroup]
  );

  const activeExercise = useMemo(
    () => filteredExercises.find((e) => e.exercise_id === activeExerciseId) ?? null,
    [filteredExercises, activeExerciseId]
  );

  const loadExercises = useCallback(async () => {
    setLoadingExercises(true);

    const { data, error } = await supabase
      .from("exercises")
      .select("exercise_id, name, category, distance_m, score_type")
      .order("name");

    if (error) {
      console.log("Exercise load error:", error.message);
      setExercises([]);
      setActiveExerciseId("");
      setLoadingExercises(false);
      return;
    }

    const rows: ExerciseChip[] = (data ?? []).map((e: any) => {
      const resolvedScoreType =
        e.score_type ??
        inferExerciseScoreType({
          name: e.name,
          category: e.category,
          distance_m: e.distance_m,
        });

      return {
        exercise_id: e.exercise_id,
        name: e.name,
        score_type: resolvedScoreType,
        category_group: inferExerciseGroup({
          category: e.category,
          distance_m: e.distance_m,
          score_type: resolvedScoreType,
        }),
      };
    });

    setExercises(rows);
    setLoadingExercises(false);
  }, []);

  const loadExerciseLeaderboard = useCallback(
    async (
      exerciseId: string,
      scoreType: "max_weight" | "min_time" | "max_reps"
    ) => {
      setLoadingExerciseRows(true);

      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      const myId = userRes.user?.id ?? null;

      if (userErr || !myId) {
        setExerciseRows([]);
        setLoadingExerciseRows(false);
        return;
      }

      const { data: friendshipData, error: friendshipErr } = await supabase
        .from("friendships")
        .select("user_low, user_high, status")
        .eq("status", "accepted");

      if (friendshipErr) {
        console.log("Friendship load error:", friendshipErr.message);
        setExerciseRows([]);
        setLoadingExerciseRows(false);
        return;
      }

      const friendIds = (friendshipData ?? [])
        .map((row: any) => {
          if (row.user_low === myId) return row.user_high;
          if (row.user_high === myId) return row.user_low;
          return null;
        })
        .filter(Boolean) as string[];

      const participantIds = Array.from(new Set([myId, ...friendIds]));

      const { data: profileData, error: profileErr } = await supabase
        .from("profiles")
        .select("id, full_name, username")
        .in("id", participantIds);

      if (profileErr) {
        console.log("Profile load error:", profileErr.message);
      }

      const nameMap = new Map<string, string>();
      (profileData ?? []).forEach((p: any) => {
        const label =
          p.id === myId
            ? "You"
            : p.full_name?.trim() || p.username?.trim() || "Unknown";
        nameMap.set(p.id, label);
      });
      nameMap.set(myId, "You");

      const { data: prData, error: prErr } = await supabase
        .from("exercise_prs")
        .select("user_id, exercise_id, best_time_sec, best_weight, best_reps")
        .eq("exercise_id", exerciseId)
        .in("user_id", participantIds);

      if (prErr) {
        console.log("Exercise PR load error:", prErr.message);
        setExerciseRows([]);
        setLoadingExerciseRows(false);
        return;
      }

      const rows: LeaderboardRow[] = (prData ?? [])
        .map((row: any) => {
          let value: number | null = null;

          if (scoreType === "min_time") value = row.best_time_sec ?? null;
          else if (scoreType === "max_reps") value = row.best_reps ?? null;
          else value = row.best_weight ?? null;

          if (value == null) return null;

          return {
            user_id: row.user_id,
            display_name: nameMap.get(row.user_id) ?? "Unknown",
            value,
          };
        })
        .filter(Boolean) as LeaderboardRow[];

      rows.sort((a, b) => {
        if (scoreType === "min_time") return a.value - b.value;
        return b.value - a.value;
      });

      setExerciseRows(rows);
      setLoadingExerciseRows(false);
    },
    []
  );

  const loadSummaryLeaderboards = useCallback(
    async (selectedRange: LeaderboardRangeKey) => {
      setLoadingSummaryRows(true);

      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      const myId = userRes.user?.id ?? null;

      if (userErr || !myId) {
        setSummaryRows(emptySummaryRows());
        setLoadingSummaryRows(false);
        return;
      }

      const { data: friendshipData, error: friendshipErr } = await supabase
        .from("friendships")
        .select("user_low, user_high, status")
        .eq("status", "accepted");

      if (friendshipErr) {
        console.log("Friendship load error:", friendshipErr.message);
        setSummaryRows(emptySummaryRows());
        setLoadingSummaryRows(false);
        return;
      }

      const friendIds = (friendshipData ?? [])
        .map((row: any) => {
          if (row.user_low === myId) return row.user_high;
          if (row.user_high === myId) return row.user_low;
          return null;
        })
        .filter(Boolean) as string[];

      const participantIds = Array.from(new Set([myId, ...friendIds]));

      const { data: profileData, error: profileErr } = await supabase
        .from("profiles")
        .select("id, full_name, username")
        .in("id", participantIds);

      if (profileErr) {
        console.log("Profile load error:", profileErr.message);
      }

      const nameMap = new Map<string, string>();
      (profileData ?? []).forEach((p: any) => {
        const label =
          p.id === myId
            ? "You"
            : p.full_name?.trim() || p.username?.trim() || "Unknown";
        nameMap.set(p.id, label);
      });
      nameMap.set(myId, "You");

      let summaryQuery = supabase
        .from("workout_summary_v")
        .select("user_id, workout_date, workout_type, total_sets, distance_m_total")
        .in("user_id", participantIds);

      const startDate = getRangeStartDate(selectedRange);
      if (startDate) {
        summaryQuery = summaryQuery.gte("workout_date", startDate);
      }

      const { data: summaryData, error: summaryErr } = await summaryQuery;

      if (summaryErr) {
        console.log("Workout summary view load error:", summaryErr.message);
        setSummaryRows(emptySummaryRows());
        setLoadingSummaryRows(false);
        return;
      }

      const aggregateMap = new Map<string, SummaryAggregate>();
      participantIds.forEach((userId) => {
        aggregateMap.set(userId, {
          user_id: userId,
          display_name: nameMap.get(userId) ?? "Unknown",
          total_workouts: 0,
          distance: 0,
          track_workouts: 0,
          lift_workouts: 0,
          total_sets: 0,
        });
      });

      ((summaryData ?? []) as WorkoutSummaryViewRow[]).forEach((row) => {
        const agg = aggregateMap.get(row.user_id);
        if (!agg) return;

        agg.total_workouts += 1;
        agg.distance += Number(row.distance_m_total ?? 0);
        agg.total_sets += Number(row.total_sets ?? 0);

        if (row.workout_type === "track") agg.track_workouts += 1;
        if (row.workout_type === "lift") agg.lift_workouts += 1;
      });

      const allAggs = Array.from(aggregateMap.values());

      function makeRows(key: FullSummaryLeaderboardMetricKey): LeaderboardRow[] {
        return allAggs
          .map((a) => ({
            user_id: a.user_id,
            display_name: a.display_name,
            value: a[key],
          }))
          .filter((r) => r.value > 0)
          .sort((a, b) => b.value - a.value);
      }

      setSummaryRows({
        total_workouts: makeRows("total_workouts"),
        distance: makeRows("distance"),
        track_workouts: makeRows("track_workouts"),
        lift_workouts: makeRows("lift_workouts"),
        total_sets: makeRows("total_sets"),
      });

      setLoadingSummaryRows(false);
    },
    []
  );

  useEffect(() => {
    loadExercises();
  }, [loadExercises]);

  useEffect(() => {
    if (mode !== "summary") return;
    loadSummaryLeaderboards(range);
  }, [mode, range, loadSummaryLeaderboards]);

  useEffect(() => {
    if (filteredExercises.length === 0) {
      setActiveExerciseId("");
      return;
    }

    const stillExists = filteredExercises.some(
      (exercise) => exercise.exercise_id === activeExerciseId
    );

    if (!stillExists) {
      setActiveExerciseId(filteredExercises[0].exercise_id);
    }
  }, [filteredExercises, activeExerciseId]);

  useEffect(() => {
    if (mode !== "exercise") return;
    if (!activeExerciseId) return;
    if (!activeExercise) return;

    loadExerciseLeaderboard(activeExerciseId, activeExercise.score_type);
  }, [mode, activeExerciseId, activeExercise, loadExerciseLeaderboard]);

  const rows =
    mode === "summary"
      ? summaryRows[activeSummaryMetric] ?? []
      : exerciseRows;

  const title =
    mode === "summary"
      ? FULL_SUMMARY_LEADERBOARD_METRICS.find(
          (m) => m.key === activeSummaryMetric
        )?.label ?? "Leaderboard"
      : activeExercise?.name ?? "Exercise";

  const formatValue =
    mode === "summary"
      ? (value: number) =>
          formatSummaryLeaderboardValue(activeSummaryMetric, value)
      : (value: number) =>
          formatExerciseLeaderboardValue(
            activeExercise?.score_type ?? "max_weight",
            value
          );

  return (
    <FormScreen scroll>
      <View style={{ gap: 14 }}>
        <View>
          <Text style={{ color: c.text, fontSize: 28, fontWeight: "900" }}>
            Leaderboards
          </Text>
          <Text style={{ color: c.subtext, marginTop: 4 }}>
            Compare your stats with friends.
          </Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: "row", gap: 8, paddingRight: 4 }}>
            {LEADERBOARD_RANGES.map((item) => {
              const active = item.key === range;
              return (
                <Pressable
                  key={item.key}
                  onPress={() => setRange(item.key)}
                  style={{
                    borderWidth: 1,
                    borderColor: active ? c.text : c.border,
                    backgroundColor: active ? c.text : c.card,
                    borderRadius: 999,
                    paddingVertical: 10,
                    paddingHorizontal: 14,
                  }}
                >
                  <Text
                    style={{ color: active ? c.bg : c.text, fontWeight: "800" }}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>

        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable
            onPress={() => setMode("summary")}
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: mode === "summary" ? c.text : c.border,
              backgroundColor: mode === "summary" ? c.text : c.card,
              borderRadius: 12,
              paddingVertical: 12,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                color: mode === "summary" ? c.bg : c.text,
                fontWeight: "800",
              }}
            >
              Summary
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setMode("exercise")}
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: mode === "exercise" ? c.text : c.border,
              backgroundColor: mode === "exercise" ? c.text : c.card,
              borderRadius: 12,
              paddingVertical: 12,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                color: mode === "exercise" ? c.bg : c.text,
                fontWeight: "800",
              }}
            >
              Exercises
            </Text>
          </Pressable>
        </View>

        {mode === "summary" ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: "row", gap: 8, paddingRight: 4 }}>
              {FULL_SUMMARY_LEADERBOARD_METRICS.map((metric) => {
                const active = metric.key === activeSummaryMetric;
                return (
                  <Pressable
                    key={metric.key}
                    onPress={() => setActiveSummaryMetric(metric.key)}
                    style={{
                      borderWidth: 1,
                      borderColor: active ? c.text : c.border,
                      backgroundColor: active ? c.text : c.card,
                      borderRadius: 999,
                      paddingVertical: 10,
                      paddingHorizontal: 14,
                    }}
                  >
                    <Text
                      style={{
                        color: active ? c.bg : c.text,
                        fontWeight: "800",
                      }}
                    >
                      {metric.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        ) : (
          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable
                onPress={() => setExerciseGroup("track")}
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor: exerciseGroup === "track" ? c.text : c.border,
                  backgroundColor: exerciseGroup === "track" ? c.text : c.card,
                  borderRadius: 12,
                  paddingVertical: 10,
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    color: exerciseGroup === "track" ? c.bg : c.text,
                    fontWeight: "800",
                  }}
                >
                  Track
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setExerciseGroup("lift")}
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor: exerciseGroup === "lift" ? c.text : c.border,
                  backgroundColor: exerciseGroup === "lift" ? c.text : c.card,
                  borderRadius: 12,
                  paddingVertical: 10,
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    color: exerciseGroup === "lift" ? c.bg : c.text,
                    fontWeight: "800",
                  }}
                >
                  Lift
                </Text>
              </Pressable>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: "row", gap: 8, paddingRight: 4 }}>
                {loadingExercises ? (
                  <Text style={{ color: c.subtext }}>Loading exercises...</Text>
                ) : filteredExercises.length === 0 ? (
                  <Text style={{ color: c.subtext }}>
                    No {exerciseGroup} exercises found.
                  </Text>
                ) : (
                  filteredExercises.map((exercise) => {
                    const active = exercise.exercise_id === activeExerciseId;
                    return (
                      <Pressable
                        key={exercise.exercise_id}
                        onPress={() => setActiveExerciseId(exercise.exercise_id)}
                        style={{
                          borderWidth: 1,
                          borderColor: active ? c.text : c.border,
                          backgroundColor: active ? c.text : c.card,
                          borderRadius: 999,
                          paddingVertical: 10,
                          paddingHorizontal: 14,
                        }}
                      >
                        <Text
                          style={{
                            color: active ? c.bg : c.text,
                            fontWeight: "800",
                          }}
                        >
                          {exercise.name}
                        </Text>
                      </Pressable>
                    );
                  })
                )}
              </View>
            </ScrollView>
          </View>
        )}

        {mode === "exercise" && loadingExerciseRows && (
          <Text style={{ color: c.subtext }}>Loading leaderboard...</Text>
        )}

        {mode === "summary" && loadingSummaryRows && (
          <Text style={{ color: c.subtext }}>Loading summary...</Text>
        )}

        <LeaderboardCard title={title} rows={rows} formatValue={formatValue} />
      </View>
    </FormScreen>
  );
}