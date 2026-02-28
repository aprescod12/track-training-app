import { useCallback, useState } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useLocalSearchParams, router, useFocusEffect } from "expo-router";
import { supabase } from "../../lib/supabase";
import PrimaryButton from "../../components/PrimaryButton";

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
  const { date } = useLocalSearchParams<{ date: string }>();
  const day = typeof date === "string" ? date : "";

  const [status, setStatus] = useState("Loading...");
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!day) return;
    setLoading(true);
    setStatus("Loading...");

    const { data, error } = await supabase
      .from("workouts")
      .select(`
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
      `)
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

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Pressable onPress={() => router.back()}>
          <Text style={{ fontWeight: "800" }}>← Back</Text>
        </Pressable>

        <PrimaryButton
          title="Log workout"
          onPress={() => router.push(`/modal?date=${day}`)}
        />
      </View>

      <Text style={{ fontSize: 22, fontWeight: "900" }}>{day}</Text>
      <Text style={{ opacity: 0.7 }}>{status}</Text>

      {loading && (
        <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
          <ActivityIndicator />
          <Text>Loading…</Text>
        </View>
      )}

      {workouts.length ? (
        workouts.map((w) => (
          <Pressable
            key={w.id}
            onPress={() => router.push(`/workout/${w.id}`)}
            style={{ borderWidth: 1, borderRadius: 14, padding: 12, gap: 6 }}
          >
            <Text style={{ fontWeight: "900" }}>{w.title}</Text>
            <Text style={{ opacity: 0.7 }}>
              {w.workout_type === "track" ? "Track" : "Lift"}
            </Text>

            {!!w.notes && <Text style={{ opacity: 0.85 }}>{w.notes}</Text>}

            <View style={{ marginTop: 6, gap: 4 }}>
              <Text style={{ fontWeight: "800" }}>Exercises</Text>
              {w.workout_entries?.length ? (
                w.workout_entries.map((e) => (
                  <Text key={e.id} style={{ opacity: 0.85 }}>
                    • {e.exercises?.name ?? e.exercise ?? "Entry"}
                  </Text>
                ))
              ) : (
                <Text style={{ opacity: 0.7 }}>No entries.</Text>
              )}
            </View>
          </Pressable>
        ))
      ) : (
        <Text style={{ opacity: 0.7 }}>No workouts logged on this day.</Text>
      )}
    </ScrollView>
  );
}