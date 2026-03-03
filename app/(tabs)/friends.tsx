import { useCallback, useEffect, useState } from "react";
import { View, Text } from "react-native";
import { supabase } from "../../lib/supabase";
import FormScreen from "../../components/FormScreen";
import { useAppColors } from "../../lib/theme";
import { SafeAreaView } from "react-native-safe-area-context";

type Workout = {
  id: string;
  workout_date: string;
  title: string;
  notes: string | null;
};

export default function HistoryScreen() {
  const c = useAppColors();

  const [items, setItems] = useState<Workout[]>([]);
  const [status, setStatus] = useState("Loading...");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setStatus("Loading...");
    const { data, error } = await supabase
      .from("workouts")
      .select("id, workout_date, title, notes")
      .order("workout_date", { ascending: false })
      .limit(20);

    if (error) {
      setStatus("Error: " + error.message);
      setItems([]);
      return;
    }

    setItems((data ?? []) as Workout[]);
    setStatus((data?.length ?? 0) ? "Loaded ✅" : "No workouts yet");
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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
      <Text style={{ fontSize: 22, fontWeight: "800", color: c.text }}>History</Text>
      <Text style={{ color: c.subtext }}>{status}</Text>

      {items.map((w) => (
        <View
          key={w.id}
          style={{
            borderWidth: 1,
            borderColor: c.border,
            backgroundColor: c.card,
            borderRadius: 14,
            padding: 12,
            gap: 6,
          }}
        >
          <Text style={{ fontWeight: "800", color: c.text }}>{w.title}</Text>
          <Text style={{ color: c.subtext }}>{w.workout_date}</Text>
          {!!w.notes && <Text style={{ color: c.text }}>{w.notes}</Text>}
        </View>
      ))}
    </FormScreen>
  );
}