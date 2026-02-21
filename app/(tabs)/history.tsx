import { useEffect, useState } from "react";
import { View, Text, ScrollView } from "react-native";
import { supabase } from "../../lib/supabase";

type Workout = {
  id: string;
  workout_date: string;
  title: string;
  notes: string | null;
};

export default function HistoryScreen() {
  const [items, setItems] = useState<Workout[]>([]);
  const [status, setStatus] = useState("Loading...");

  useEffect(() => {
    (async () => {
      setStatus("Loading...");
      const { data, error } = await supabase
        .from("workouts")
        .select("id, workout_date, title, notes")
        .order("workout_date", { ascending: false })
        .limit(20);

      if (error) setStatus("Error: " + error.message);
      else {
        setItems(data ?? []);
        setStatus((data?.length ?? 0) ? "Loaded ✅" : "No workouts yet");
      }
    })();
  }, []);

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 22, fontWeight: "800" }}>History</Text>
      <Text>{status}</Text>

      {items.map((w) => (
        <View key={w.id} style={{ borderWidth: 1, borderRadius: 14, padding: 12, gap: 6 }}>
          <Text style={{ fontWeight: "800" }}>{w.title}</Text>
          <Text style={{ opacity: 0.7 }}>{w.workout_date}</Text>
          {!!w.notes && <Text>{w.notes}</Text>}
        </View>
      ))}
    </ScrollView>
  );
}