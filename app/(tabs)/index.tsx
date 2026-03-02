import { useCallback, useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { supabase } from "../../lib/supabase";
import { formatYMD } from "../../lib/date";
import PrimaryButton from "../../components/PrimaryButton";
import { useAppColors } from "../../lib/theme";
import FormScreen from "../../components/FormScreen";
import { SafeAreaView } from "react-native-safe-area-context";

type Entry = {
  id: string;
  exercise_id: string | null;
  exercises?: { name: string } | null;
  exercise: string | null;
  reps: number | null;
  time: string | null;
  weight: number | null;
  notes: string | null;
};

type Workout = {
  id: string;
  workout_date: string; // YYYY-MM-DD
  title: string;
  notes: string | null;
  workout_type: "track" | "lift";
  workout_entries: Entry[];
};

function startOfWeekMonday(d: Date) {
  const date = new Date(d);
  const day = (date.getDay() + 6) % 7; // Mon=0 ... Sun=6
  date.setDate(date.getDate() - day);
  date.setHours(0, 0, 0, 0);
  return date;
}
function addDays(d: Date, n: number) {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

export default function HomeScreen() {
  const c = useAppColors();

  const today = useMemo(() => new Date(), []);
  const todayKey = useMemo(() => formatYMD(today), [today]);

  const [status, setStatus] = useState("Loading...");
  const [userLabel, setUserLabel] = useState<string>("Welcome back");

  const [todaysWorkout, setTodaysWorkout] = useState<Workout | null>(null);
  const [weekWorkouts, setWeekWorkouts] = useState<Workout[]>([]);

  const weekStart = useMemo(() => startOfWeekMonday(today), [today]);
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  const [weeklyStats, setWeeklyStats] = useState({
    totalDistanceM: 0,
    trackWorkouts: 0,
    liftWorkouts: 0,
    liftSets: 0,
  });

  const [featuredExercise, setFeaturedExercise] = useState<{ exercise_id: string; name: string } | null>(null);
  const [featuredRows, setFeaturedRows] = useState<any[]>([]);
  const [allExercises, setAllExercises] = useState<{ exercise_id: string; name: string }[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  const [refreshing, setRefreshing] = useState(false);

  const weekCounts = useMemo(() => {
    const map: Record<string, { track: number; lift: number; total: number }> = {};
    for (const w of weekWorkouts) {
      const key = w.workout_date;
      if (!map[key]) map[key] = { track: 0, lift: 0, total: 0 };
      map[key][w.workout_type] += 1;
      map[key].total += 1;
    }
    return map;
  }, [weekWorkouts]);

  const load = useCallback(async () => {
    setStatus("Loading...");

    // 1) Welcome label
    try {
      const { data } = await supabase.auth.getSession();
      const email = data.session?.user?.email;
      setUserLabel(email ? `Welcome, ${email}` : "Welcome back");
    } catch {
      setUserLabel("Welcome back");
    }

    // 2) Today’s workout + entries
    const todayRes = await supabase
      .from("workouts")
      .select(
        `id, workout_date, title, notes, workout_type, workout_entries(id, exercise_id, exercises(name), exercise, reps, time, weight, notes)`
      )
      .eq("workout_date", todayKey)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (todayRes.error) {
      setStatus("Error: " + todayRes.error.message);
      setTodaysWorkout(null);
      setWeekWorkouts([]);
      return;
    }

    setTodaysWorkout((todayRes.data as any) ?? null);

    // 3) Week workouts
    const startKey = formatYMD(weekStart);
    const endKey = formatYMD(addDays(weekStart, 6));

    const weekRes = await supabase
      .from("workouts")
      .select("id, workout_date, title, notes, workout_type")
      .gte("workout_date", startKey)
      .lte("workout_date", endKey)
      .order("workout_date", { ascending: true })
      .order("created_at", { ascending: true });

    if (weekRes.error) {
      setStatus("Error: " + weekRes.error.message);
      setWeekWorkouts([]);
      return;
    }

    const weekRows = (weekRes.data as any) ?? [];
    setWeekWorkouts(weekRows);

    const trackWorkouts = weekRows.filter((w: any) => w.workout_type === "track").length;
    const liftWorkouts = weekRows.filter((w: any) => w.workout_type === "lift").length;

    // 4) Weekly distance + lift sets (using entries joined to workouts)
    const { data: distRows, error: distErr } = await supabase
      .from("workout_entries")
      .select(`reps, sets, exercises(distance_m), workouts!inner(workout_date, workout_type)`)
      .gte("workouts.workout_date", startKey)
      .lte("workouts.workout_date", endKey);

    if (distErr) {
      setStatus("Error: " + distErr.message);
      return;
    }

    const totalDistanceM = (distRows ?? []).reduce((sum: number, r: any) => {
      if (r.workouts?.workout_type !== "track") return sum;
      const perRep = Number(r.exercises?.distance_m ?? 0);
      const reps = Number(r.reps ?? 1);
      const sets = Number(r.sets ?? 1);
      return sum + perRep * reps * sets;
    }, 0);

    const liftSets = (distRows ?? []).reduce((sum: number, r: any) => {
      if (r.workouts?.workout_type !== "lift") return sum;
      return sum + Number(r.sets ?? 0);
    }, 0);

    setWeeklyStats({ totalDistanceM, trackWorkouts, liftWorkouts, liftSets });

    // 5) Exercise list for picker
    const { data: exData } = await supabase
      .from("exercises")
      .select("exercise_id, name")
      .order("name", { ascending: true });

    setAllExercises((exData as any) ?? []);

    setStatus("Loaded ✅");
  }, [todayKey, weekStart]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  async function loadFeatured(exercise_id: string) {
    const { data, error } = await supabase
      .from("workout_entries")
      .select(`
        id,
        time,
        times,
        set_times,
        lift_reps,
        lift_weights,
        workouts!inner(workout_date, workout_type),
        exercises(name)
      `)
      .eq("exercise_id", exercise_id)
      .order("workouts.workout_date", { ascending: false })
      .limit(12);
  
    if (error) {
      console.log("loadFeatured error:", error);
      setFeaturedRows([]);
      return;
    }
  
    setFeaturedRows((data as any) ?? []);
  }

  const dotTrack = c.dark ? "#34D399" : "green";
  const dotLift = c.dark ? "#60A5FA" : "blue";

  return (
    <FormScreen
      refreshControlProps={{
        refreshing,
        onRefresh,
      }}
    >
      {/* Welcome */}
      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 22, fontWeight: "800", color: c.text }}>{userLabel}</Text>
        <Text style={{ color: c.subtext }}>{status}</Text>
      </View>

      {/* Today’s workout */}
      <View
        style={{
          borderWidth: 1,
          borderColor: c.border,
          backgroundColor: c.card,
          borderRadius: 14,
          padding: 14,
          gap: 10,
        }}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ fontSize: 16, fontWeight: "800", color: c.text }}>Today’s Workout</Text>
          <PrimaryButton title="Log" onPress={() => router.push(`/modal?date=${todayKey}`)} />
        </View>

        {todaysWorkout ? (
          <>
            <View style={{ gap: 4 }}>
              <Text style={{ fontWeight: "800", color: c.text }}>{todaysWorkout.title}</Text>
              <Text style={{ color: c.subtext }}>
                {todaysWorkout.workout_type === "track" ? "Track" : "Lift"} • {todaysWorkout.workout_date}
              </Text>
              {!!todaysWorkout.notes && <Text style={{ color: c.text }}>{todaysWorkout.notes}</Text>}
            </View>

            <Text style={{ fontWeight: "800", marginTop: 8, color: c.text }}>Entries</Text>

            {todaysWorkout.workout_entries?.length ? (
              todaysWorkout.workout_entries.map((e) => (
                <View
                  key={e.id}
                  style={{
                    borderWidth: 1,
                    borderColor: c.border,
                    backgroundColor: c.bg,
                    borderRadius: 14,
                    padding: 12,
                    gap: 6,
                  }}
                >
                  <Text style={{ fontWeight: "700", color: c.text }}>
                    {e.exercises?.name ?? e.exercise ?? "Entry"}
                  </Text>
                  {!!e.reps && <Text style={{ color: c.subtext }}>Reps: {e.reps}</Text>}
                  {!!e.time && <Text style={{ color: c.subtext }}>Time: {e.time}</Text>}
                  {e.weight !== null && <Text style={{ color: c.subtext }}>Weight: {e.weight}</Text>}
                  {!!e.notes && <Text style={{ color: c.subtext }}>{e.notes}</Text>}
                </View>
              ))
            ) : (
              <Text style={{ color: c.subtext }}>No entries yet.</Text>
            )}

            <Pressable onPress={() => router.push(`/workout/${todaysWorkout.id}`)}>
              <Text style={{ fontWeight: "800", marginTop: 6, color: c.text }}>View details →</Text>
            </Pressable>
          </>
        ) : (
          <Text style={{ color: c.subtext }}>No workout logged today.</Text>
        )}
      </View>

      {/* Stats */}
      <View
        style={{
          borderWidth: 1,
          borderColor: c.border,
          backgroundColor: c.card,
          borderRadius: 14,
          padding: 14,
          gap: 10,
        }}
      >
        <Text style={{ fontSize: 16, fontWeight: "800", color: c.text }}>This Week</Text>

        <View style={{ flexDirection: "row", gap: 10 }}>
          <View
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: c.border,
              backgroundColor: c.bg,
              borderRadius: 14,
              padding: 12,
              gap: 4,
            }}
          >
            <Text style={{ color: c.subtext }}>Distance Logged</Text>
            <Text style={{ fontSize: 18, fontWeight: "900", color: c.text }}>
              {(weeklyStats.totalDistanceM / 1000).toFixed(2)} km
            </Text>
          </View>

          <View
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: c.border,
              backgroundColor: c.bg,
              borderRadius: 14,
              padding: 12,
              gap: 4,
            }}
          >
            <Text style={{ color: c.subtext }}>Workouts</Text>
            <Text style={{ fontSize: 18, fontWeight: "900", color: c.text }}>
              {weeklyStats.trackWorkouts + weeklyStats.liftWorkouts}
            </Text>
          </View>

          <View
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: c.border,
              backgroundColor: c.bg,
              borderRadius: 14,
              padding: 12,
              gap: 4,
            }}
          >
            <Text style={{ color: c.subtext }}>Lifts</Text>
            <Text style={{ fontSize: 18, fontWeight: "900", color: c.text }}>
              {weeklyStats.liftWorkouts}
            </Text>
          </View>
        </View>
      </View>

      {/* Featured Exercise */}
      <View
        style={{
          borderWidth: 1,
          borderColor: c.border,
          backgroundColor: c.card,
          borderRadius: 14,
          padding: 14,
          gap: 10,
        }}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ fontSize: 16, fontWeight: "800", color: c.text }}>Featured exercise</Text>

          <Pressable onPress={() => setPickerOpen(true)}>
            <Text style={{ fontWeight: "800", color: c.text }}>
              {featuredExercise ? "Change" : "Choose"}
            </Text>
          </Pressable>
        </View>

        {!featuredExercise ? (
          <Text style={{ color: c.subtext }}>
            Choose an exercise to see recent performances. (Optional)
          </Text>
        ) : (
          <>
            <Text style={{ fontWeight: "900", color: c.text }}>{featuredExercise.name}</Text>

            {featuredRows.length === 0 ? (
              <Text style={{ color: c.subtext }}>
                No recent entries for this exercise yet.
              </Text>
            ) : null}

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
              {featuredRows.map((r) => {
                const date = r.workouts?.workout_date ?? "";
                const isLift = r.workouts?.workout_type === "lift";

                return (
                  <View
                    key={r.id}
                    style={{
                      width: 240,
                      borderWidth: 1,
                      borderColor: c.border,
                      backgroundColor: c.bg,
                      borderRadius: 14,
                      padding: 12,
                      gap: 6,
                    }}
                  >
                    <Text style={{ fontWeight: "800", color: c.text }}>{date}</Text>

                    {isLift ? (
                      (r.lift_reps ?? []).map((rep: number | null, i: number) => {
                        const w = r.lift_weights?.[i] ?? null;
                        if (rep == null && w == null) return null;
                        return (
                          <Text key={i} style={{ color: c.subtext }} numberOfLines={2}>
                            Set {i + 1}: {rep ?? "—"} reps {w != null ? `@ ${w}` : ""}
                          </Text>
                        );
                      })
                    ) : (
                      (() => {
                        const flatTimes: string[] =
                          Array.isArray(r.set_times) && r.set_times.length
                            ? r.set_times
                            : Array.isArray(r.times) && r.times.length
                            ? r.times
                            : [];
                    
                        if (flatTimes.length) {
                          return (
                            <Text style={{ color: c.subtext }} numberOfLines={3}>
                              Times: {flatTimes.filter((t: string) => t?.trim()).join(" • ")}
                            </Text>
                          );
                        }
                    
                        if (r.time) {
                          return <Text style={{ color: c.subtext }}>Time: {r.time}</Text>;
                        }
                    
                        return <Text style={{ color: c.subtext }}>No times recorded.</Text>;
                      })()
                    )}
                  </View>
                );
              })}
            </ScrollView>

            <Pressable
              onPress={() => {
                setFeaturedExercise(null);
                setFeaturedRows([]);
              }}
            >
              <Text style={{ color: c.subtext, fontWeight: "800" }}>Remove featured exercise</Text>
            </Pressable>
          </>
        )}
      </View>

      {/* Mini weekly calendar */}
      <View
        style={{
          borderWidth: 1,
          borderColor: c.border,
          backgroundColor: c.card,
          borderRadius: 14,
          padding: 14,
          gap: 10,
        }}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ fontSize: 16, fontWeight: "800", color: c.text }}>This Week</Text>
          <Pressable onPress={() => router.push("/(tabs)/calendar")}>
            <Text style={{ fontWeight: "800", color: c.text }}>Open calendar →</Text>
          </Pressable>
        </View>

        <View style={{ flexDirection: "row" }}>
          {weekdayLabels.map((w) => (
            <Text
              key={w}
              style={{ width: `${100 / 7}%`, textAlign: "center", fontSize: 12, color: c.subtext }}
            >
              {w}
            </Text>
          ))}
        </View>

        <View style={{ flexDirection: "row" }}>
          {weekDays.map((d) => {
            const key = formatYMD(d);
            const counts = weekCounts[key];
            const trackCount = counts?.track ?? 0;
            const liftCount = counts?.lift ?? 0;
            const total = counts?.total ?? 0;

            const selected = key === todayKey;
            const dayNum = d.getDate();

            return (
              <Pressable
                key={key}
                onPress={() => router.push(`/calendar/${key}`)}
                style={{ width: `${100 / 7}%`, paddingVertical: 10, alignItems: "center" }}
              >
                <View
                  style={{
                    minWidth: 32,
                    height: 32,
                    borderRadius: 999,
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: selected ? 2 : 0,
                    borderColor: selected ? c.primary : c.border,
                    backgroundColor: selected ? c.primary : "transparent",
                  }}
                >
                  <Text style={{ color: selected ? c.primaryText : c.text, fontWeight: selected ? "800" : "400" }}>
                    {dayNum}
                  </Text>
                </View>

                {total > 0 && (
                  <View style={{ marginTop: 4, alignItems: "center" }}>
                    {total <= 2 ? (
                      <View style={{ flexDirection: "row", gap: 4 }}>
                        {trackCount >= 1 && (
                          <View style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: dotTrack }} />
                        )}
                        {trackCount >= 2 && (
                          <View style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: dotTrack }} />
                        )}
                        {liftCount >= 1 && (
                          <View style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: dotLift }} />
                        )}
                        {liftCount >= 2 && (
                          <View style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: dotLift }} />
                        )}
                      </View>
                    ) : (
                      <View
                        style={{
                          borderWidth: 1,
                          borderColor: c.border,
                          borderRadius: 999,
                          paddingHorizontal: 6,
                          paddingVertical: 1,
                          backgroundColor: c.bg,
                        }}
                      >
                        <Text style={{ fontSize: 10, fontWeight: "800", color: c.text }}>{total}</Text>
                      </View>
                    )}
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>

        <Text style={{ color: c.subtext }}>Tap a day to view workouts for that date.</Text>
      </View>

      {/* Picker overlay */}
      {pickerOpen && (
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.35)",
            justifyContent: "center",
            alignItems: "center",
            padding: 16,
          }}
        >
          <View
            style={{
              width: "100%",
              maxWidth: 520,
              backgroundColor: c.card,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: c.border,
              padding: 14,
              gap: 10,
              maxHeight: "80%",
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ fontSize: 16, fontWeight: "900", color: c.text }}>Pick an exercise</Text>
              <Pressable onPress={() => setPickerOpen(false)}>
                <Text style={{ fontWeight: "800", color: c.text }}>Close</Text>
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={{ gap: 8 }}>
              <Pressable
                onPress={() => {
                  setFeaturedExercise(null);
                  setFeaturedRows([]);
                  setPickerOpen(false);
                }}
                style={{
                  borderWidth: 1,
                  borderColor: c.border,
                  borderRadius: 14,
                  padding: 12,
                  backgroundColor: c.bg,
                }}
              >
                <Text style={{ fontWeight: "800", color: c.text }}>No featured exercise</Text>
              </Pressable>

              {allExercises.map((ex) => (
                <Pressable
                  key={ex.exercise_id}
                  onPress={async () => {
                    setFeaturedExercise(ex);
                    setPickerOpen(false);
                    await loadFeatured(ex.exercise_id);
                  }}
                  style={{
                    borderWidth: 1,
                    borderColor: c.border,
                    borderRadius: 14,
                    padding: 12,
                    backgroundColor: c.bg,
                  }}
                >
                  <Text style={{ fontWeight: "800", color: c.text }}>{ex.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      )}
    </FormScreen>
  );
}