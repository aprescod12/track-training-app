import { useCallback, useMemo, useState } from "react";
import { View, Text, Pressable, useWindowDimensions } from "react-native";
import { router, useFocusEffect } from "expo-router";
import PrimaryButton from "../../components/PrimaryButton";
import { supabase } from "../../lib/supabase";
import { formatYMD } from "../../lib/date";
import FormScreen from "../../components/FormScreen";
import { useAppColors } from "../../lib/theme";

type Workout = {
  id: string;
  workout_date: string;
  title: string;
  notes: string | null;
};

type FilterKey = "all" | "7d" | "30d";

function startOfDay(d: Date) {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function daysAgo(base: Date, days: number) {
  const copy = new Date(base);
  copy.setDate(copy.getDate() - days);
  return copy;
}

export default function WorkoutsScreen() {
  const c = useAppColors();
  const { width } = useWindowDimensions();

  const [items, setItems] = useState<Workout[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("all");

  const today = useMemo(() => new Date(), []);
  const todayKey = useMemo(() => formatYMD(today), [today]);

  const load = useCallback(async () => {
    setError(null);

    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    const uid = userRes.user?.id ?? null;

    if (userErr || !uid) {
      setError("Not logged in");
      setItems([]);
      return;
    }

    const { data, error } = await supabase
      .from("workouts")
      .select("id, workout_date, title, notes")
      .eq("user_id", uid)
      .order("workout_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(60);

    if (error) {
      setError("Error: " + error.message);
      setItems([]);
      return;
    }

    const rows = (data ?? []) as Workout[];
    setItems(rows);
  }, []);

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

  const todaysWorkout = useMemo(() => {
    return items.find((w) => w.workout_date === todayKey) ?? null;
  }, [items, todayKey]);

  const recentWorkoutsBase = useMemo(() => {
    return items.filter((w) => w.workout_date !== todayKey);
  }, [items, todayKey]);

  const filteredWorkouts = useMemo(() => {
    if (filter === "all") return recentWorkoutsBase;

    const todayStart = startOfDay(today);
    const cutoff =
      filter === "7d" ? startOfDay(daysAgo(todayStart, 6)) : startOfDay(daysAgo(todayStart, 29));

    return recentWorkoutsBase.filter((w) => {
      const d = new Date(w.workout_date + "T00:00:00");
      return d >= cutoff && d <= todayStart;
    });
  }, [filter, recentWorkoutsBase, today]);

  const filterLabel = useMemo(() => {
    if (filter === "7d") return "Past 7 Days";
    if (filter === "30d") return "Past 30 Days";
    return "All Workouts";
  }, [filter]);

  const cardGap = 10;
  const cardWidth = useMemo(() => {
    const usableWidth = width - 32;
    return (usableWidth - cardGap) / 2;
  }, [width]);

  const filterOptions: { key: FilterKey; label: string }[] = [
    { key: "all", label: "All" },
    { key: "7d", label: "7 Days" },
    { key: "30d", label: "30 Days" },
  ];

  return (
    <FormScreen
      refreshControlProps={{
        refreshing,
        onRefresh,
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ fontSize: 22, fontWeight: "800", color: c.text }}>Workouts</Text>
        <PrimaryButton title="Log workout" onPress={() => router.push("/modal")} />
      </View>

      {error && (
        <Text style={{ color: "#ef4444", fontWeight: "600" }}>
          {error}
        </Text>
      )}

      {/* Today */}
      <View
        style={{
          borderWidth: 1,
          borderColor: c.border,
          backgroundColor: c.card,
          borderRadius: 14,
          padding: 14,
          gap: 6,
        }}
      >
        <Text style={{ fontWeight: "800", color: c.text }}>Today</Text>

        {todaysWorkout ? (
          <>
            <Text style={{ fontWeight: "700", color: c.text }}>{todaysWorkout.title}</Text>
            {!!todaysWorkout.notes && <Text style={{ color: c.text }}>{todaysWorkout.notes}</Text>}
            <Pressable onPress={() => router.push(`/workout/${todaysWorkout.id}`)}>
              <Text style={{ marginTop: 6, fontWeight: "700", color: c.text }}>View details →</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={{ color: c.subtext }}>No workout logged today.</Text>
            <Pressable onPress={() => router.push("/modal")}>
              <Text style={{ marginTop: 6, fontWeight: "700", color: c.text }}>Log today’s workout →</Text>
            </Pressable>
          </>
        )}
      </View>

      {/* Filter selector */}
      <View style={{ gap: 10 }}>
        <Text style={{ fontWeight: "800", color: c.text }}>Recent</Text>

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
          {filterOptions.map((option) => {
            const selected = filter === option.key;

            return (
              <Pressable
                key={option.key}
                onPress={() => setFilter(option.key)}
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
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Recent grid */}
      <View style={{ gap: 10 }}>
        <Text style={{ color: c.subtext }}>{filterLabel}</Text>

        {filteredWorkouts.length === 0 ? (
          <View
            style={{
              borderWidth: 1,
              borderColor: c.border,
              backgroundColor: c.card,
              borderRadius: 14,
              padding: 14,
              gap: 6,
            }}
          >
            <Text style={{ color: c.subtext }}>No workouts found for this range.</Text>
          </View>
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: cardGap }}>
            {filteredWorkouts.map((w) => (
              <Pressable
                key={w.id}
                onPress={() => router.push(`/workout/${w.id}`)}
                style={{
                  width: cardWidth,
                  borderWidth: 1,
                  borderColor: c.border,
                  backgroundColor: c.card,
                  borderRadius: 14,
                  padding: 12,
                  gap: 6,
                }}
              >
                <Text numberOfLines={2} style={{ fontWeight: "800", color: c.text }}>
                  {w.title}
                </Text>

                <Text style={{ color: c.subtext }}>{w.workout_date}</Text>

                {!!w.notes && (
                  <Text numberOfLines={3} style={{ color: c.subtext }}>
                    {w.notes}
                  </Text>
                )}

                <Text style={{ marginTop: 2, fontWeight: "700", color: c.text }}>View details →</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </FormScreen>
  );
}