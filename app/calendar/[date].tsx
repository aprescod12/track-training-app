import { useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { useLocalSearchParams, router, useFocusEffect } from "expo-router";
import FormScreen from "../../components/FormScreen";
import { supabase } from "../../lib/supabase";
import PrimaryButton from "../../components/PrimaryButton";
import { useAppColors } from "../../lib/theme";
import { SafeAreaView } from "react-native-safe-area-context";

type Entry = {
  id: string;
  exercise_id: string | null;
  exercises?: { name: string } | null;
  exercise: string | null;
};

type Workout = {
  id: string;
  workout_date: string;
  title: string;
  notes: string | null;
  workout_type: "track" | "lift";
  workout_entries: Entry[];
};

export default function CalendarDayScreen() {
  const c = useAppColors();

  const { date } = useLocalSearchParams<{ date: string }>();
  const day = typeof date === "string" ? date : "";

  const { width } = useWindowDimensions();
  const isWide = width >= 420;

  const [status, setStatus] = useState("Loading...");
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!day) return;
    setLoading(true);
    setStatus("Loading...");

    const { data, error } = await supabase
      .from("workouts")
      .select(
        `
        id,
        workout_date,
        title,
        notes,
        workout_type,
        workout_entries(
          id,
          exercise_id,
          exercises(name),
          exercise
        )
      `
      )
      .eq("workout_date", day)
      .order("created_at", { ascending: false });

    if (error) {
      setStatus("Error: " + error.message);
      setWorkouts([]);
      setLoading(false);
      return;
    }

    setWorkouts((data as any) ?? []);
    setStatus("Loaded ✅");
    setLoading(false);
  }, [day]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const pagePad = 16;
  const cardMaxWidth = isWide ? 560 : undefined;

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

  const cardStyle = {
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.card,
    borderRadius: 16,
    padding: 14,
    alignSelf: "center" as const,
    width: "100%" as const,
    maxWidth: cardMaxWidth,
  };

  return (
    <FormScreen>
      <ScrollView
        contentContainerStyle={{
          padding: pagePad,
          paddingBottom: 28,
          gap: 12,
        }}
      >
        {/* Top bar */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <Pressable onPress={() => router.back()} style={{ paddingVertical: 8, paddingRight: 8 }}>
            <Text style={{ fontWeight: "800", color: c.text }}>← Back</Text>
          </Pressable>

          <View style={{ flex: 1 }} />

          <PrimaryButton title="Log workout" onPress={() => router.push(`/modal?date=${day}`)} />
        </View>

        {/* Header */}
        <View style={{ ...cardStyle, gap: 6 }}>
          <Text style={{ fontSize: 22, fontWeight: "900", color: c.text }}>
            {day ? formatPrettyDate(day) : "Selected day"}
          </Text>
          <Text style={{ color: c.subtext }}>{status}</Text>

          {loading && (
            <View style={{ flexDirection: "row", gap: 10, alignItems: "center", marginTop: 6 }}>
              <ActivityIndicator />
              <Text style={{ color: c.text }}>Loading…</Text>
            </View>
          )}
        </View>

        {/* Workouts */}
        {workouts.length ? (
          workouts.map((w) => (
            <Pressable
              key={w.id}
              onPress={() => router.push(`/workout/${w.id}`)}
              style={({ pressed }) => ({
                ...cardStyle,
                gap: 8,
                opacity: pressed ? 0.92 : 1,
              })}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
                <Text style={{ fontWeight: "900", flexShrink: 1, color: c.text }} numberOfLines={2}>
                  {w.title}
                </Text>
                <Text style={{ color: c.subtext, fontWeight: "700" }}>
                  {w.workout_type === "track" ? "Track" : "Lift"}
                </Text>
              </View>

              {!!w.notes && (
                <Text style={{ color: c.subtext }} numberOfLines={3}>
                  {w.notes}
                </Text>
              )}

              <View style={{ gap: 4 }}>
                <Text style={{ fontWeight: "800", color: c.text }}>Exercises</Text>
                {w.workout_entries?.length ? (
                  w.workout_entries.map((e) => (
                    <Text key={e.id} style={{ color: c.subtext }} numberOfLines={2}>
                      • {e.exercises?.name ?? e.exercise ?? "Entry"}
                    </Text>
                  ))
                ) : (
                  <Text style={{ color: c.subtext }}>No entries.</Text>
                )}
              </View>

              <Text style={{ fontWeight: "800", marginTop: 4, color: c.text }}>View details →</Text>
            </Pressable>
          ))
        ) : (
          <View style={{ ...cardStyle, gap: 8 }}>
            <Text style={{ color: c.subtext }}>No workouts logged on this day.</Text>
            <PrimaryButton title="Log one now" onPress={() => router.push(`/modal?date=${day}`)} />
          </View>
        )}
      </ScrollView>
    </FormScreen>
  );
}