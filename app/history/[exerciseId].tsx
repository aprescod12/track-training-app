import { useCallback, useMemo, useState } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator, Dimensions } from "react-native";
import { useLocalSearchParams, useFocusEffect, router } from "expo-router";
import { supabase } from "../../lib/supabase";
import FormScreen from "../../components/FormScreen";
import { useAppColors } from "../../lib/theme";

type EntrySetRow = {
  set_number: number;
  rep_number: number | null;
  time_text: string | null;
  reps: number | null;
  weight: number | null;
};

type HistoryRow = {
  id: string;
  workouts: {
    workout_date: string; // YYYY-MM-DD
    workout_type: "track" | "lift" | string;
    title: string | null;
  } | null;
  exercises: { name: string } | null;
  entry_sets: EntrySetRow[] | null;
};

function formatPrettyDate(ymd: string) {
  const d = new Date(ymd + "T00:00:00");
  if (isNaN(d.getTime())) return ymd;

  const month = d.toLocaleString(undefined, { month: "long" });
  const dd = d.getDate();
  const year = d.getFullYear();

  const ordinal = (n: number) => {
    if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`;
    switch (n % 10) {
      case 1:
        return `${n}st`;
      case 2:
        return `${n}nd`;
      case 3:
        return `${n}rd`;
      default:
        return `${n}th`;
    }
  };

  return `${month} ${ordinal(dd)}, ${year}`;
}

// Accepts: "28.7", "1:23.45", "01:23.45"
function parseTimeToSeconds(t: string): number | null {
  const s = t.trim();
  if (!s) return null;

  // mm:ss(.xx)
  if (s.includes(":")) {
    const [mm, rest] = s.split(":");
    const minutes = Number(mm);
    const seconds = Number(rest);
    if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return null;
    return minutes * 60 + seconds;
  }

  // plain seconds
  const seconds = Number(s);
  if (!Number.isFinite(seconds)) return null;
  return seconds;
}

export default function ExerciseHistoryScreen() {
  const c = useAppColors();
  const { exerciseId } = useLocalSearchParams<{ exerciseId: string }>();

  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>("Loading...");
  const [rows, setRows] = useState<HistoryRow[]>([]);

  // ensures header is correct even when rows is empty
  const [exerciseName, setExerciseName] = useState<string>("Exercise History");

  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!exerciseId) return;

    setLoading(true);
    setStatus("Loading...");

    const { data, error } = await supabase
      .from("workout_entries")
      .select(
        `
        id,
        workouts!inner(workout_date, workout_type, title),
        exercises(name),
        entry_sets(set_number, rep_number, time_text, reps, weight)
      `
      )
      .eq("exercise_id", exerciseId)
      .order("workout_date", { ascending: false, foreignTable: "workouts" })
      .order("set_number", { ascending: true, foreignTable: "entry_sets" })
      .order("rep_number", { ascending: true, foreignTable: "entry_sets" })
      .limit(500);

    if (error) {
      console.log("history load error:", error);
      setStatus("Error: " + error.message);
      setRows([]);
      setExerciseName("Exercise History");
      setLoading(false);
      return;
    }

    const nextRows = (data as any) ?? [];
    setRows(nextRows);

    const fromRows = nextRows?.[0]?.exercises?.name?.trim();
    if (fromRows) {
      setExerciseName(fromRows);
    } else {
      const { data: ex, error: exErr } = await supabase
        .from("exercises")
        .select("name")
        .eq("exercise_id", exerciseId)
        .maybeSingle();

      if (!exErr && ex?.name) setExerciseName(ex.name);
      else setExerciseName("Exercise History");
    }

    setStatus("Loaded ✅");
    setLoading(false);
  }, [exerciseId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Group by workout_date
  const grouped = useMemo(() => {
    const map: Record<string, HistoryRow[]> = {};
    for (const r of rows) {
      const date = r.workouts?.workout_date;
      if (!date) continue;
      if (!map[date]) map[date] = [];
      map[date].push(r);
    }
    const dates = Object.keys(map).sort((a, b) => (a < b ? 1 : -1)); // desc
    return { map, dates };
  }, [rows]);

  // Compute BEST performance: if ANY time_text exists => track; else lift.
  const best = useMemo(() => {
    const hasTimes = rows.some((r) => (r.entry_sets ?? []).some((s) => (s.time_text ?? "").trim()));
    const type: "track" | "lift" = hasTimes ? "track" : "lift";

    if (type === "lift") {
      let bestWeight = -Infinity;
      let bestReps: number | null = null;
      let bestDate: string | null = null;

      for (const r of rows) {
        const date = r.workouts?.workout_date ?? null;
        for (const s of r.entry_sets ?? []) {
          const w = s.weight;
          if (w == null) continue;
          const ww = Number(w);
          if (!Number.isFinite(ww)) continue;

          if (ww > bestWeight) {
            bestWeight = ww;
            bestReps = s.reps ?? null;
            bestDate = date;
          }
        }
      }

      if (bestWeight === -Infinity) return null;

      return {
        type: "lift" as const,
        date: bestDate,
        label: bestReps != null ? `${bestReps} reps @ ${bestWeight}` : `Best weight: ${bestWeight}`,
      };
    }

    // track: lowest time_text (overall fastest rep time)
    let bestSec = Infinity;
    let bestStr: string | null = null;
    let bestDate: string | null = null;

    for (const r of rows) {
      const date = r.workouts?.workout_date ?? null;
      for (const s of r.entry_sets ?? []) {
        const tt = (s.time_text ?? "").trim();
        if (!tt) continue;
        const sec = parseTimeToSeconds(tt);
        if (sec == null) continue;

        if (sec < bestSec) {
          bestSec = sec;
          bestStr = tt;
          bestDate = date;
        }
      }
    }

    if (bestSec === Infinity || !bestStr) return null;

    return {
      type: "track" as const,
      date: bestDate,
      label: `Fastest: ${bestStr}`,
    };
  }, [rows]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // Make the "Sets" container take full available width (inside the horizontal list)
  const windowW = Dimensions.get("window").width;
  const entryCardWidth = Math.max(280, windowW - 32); // tweak 32 if your FormScreen padding differs

  return (
    <FormScreen
      refreshControlProps={{
        refreshing,
        onRefresh,
      }}
    >
      {/* Header */}
      <View style={{ gap: 6 }}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Text style={{ fontSize: 22, fontWeight: "900", color: c.text }}>{exerciseName}</Text>

          <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
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
              <Text style={{ fontWeight: "600", color: c.text }}>Back</Text>
            </Pressable>
          </View>
        </View>

        <Text style={{ color: c.subtext }}>{status}</Text>
      </View>

      {/* Best Performance Badge */}
      <View
        style={{
          marginTop: 10,
          borderWidth: 1,
          borderColor: c.border,
          backgroundColor: c.card,
          borderRadius: 14,
          padding: 14,
          gap: 6,
        }}
      >
        <Text style={{ fontWeight: "900", color: c.text }}>Best Performance</Text>

        {!best ? (
          <Text style={{ color: c.subtext }}>No recorded sets yet for this exercise.</Text>
        ) : (
          <>
            <Text style={{ fontSize: 18, fontWeight: "900", color: c.text }}>{best.label}</Text>
            <Text style={{ color: c.subtext }}>{best.date ? `On ${formatPrettyDate(best.date)}` : ""}</Text>
          </>
        )}
      </View>

      {/* Body */}
      {loading ? (
        <View style={{ marginTop: 16, flexDirection: "row", gap: 10, alignItems: "center" }}>
          <ActivityIndicator />
          <Text style={{ color: c.subtext }}>Loading history…</Text>
        </View>
      ) : grouped.dates.length === 0 ? (
        <Text style={{ marginTop: 16, color: c.subtext }}>No history for this exercise yet.</Text>
      ) : (
        <View style={{ marginTop: 12, gap: 12 }}>
          {grouped.dates.map((date) => {
            const list = grouped.map[date] ?? [];
            const workoutTitle = list?.[0]?.workouts?.title ?? null;
            const workoutType = list?.[0]?.workouts?.workout_type;

            return (
              <View
                key={date}
                style={{
                  borderWidth: 1,
                  borderColor: c.border,
                  backgroundColor: c.card,
                  borderRadius: 14,
                  padding: 14,
                  gap: 8,
                }}
              >
                <Text style={{ fontWeight: "900", color: c.text }}>{formatPrettyDate(date)}</Text>
                <Text style={{ color: c.subtext }}>
                  {workoutType ? String(workoutType).toUpperCase() : ""} {workoutTitle ? `• ${workoutTitle}` : ""}
                </Text>

                {/* Each entry on that day (if you ever log the same exercise multiple times in one workout) */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                  {list.map((r) => {
                    const sets = (r.entry_sets ?? []) as EntrySetRow[];

                    // group rows by set_number
                    const bySet: Record<number, EntrySetRow[]> = {};
                    for (const s of sets) {
                      const k = Number(s.set_number);
                      if (!bySet[k]) bySet[k] = [];
                      bySet[k].push(s);
                    }
                    const setNums = Object.keys(bySet).map(Number).sort((a, b) => a - b);

                    // ---- BEST SET (star) for this day+entry ----
                    // Lift: highest weight set
                    // Track: lowest AVERAGE time across reps in that set
                    let bestSetNum: number | null = null;

                    if (setNums.length) {
                      if (workoutType === "lift") {
                        let bestW = -Infinity;
                        let bestR = -Infinity;

                        for (const sn of setNums) {
                          const row = bySet[sn]?.[0];
                          if (!row) continue;

                          const w = row.weight == null ? -Infinity : Number(row.weight);
                          const reps = row.reps == null ? -Infinity : Number(row.reps);

                          if (Number.isFinite(w) && (w > bestW || (w === bestW && reps > bestR))) {
                            bestW = w;
                            bestR = reps;
                            bestSetNum = sn;
                          }
                        }
                      } else {
                        let bestAvg = Infinity;

                        for (const sn of setNums) {
                          const times = (bySet[sn] ?? [])
                            .map((x) => (x.time_text ?? "").trim())
                            .filter(Boolean)
                            .map((t) => parseTimeToSeconds(t))
                            .filter((v): v is number => typeof v === "number" && Number.isFinite(v));

                          if (!times.length) continue;

                          const avg = times.reduce((a, b) => a + b, 0) / times.length;
                          if (avg < bestAvg) {
                            bestAvg = avg;
                            bestSetNum = sn;
                          }
                        }
                      }
                    }

                    return (
                      <View
                        key={r.id}
                        style={{
                          width: entryCardWidth - 30,
                          borderWidth: 1,
                          borderColor: c.border,
                          backgroundColor: c.bg,
                          borderRadius: 14,
                          padding: 12,
                          gap: 10,
                        }}
                      >
                        {setNums.length === 0 ? (
                          <Text style={{ color: c.subtext }}>No sets recorded.</Text>
                        ) : (
                          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                            {setNums.map((setNum) => {
                              const rowsForSet = bySet[setNum] ?? [];
                              const isBest = bestSetNum === setNum;

                              // LIFT: one row per set (rep_number=1)
                              if (workoutType === "lift") {
                                const row = rowsForSet[0];
                                if (!row) return null;

                                const reps = row.reps ?? "—";
                                const w = row.weight != null ? String(row.weight) : "";

                                return (
                                  <View
                                    key={setNum}
                                    style={{
                                      width: 180,
                                      borderWidth: 1,
                                      borderColor: c.border,
                                      backgroundColor: c.card,
                                      borderRadius: 14,
                                      padding: 12,
                                      gap: 6,
                                    }}
                                  >
                                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                                      <Text style={{ fontWeight: "900", color: c.text }}>Set {setNum}</Text>
                                      {isBest ? <Text style={{ color: c.text, fontWeight: "900" }}>★</Text> : null}
                                    </View>

                                    <Text style={{ color: c.subtext }} numberOfLines={2}>
                                      {reps} reps {w ? `@ ${w}` : ""}
                                    </Text>
                                  </View>
                                );
                              }

                              // TRACK: multiple rep times per set
                              const times = rowsForSet
                                .map((x) => (x.time_text ?? "").trim())
                                .filter(Boolean);

                              return (
                                <View
                                  key={setNum}
                                  style={{
                                    width: 220,
                                    borderWidth: 1,
                                    borderColor: c.border,
                                    backgroundColor: c.card,
                                    borderRadius: 14,
                                    padding: 12,
                                    gap: 6,
                                  }}
                                >
                                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                                    <Text style={{ fontWeight: "900", color: c.text }}>Set {setNum}</Text>
                                    {isBest ? <Text style={{ color: c.text, fontWeight: "900" }}>★</Text> : null}
                                  </View>

                                  {times.length ? (
                                    <Text style={{ color: c.subtext }} numberOfLines={3}>
                                      {times.join(" • ")}
                                    </Text>
                                  ) : (
                                    <Text style={{ color: c.subtext }}>No times.</Text>
                                  )}
                                </View>
                              );
                            })}
                          </ScrollView>
                        )}
                      </View>
                    );
                  })}
                </ScrollView>
              </View>
            );
          })}
        </View>
      )}
    </FormScreen>
  );
}