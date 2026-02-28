import { useCallback, useMemo, useState } from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { supabase } from "../../lib/supabase";
import { formatYMD } from "../../lib/date";
import PrimaryButton from "../../components/PrimaryButton";

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
function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export default function HomeScreen() {
  const today = useMemo(() => new Date(), []);
  const todayKey = useMemo(() => formatYMD(today), [today]);

  const [status, setStatus] = useState("Loading...");
  const [userLabel, setUserLabel] = useState<string>("Welcome back");

  const [todaysWorkout, setTodaysWorkout] = useState<Workout | null>(null);
  const [weekWorkouts, setWeekWorkouts] = useState<Workout[]>([]);

  const weekStart = useMemo(() => startOfWeekMonday(today), [today]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

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

    // 1) Welcome label (session if available)
    try {
      const { data } = await supabase.auth.getSession();
      const email = data.session?.user?.email;
      if (email) setUserLabel(`Welcome, ${email}`);
      else setUserLabel("Welcome back");
    } catch {
      setUserLabel("Welcome back");
    }

    // 2) Today’s workout (most recent one today) + entries
    const todayRes = await supabase
      .from("workouts")
      .select(`id, workout_date, title, notes, workout_type, workout_entries(id, exercise_id, exercises(name), exercise, reps, time, weight, notes)`)
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

    // 3) Week workouts for mini calendar
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

    setWeekWorkouts((weekRes.data as any) ?? []);
    setStatus("Loaded ✅");
  }, [todayKey, weekStart]);

  // Refresh when you land on Home (e.g., after saving from modal)
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
      {/* Welcome */}
      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 22, fontWeight: "800" }}>{userLabel}</Text>
        <Text style={{ opacity: 0.7 }}>{status}</Text>
      </View>

      {/* Today’s workout */}
      <View style={{ borderWidth: 1, borderRadius: 14, padding: 14, gap: 10 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ fontSize: 16, fontWeight: "800" }}>Today’s Workout</Text>
          <PrimaryButton title="Log" onPress={() => router.push(`/modal?date=${todayKey}`)} />
        </View>

        {todaysWorkout ? (
          <>
            <View style={{ gap: 4 }}>
              <Text style={{ fontWeight: "800" }}>{todaysWorkout.title}</Text>
              <Text style={{ opacity: 0.7 }}>
                {todaysWorkout.workout_type === "track" ? "Track" : "Lift"} • {todaysWorkout.workout_date}
              </Text>
              {!!todaysWorkout.notes && <Text>{todaysWorkout.notes}</Text>}
            </View>

            <Text style={{ fontWeight: "800", marginTop: 8 }}>Entries</Text>

            {todaysWorkout.workout_entries?.length ? (
              todaysWorkout.workout_entries.map((e) => (
                <View key={e.id} style={{ borderWidth: 1, borderRadius: 14, padding: 12, gap: 6 }}>
                  <Text style={{ fontWeight: "700" }}>
                    {e.exercises?.name ?? e.exercise ?? "Entry"}
                  </Text>
{!!e.reps && <Text style={{ opacity: 0.8 }}>Reps: {e.reps}</Text>}
{!!e.time && <Text style={{ opacity: 0.8 }}>Time: {e.time}</Text>}
{e.weight !== null && <Text style={{ opacity: 0.8 }}>Weight: {e.weight}</Text>}
{!!e.notes && <Text style={{ opacity: 0.8 }}>{e.notes}</Text>}
                </View>
              ))
            ) : (
              <Text style={{ opacity: 0.7 }}>No entries yet.</Text>
            )}

            <Pressable onPress={() => router.push(`/workout/${todaysWorkout.id}`)}>
              <Text style={{ fontWeight: "800", marginTop: 6 }}>View details →</Text>
            </Pressable>
          </>
        ) : (
          <Text style={{ opacity: 0.7 }}>No workout logged today.</Text>
        )}
      </View>

      {/* Mini weekly calendar */}
      <View style={{ borderWidth: 1, borderRadius: 14, padding: 14, gap: 10 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ fontSize: 16, fontWeight: "800" }}>This Week</Text>
          <Pressable onPress={() => router.push("/(tabs)/calendar")}>
            <Text style={{ fontWeight: "800" }}>Open calendar →</Text>
          </Pressable>
        </View>

        <View style={{ flexDirection: "row" }}>
          {weekdayLabels.map((w) => (
            <Text key={w} style={{ width: `${100 / 7}%`, textAlign: "center", fontSize: 12, opacity: 0.7 }}>
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
                    backgroundColor: selected ? "black" : "transparent",
                  }}
                >
                  <Text style={{ color: selected ? "white" : "black", fontWeight: selected ? "800" : "400" }}>
                    {dayNum}
                  </Text>
                </View>

                {/* Indicators: dots if total<=2, else total number */}
                {total > 0 && (
                  <View style={{ marginTop: 4, alignItems: "center" }}>
                    {total <= 2 ? (
                      <View style={{ flexDirection: "row", gap: 4 }}>
                        {trackCount >= 1 && (
                          <View style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: "green" }} />
                        )}
                        {trackCount >= 2 && (
                          <View style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: "green" }} />
                        )}
                        {liftCount >= 1 && (
                          <View style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: "blue" }} />
                        )}
                        {liftCount >= 2 && (
                          <View style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: "blue" }} />
                        )}
                      </View>
                    ) : (
                      <View style={{ borderWidth: 1, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1 }}>
                        <Text style={{ fontSize: 10, fontWeight: "800" }}>{total}</Text>
                      </View>
                    )}
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>

        <Text style={{ opacity: 0.7 }}>
          Tap a day to view workouts for that date.
        </Text>
      </View>
    </ScrollView>
  );
}