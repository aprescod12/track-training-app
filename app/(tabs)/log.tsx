import { useCallback, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { router, useFocusEffect } from "expo-router";
import PrimaryButton from "../../components/PrimaryButton";
import { supabase } from "../../lib/supabase";
import { formatYMD } from "../../lib/date";
import FormScreen from "../../components/FormScreen";

type Workout = {
  id: string;
  workout_date: string;
  title: string;
  notes: string | null;
};

export default function WorkoutsScreen() {
  const [items, setItems] = useState<Workout[]>([]);
  const [status, setStatus] = useState("Loading...");
  const [refreshing, setRefreshing] = useState(false);

  const todayKey = formatYMD(new Date());

  const load = useCallback(async () => {
    setStatus("Loading...");
    const { data, error } = await supabase
      .from("workouts")
      .select("id, workout_date, title, notes")
      .order("workout_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) {
      setStatus("Error: " + error.message);
      setItems([]);
      return;
    }

    setItems(data ?? []);
    setStatus((data?.length ?? 0) ? "Loaded ✅" : "No workouts yet");
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

  const todaysWorkout = items.find((w) => w.workout_date === todayKey);

  return (
    <FormScreen
      refreshControlProps={{
        refreshing,
        onRefresh,
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ fontSize: 22, fontWeight: "800" }}>Workouts</Text>
        <PrimaryButton title="Log workout" onPress={() => router.push("/modal")} />
      </View>

      <Text style={{ opacity: 0.7 }}>{status}</Text>

      {/* Today */}
      <View style={{ borderWidth: 1, borderRadius: 14, padding: 12, gap: 6 }}>
        <Text style={{ fontWeight: "800" }}>Today</Text>
        {todaysWorkout ? (
          <>
            <Text style={{ fontWeight: "700" }}>{todaysWorkout.title}</Text>
            {!!todaysWorkout.notes && <Text>{todaysWorkout.notes}</Text>}
            <Pressable onPress={() => router.push(`/workout/${todaysWorkout.id}`)}>
              <Text style={{ marginTop: 6, fontWeight: "700" }}>View details →</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={{ opacity: 0.7 }}>No workout logged today.</Text>
            <Pressable onPress={() => router.push("/modal")}>
              <Text style={{ marginTop: 6, fontWeight: "700" }}>Log today’s workout →</Text>
            </Pressable>
          </>
        )}
      </View>

      {/* Recent */}
      <Text style={{ fontWeight: "800" }}>Recent</Text>

      {items.map((w) => (
        <Pressable
          key={w.id}
          onPress={() => router.push(`/workout/${w.id}`)}
          style={{ borderWidth: 1, borderRadius: 14, padding: 12, gap: 6 }}
        >
          <Text style={{ fontWeight: "800" }}>{w.title}</Text>
          <Text style={{ opacity: 0.7 }}>{w.workout_date}</Text>
          {!!w.notes && <Text numberOfLines={2}>{w.notes}</Text>}
        </Pressable>
      ))}
    </FormScreen>
  );
}