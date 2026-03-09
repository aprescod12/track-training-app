import { useCallback, useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { supabase } from "../../lib/supabase";
import { formatYMD } from "../../lib/date";
import PrimaryButton from "../../components/PrimaryButton";
import { useAppColors } from "../../lib/theme";
import FormScreen from "../../components/FormScreen";

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

type EventRow = {
  id: string;
  title: string;
  notes: string | null;
  starts_at: string;
  ends_at: string | null;
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

function ymdLocal(ts: string) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function HomeScreen() {
  const c = useAppColors();

  const today = useMemo(() => new Date(), []);
  const todayKey = useMemo(() => formatYMD(today), [today]);

  const [error, setError] = useState<string | null>(null);
  const [userLabel, setUserLabel] = useState<string>("Welcome back");

  const [todaysWorkout, setTodaysWorkout] = useState<Workout | null>(null);
  const [weekWorkouts, setWeekWorkouts] = useState<Workout[]>([]);

  const weekStart = useMemo(() => startOfWeekMonday(today), [today]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

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

  const [weekEvents, setWeekEvents] = useState<EventRow[]>([]);

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

  const eventCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const e of weekEvents) {
      const key = ymdLocal(e.starts_at);
      map[key] = (map[key] ?? 0) + 1;
    }
    return map;
  }, [weekEvents]);

  const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  const dotTrack = c.dark ? "#34D399" : "green";
  const dotLift = c.dark ? "#60A5FA" : "blue";

  function formatPrettyDate(ymd: string) {
    const d = new Date(ymd + "T00:00:00"); // prevent timezone shift
    if (isNaN(d.getTime())) return ymd;

    const month = d.toLocaleString(undefined, { month: "long" });
    const dd = d.getDate();
    const year = d.getFullYear();

    function ordinal(n: number) {
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
    }

    return `${month} ${ordinal(dd)}, ${year}`;
  }

  // ✅ IMPORTANT: pass uid so featured only pulls *my* entries
  const loadFeatured = useCallback(async (uid: string, exercise_id: string) => {
    if (!uid || !exercise_id) {
      setFeaturedRows([]);
      return;
    }
  
    const { data, error } = await supabase
      .from("workout_entries")
      .select(
        `
        id,
        workouts(workout_date, workout_type),
        exercises(name),
        entry_sets(set_number, rep_number, time_text, reps, weight)
      `
      )
      .eq("user_id", uid) // ✅ my data only
      .eq("exercise_id", exercise_id)
      .order("workout_date", { ascending: false, foreignTable: "workouts" })
      .order("set_number", { ascending: true, foreignTable: "entry_sets" })
      .order("rep_number", { ascending: true, foreignTable: "entry_sets" })
      .limit(12);
  
    if (error) {
      console.log("loadFeatured error:", error);
      setFeaturedRows([]);
      return;
    }
  
    setFeaturedRows((data as any) ?? []);
  }, []);

  const clearFeatured = useCallback(async () => {
    setFeaturedExercise(null);
    setFeaturedRows([]);

    const { data: userRes } = await supabase.auth.getUser();
    const uid = userRes.user?.id;

    if (uid) {
      const { error } = await supabase.from("profiles").update({ featured_exercise_id: null }).eq("id", uid);
      if (error) console.log("clear featured_exercise_id error:", error);
    }
  }, []);

  const load = useCallback(async () => {
    setError(null);

    // --- get user once ---
    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    if (userErr) console.log("getUser error:", userErr);
    const user = userRes.user ?? null;
    const uid = user?.id ?? null;

    // If not logged in, hard stop (prevents accidental cross-user UI)
    if (!uid) {
      setUserLabel("Welcome back");
      setTodaysWorkout(null);
      setWeekWorkouts([]);
      setWeekEvents([]);
      setWeeklyStats({ totalDistanceM: 0, trackWorkouts: 0, liftWorkouts: 0, liftSets: 0 });
      setFeaturedExercise(null);
      setFeaturedRows([]);
      setError("Not logged in");
      return;
    }

    // 1) Welcome label
    try {
      const fullName = (user?.user_metadata as any)?.full_name?.trim?.();
      if (fullName) {
        const firstName = String(fullName).split(" ")[0];
        setUserLabel(`Welcome, ${firstName}`);
      } else if (user?.email) {
        const fallback = user.email.split("@")[0];
        setUserLabel(`Welcome, ${fallback}`);
      } else {
        setUserLabel("Welcome back");
      }
    } catch {
      setUserLabel("Welcome back");
    }

    // 2) Today’s workout + entries (✅ my workouts only)
    const todayRes = await supabase
      .from("workouts")
      .select(
        `id, workout_date, title, notes, workout_type, workout_entries(id, exercise_id, exercises(name), exercise, reps, time, weight, notes)`
      )
      .eq("user_id", uid) // ✅
      .eq("workout_date", todayKey)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (todayRes.error) {
      setError("Error: " + todayRes.error.message);
      setTodaysWorkout(null);
      setWeekWorkouts([]);
      return;
    }

    setTodaysWorkout((todayRes.data as any) ?? null);

    // 3) Week workouts (✅ my workouts only)
    const startKey = formatYMD(weekStart);
    const endKey = formatYMD(addDays(weekStart, 6));
    const weekStartDate = new Date(`${startKey}T00:00:00`);
    const weekEndExclusive = new Date(`${formatYMD(addDays(weekStart, 7))}T00:00:00`);

    const weekRes = await supabase
      .from("workouts")
      .select("id, workout_date, title, notes, workout_type")
      .eq("user_id", uid) // ✅
      .gte("workout_date", startKey)
      .lte("workout_date", endKey)
      .order("workout_date", { ascending: true })
      .order("created_at", { ascending: true });

    if (weekRes.error) {
      setError("Error: " + weekRes.error.message);
      setWeekWorkouts([]);
      return;
    }

    const weekRows = (weekRes.data as any) ?? [];
    setWeekWorkouts(weekRows);

    const { data: eData, error: eErr } = await supabase
      .from("calendar_events")
      .select("id, title, notes, starts_at, ends_at")
      .eq("user_id", uid)
      .gte("starts_at", weekStartDate.toISOString())
      .lt("starts_at", weekEndExclusive.toISOString())
      .order("starts_at", { ascending: true });

    if (eErr) {
      console.log("week events error:", eErr);
      setWeekEvents([]);
    } else {
      setWeekEvents((eData as EventRow[]) ?? []);
    }

    const trackWorkouts = weekRows.filter((w: any) => w.workout_type === "track").length;
    const liftWorkouts = weekRows.filter((w: any) => w.workout_type === "lift").length;

    // 4) Weekly distance + lift sets (✅ my entries only via workouts.user_id)
    const { data: distRows, error: distErr } = await supabase
      .from("workout_entries")
      .select(`reps, sets, exercises(distance_m), workouts!inner(user_id, workout_date, workout_type)`)
      .eq("user_id", uid)          // ✅ add this
      .eq("workouts.user_id", uid) // ✅ keep this
      .gte("workouts.workout_date", startKey)
      .lte("workouts.workout_date", endKey);

    if (distErr) {
      setError("Error: " + distErr.message);
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

    // 5) Exercise list for picker (global list is fine)
    const { data: exData, error: exErr } = await supabase
      .from("exercises")
      .select("exercise_id, name")
      .order("name", { ascending: true });

    if (exErr) {
      setAllExercises([]);
      setError("Error: " + exErr.message);
      return;
    }

    const exList = (exData as any) ?? [];
    setAllExercises(exList);

    // 6) Restore featured exercise from profile
    let featuredId: string | null = null;
    const { data: prof, error: pErr } = await supabase
      .from("profiles")
      .select("featured_exercise_id")
      .eq("id", uid)
      .maybeSingle();

    if (pErr) console.log("profile fetch error:", pErr);
    featuredId = (prof as any)?.featured_exercise_id ?? null;

    if (featuredId) {
      const found = exList.find((x: any) => x.exercise_id === featuredId);

      if (found) {
        setFeaturedExercise(found);
        await loadFeatured(uid, featuredId); // ✅ pass uid
      } else {
        const { data: one, error: oneErr } = await supabase
          .from("exercises")
          .select("exercise_id, name")
          .eq("exercise_id", featuredId)
          .maybeSingle();

        if (oneErr) console.log("exercise fallback fetch error:", oneErr);

        if (one) {
          setFeaturedExercise(one as any);
          await loadFeatured(uid, featuredId); // ✅ pass uid
        } else {
          setFeaturedExercise(null);
          setFeaturedRows([]);
        }
      }
    } else {
      setFeaturedExercise(null);
      setFeaturedRows([]);
    }

  }, [todayKey, weekStart, loadFeatured]);

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
      </View>

      {error && (
          <Text style={{ color: "#ef4444", fontWeight: "600" }}>
            {error}
          </Text>
        )}

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
                  <Text style={{ fontWeight: "700", color: c.text }}>{e.exercises?.name ?? e.exercise ?? "Entry"}</Text>
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
            <Text style={{ fontSize: 18, fontWeight: "900", color: c.text }}>{weeklyStats.liftWorkouts}</Text>
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
          <Text style={{ fontSize: 16, fontWeight: "800", color: c.text }}>Featured Exercise</Text>

          <Pressable onPress={() => setPickerOpen(true)}>
            <Text style={{ fontWeight: "800", color: c.text }}>{featuredExercise ? "Change" : "Choose"}</Text>
          </Pressable>
        </View>

        {!featuredExercise ? (
          <Text style={{ color: c.subtext }}>Choose an exercise to see recent performances. (Optional)</Text>
        ) : (
          <>
            <Text style={{ fontWeight: "900", color: c.text }}>{featuredExercise.name}</Text>

            {featuredRows.length === 0 ? (
              <Text style={{ color: c.subtext }}>No recent entries for this exercise yet.</Text>
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
                    <Text style={{ fontWeight: "800", color: c.text }}>{date ? formatPrettyDate(date) : "-"}</Text>

                    {(() => {
                      const sets = (r.entry_sets ?? []) as Array<{
                        set_number: number;
                        rep_number: number | null;
                        time_text: string | null;
                        reps: number | null;
                        weight: number | null;
                      }>;

                      if (!sets.length) {
                        return <Text style={{ color: c.subtext }}>No sets recorded.</Text>;
                      }

                      const bySet: Record<number, typeof sets> = {};
                      for (const s of sets) {
                        const k = Number(s.set_number);
                        if (!bySet[k]) bySet[k] = [];
                        bySet[k].push(s);
                      }

                      const setNums = Object.keys(bySet)
                        .map(Number)
                        .sort((a, b) => a - b);

                      if (isLift) {
                        return setNums.map((setNum) => {
                          const row = bySet[setNum]?.[0];
                          if (!row) return null;
                          const reps = row.reps ?? "—";
                          const w = row.weight != null ? String(row.weight) : "";
                          return (
                            <Text key={setNum} style={{ color: c.subtext }} numberOfLines={2}>
                              Set {setNum}: {reps} reps {w ? `@ ${w}` : ""}
                            </Text>
                          );
                        });
                      }

                      return setNums.map((setNum) => {
                        const times = (bySet[setNum] ?? [])
                          .map((x) => (x.time_text ?? "").trim())
                          .filter(Boolean);

                        if (!times.length) return null;

                        return (
                          <Text key={setNum} style={{ color: c.subtext }} numberOfLines={2}>
                            Set {setNum}: {times.join(" • ")}
                          </Text>
                        );
                      });
                    })()}
                  </View>
                );
              })}
            </ScrollView>

            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Pressable onPress={clearFeatured}>
                <Text style={{ color: c.subtext, fontWeight: "800" }}>Remove featured exercise</Text>
              </Pressable>

              <Pressable onPress={() => router.push(`/history/${featuredExercise.exercise_id}`)}>
                <Text style={{ color: c.subtext, fontWeight: "800" }}>History</Text>
              </Pressable>
            </View>
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
            <Text key={w} style={{ width: `${100 / 7}%`, textAlign: "center", fontSize: 12, color: c.subtext }}>
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
            const hasEvent = (eventCounts[key] ?? 0) > 0;

            const selected = key === todayKey;
            const dayNum = d.getDate();

            return (
              <Pressable
                key={key}
                onPress={() => router.push(`/calendar/${key}`)}
                style={{ width: `${100 / 7}%`, paddingVertical: 10, alignItems: "center" }}
              >
                {hasEvent && (
                  <View
                    style={{
                      position: "absolute",
                      top: 2,
                      alignSelf: "center",
                      width: 6,
                      height: 6,
                      borderRadius: 999,
                      backgroundColor: c.dark ? "#FFFFFF" : c.text,
                      opacity: selected ? 1 : 0.9,
                    }}
                  />
                )}
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

        <Text style={{ color: c.subtext }}>Tap a day to view workouts and events for that date.</Text>
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
                onPress={async () => {
                  setPickerOpen(false);
                  await clearFeatured();
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

                    const { data: userRes } = await supabase.auth.getUser();
                    const uid = userRes.user?.id;

                    if (uid) {
                      await loadFeatured(uid, ex.exercise_id); // ✅
                      const { error } = await supabase
                        .from("profiles")
                        .update({ featured_exercise_id: ex.exercise_id })
                        .eq("id", uid);

                      if (error) console.log("save featured_exercise_id error:", error);
                    }
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